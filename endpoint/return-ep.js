const returnDao = require("../dao/return-dao");
const asyncHandler = require("express-async-handler");
const { submitReturnSchema } = require("../validations/return-validation");

// Get All Return Reasons
exports.getReason = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  try {
    const reasons = await returnDao.getReason();

    res.status(200).json({
      status: "success",
      message: "Reasons fetched successfully",
      data: reasons,
    });
  } catch (error) {
    console.error("Error fetching reasons:", error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch reasons. Please try again.",
    });
  }
});

// Submit Return Order
exports.submitReturn = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  // Validate request body using Joi schema
  const { error, value } = submitReturnSchema.validate(req.body, {
    abortEarly: false,
  });

  if (error) {
    const errors = error.details.map((detail) => detail.message);
    return res.status(400).json({
      status: "error",
      message: "Validation failed",
      errors: errors,
    });
  }

  const { orderIds, returnReasonId, note } = value;

  try {
    // Submit the return order
    const result = await returnDao.submitReturn({
      orderIds,
      returnReasonId,
      note: note || null,
      userId: req.user.id,
    });

    res.status(200).json({
      status: "success",
      message: "Return order submitted successfully",
      data: {
        processOrdersUpdated: result.processOrdersUpdated,
        driverOrdersUpdated: result.driverOrdersUpdated,
        returnOrdersInserted: result.returnOrdersInserted,
        orderIds: orderIds,
        invoiceNumbers: result.invoiceNumbers || [], 
        orderDetails: result.orderDetails || [], 
      },
    });
  } catch (error) {
    console.error("Error submitting return order:", error.message);

    // Check for specific error types
    if (error.message.includes("No orders found")) {
      return res.status(404).json({
        status: "error",
        message: "No orders found with the provided IDs",
      });
    }

    if (error.message.includes("No driver orders found")) {
      return res.status(404).json({
        status: "error",
        message: "No driver orders found for the provided order IDs",
      });
    }

    res.status(500).json({
      status: "error",
      message:
        error.message || "Failed to submit return order. Please try again.",
    });
  }
});
