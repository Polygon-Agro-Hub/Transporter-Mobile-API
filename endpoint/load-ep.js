const loadDao = require("../dao/load-dao");
const asyncHandler = require("express-async-handler");

// Get Driver Loads Count (Active / To Do loads filtered by conformDriverId)
exports.getDriverLoadsCount = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  const driverId = req.user.id;

  try {
    const counts = await loadDao.getDriverLoadsCount(driverId);
    return res.status(200).json({
      status: "success",
      message: "Loads count fetched successfully",
      data: counts,
    });
  } catch (error) {
    console.error("Error fetching loads count:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch loads count. Please try again.",
    });
  }
});

// Get Driver Loads (To Do & Delivered filtered by conformDriverId)
exports.getDriverLoads = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  const driverId = req.user.id;
  const { status } = req.query;

  try {
    const loadsData = await loadDao.getDriverLoads(driverId, status);
    return res.status(200).json({
      status: "success",
      message: "Driver loads fetched successfully",
      data: loadsData,
    });
  } catch (error) {
    console.error("Error fetching driver loads:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch driver loads. Please try again.",
    });
  }
});

// Scan QR and assign load to driver (updates conformDriverId)
exports.scanAndAssignLoad = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  const driverId = req.user.id;
  const { transferCode, loadCode } = req.body;
  const targetCode = transferCode || loadCode;

  if (!targetCode) {
    return res.status(400).json({
      status: "error",
      message: "Transfer code is required",
    });
  }

  try {
    const result = await loadDao.scanAndAssignLoad(targetCode, driverId);
    return res.status(200).json({
      status: "success",
      message: "Load scanned and assigned successfully",
      data: result,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      status: "error",
      message: error.message || "Failed to scan and assign load",
    });
  }
});

// Get Load Details by Transfer Code or ID
exports.getLoadDetails = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  const { transferCode, loadId } = req.query;
  const targetCode = transferCode || loadId;

  if (!targetCode) {
    return res.status(400).json({
      status: "error",
      message: "Transfer code or load ID is required",
    });
  }

  try {
    const loadDetails = await loadDao.getLoadDetails(targetCode);

    if (!loadDetails) {
      return res.status(404).json({
        status: "error",
        message: "Load not found",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Load details fetched successfully",
      data: loadDetails,
    });
  } catch (error) {
    console.error("Error fetching load details:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch load details. Please try again.",
    });
  }
});

// Check if a load has been unloaded / delivered
exports.checkLoadStatus = asyncHandler(async (req, res) => {
  const { transferCode, loadId } = req.query;
  const targetCode = transferCode || loadId;

  if (!targetCode) {
    return res.status(400).json({
      status: "error",
      message: "Transfer code or load ID is required",
    });
  }

  try {
    const statusData = await loadDao.checkLoadStatus(targetCode);

    if (!statusData) {
      return res.status(404).json({
        status: "error",
        message: "Load not found",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Load status checked successfully",
      data: statusData,
    });
  } catch (error) {
    console.error("Error checking load status:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Failed to check load status",
    });
  }
});

// Mark load as unloaded / delivered (triggers socket broadcast)
exports.unloadLoad = asyncHandler(async (req, res) => {
  const { transferCode, loadId, unloadOfficerId } = req.body;
  const targetCode = transferCode || loadId;

  if (!targetCode) {
    return res.status(400).json({
      status: "error",
      message: "Transfer code or load ID is required",
    });
  }

  try {
    const officerId = unloadOfficerId || (req.user && req.user.id) || 189;
    const result = await loadDao.unloadLoad(targetCode, officerId);

    return res.status(200).json({
      status: "success",
      message: "Load marked as delivered / unloaded successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error unloading load:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Failed to mark load as delivered",
    });
  }
});

// Validate QR code eligibility before navigating to summary
exports.validateLoadQR = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  const driverId = req.user.id;
  const { transferCode, loadCode } = req.body;
  const targetCode = transferCode || loadCode;

  if (!targetCode) {
    return res.status(400).json({
      status: "error",
      message: "Transfer code is required",
    });
  }

  try {
    const result = await loadDao.validateLoadQR(targetCode, driverId);
    return res.status(200).json({
      status: "success",
      message: "Load QR is valid",
      data: result,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      status: "error",
      message: error.message || "Failed to validate load QR",
    });
  }
});

// Update Journey Status ('Pending', 'Start', 'End')
exports.updateJourneyStatus = asyncHandler(async (req, res) => {
  const { transferCode, loadId, journeyStatus } = req.body;
  const targetCode = transferCode || loadId;

  if (!targetCode) {
    return res.status(400).json({
      status: "error",
      message: "Transfer code or load ID is required",
    });
  }

  if (!journeyStatus || !["Pending", "Start", "End"].includes(journeyStatus)) {
    return res.status(400).json({
      status: "error",
      message: "Valid journeyStatus ('Pending', 'Start', 'End') is required",
    });
  }

  try {
    const result = await loadDao.updateJourneyStatus(targetCode, journeyStatus);
    return res.status(200).json({
      status: "success",
      message: `Journey status updated to ${journeyStatus} successfully`,
      data: result,
    });
  } catch (error) {
    console.error("Error updating journey status:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Failed to update journey status",
    });
  }
});
