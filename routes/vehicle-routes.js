const express = require("express");
const router = express.Router();
const vehicleEp = require("../endpoint/vehicle-ep");

router.get("/", vehicleEp.getVehicleTypes);

module.exports = router;
