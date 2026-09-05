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
      throw new Error("This Employee ID is rejected");
    }

    if (user.status === "Not Approved") {
      throw new Error("This Employee ID is not approved");
    }

    if (user.status !== "Approved") {
      throw new Error("Account status is pending verification");
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
        user.password,
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
        },
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
        co.passwordUpdated,
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
      // Throw a specific error that can be caught in controller
      throw new Error("USER_NOT_FOUND");
    }

    const user = results[0];

    return {
      empId: user.empId,
      firstNameEnglish: user.firstNameEnglish || "",
      lastNameEnglish: user.lastNameEnglish || "",
      phoneCode01: user.phoneCode01 || "",
      phoneNumber01: user.phoneNumber01 || "",
      nic: user.nic || "",
      email: user.email || "",
      image: user.image || "",
      passwordUpdated: user.passwordUpdated ?? 0,
      createdAt: user.createdAt || "",
      vType: user.vType || null,
      vRegNo: user.vRegNo || null,
    };
  } catch (err) {
    // Re-throw the error with proper context
    if (err.message === "USER_NOT_FOUND") {
      throw new Error("User not found or account not approved");
    }
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

const isReturnStatus = (status) =>
  status === "return" || status === "return received";

exports.getEarnings = async (driverId, date) => {
  try {
    const targetDate = date ? date : new Date().toISOString().split("T")[0];
    const sql = `
      SELECT 
        do.earnPrice,
        po.paymentMethod,
        po.status
      FROM collection_officer.driverorders do
      INNER JOIN collection_officer.processorders po ON do.orderId = po.id
      INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
      WHERE dom.driverId = ?
        AND DATE(do.createdAt) = ?
    `;
    const [rows] = await db.collectionofficer
      .promise()
      .query(sql, [driverId, targetDate]);

    let totalEarnings = 0;
    let cashEarnings = 0;
    let cashOrders = 0;
    let cardEarnings = 0;
    let cardOrders = 0;

    rows.forEach((row) => {
      const earnPrice = Number(row.earnPrice) || 0;
      const method = row.paymentMethod
        ? String(row.paymentMethod).toLowerCase()
        : "";
      const status = row.status ? String(row.status).toLowerCase() : "";

      // Only finalized orders count toward earnings
      if (status !== "delivered" && !isReturnStatus(status)) return;

      totalEarnings += earnPrice;

      if (method === "card") {
        cardEarnings += earnPrice;
        cardOrders++;
      } else if (method === "cash") {
        if (isReturnStatus(status)) {
          cardEarnings += earnPrice;
          cardOrders++;
        } else {
          cashEarnings += earnPrice;
          cashOrders++;
        }
      }
    });

    return {
      todayDate: new Date(targetDate).toISOString(),
      totalEarnings,
      cashEarnings,
      cashOrders,
      cardEarnings,
      cardOrders,
    };
  } catch (err) {
    console.error("Database error in getEarnings:", err.message);
    throw new Error("Failed to fetch earnings: " + err.message);
  }
};

exports.getEarningsHistory = async (driverId, fromDate, toDate) => {
  try {
    const sql = `
      SELECT 
        do.earnPrice,
        po.invNo,
        po.paymentMethod,
        po.status,
        do.createdAt
      FROM collection_officer.driverorders do
      INNER JOIN collection_officer.processorders po ON do.orderId = po.id
      INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
      WHERE dom.driverId = ?
        AND DATE(do.createdAt) BETWEEN ? AND ?
      ORDER BY do.createdAt DESC
    `;
    const [rows] = await db.collectionofficer
      .promise()
      .query(sql, [driverId, fromDate, toDate]);

    let cashEarnings = 0;
    let cashOrders = 0;
    let cardEarnings = 0;
    let cardOrders = 0;

    const orders = rows
      .map((row) => {
        const earnPrice = Number(row.earnPrice) || 0;
        const method = row.paymentMethod
          ? String(row.paymentMethod).toLowerCase()
          : "";
        const status = row.status ? String(row.status).toLowerCase() : "";

        if (status !== "delivered" && !isReturnStatus(status)) return null;

        // effectiveMethod is ONLY used for the earnings summary totals
        let effectiveMethod;
        if (method === "card") {
          effectiveMethod = "card";
        } else if (method === "cash") {
          effectiveMethod = isReturnStatus(status) ? "card" : "cash";
        } else {
          effectiveMethod = "cash";
        }

        if (effectiveMethod === "cash") {
          cashEarnings += earnPrice;
          cashOrders++;
        } else {
          cardEarnings += earnPrice;
          cardOrders++;
        }

        return {
          orderId: row.invNo,
          dateTime: row.createdAt,
          method: method || "cash",
          status: row.status,
          earnings: earnPrice,
        };
      })
      .filter(Boolean);

    return {
      summary: {
        fromDate,
        toDate,
        cashEarnings,
        cashOrders,
        cardEarnings,
        cardOrders,
      },
      orders,
    };
  } catch (err) {
    console.error("Database error in getEarningsHistory:", err.message);
    throw new Error("Failed to fetch earnings history: " + err.message);
  }
};
