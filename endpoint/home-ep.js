const homeDao = require("../dao/home-dao");
const asyncHandler = require("express-async-handler");
const uploadFileToS3 = require("../middlewares/s3upload");

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
    const officer = await homeDao.getOfficerByEmpId(empId);
    if (!officer) {
      return res.status(404).json({
        status: "error",
        message: "Officer not found in the system",
      });
    }

    if (officer.status === "Not Approved" || officer.status === "Rejected") {
      return res.status(403).json({
        status: "error",
        message:
          "This Distribution Centre Manager is not in an approved status. Cash handover is not permitted.",
      });
    }

    const upperEmpId = String(officer.empId).toUpperCase();
    if (!upperEmpId.startsWith("DCM")) {
      return res.status(403).json({
        status: "error",
        message:
          "Cash handover is only permitted to a Distribution Centre Manager (DCM). This officer is not authorized.",
      });
    }

    const driverCentre = await homeDao.getDriverDistributedCenter(driverId);
    if (!driverCentre) {
      return res.status(403).json({
        status: "error",
        message:
          "Unable to determine your assigned Distribution Centre. Please contact your supervisor.",
      });
    }

    if (officer.distributedCenterId !== driverCentre.distributedCenterId) {
      return res.status(403).json({
        status: "error",
        message:
          "This Distribution Centre Manager is not assigned to this centre. Cash handover is not permitted.",
      });
    }

    const officerDbId = officer.id;

    const orderDetails = await homeDao.getOrderAmounts(orderIds);
    if (!orderDetails || orderDetails.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Orders not found",
      });
    }

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

exports.getOfficerDetails = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  const { empId } = req.params;
  const driverId = req.user.id;

  if (!empId) {
    return res.status(400).json({
      status: "error",
      message: "Officer Employee ID is required",
    });
  }

  try {
    const officer = await homeDao.getOfficerByEmpId(empId);
    if (!officer) {
      return res.status(404).json({
        status: "error",
        message: "Officer not found in the system",
      });
    }

    if (officer.status === "Not Approved" || officer.status === "Rejected") {
      return res.status(403).json({
        status: "error",
        message:
          "This Distribution Centre Manager is not in an approved status. Cash handover is not permitted.",
      });
    }

    const upperEmpId = String(officer.empId).toUpperCase();
    if (!upperEmpId.startsWith("DCM")) {
      return res.status(403).json({
        status: "error",
        message:
          "Cash handover is only permitted to a Distribution Centre Manager (DCM). This officer is not authorized.",
      });
    }

    const driverCentre = await homeDao.getDriverDistributedCenter(driverId);
    if (!driverCentre) {
      return res.status(403).json({
        status: "error",
        message:
          "Unable to determine your assigned Distribution Centre. Please contact your supervisor.",
      });
    }

    if (officer.distributedCenterId !== driverCentre.distributedCenterId) {
      return res.status(403).json({
        status: "error",
        message:
          "This Distribution Centre Manager is not assigned to this centre. Cash handover is not permitted.",
      });
    }

    if (!officer.phoneNumber01) {
      return res.status(400).json({
        status: "error",
        message: "Officer does not have a registered mobile number",
      });
    }

    const rawCode = String(officer.phoneCode01 || "+94").trim();
    let rawNumber = String(officer.phoneNumber01).trim();

    if (rawNumber.startsWith("0")) {
      rawNumber = rawNumber.substring(1);
    }

    const fullMobileNumber = `${rawCode}${rawNumber}`;

    res.status(200).json({
      status: "success",
      message: "Officer validated",
      data: {
        officerId: officer.id,
        empId: officer.empId,
        firstNameEnglish: officer.firstNameEnglish,
        lastNameEnglish: officer.lastNameEnglish,
        mobileNumber: fullMobileNumber,
      },
    });
  } catch (error) {
    console.error("Error getting officer details:", error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to validate officer. Please try again.",
    });
  }
});

exports.uploadTransferSlip = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      status: "error",
      message: "Bank transfer slip is required",
    });
  }

  const { amount } = req.body;
  if (!amount || isNaN(parseFloat(amount))) {
    return res.status(400).json({
      status: "error",
      message: "Valid transfer amount is required",
    });
  }

  const driverId = req.user.id;

  try {
    const drvOrderMainId = await homeDao.getActiveOrderMainId(driverId);
    if (!drvOrderMainId) {
      return res.status(400).json({
        status: "error",
        message: "No active delivery shift found to hand over cash.",
      });
    }

    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;
    const keyPrefix = "rider/transfer-slips";
    const imageUrl = await uploadFileToS3(fileBuffer, fileName, keyPrefix);

    const empId = req.user.empId || "";
    const empIdDigits = empId.replace(/\D/g, "") || String(driverId).padStart(5, "0");
    const now = new Date();
    const yy = String(now.getFullYear()).substring(2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const dateStr = `${yy}${mm}${dd}`;

    const { transactionId, transCode } = await homeDao.createTransactionWithSeq(
      driverId,
      drvOrderMainId,
      empIdDigits,
      dateStr,
      parseFloat(amount),
      imageUrl,
    );

    res.status(200).json({
      status: "success",
      message: "Slip uploaded successfully. Transaction is pending review.",
      data: {
        transactionId,
        transCode,
        amount: parseFloat(amount),
        paySlip: imageUrl,
      },
    });
  } catch (error) {
    console.error("Error uploading transfer slip:", error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to upload transfer slip: " + error.message,
    });
  }
});

exports.getLatestTransactionStatus = asyncHandler(async (req, res) => {
  const driverId = req.user.id;

  try {
    const tx = await homeDao.getLatestTransactionStatus(driverId);
    if (!tx) {
      return res.status(404).json({
        status: "error",
        message: "No transactions found for the active shift.",
      });
    }

    res.status(200).json({
      status: "success",
      message: "Transaction status fetched successfully",
      data: tx,
    });
  } catch (error) {
    console.error("Error fetching latest transaction status:", error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch transaction status: " + error.message,
    });
  }
});

