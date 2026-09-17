const express = require("express");
const router = express.Router();
const loadEp = require("../endpoint/load-ep");
const auth = require("../middlewares/auth.middleware");

// Get driver loads count (To Do loads filtered by conformDriverId)
router.get("/get-driver-loads-count", auth, loadEp.getDriverLoadsCount);

// Get driver loads list (To Do / Delivered filtered by conformDriverId)
router.get("/get-driver-loads", auth, loadEp.getDriverLoads);

// Validate QR code before summary
router.post("/validate-qr", auth, loadEp.validateLoadQR);

// Scan QR and assign load to driver (updates conformDriverId)
router.post("/scan-qr", auth, loadEp.scanAndAssignLoad);
router.post("/assign-load", auth, loadEp.scanAndAssignLoad);

// Get load details
router.get("/get-load-details", auth, loadEp.getLoadDetails);

// Check if load status has changed to delivered/unloaded
router.get("/check-status", auth, loadEp.checkLoadStatus);

// Update journey status ('Pending', 'Start', 'End')
router.post("/update-journey-status", auth, loadEp.updateJourneyStatus);

// Mark load as delivered/unloaded
router.post("/unload", auth, loadEp.unloadLoad);

module.exports = router;
