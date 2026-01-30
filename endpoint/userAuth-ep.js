const userDao = require("../dao/userAuth-dao");
const jwt = require("jsonwebtoken");
const { loginSchema } = require("../validations/userAuth-validations");
const asyncHandler = require("express-async-handler");
const uploadFileToS3 = require("../middlewares/s3upload");

// Login User
exports.login = asyncHandler(async (req, res) => {
  console.log("hit login");
  const { error } = loginSchema.validate(req.body, { abortEarly: false });
  console.log(error);

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: error.details.map((err) => err.message),
    });
  }

  const { empId, password } = req.body;

  try {
    const result = await userDao.loginUser(empId, password);
    console.log("User login successful:", result);

    // Define JWT payload
    const payload = {
      empId: result.empId,
      id: result.id,
      passwordUpdated: result.passwordUpdated,
      iat: Math.floor(Date.now() / 1000),
    };

    // Create JWT token
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "8h",
    });

    // Send token as HTTP-only cookie (more secure)
    res.cookie("authToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 8 * 60 * 60 * 1000,
    });

    // Send response with token
    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        empId: result.empId,
        id: result.id,
        token,
        passwordUpdated: result.passwordUpdated,
        firstNameEnglish: result.firstNameEnglish,
        lastNameEnglish: result.lastNameEnglish,
        image: result.image,
      },
    });
  } catch (err) {
    console.error("Login failed:", err.message);
    return res.status(401).json({ success: false, message: err.message });
  }
});

// Change Password
exports.changePassword = asyncHandler(async (req, res) => {
  const officerId = req.user.id;
  const { currentPassword, newPassword } = req.body;
  console.log("Hit change password");

  try {
    const result = await userDao.changePassword(
      officerId,
      currentPassword,
      newPassword,
    );
    res.status(200).json({
      status: "success",
      message: result.message,
    });
  } catch (error) {
    console.error("Error changing password:", error.message);

    // Custom error handling
    if (error.message === "Current password is incorrect") {
      return res.status(401).json({
        status: "error",
        message: error.message,
      });
    }

    if (error.message === "Officer not found") {
      return res.status(404).json({
        status: "error",
        message: error.message,
      });
    }

    // Default to 400 for other errors
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
});

// Get User Profile
exports.getProfile = asyncHandler(async (req, res) => {
  try {
    console.log("Getting profile for user:", req.user);

    // Use empId from the decoded token
    const empId = req.user.empId;

    if (!empId) {
      return res.status(400).json({
        success: false,
        status: "error",
        message: "Employee ID not found in token",
      });
    }

    console.log("Fetching profile for empId:", empId);

    const userProfile = await userDao.getUserProfile(empId);

    console.log("User profile fetched successfully");

    return res.status(200).json({
      success: true,
      status: "success",
      message: "User profile fetched successfully",
      data: userProfile,
    });
  } catch (err) {
    console.error("Get profile failed:", err.message);

    // Determine the type of error
    let statusCode = 500;
    let errorMessage = err.message;

    if (err.message.includes("User not found")) {
      statusCode = 404;
      errorMessage =
        "User account not found or not approved. Please contact support.";
    } else if (err.message.includes("Database error")) {
      statusCode = 500;
      errorMessage = "Database error occurred. Please try again.";
    }

    return res.status(statusCode).json({
      success: false,
      status: "error",
      message: errorMessage,
    });
  }
});

// Update Profile Image
exports.updateProfileImage = asyncHandler(async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Profile image is required",
      });
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: "Only JPEG, JPG, and PNG images are allowed",
      });
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (req.file.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: "Image size should not exceed 5MB",
      });
    }

    // Get empId from token
    const empId = req.user.empId;

    if (!empId) {
      return res.status(400).json({
        success: false,
        message: "Employee ID not found in token",
      });
    }

    // Get current user info to check if they have an existing image
    const currentProfile = await userDao.getUserProfile(empId);

    if (currentProfile.image && currentProfile.image !== "") {
      try {
        await deleteFromR2(currentProfile.image);
      } catch (deleteError) {
        console.warn("Failed to delete old image:", deleteError.message);
      }
    }

    // Upload new image to R2
    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;
    const keyPrefix = "users/profile-images";

    const imageUrl = await uploadFileToS3(fileBuffer, fileName, keyPrefix);

    // Update profile image in database
    const result = await userDao.updateProfileImage(empId, imageUrl);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        message: result.message,
      });
    }

    console.log("Profile image updated successfully");

    return res.status(200).json({
      success: true,
      message: "Profile image updated successfully",
      data: {
        imageUrl: imageUrl,
        empId: empId,
      },
    });
  } catch (err) {
    console.error("Update profile image failed:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to update profile image: " + err.message,
    });
  }
});
