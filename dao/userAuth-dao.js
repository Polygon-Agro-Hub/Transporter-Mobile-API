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
        po.status,
        COALESCE(
          CASE 
            WHEN LOWER(po.status) IN ('return', 'return received') OR LOWER(do.drvStatus) IN ('return', 'return received')
              THEN dro.returnTime
            ELSE po.deliveredTime
          END,
          po.deliveredTime,
          dro.returnTime
        ) AS completionTime
      FROM collection_officer.driverorders do
      INNER JOIN collection_officer.processorders po ON do.orderId = po.id
      INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
      LEFT JOIN (
        SELECT drvOrderId, MAX(createdAt) AS returnTime
        FROM collection_officer.driverreturnorders
        GROUP BY drvOrderId
      ) dro ON dro.drvOrderId = do.id
      WHERE dom.driverId = ?
        AND DATE(
          COALESCE(
            CASE 
              WHEN LOWER(po.status) IN ('return', 'return received') OR LOWER(do.drvStatus) IN ('return', 'return received')
                THEN dro.returnTime
              ELSE po.deliveredTime
            END,
            po.deliveredTime,
            dro.returnTime
          )
        ) = ?
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
        po.deliveredTime,
        dro.returnTime,
        COALESCE(
          CASE 
            WHEN LOWER(po.status) IN ('return', 'return received') OR LOWER(do.drvStatus) IN ('return', 'return received')
              THEN dro.returnTime
            ELSE po.deliveredTime
          END,
          po.deliveredTime,
          dro.returnTime
        ) AS completionTime
      FROM collection_officer.driverorders do
      INNER JOIN collection_officer.processorders po ON do.orderId = po.id
      INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
      LEFT JOIN (
        SELECT drvOrderId, MAX(createdAt) AS returnTime
        FROM collection_officer.driverreturnorders
        GROUP BY drvOrderId
      ) dro ON dro.drvOrderId = do.id
      WHERE dom.driverId = ?
        AND DATE(
          COALESCE(
            CASE 
              WHEN LOWER(po.status) IN ('return', 'return received') OR LOWER(do.drvStatus) IN ('return', 'return received')
                THEN dro.returnTime
              ELSE po.deliveredTime
            END,
            po.deliveredTime,
            dro.returnTime
          )
        ) BETWEEN ? AND ?
      ORDER BY completionTime DESC
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

        const rawTime = row.completionTime;
        let finalDateTime = rawTime;
        if (rawTime instanceof Date) {
          finalDateTime = rawTime.toISOString();
        } else if (typeof rawTime === "string") {
          finalDateTime = rawTime.includes("T") ? rawTime : rawTime.replace(" ", "T");
        }

        return {
          orderId: row.invNo,
          dateTime: finalDateTime,
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
    let sql = "SELECT id, empId, status, firstNameEnglish, lastNameEnglish, jobRole, passwordUpdated FROM collectionofficer WHERE ";
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

/**
 * Check if any of the provided fields already exist in the database.
 * Checks collectionofficer for: phone1, phone2, email, nic.
 * Checks vehicleregistration for: licenseNumber (licNo), insurancePolicyNumber (insNo), vehicleNumber (vRegNo).
 * Returns a map of duplicated fields with value "Already registered".
 */
exports.checkExistingRecordsDao = async (params = {}) => {
  try {
    const duplicates = {};

    const cleanPhone1 = (params.phone1 || "").replace(/\s+/g, "").replace(/^0+/, "");
    const cleanPhone2 = (params.phone2 || "").replace(/\s+/g, "").replace(/^0+/, "");
    const cleanEmail = (params.email || "").trim().toLowerCase();
    const cleanNic = (params.nic || "").trim().toUpperCase();

    const cleanLicense = (params.licenseNumber || "").trim().toUpperCase();
    const cleanInsurance = (params.insurancePolicyNumber || "").trim();
    const cleanVehicle = (params.vehicleNumber || "").trim().toUpperCase();

    // Helper to normalize phone numbers for comparison
    const normalizePhone = (p) =>
      (p || "").replace(/\s+/g, "").replace(/^\+94/, "").replace(/^94/, "").replace(/^0+/, "");

    // 1. Check collectionofficer table
    const officerChecks = [];
    const officerParams = [];

    const addPhoneConditions = (phoneVal) => {
      officerChecks.push(
        "(phoneNumber01 IN (?, ?, ?, ?) OR phoneNumber02 IN (?, ?, ?, ?))"
      );
      officerParams.push(
        phoneVal,
        "0" + phoneVal,
        "+94" + phoneVal,
        "94" + phoneVal,
        phoneVal,
        "0" + phoneVal,
        "+94" + phoneVal,
        "94" + phoneVal
      );
    };

    if (cleanPhone1) {
      addPhoneConditions(cleanPhone1);
    }
    if (cleanPhone2) {
      addPhoneConditions(cleanPhone2);
    }
    if (cleanEmail) {
      officerChecks.push("(LOWER(TRIM(email)) = ?)");
      officerParams.push(cleanEmail);
    }
    if (cleanNic) {
      officerChecks.push("(UPPER(TRIM(nic)) = ?)");
      officerParams.push(cleanNic);
    }

    if (officerChecks.length > 0) {
      const officerSql = `
        SELECT id, phoneNumber01, phoneNumber02, email, nic
        FROM collectionofficer
        WHERE ${officerChecks.join(" OR ")}
      `;
      const [rows] = await db.collectionofficer.promise().query(officerSql, officerParams);

      for (const row of rows) {
        const rowPhone1 = normalizePhone(row.phoneNumber01);
        const rowPhone2 = normalizePhone(row.phoneNumber02);
        const rowEmail = (row.email || "").trim().toLowerCase();
        const rowNic = (row.nic || "").trim().toUpperCase();

        if (cleanPhone1 && (rowPhone1 === cleanPhone1 || rowPhone2 === cleanPhone1)) {
          duplicates.phone1 = "Already registered";
        }
        if (cleanPhone2 && (rowPhone1 === cleanPhone2 || rowPhone2 === cleanPhone2)) {
          duplicates.phone2 = "Already registered";
        }
        if (cleanEmail && rowEmail && rowEmail === cleanEmail) {
          duplicates.email = "Already registered";
        }
        if (cleanNic && rowNic && rowNic === cleanNic) {
          duplicates.nic = "Already registered";
        }
      }
    }

    // 2. Check vehicleregistration table
    const vehicleChecks = [];
    const vehicleParams = [];

    const normalizeLicense = (l) => (l || "").trim().toUpperCase().replace(/[\s-]/g, "");
    const normalizeVehicle = (v) => (v || "").trim().toUpperCase().replace(/[\s-]/g, "");

    if (cleanLicense) {
      const normLic = normalizeLicense(cleanLicense);
      vehicleChecks.push(
        "(UPPER(TRIM(licNo)) = ? OR REPLACE(REPLACE(UPPER(TRIM(licNo)), '-', ''), ' ', '') = ?)"
      );
      vehicleParams.push(cleanLicense, normLic);
    }
    if (cleanInsurance) {
      const normIns = cleanInsurance.replace(/[\s\/-]/g, "").toUpperCase();
      vehicleChecks.push(
        "(TRIM(insNo) = ? OR REPLACE(REPLACE(REPLACE(UPPER(TRIM(insNo)), '-', ''), '/', ''), ' ', '') = ?)"
      );
      vehicleParams.push(cleanInsurance, normIns);
    }
    if (cleanVehicle) {
      const normVeh = normalizeVehicle(cleanVehicle);
      vehicleChecks.push(
        "(UPPER(TRIM(vRegNo)) = ? OR REPLACE(REPLACE(UPPER(TRIM(vRegNo)), '-', ''), ' ', '') = ?)"
      );
      vehicleParams.push(cleanVehicle, normVeh);
    }

    if (vehicleChecks.length > 0) {
      const vehicleSql = `
        SELECT id, licNo, insNo, vRegNo
        FROM vehicleregistration
        WHERE ${vehicleChecks.join(" OR ")}
      `;
      const [rows] = await db.collectionofficer.promise().query(vehicleSql, vehicleParams);

      for (const row of rows) {
        const rowLic = (row.licNo || "").trim().toUpperCase();
        const rowIns = (row.insNo || "").trim();
        const rowVReg = (row.vRegNo || "").trim().toUpperCase();

        if (
          cleanLicense &&
          rowLic &&
          (rowLic === cleanLicense || normalizeLicense(rowLic) === normalizeLicense(cleanLicense))
        ) {
          duplicates.licenseNumber = "Already registered";
        }
        if (
          cleanInsurance &&
          rowIns &&
          (rowIns.toLowerCase() === cleanInsurance.toLowerCase() ||
            rowIns.replace(/[\s\/-]/g, "").toLowerCase() ===
              cleanInsurance.replace(/[\s\/-]/g, "").toLowerCase())
        ) {
          duplicates.insurancePolicyNumber = "Already registered";
        }
        if (
          cleanVehicle &&
          rowVReg &&
          (rowVReg === cleanVehicle || normalizeVehicle(rowVReg) === normalizeVehicle(cleanVehicle))
        ) {
          duplicates.vehicleNumber = "Already registered";
        }
      }
    }

    return duplicates;
  } catch (err) {
    console.error("Database error in checkExistingRecordsDao:", err.message);
    throw err;
  }
};

/**
 * Check if a driver with the given NIC or phone number already exists.
 */
exports.checkDriverExists = async (nic, phone) => {
  try {
    const cleanNic = (nic || "").trim().toUpperCase();
    const cleanPhone = (phone || "").replace(/\s+/g, "").replace(/^0+/, "");

    const sql = `
      SELECT id, empId, nic, phoneNumber01 
      FROM collectionofficer 
      WHERE (nic = ? AND ? != '') 
         OR (phoneNumber01 = ? AND ? != '')
      LIMIT 1
    `;
    const [rows] = await db.collectionofficer
      .promise()
      .query(sql, [cleanNic, cleanNic, cleanPhone, cleanPhone]);
    return rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.error("Database error in checkDriverExists:", err.message);
    throw err;
  }
};

/**
 * Register a new driver with status 'Not Approved'.
 * Does NOT generate a driver employee ID (empId remains NULL until admin approves and assigns one).
 * Submits the company as Distribution Polygon Holdings Company (companyId: 2).
 * Inserts into collectionofficer and vehicleregistration in an atomic transaction.
 */
const DISTRIBUTION_POLYGON_HOLDINGS_COMPANY_ID = 2;

exports.registerDriverDao = async (data) => {
  const connection = await db.collectionofficer.promise().getConnection();
  try {
    await connection.beginTransaction();

    // 1. Prepare collectionofficer row
    // Password and empId remain NULL upon registration.
    // The admin sets/generates the initial password and assigns an empId upon approval,
    // and sends those credentials directly to the driver to log in.
    const personal = data.personal || {};
    const residential = data.residential || {};
    const bank = data.bank || {};
    const license = data.license || {};
    const insurance = data.insurance || {};
    const vehicle = data.vehicle || {};

    const languagesStr = Array.isArray(personal.languages)
      ? personal.languages.join(", ")
      : personal.languages || "English";

    const insertOfficerSql = `
      INSERT INTO collectionofficer (
        companyId,
        empId,
        firstNameEnglish,
        lastNameEnglish,
        phoneCode01,
        phoneNumber01,
        phoneCode02,
        phoneNumber02,
        nic,
        email,
        password,
        passwordUpdated,
        jobRole,
        houseNumber,
        streetName,
        city,
        district,
        province,
        country,
        languages,
        accHolderName,
        accNumber,
        bankName,
        branchName,
        image,
        status,
        claimStatus,
        onlineStatus,
        createdAt
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NOW())
    `;

    const officerParams = [
      DISTRIBUTION_POLYGON_HOLDINGS_COMPANY_ID,
      (personal.firstName || "").trim(),
      (personal.lastName || "").trim(),
      "+94",
      (personal.phone1 || "").replace(/\s+/g, "").replace(/^0+/, ""),
      personal.phone2 ? "+94" : null,
      personal.phone2 ? personal.phone2.replace(/\s+/g, "").replace(/^0+/, "") : null,
      (personal.nic || "").trim().toUpperCase(),
      personal.email ? personal.email.trim().toLowerCase() : null,
      personal.jobRole || "Light Weight Driver",
      (residential.houseNumber || "").trim(),
      (residential.streetName || "").trim(),
      (residential.city || "").trim(),
      (residential.district || "").trim(),
      residential.province ? residential.province.trim() : null,
      residential.country || "Sri Lanka",
      languagesStr,
      (bank.bankAccountHolder || "").trim(),
      (bank.bankAccountNumber || "").trim(),
      (bank.bankName || "").trim(),
      (bank.bankBranch || "").trim(),
      personal.profilePhoto || null,
      OFFICER_STATUS.NOT_APPROVED,
    ];

    const [officerResult] = await connection.query(insertOfficerSql, officerParams);
    const coId = officerResult.insertId;
    const referenceId = `REG-DRV-${String(coId).padStart(5, "0")}`;

    // 3. Format insurance expiry date for MySQL (YYYY-MM-DD)
    let formattedExpiryDate = null;
    if (insurance.insuranceExpiry) {
      const parts = insurance.insuranceExpiry.split("/");
      if (parts.length === 3) {
        formattedExpiryDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      } else if (insurance.insuranceExpiry.includes("-")) {
        formattedExpiryDate = insurance.insuranceExpiry.split("T")[0];
      }
    }

    // 4. Parse capacity
    let capacityNum = 0;
    if (typeof vehicle.vehicleCapacity === "number") {
      capacityNum = vehicle.vehicleCapacity;
    } else if (vehicle.vehicleCapacity) {
      capacityNum = parseInt(String(vehicle.vehicleCapacity).replace(/[^0-9]/g, ""), 10) || 0;
    }

    // 5. Insert vehicleregistration row
    const insertVehicleSql = `
      INSERT INTO vehicleregistration (
        coId,
        licNo,
        insNo,
        insExpDate,
        vType,
        vCapacity,
        vRegNo,
        licFrontImg,
        licBackImg,
        insFrontImg,
        insBackImg,
        vehFrontImg,
        vehBackImg,
        vehSideImgA,
        vehSideImgB
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const vehicleParams = [
      coId,
      (license.licenseNumber || "").trim().toUpperCase(),
      (insurance.insurancePolicyNumber || "").trim(),
      formattedExpiryDate,
      (vehicle.vehicleType || "").trim(),
      capacityNum,
      (vehicle.vehicleNumber || "").trim().toUpperCase(),
      license.licenseFrontPhoto || null,
      license.licenseBackPhoto || null,
      insurance.insuranceFrontPhoto || null,
      insurance.insuranceBackPhoto || null,
      vehicle.vehicleFrontPhoto || null,
      vehicle.vehicleBackPhoto || null,
      vehicle.vehicleLeftSidePhoto || null,
      vehicle.vehicleRightSidePhoto || null,
    ];

    await connection.query(insertVehicleSql, vehicleParams);

    await connection.commit();

    return {
      coId,
      referenceId,
      empId: null,
      status: OFFICER_STATUS.NOT_APPROVED,
    };
  } catch (error) {
    await connection.rollback();
    console.error("Database error in registerDriverDao:", error);
    throw error;
  } finally {
    connection.release();
  }
};



