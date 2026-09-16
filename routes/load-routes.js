const express = require("express");
const router = express.Router();
const loadEp = require("../endpoint/load-ep");
const auth = require("../middlewares/auth.middleware");

// Get driver loads count
router.get("/get-driver-loads-count", auth, loadEp.getDriverLoadsCount);

// Get driver loads list (To Do / Delivered)
router.get("/get-driver-loads", auth, loadEp.getDriverLoads);

// Get load details
router.get("/get-load-details", auth, loadEp.getLoadDetails);

// Check if load status has changed to delivered/unloaded
router.get("/check-status", auth, loadEp.checkLoadStatus);

// Mark load as delivered/unloaded
router.post("/unload", auth, loadEp.unloadLoad);

module.exports = router;
