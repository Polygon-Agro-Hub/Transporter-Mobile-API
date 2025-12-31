const orderDao = require("../dao/order-dao");
const asyncHandler = require("express-async-handler");
const uploadFileToS3 = require("../middlewares/s3upload");

// Assign Driver Order
exports.assignDriverOrder = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  const driverId = req.user.id;
  const { invNo } = req.body;

  // Validate input
  if (!invNo || invNo.trim() === "") {
    return res.status(400).json({
      status: "error",
      message: "Invoice number is required",
    });
  }

  try {
    // Step 1: Get driver's empId for response
    const driverEmpId = await orderDao.GetDriverEmpId(driverId);

    // Step 2: Get process order ID and check status by invoice number
    const orderInfo = await orderDao.GetProcessOrderInfoByInvNo(invNo);

    // Step 3: Check if order status is "Out For Delivery"
    if (orderInfo.status !== "Out For Delivery") {
      return res.status(400).json({
        status: "error",
        message:
          "Still processing this order. Scanning will be available after it's set to Out For Delivery.",
        currentStatus: orderInfo.status,
      });
    }

    // Step 4: Check if order is already assigned to any driver
    const assignmentCheck = await orderDao.CheckOrderAlreadyAssigned(
      orderInfo.id,
      driverId
    );

    if (assignmentCheck.isAssigned) {
      // Return specific error messages based on assignment
      if (assignmentCheck.assignedToSameDriver) {
        return res.status(409).json({
          status: "error",
          message: assignmentCheck.message,
          driverEmpId: driverEmpId,
        });
      } else {
        return res.status(409).json({
          status: "error",
          message: assignmentCheck.message,
          assignedDriverEmpId: assignmentCheck.assignedDriverEmpId,
          assignedDriverName: assignmentCheck.assignedDriverName,
        });
      }
    }

    // Step 5: Generate handOverTime (current time + 24 hours)
    const handOverTime = new Date();
    handOverTime.setHours(handOverTime.getHours() + 24);

    // Step 6: Save driver order
    const result = await orderDao.SaveDriverOrder(
      driverId,
      orderInfo.id,
      handOverTime
    );

    // Step 7: Return success response with driver info
    res.status(201).json({
      status: "success",
      message: "Order assigned successfully to your target list",
      data: {
        ...result,
        driverEmpId: driverEmpId,
        assignedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error assigning driver order:", error.message);

    // Determine appropriate status code
    let statusCode = 500;
    let errorMessage = error.message;

    if (error.message.includes("not found")) {
      statusCode = 404;
    } else if (
      error.message.includes("already assigned") ||
      error.message.includes("already in your target list")
    ) {
      statusCode = 409;
    } else if (error.message.includes("Unauthorized")) {
      statusCode = 401;
    } else if (error.message.includes("required")) {
      statusCode = 400;
    } else if (error.message.includes("Still processing")) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      status: "error",
      message: errorMessage,
    });
  }
});

// Get Driver's Order
exports.GetDriverOrders = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  const driverId = req.user.id;
  let { status, isHandOver } = req.query;

  try {
    const handoverFilter = isHandOver !== undefined ? parseInt(isHandOver) : 0;

    let statuses = [];
    if (status) {
      if (typeof status === "string") {
        statuses = status.split(",").map((s) => s.trim());
      } else if (Array.isArray(status)) {
        statuses = status;
      }

      statuses = statuses.map((s) => {
        const lower = s.toLowerCase();
        if (lower === "todo") return "Todo";
        if (lower === "completed") return "Completed";
        if (lower === "hold") return "Hold";
        if (lower === "return") return "Return";
        if (lower === "on the way") return "On the way";
        return s;
      });
    }

    const orders = await orderDao.getDriverOrdersDAO(
      driverId,
      statuses,
      handoverFilter
    );

    console.log("FINAL ORDERS RESPONSE:", orders);

    res.status(200).json({
      status: "success",
      data: {
        orders,
        totalOrders: orders.length,
      },
    });
  } catch (error) {
    console.error("Error fetching driver orders:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch orders",
    });
  }
});

