const homeDao = require("../dao/home-dao");
const asyncHandler = require("express-async-handler");


// Get My Complain
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