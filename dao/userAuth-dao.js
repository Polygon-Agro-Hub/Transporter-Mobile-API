const db = require("../startup/database");
const bcrypt = require("bcrypt");
const { ROLES } = require("../constants/user-roles");
const { OFFICER_STATUS } = require("../constants/officer-status");

// Login User
exports.loginUser = async (empId, password) => {
  try {
    const sql = `
      SELECT 
        co.empId, 
        co.password, 
        co.id, 
        co.passwordUpdated,
        co.firstNameEnglish,
        co.lastNameEnglish,
        co.image,
        co.status,
        co.jobRole,
        co.QRcode
      FROM collectionofficer co
      WHERE co.empId = ?
      ORDER BY co.id DESC
    `;

    const [results] = await db.collectionofficer.promise().query(sql, [empId]);

    if (results.length === 0) {
      throw new Error("User not found");
    }

    let user = null;
    let passwordMatches = false;
    let rejectionError = null;

    for (const u of results) {
      if (u.status === OFFICER_STATUS.REJECTED) {
        rejectionError = "This Employee ID is rejected";
        continue;
      }
      if (u.status === OFFICER_STATUS.NOT_APPROVED || u.status !== OFFICER_STATUS.APPROVED) {
        rejectionError = "This Employee ID is not approved";
        continue;
      }

      const isPasswordValid = await bcrypt.compare(password, u.password);
      if (isPasswordValid) {
        user = u;
        passwordMatches = true;
        break;
      }
    }

    if (!passwordMatches) {
      if (rejectionError && !results.some((r) => r.status === "Approved")) {
        throw new Error(rejectionError);
      }
      throw new Error("Invalid password");
    }

    const jobRole =
      user.jobRole === ROLES.HEAVY_WEIGHT_DRIVER
        ? ROLES.HEAVY_WEIGHT_DRIVER
        : ROLES.LIGHT_WEIGHT_DRIVER;

    return {
      success: true,
      empId: user.empId,
      id: user.id,
      passwordUpdated: user.passwordUpdated,
      firstNameEnglish: user.firstNameEnglish,
      lastNameEnglish: user.lastNameEnglish,
      image: user.image,
      jobRole: jobRole,
      QRcode: user.QRcode || null,
      qrCode: user.QRcode || null,
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
exports.getUserProfile = async (empId, officerId) => {
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
        co.jobRole,
        co.passwordUpdated,
        co.createdAt,
        co.QRcode,
        co.companyId,
        vr.vType,
        vr.vRegNo,
        c.companyNameEnglish,
        c.companyNameSinhala,
        c.companyNameTamil,
        c.logo AS companyLogo
      FROM collectionofficer co
      LEFT JOIN vehicleregistration vr ON co.id = vr.coId
      LEFT JOIN company c ON co.companyId = c.id
      WHERE (co.id = ? OR (co.empId = ? AND ? IS NULL))
        AND co.status = "Approved"
      ORDER BY co.id DESC
    `;

    const [results] = await db.collectionofficer.promise().query(sql, [
      officerId || null,
      empId,
      officerId || null,
    ]);

    if (results.length === 0) {
      throw new Error("USER_NOT_FOUND");
    }

    const user = results[0];

    const exactJobRole =
      user.jobRole === ROLES.HEAVY_WEIGHT_DRIVER
        ? ROLES.HEAVY_WEIGHT_DRIVER
        : ROLES.LIGHT_WEIGHT_DRIVER;

    return {
      empId: user.empId,
      firstNameEnglish: user.firstNameEnglish || "",
      lastNameEnglish: user.lastNameEnglish || "",
      phoneCode01: user.phoneCode01 || "",
      phoneNumber01: user.phoneNumber01 || "",
      nic: user.nic || "",
      email: user.email || "",
      image: user.image || "",
      jobRole: exactJobRole,
      passwordUpdated: user.passwordUpdated ?? 0,
      createdAt: user.createdAt || "",
      vType: user.vType || null,
      vRegNo: user.vRegNo || null,
      QRcode: user.QRcode || null,
      qrCode: user.QRcode || null,
      company: {
        id: user.companyId || null,
        nameEnglish: user.companyNameEnglish || "",
        nameSinhala: user.companyNameSinhala || "",
        nameTamil: user.companyNameTamil || "",
        logo: user.companyLogo || null,
      },
    };
  } catch (err) {
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

/**
 * Fetch all disallowed officers (Rejected, Not Approved) from database.
 */
exports.getDisallowedOfficersDao = async () => {
  try {
    const sql = `
      SELECT id, status 
      FROM collectionofficer 
      WHERE status IN (?, ?)
    `;
    const [results] = await db.collectionofficer.promise().query(sql, [
      OFFICER_STATUS.REJECTED,
      OFFICER_STATUS.NOT_APPROVED,
    ]);
    return results;
  } catch (err) {
    console.error("Database error in getDisallowedOfficersDao:", err.message);
    throw err;
  }
};

/**
 * Fetch officer details and status by ID or EmpId.
 */
exports.getOfficerDetailsDao = async ({ id, empId } = {}) => {
  try {
    let sql = "SELECT id, empId, status, firstNameEnglish, lastNameEnglish FROM collectionofficer WHERE ";
    const params = [];

    if (id) {
      sql += "id = ?";
      params.push(Number(id));
    } else if (empId) {
      sql += "empId = ?";
      params.push(String(empId));
    } else {
      return null;
    }

    const [results] = await db.collectionofficer.promise().query(sql, params);
    return results.length > 0 ? results[0] : null;
  } catch (err) {
    console.error("Database error in getOfficerDetailsDao:", err.message);
    throw err;
  }
};



