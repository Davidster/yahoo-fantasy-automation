#!/usr/bin/env bash

COMMON_PATH=$(readlink -f ../sharedLambdaLayer/common) \
RUN_LOCAL=true \
USER_INFO_TABLE_NAME=SetMyLinesUserInfo \
node app.local.js