// Get Order User Details
exports.GetOrderUserDetails = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  const driverId = req.user.id;
  const { orderIds } = req.query;

  try {
    // Validate orderIds parameter
    if (!orderIds) {
      return res.status(400).json({
        status: "error",
        message: "orderIds parameter is required",
      });
    }

    console.log("Received orderIds:", orderIds);

    // Convert comma-separated string to array
    let orderIdArray = [];
    if (typeof orderIds === "string") {
      orderIdArray = orderIds
        .split(",")
        .map((id) => parseInt(id.trim()))
        .filter((id) => !isNaN(id));
    } else if (Array.isArray(orderIds)) {
      orderIdArray = orderIds
        .map((id) => parseInt(id))
        .filter((id) => !isNaN(id));
    }

    if (orderIdArray.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Valid order IDs are required",
      });
    }

    // Fetch user and order details
    const result = await orderDao.getOrderUserDetailsDAO(
      driverId,
      orderIdArray
    );

    console.log(JSON.stringify(result, null, 2));

    if (!result || !result.user) {
      return res.status(404).json({
        status: "error",
        message: "No user or orders found",
      });
    }

    res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    console.error("Error fetching order user details:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch order details",
    });
  }
});

// Start Journey
exports.StartJourney = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  const driverId = req.user.id;
  const { orderIds } = req.body;

  try {
    // Validate orderIds parameter
    if (!orderIds) {
      return res.status(400).json({
        status: "error",
        message: "orderIds parameter is required",
      });
    }

    // Convert to array
    let orderIdArray = [];
    if (typeof orderIds === "string") {
      orderIdArray = orderIds
        .split(",")
        .map((id) => parseInt(id.trim()))
        .filter((id) => !isNaN(id));
    } else if (Array.isArray(orderIds)) {
      orderIdArray = orderIds
        .map((id) => parseInt(id))
        .filter((id) => !isNaN(id));
    }

    if (orderIdArray.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Valid order IDs are required",
      });
    }

    console.log(
      "Starting journey for driver:",
      driverId,
      "with order IDs:",
      orderIdArray
    );

    // Start the journey
    const result = await orderDao.startJourneyDAO(driverId, orderIdArray);

    if (result.success) {
      res.status(200).json({
        status: "success",
        message: result.message,
        data: {
          updatedOrders: result.updatedOrders,
        },
      });
    } else {
      res.status(400).json({
        status: "error",
        message: result.message,
      });
    }
  } catch (error) {
    console.error("Error starting journey:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to start journey",
    });
  }
});

// Save Signature
exports.saveSignature = asyncHandler(async (req, res) => {
  try {
    // Get driver ID from token
    const driverId = req.user.id;

    if (!driverId) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized: Driver authentication required",
      });
    }

    // Get process order IDs from request body
    const { processOrderIds } = req.body;

    if (
      !processOrderIds ||
      !Array.isArray(processOrderIds) ||
      processOrderIds.length === 0
    ) {
      return res.status(400).json({
        status: "error",
        message: "processOrderIds array is required",
      });
    }

    // Check if signature file is uploaded
    if (!req.file) {
      return res.status(400).json({
        status: "error",
        message: "Signature image is required",
      });
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        status: "error",
        message: "Only JPEG, JPG, and PNG images are allowed",
      });
    }

    // Verify driver has access to these orders
    const verification = await orderDao.verifyDriverAccessToOrdersDAO(
      driverId,
      processOrderIds
    );

    if (!verification.hasAccess) {
      return res.status(403).json({
        status: "error",
        message: `You don't have access to all requested orders. Accessible: ${verification.accessibleCount}/${verification.totalRequested}`,
      });
    }

    // Upload signature image to S3/R2
    const signatureUrl = await uploadFileToS3(
      req.file.buffer,
      req.file.originalname,
      "signatures"
    );

    // Save signature and update order statuses
    const result = await orderDao.saveSignatureAndUpdateStatusDAO(
      processOrderIds,
      signatureUrl,
      driverId
    );

    res.status(200).json({
      status: "success",
      message: "Signature saved and orders marked as delivered successfully",
      data: {
        signatureUrl: result.signatureUrl,
        driverOrdersUpdated: result.driverOrdersUpdated,
        processOrdersUpdated: result.processOrdersUpdated,
        updatedOrders: result.updatedOrders,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error in saveSignature endpoint:", error);
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to save signature and update orders",
    });
  }
});
