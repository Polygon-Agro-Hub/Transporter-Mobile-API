const complainDao = require("../dao/complain-dao");
const asyncHandler = require("express-async-handler");

// Add Complain
exports.AddComplain = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  const officerId = req.user.id;
  const { complainCategory, complain } = req.body;

  // Validate input
  if (!complainCategory || !complain || complain.trim() === "") {
    return res.status(400).json({
      status: "error",
      message: "Category and description are required",
    });
  }

  try {
    const result = await complainDao.AddComplain(
      officerId,
      complainCategory,
      complain,
    );

    res.status(200).json({
      status: "success",
      message: "Complaint submitted successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error submitting complaint:", error.message);

    res.status(500).json({
      status: "error",
      message: "Failed to submit complaint. Please try again.",
    });
  }
});

// Get Complain Categories
exports.GetComplainCategories = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  try {
    const categories = await complainDao.GetComplainCategories();

    res.status(200).json({
      status: "success",
      message: "Categories fetched successfully",
      data: categories,
    });
  } catch (error) {
    console.error("Error fetching categories:", error.message);

    res.status(500).json({
      status: "error",
      message: "Failed to fetch categories. Please try again.",
    });
  }
});

// Get My Complain
exports.GetMyComplains = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  const driverId = req.user.id;

  try {
    const complains = await complainDao.GetMyComplains(driverId);

    res.status(200).json({
      status: "success",
      message: "Complaints fetched successfully",
      data: complains,
    });
  } catch (error) {
    console.error("Error fetching complaints:", error.message);

    res.status(500).json({
      status: "error",
      message: "Failed to fetch complaints. Please try again.",
    });
  }
});
