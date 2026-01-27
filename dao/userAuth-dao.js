const db = require("../startup/database");
const bcrypt = require("bcrypt");

// Login User
exports.loginUser = async (empId, password) => {
  try {
    const sql = `
      SELECT 
        empId, 
        password, 
        id, 
        passwordUpdated,
        firstNameEnglish,
        lastNameEnglish,
        image,
        status  
      FROM collectionofficer
      WHERE empId = ? 
        AND jobRole = "Driver"
    `;

    const [results] = await db.collectionofficer.promise().query(sql, [empId]);

    if (results.length === 0) {
      throw new Error("User not found");
    }

    const user = results[0];

    if (user.status === "Rejected") {
      throw new Error("This EMP ID is Rejected");
    }

    // Check if user status is "Approved"
    if (user.status !== "Approved") {
      throw new Error("EMP ID not approved");
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new Error("Invalid password");
    }

    return {
      success: true,
      empId: user.empId,
      id: user.id,
      passwordUpdated: user.passwordUpdated,
      firstNameEnglish: user.firstNameEnglish,
      lastNameEnglish: user.lastNameEnglish,
      image: user.image,
    };
  } catch (err) {
    // Pass the specific error message
    throw new Error(err.message);
  }
};

// Change Password
exports.changePassword = async (officerId, currentPassword, newPassword) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT password
      FROM collectionofficer
      WHERE id = ?
    `;
    db.collectionofficer.query(sql, [officerId], async (err, results) => {
      if (err) {
        console.error("Database error:", err.message);
        return reject(new Error("Database error"));
      }
      if (results.length === 0) {
        return reject(new Error("Officer not found"));
      }
      const user = results[0];
      const isPasswordValid = await bcrypt.compare(
        currentPassword,
        user.password
      );
      if (!isPasswordValid) {
        return reject(new Error("Current password is incorrect"));
      }
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      const updateSql = `
        UPDATE collectionofficer
        SET password = ?, passwordUpdated = 1
        WHERE id = ?
      `;
      db.collectionofficer.query(
        updateSql,
        [hashedNewPassword, officerId],
        (updateErr, updateResults) => {
          if (updateErr) {
            console.error("Database error:", updateErr.message);
            return reject(new Error("Database error"));
          }
          resolve({ success: true, message: "Password changed successfully" });
        }
      );
    });
  });
};

// Get User Profile
exports.getUserProfile = async (empId) => {
  try {
    const sql = `
      SELECT 
        co.empId,
        co.firstNameEnglish,
        co.lastNameEnglish,
        co.phoneCode01,
        co.phoneNumber01,
        co.nic,
        co.email,
        co.image,
        co.createdAt,
        vr.vType,
        vr.vRegNo
      FROM collectionofficer co
      LEFT JOIN vehicleregistration vr ON co.id = vr.coId
      WHERE co.empId = ? 
        AND co.status = "Approved"
    `;

    const [results] = await db.collectionofficer.promise().query(sql, [empId]);

    if (results.length === 0) {
      throw new Error("User not found");
    }

    const user = results[0];

    return {
      success: true,
      empId: user.empId,
      firstNameEnglish: user.firstNameEnglish || "",
      lastNameEnglish: user.lastNameEnglish || "",
      phoneCode01: user.phoneCode01 || "",
      phoneNumber01: user.phoneNumber01 || "",
      nic: user.nic || "",
      email: user.email || "",
      image: user.image || "",
      createdAt: user.createdAt || "",
      vType: user.vType || null,
      vRegNo: user.vRegNo || null,
    };
  } catch (err) {
    throw new Error("Database error: " + err.message);
  }
};

// Update Profile Image
exports.updateProfileImage = async (empId, imageUrl) => {
  try {
    const sql = `
      UPDATE collectionofficer 
      SET image = ? 
      WHERE empId = ? 
        AND status = "Approved"
    `;

    const [result] = await db.collectionofficer
      .promise()
      .query(sql, [imageUrl, empId]);

    if (result.affectedRows === 0) {
      return {
        success: false,
        message: "User not found or not approved",
      };
    }

    return {
      success: true,
      message: "Profile image updated successfully",
      affectedRows: result.affectedRows,
    };
  } catch (err) {
    console.error("Database error in updateProfileImage:", err.message);
    throw new Error("Failed to update profile image: " + err.message);
  }
};
