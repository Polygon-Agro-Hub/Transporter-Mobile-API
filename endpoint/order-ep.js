const orderDao = require("../dao/order-dao");
const asyncHandler = require("express-async-handler");

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

    // Step 2: Get process order ID by invoice number
    const orderId = await orderDao.GetProcessOrderIdByInvNo(invNo);

    // Step 3: Check if order is already assigned to any driver
    const assignmentCheck = await orderDao.CheckOrderAlreadyAssigned(
      orderId,
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

    // Step 4: Generate handOverTime (current time + 24 hours)
    const handOverTime = new Date();
    handOverTime.setHours(handOverTime.getHours() + 24);

    // Step 5: Save driver order
    const result = await orderDao.SaveDriverOrder(
      driverId,
      orderId,
      handOverTime
    );

    // Step 6: Return success response with driver info
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
