const homeDao = require("../dao/home-dao");
const asyncHandler = require("express-async-handler");


// Get My Amount
exports.getAmount = asyncHandler(async (req, res) => {
    if (!req.user || !req.user.id) {
        return res.status(401).json({
            status: "error",
            message: "Unauthorized: User authentication required"
        });
    }

    const driverId = req.user.id;

    console.log("-------------------", driverId)

    try {
        const amount = await homeDao.getAmount(driverId);

        console.log("--------------------", amount)

        res.status(200).json({
            status: "success",
            message: "Amount fetched successfully",
            data: amount
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
            message: "Unauthorized: User authentication required"
        });
    }

    const driverId = req.user.id;

    console.log("-------------------", driverId)

    try {
        const amount = await homeDao.getReceivedCash(driverId);

        console.log("--------------------", amount)

        res.status(200).json({
            status: "success",
            message: "Amount fetched successfully",
            data: amount
        });
    } catch (error) {
        console.error("Error fetching Amount:", error.message);

        res.status(500).json({
            status: "error",
            message: "Failed to fetch Amount. Please try again.",
        });
    }
});



// update hand Over 

exports.handOverCash = asyncHandler(async (req, res) => {
    if (!req.user || !req.user.id) {
        return res.status(401).json({
            status: "error",
            message: "Unauthorized: User authentication required"
        });
    }



    const { orderIds, totalAmount, officerId } = req.body; // Changed from officerId to empId

    const empId = officerId;
    const driverId = req.user.id;

    if (!orderIds || orderIds.length === 0) {
        return res.status(400).json({
            status: "error",
            message: "No orders selected"
        });
    }

    if (!empId) {
        return res.status(400).json({
            status: "error",
            message: "Officer Employee ID is required"
        });
    }

    console.log("Hand over request:", { orderIds, totalAmount, empId, driverId });

    try {
        // Get officer ID from empId
        const officer = await homeDao.getOfficerByEmpId(empId);
        if (!officer) {
            return res.status(404).json({
                status: "error",
                message: "Officer not found in the system"
            });
        }

        const officerId = officer.id;

        await homeDao.handOverCash(orderIds, officerId, totalAmount);

        res.status(200).json({
            status: "success",
            message: "Cash handed over successfully",
            data: {
                empId,
                officerId,
                totalAmount,
                orderCount: orderIds.length
            }
        });
    } catch (error) {
        console.error("Error handing over cash:", error.message);
        res.status(500).json({
            status: "error",
            message: "Failed to hand over cash. Please try again.",
        });
    }
});