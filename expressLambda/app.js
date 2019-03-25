process.env.COMMON_PATH = process.env.COMMON_PATH || "/opt/common";

const createError = require("http-errors");
const express = require("express");
const path = require("path");
const csrf = require("csurf");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const logger = require("morgan");
const cache = require("memory-cache");
const dotenv = require("dotenv");
dotenv.config();

const csrfProtection = csrf({ cookie: true });
const verifyTokenRouter = require("./routes/verifyToken");
const loginRouter = require("./routes/login");
const loginCallbackRouter = require("./routes/loginCallback");
const logoutRouter = require("./routes/logout");
const teams = require("./routes/teams");
const teamRoster = require("./routes/teamRoster");
const subscriptions = require("./routes/subscriptions");

cookieOptions = {
  httpOnly: true
};

if(process.env.RUN_LOCAL === undefined) {
  cookieOptions.secure = true;
}

// use in-memory cache if running locally to improve development speed
let memCache = new cache.Cache();
let cacheMiddleware = (duration) => {
  return (req, res, next) => {
    if(!process.env.LOCAL_CACHE) {
      next();
    } else {
      let key = `__express__${(req.originalUrl || req.url)}`;
      let cacheContent = memCache.get(key);
      if(req.method === "GET" && cacheContent){
        console.log("Cache hit for key: ", key);
        res.send(cacheContent);
        return;
      } else {
        res.sendResponse = res.send;
        res.send = (body) => {
          memCache.put(key,body,duration*1000);
          res.sendResponse(body)
        }
        next();
      }
    }
  }
}

const app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));

app.use(logger("common"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/verifyToken", csrfProtection, verifyTokenRouter);
app.use("/api/login", csrfProtection, loginRouter);
app.use("/api/loginCallback", csrfProtection, loginCallbackRouter);
app.use("/api/logout", csrfProtection, logoutRouter);
app.use("/api/teams", csrfProtection, cacheMiddleware(3600), teams);
app.use("/api/teamRoster", csrfProtection, cacheMiddleware(3600), teamRoster);
app.use("/api/subscriptions", csrfProtection, subscriptions);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.send(res.locals.message);
});

module.exports = app;
