const express = require("express");
const router = express.Router();
const appVersionEp = require("../endpoint/app-version-ep");

router.get("/", appVersionEp.getAppVersion);

module.exports = router;
