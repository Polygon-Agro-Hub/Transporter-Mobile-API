/**
 * Script to test sending return order OTP notification to DCM (Distribution Centre Manager).
 * Targets: DCM00001
 * 
 * Usage: node scripts/send-return-otp-dcm.js [dcmEmpId]
 */
require("dotenv").config();
const axios = require("axios");
const db = require("../startup/database");
const returnOtpCache = require("../services/return-otp-cache");

const targetDcmEmpId = (process.argv[2] || "DCM00001").trim().toUpperCase();

async function run() {
  console.log(`\n======================================================`);
  console.log(`🚀 Starting Return OTP Notification Test for DCM: ${targetDcmEmpId}`);
  console.log(`======================================================\n`);

  try {
    // 1. Verify DCM in database
    const dcm = await new Promise((resolve, reject) => {
      const sql = `
        SELECT id, empId, firstNameEnglish, lastNameEnglish, status, jobRole, distributedCenterId
        FROM collection_officer.collectionofficer
        WHERE UPPER(empId) = ?
        LIMIT 1
      `;
      db.collectionofficer.query(sql, [targetDcmEmpId], (err, rows) => {
        if (err) return reject(err);
        if (rows.length === 0) return reject(new Error(`Officer with ID '${targetDcmEmpId}' not found in database.`));
        resolve(rows[0]);
      });
    });

    console.log(`👤 Target DCM Found:`);
    console.log(`   - ID: ${dcm.id}`);
    console.log(`   - Emp ID: ${dcm.empId}`);
    console.log(`   - Name: ${dcm.firstNameEnglish} ${dcm.lastNameEnglish || ""}`.trim());
    console.log(`   - Role: ${dcm.jobRole}`);
    console.log(`   - Status: ${dcm.status}`);
    console.log(`   - Center ID: ${dcm.distributedCenterId}\n`);

    // 2. Find an active or pending return order
    const returnOrder = await new Promise((resolve, reject) => {
      const sql = `
        SELECT do.id as drvOrderId, do.orderId as processOrderId, do.drvStatus, po.invNo
        FROM collection_officer.driverorders do
        LEFT JOIN collection_officer.processorders po ON do.orderId = po.id
        WHERE do.drvStatus LIKE '%Return%'
        ORDER BY (do.drvStatus = 'Return') DESC, do.id DESC
        LIMIT 1
      `;
      db.collectionofficer.query(sql, (err, rows) => {
        if (err) return reject(err);
        if (rows.length === 0) return reject(new Error("No return orders found in database to associate with OTP."));
        resolve(rows[0]);
      });
    });

    console.log(`📦 Return Order Found:`);
    console.log(`   - Driver Order ID: ${returnOrder.drvOrderId}`);
    console.log(`   - Invoice No: ${returnOrder.invNo}`);
    console.log(`   - Current Status: ${returnOrder.drvStatus}\n`);

    // 3. Generate 5-digit OTP
    const otpCode = Math.floor(10000 + Math.random() * 90000);
    console.log(`🔑 Generated 5-digit OTP: ${otpCode}`);

    // 4. Save to Database (handoverreturnorder table)
    const insertResult = await new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO collection_officer.handoverreturnorder 
          (drvOrderId, handOverOfficerId, otpCode, expireTime, createdAt)
        VALUES 
          (?, ?, ?, DATE_ADD(NOW(), INTERVAL 2 MINUTE), NOW())
      `;
      db.collectionofficer.query(sql, [returnOrder.drvOrderId, dcm.id, otpCode], (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });

    const otpId = insertResult.insertId;
    console.log(`💾 Database record created: handoverreturnorder.id = ${otpId} (Expires in 2 mins)`);

    // 5. Cache in Node-Cache (in-memory)
    const cachePayload = {
      otpId,
      otpCode,
      drvOrderId: returnOrder.drvOrderId,
      invoiceNumber: returnOrder.invNo,
      dcmEmpId: dcm.empId,
      officerId: dcm.id,
      officerName: dcm.firstNameEnglish,
      expiresInSeconds: 120,
    };
    returnOtpCache.setReturnOtp(cachePayload, 120);

    // Verify cache read
    const cached = returnOtpCache.getReturnOtp({ drvOrderId: returnOrder.drvOrderId });
    if (cached) {
      console.log(`⚡ Node-Cache verified: OTP ${cached.otpCode} active in memory for 120s`);
    }

    // 6. Send HTTP notification to Collector API (Codi Net)
    const collectorBase = (
      process.env.COLLECTOR_API_URL ||
      "https://collector-api.polygonagro.com/agro-api/collection-api"
    ).replace(/\/+$/, "");

    console.log(`\n📡 Dispatching real-time notification to Codi Net Collector API...`);
    console.log(`   - URL: ${collectorBase}/api/distribution-manager/notify-return-otp`);

    const webhookPayload = {
      id: otpId,
      officerId: dcm.id,
      dcmEmpId: dcm.empId,
      invNo: returnOrder.invNo,
      otpCode: String(otpCode),
      createdAt: new Date().toISOString(),
      isRead: 0,
    };

    const triggerSecret =
      process.env.CODINET_TRIGGER_SECRET || "codi_sec_trg_192tk596ikg90e9kf9t6b21";

    const response = await axios.post(
      `${collectorBase}/api/distribution-manager/notify-return-otp`,
      webhookPayload,
      {
        headers: {
          "Content-Type": "application/json",
          "x-service-token": triggerSecret,
          Authorization: `Bearer ${triggerSecret}`,
        },
        timeout: 8000,
      }
    );

    console.log(`\n✅ Codi Net Collector API Response (${response.status} ${response.statusText}):`);
    console.log(JSON.stringify(response.data, null, 2));

    console.log(`\n======================================================`);
    console.log(`🎉 SUCCESS! Return OTP notification dispatched to ${dcm.empId}`);
    console.log(`   - OTP Code: ${otpCode}`);
    console.log(`   - Invoice No: ${returnOrder.invNo}`);
    console.log(`   - Socket Rooms Notified: user_${dcm.id}, user_${dcm.empId}`);
    console.log(`======================================================\n`);

  } catch (error) {
    console.error(`\n❌ Error during return OTP test:`, error.response ? error.response.data : error.message);
  } finally {
    process.exit(0);
  }
}

run();
