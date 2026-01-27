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

    // Step 3: Check if order is already assigned to any driver FIRST
    // This should happen BEFORE checking "Out For Delivery" status
    const assignmentCheck = await orderDao.CheckOrderAlreadyAssigned(
      orderInfo.id,
      driverId,
    );

    if (assignmentCheck.isAssigned) {
      // Return specific error messages based on assignment
      if (assignmentCheck.assignedToSameDriver) {
        return res.status(409).json({
          status: "error",
          message: "This order is already in your target list.",
          driverEmpId: driverEmpId,
        });
      } else {
        return res.status(409).json({
          status: "error",
          message: `This order has already been collected by another officer (Officer ID: ${assignmentCheck.assignedDriverEmpId}).`,
          assignedDriverEmpId: assignmentCheck.assignedDriverEmpId,
          assignedDriverName: assignmentCheck.assignedDriverName,
        });
      }
    }

    // Step 4: NOW check if order status is "Out For Delivery"
    // Only check this if order is NOT already assigned
    if (orderInfo.status !== "Out For Delivery") {
      return res.status(400).json({
        status: "error",
        message:
          "Still processing this order. Scanning will be available after it's set to Out For Delivery.",
        currentStatus: orderInfo.status,
      });
    }

    // Step 5: Generate handOverTime (current time + 24 hours)
    const handOverTime = new Date();
    handOverTime.setHours(handOverTime.getHours() + 24);

    // Step 6: Save driver order
    const result = await orderDao.SaveDriverOrder(
      driverId,
      orderInfo.id,
      handOverTime,
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
      error.message.includes("already in your target list") ||
      error.message.includes("already been collected")
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

// Get Driver Orders
exports.GetDriverOrders = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  const driverId = req.user.id;
  let { status, isHandOver, date } = req.query;

  try {
    // Get current date for logging
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // Only filter by isHandOver if explicitly provided (0 or 1)
    const handoverFilter =
      isHandOver !== undefined ? parseInt(isHandOver) : null;

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

    // Use provided date or default to today
    let filterDate = date || todayStr;

    const orders = await orderDao.getDriverOrdersDAO(
      driverId,
      statuses,
      handoverFilter,
      filterDate,
    );

    // Count orders by status
    const statusCount = orders.reduce((acc, order) => {
      acc[order.drvStatus] = (acc[order.drvStatus] || 0) + 1;
      return acc;
    }, {});

    Object.entries(statusCount).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

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
      orderIdArray,
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
    const response = {
      status: "error",
      message: "Unauthorized: User authentication required",
    };
    console.log("StartJourney Response:", response);
    return res.status(401).json(response);
  }

  const driverId = req.user.id;
  const { orderIds } = req.body;

  try {
    // Validate orderIds parameter
    if (!orderIds) {
      const response = {
        status: "error",
        message: "orderIds parameter is required",
      };
      console.log("StartJourney Response:", response);
      return res.status(400).json(response);
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
      const response = {
        status: "error",
        message: "Valid order IDs are required",
      };
      console.log("StartJourney Response:", response);
      return res.status(400).json(response);
    }

    console.log(
      "Starting journey for driver:",
      driverId,
      "with order IDs:",
      orderIdArray,
    );

    // Start the journey
    const result = await orderDao.startJourneyDAO(driverId, orderIdArray);

    if (result.success) {
      const response = {
        status: "success",
        message: result.message,
        data: {
          updatedOrders: result.updatedOrders,
        },
      };
      console.log("StartJourney Response:", response);
      return res.status(200).json(response);
    } else {
      // IMPORTANT: Include ongoingProcessOrderIds in the error response
      const response = {
        status: "error",
        message: result.message,
        ongoingProcessOrderIds: result.ongoingProcessOrderIds || [],
      };
      console.log("StartJourney Response:", response);
      return res.status(400).json(response);
    }
  } catch (error) {
    console.error("Error starting journey:", error);
    const response = {
      status: "error",
      message: "Failed to start journey",
    };
    console.log("StartJourney Response:", response);
    return res.status(500).json(response);
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
      processOrderIds,
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
      "signatures",
    );

    // Save signature and update order statuses
    const result = await orderDao.saveSignatureAndUpdateStatusDAO(
      processOrderIds,
      signatureUrl,
      driverId,
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

//Re start Journey
exports.ReStartJourney = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    const response = {
      status: "error",
      message: "Unauthorized: User authentication required",
    };
    console.log("StartJourney Response:", response);
    return res.status(401).json(response);
  }

  const driverId = req.user.id;
  const { orderIds } = req.body;

  try {
    // Validate orderIds parameter
    if (!orderIds) {
      const response = {
        status: "error",
        message: "orderIds parameter is required",
      };
      console.log("StartJourney Response:", response);
      return res.status(400).json(response);
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
      const response = {
        status: "error",
        message: "Valid order IDs are required",
      };
      console.log("StartJourney Response:", response);
      return res.status(400).json(response);
    }

    console.log(
      "Starting journey for driver:",
      driverId,
      "with order IDs:",
      orderIdArray,
    );

    // Start the journey
    const result = await orderDao.reStartJourneyDAO(driverId, orderIdArray);

    if (result.success) {
      const response = {
        status: "success",
        message: result.message,
        data: {
          updatedOrders: result.updatedOrders,
        },
      };
      console.log("StartJourney Response:", response);
      return res.status(200).json(response);
    } else {
      const response = {
        status: "error",
        message: result.message,
        ongoingProcessOrderIds: result.ongoingProcessOrderIds || [],
      };
      console.log("StartJourney Response:", response);
      return res.status(400).json(response);
    }
  } catch (error) {
    console.error("Error starting journey:", error);
    const response = {
      status: "error",
      message: "Failed to start journey",
    };
    console.log("StartJourney Response:", response);
    return res.status(500).json(response);
  }
});
