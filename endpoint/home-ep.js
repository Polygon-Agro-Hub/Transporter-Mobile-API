const homeDao = require("../dao/home-dao");
const asyncHandler = require("express-async-handler");

// Get My Amount
exports.getAmount = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  const driverId = req.user.id;

  try {
    const amount = await homeDao.getAmount(driverId);

    res.status(200).json({
      status: "success",
      message: "Amount fetched successfully",
      data: amount,
    });
  } catch (error) {
    console.error("Error fetching Amount:", error.message);

    res.status(500).json({
      status: "error",
      message: "Failed to fetch Amount. Please try again.",
    });
  }
});

// Get Received Cash
exports.getReceivedCash = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  const driverId = req.user.id;

  try {
    const amount = await homeDao.getReceivedCash(driverId);

    res.status(200).json({
      status: "success",
      message: "Amount fetched successfully",
      data: amount,
    });
  } catch (error) {
    console.error("Error fetching Amount:", error.message);

    res.status(500).json({
      status: "error",
      message: "Failed to fetch Amount. Please try again.",
    });
  }
});

// Hand Over Cash
exports.handOverCash = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  const { orderIds, totalAmount, officerId } = req.body;
  const empId = officerId;
  const driverId = req.user.id;

  if (!orderIds || orderIds.length === 0) {
    return res.status(400).json({
      status: "error",
      message: "No orders selected",
    });
  }

  if (!empId) {
    return res.status(400).json({
      status: "error",
      message: "Officer Employee ID is required",
    });
  }

  try {
    // Step 1: Get officer by empId
    const officer = await homeDao.getOfficerByEmpId(empId);
    if (!officer) {
      return res.status(404).json({
        status: "error",
        message: "Officer not found in the system",
      });
    }

    // Step 2: Check officer approval status
    if (officer.status === "Not Approved" || officer.status === "Rejected") {
      return res.status(403).json({
        status: "error",
        message: "This Distribution Centre Manager is not in an approved status. Cash handover is not permitted.",
      });
    }

    // Step 3: Get driver's distributed centre via irmId chain
    const driverCentre = await homeDao.getDriverDistributedCenter(driverId);
    if (!driverCentre) {
      return res.status(403).json({
        status: "error",
        message: "Unable to determine your assigned Distribution Centre. Please contact your supervisor.",
      });
    }

    // Step 4: Validate officer belongs to the same centre as the driver
    if (officer.distributedCenterId !== driverCentre.distributedCenterId) {
      return res.status(403).json({
        status: "error",
        message: "This Distribution Centre Manager is not assigned to this centre. Cash handover is not permitted.",
      });
    }

    const officerDbId = officer.id;

    // Step 5: Get order amounts
    const orderDetails = await homeDao.getOrderAmounts(orderIds);
    if (!orderDetails || orderDetails.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Orders not found",
      });
    }

    // Step 6: Perform hand over
    await homeDao.handOverCash(orderDetails, officerDbId);

    res.status(200).json({
      status: "success",
      message: "Cash handed over successfully",
      data: {
        empId,
        officerId: officerDbId,
        totalAmount,
        orderCount: orderIds.length,
      },
    });

  } catch (error) {
    console.error("Error handing over cash:", error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to hand over cash. Please try again.",
    });
  }
});