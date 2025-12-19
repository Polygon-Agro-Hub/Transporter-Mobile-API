const holdDao = require("../dao/hold-dao");
const asyncHandler = require("express-async-handler");
const { submitHoldSchema } = require("../validations/hold-validation");


exports.getReason = asyncHandler(async (req, res) => {
    if (!req.user || !req.user.id) {
        return res.status(401).json({
            status: "error",
            message: "Unauthorized: User authentication required"
        });
    }

    try {
        const Reason = await holdDao.getReason();

        res.status(200).json({
            status: "success",
            message: "Reason fetched successfully",
            data: Reason
        });
    } catch (error) {
        console.error("Error fetching Reason:", error.message);

        res.status(500).json({
            status: "error",
            message: "Failed to fetch Reason. Please try again.",
        });
    }
});



exports.submitHold = asyncHandler(async (req, res) => {
    if (!req.user || !req.user.id) {
        return res.status(401).json({
            status: "error",
            message: "Unauthorized: User authentication required",
        });
    }

    // Validate request body using Joi schema
    const { error, value } = submitHoldSchema.validate(req.body, {
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

    const { orderIds, holdReasonId, note } = value;

    try {
        // Submit the return order
        const result = await holdDao.submitHold({
            orderIds,
            holdReasonId,
            note: note || null,
            userId: req.user.id,
        });

        res.status(200).json({
            status: "success",
            message: "Hold order submitted successfully",
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