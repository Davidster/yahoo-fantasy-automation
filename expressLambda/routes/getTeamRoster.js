var express = require("express");
var router = express.Router();
const rp = require("request-promise");
const moment = require("moment-timezone");
const { requester, refreshTokenIfNeeded, verifyIDToken } = require("../requester");
const { parseNhlDailySchedule } = require("../parsers/nhlDailySchedule");
const { parseTeamRoster,
        parsePlayerStats,
        parseGameSettings,
        parseLeagueSettings } = require("../parsers/roster");
const { optimizeLineupByAttribute } = require("../lineOptimizer");

const NHL_DAILY_SCHEDULE_URL = "https://statsapi.web.nhl.com/api/v1/schedule";

let batchPlayerStatsRequests = (playerKeys, accessToken, res) => {
  // Yahoo seems to only allow 25 players per request. put max at 20 to be safe
  let playersPerBatch = 20;
  let batches = Math.ceil(playerKeys.length / playersPerBatch);
  let batchPromises = [];
  for(let batch = 0; batch < batches; batch++) {
    let playerBatch = playerKeys.slice(batch * playersPerBatch, (batch + 1) * playersPerBatch);
    let playersStatsQuery = `players;player_keys=${playerBatch.join(",")}/stats`;
    batchPromises.push(requester(playersStatsQuery, accessToken, res));
  }
  return batchPromises;
};

let simplePlayerMapping = player => ({
  position: player.currentPosition,
  name: player.name,
  moved: player.moved
});

router.get("/", async (req, res, next) => {
  // parse request
  let accessToken = JSON.parse(req.cookies.accessToken);
  let date = req.query.date || moment().tz("America/New_York").format("YYYY-MM-DD");

  // define yahoo queries
  let dailyScheduleReq = { url: `${NHL_DAILY_SCHEDULE_URL}?date=${date}` };
  let teamKey = req.query.teamKey;
  let teamRosterQuery = `team/${teamKey}/roster;date=${date}`;
  let leagueKey = teamKey.split(".").slice(0,3).join(".");
  let leagueSettingsQuery = `league/${leagueKey}/settings`;
  let gameKey = teamKey.split(".")[0];
  let gameSettingsQuery = `game/${gameKey}/stat_categories`;

  let statIDMap = {}, optimizedLineups = {}, playerInfoMap = {}, originalLineup = [], requests = [];
  try {
    // fire nhl daily schedule request first since we don't need the access token
    let nhlDailyScheduleReqPromise = rp(dailyScheduleReq);

    // prepare access token
    let tokenCheckResults = await Promise.all([
      verifyIDToken(accessToken.id_token),
      refreshTokenIfNeeded(accessToken, res)
    ]);
    accessToken = tokenCheckResults[1];

    // perform yahoo queries
    let playerInfoSub = {};

    requests = await Promise.all([
      requester(teamRosterQuery, accessToken, res).then($trDoc => {
        playerInfoSub = parseTeamRoster($trDoc);
        return Promise.all(batchPlayerStatsRequests(Object.keys(playerInfoSub), accessToken, res));
      }),
      nhlDailyScheduleReqPromise,
      requester(gameSettingsQuery, accessToken, res),
      requester(leagueSettingsQuery, accessToken, res),
    ]);

    // parse query results
    let dailyGameMap = parseNhlDailySchedule(JSON.parse(requests[1]));
    statIDMap = parseGameSettings(requests[2]);
    let positionCapacityMap = {};
    // this function mutates the statIDMap and positionCapacityMap objects
    parseLeagueSettings(requests[3], statIDMap, positionCapacityMap);
    let allPlayerInfo = parsePlayerStats(requests[0], playerInfoSub, statIDMap, dailyGameMap);

    // optimize linuep against some stat categories
    let aggregateStatCategories = [
      "averageFanPoints",
      "totalFanPoints"
    ];
    for(let i = 0; i < aggregateStatCategories.length; i++) {
      let category = aggregateStatCategories[i];
      let optimizedLineup = await optimizeLineupByAttribute(allPlayerInfo, category, positionCapacityMap, true);
      optimizedLineups[category] = optimizedLineup.map(simplePlayerMapping);
    }

    // format output
    playerInfoMap = allPlayerInfo.reduce((acc, player) => {
      acc[player.name] = player;
      return acc;
    }, {});
    originalLineup = allPlayerInfo.map(simplePlayerMapping);

  } catch (err) {
    console.log("Error getting team roster:", err);
    console.log("Raw Yahoo responses:");
    console.log("player stats document:", requests[0] && requests[0].html());
    console.log("nhl daily schedule document:", requests[1] && requests[1].html());
    console.log("game settings document:", requests[2] && requests[2].html());
    console.log("league settings document:", requests[3] && requests[3].html());
    return res.status(500).send();
  }

  // return results to client
  res.send(JSON.stringify({
    playerInfoMap: playerInfoMap,
    originalLineup: originalLineup,
    optimizedLineups: optimizedLineups,
    statIDMap: statIDMap
  }));
});

router.post("/", async (req, res, next) => {
  console.log("Access token", req.cookies.accessToken.slice(0,10), "...");
  console.log("request params", req.body);
  console.log("changed a ting ting");

  // return results to client
  res.send(JSON.stringify({
    ladiesAndGentlemen: "we got him"
  }));
});

module.exports = router;
