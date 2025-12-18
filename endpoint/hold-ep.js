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


// exports.submitHold = asyncHandler(async (req, res) => {
//     if (!req.user || !req.user.id) {
//         return res.status(401).json({
//             status: "error",
//             message: "Unauthorized: User authentication required"
//         });
//     }

//     const { orderIds, holdReasonId, note } = req.body;

//     // Validation: Check if orderIds is provided and is an array
//     if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
//         return res.status(400).json({
//             status: "error",
//             message: "Order IDs are required and must be a non-empty array"
//         });
//     }

//     // Validation: Check if holdReasonId is provided
//     if (!holdReasonId) {
//         return res.status(400).json({
//             status: "error",
//             message: "Return reason ID is required"
//         });
//     }

//     // Validation: Ensure holdReasonId is a valid number
//     if (isNaN(holdReasonId) || holdReasonId <= 0) {
//         return res.status(400).json({
//             status: "error",
//             message: "Invalid return reason ID"
//         });
//     }

//     // Validation: Ensure all orderIds are valid numbers
//     const invalidOrderIds = orderIds.filter(id => isNaN(id) || id <= 0);
//     if (invalidOrderIds.length > 0) {
//         return res.status(400).json({
//             status: "error",
//             message: "Invalid order IDs provided"
//         });
//     }

//     try {
//         // Submit the return order
//         const result = await holdDao.submitHold({
//             orderIds,
//             holdReasonId: parseInt(holdReasonId),
//             note: note && note.trim() ? note.trim() : null,
//             userId: req.user.id
//         });

//         res.status(200).json({
//             status: "success",
//             message: "Return order submitted successfully",
//             data: {
//                 processOrdersUpdated: result.processOrdersUpdated,
//                 driverOrdersUpdated: result.driverOrdersUpdated,
//                 returnOrdersInserted: result.returnOrdersInserted,
//                 orderIds: orderIds
//             }
//         });
//     } catch (error) {
//         console.error("Error submitting return order:", error.message);

//         // Check for specific error types
//         if (error.message.includes("No orders found")) {
//             return res.status(404).json({
//                 status: "error",
//                 message: "No orders found with the provided IDs"
//             });
//         }

//         if (error.message.includes("No driver orders found")) {
//             return res.status(404).json({
//                 status: "error",
//                 message: "No driver orders found for the provided order IDs"
//             });
//         }

//         res.status(500).json({
//             status: "error",
//             message: error.message || "Failed to submit return order. Please try again.",
//         });
//     }
// });

exports.submitHold = asyncHandler(async (req, res) => {
    if (!req.user || !req.user.id) {
        return res.status(401).json({
            status: "error",
            message: "Unauthorized: User authentication required"
        });
    }

    // Use Joi validation from validation file
    const { error, value } = submitHoldSchema.validate(req.body, {
        abortEarly: false
    });

    if (error) {
        const errorMessages = error.details.map(detail => detail.message);
        return res.status(400).json({
            status: "error",
            message: "Validation failed",
            errors: errorMessages
        });
    }

    const { orderIds, holdReasonId, note } = value;

    try {
        // Submit the hold order
        const result = await holdDao.submitHold({
            orderIds,
            holdReasonId: parseInt(holdReasonId),
            note: note && note.trim() ? note.trim() : null,
            userId: req.user.id
        });

        res.status(200).json({
            status: "success",
            message: "Hold order submitted successfully",
            data: {
                processOrdersUpdated: result.processOrdersUpdated,
                driverOrdersUpdated: result.driverOrdersUpdated,
                returnOrdersInserted: result.returnOrdersInserted,
                orderIds: orderIds
            }
        });
    } catch (error) {
        console.error("Error submitting hold order:", error.message);

        // Check for specific error types
        if (error.message.includes("No orders found")) {
            return res.status(404).json({
                status: "error",
                message: "No orders found with the provided IDs"
            });
        }

        if (error.message.includes("No driver orders found")) {
            return res.status(404).json({
                status: "error",
                message: "No driver orders found for the provided order IDs"
            });
        }

        res.status(500).json({
            status: "error",
            message: error.message || "Failed to submit hold order. Please try again.",
        });
    }
});

