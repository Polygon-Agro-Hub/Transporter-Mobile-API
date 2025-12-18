const db = require("../startup/database");

// Get process order ID by invoice number
exports.GetProcessOrderIdByInvNo = async (invNo) => {
  return new Promise((resolve, reject) => {
    const sql = `
            SELECT id 
            FROM market_place.processorders 
            WHERE invNo = ? 
            LIMIT 1
        `;

    db.marketPlace.query(sql, [invNo], (err, results) => {
      if (err) {
        console.error("Database error fetching process order:", err.message);
        return reject(new Error("Failed to fetch process order"));
      }

      if (results.length === 0) {
        return reject(new Error("Invoice number not found"));
      }

      resolve(results[0].id);
    });
  });
};

// Save driver order and update processorders status
exports.SaveDriverOrder = async (driverId, processOrderId, handOverTime) => {
  return new Promise(async (resolve, reject) => {
    try {
      // STEP 1: Insert using processorders.id (FK correct)
      const insertSql = `
        INSERT INTO collection_officer.driverorders
        (driverId, orderId, handOverTime, drvStatus, isHandOver, createdAt)
        VALUES (?, ?, ?, 'Todo', 0, NOW())
      `;

      const insertResult = await new Promise((res, rej) => {
        db.collectionofficer.query(
          insertSql,
          [driverId, processOrderId, handOverTime],
          (err, result) => {
            if (err) return rej(err);
            res(result);
          }
        );
      });

      // STEP 2: Update processorders
      const updateSql = `
        UPDATE market_place.processorders
        SET status = 'Collected',
            isTargetAssigned = 1
        WHERE id = ?
      `;

      await new Promise((res, rej) => {
        db.marketPlace.query(updateSql, [processOrderId], (err, result) => {
          if (err) return rej(err);
          res(result);
        });
      });

      resolve({
        message: "Order assigned successfully",
        driverOrderId: insertResult.insertId,
        processOrderId,
        status: "Collected",
      });
    } catch (error) {
      reject(error);
    }
  });
};

// Check If Order Is Already Assigned
exports.CheckOrderAlreadyAssigned = async (processOrderId, driverId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
          do.id as driverOrderId,
          do.driverId as assignedDriverId,
          co.empId as assignedDriverEmpId,
          CONCAT(co.firstNameEnglish, ' ', co.lastNameEnglish) as assignedDriverName
      FROM collection_officer.driverorders do
      INNER JOIN collection_officer.collectionofficer co ON do.driverId = co.id
      WHERE do.orderId = ?  -- direct FK match
      LIMIT 1
    `;

    db.collectionofficer.query(sql, [processOrderId], (err, results) => {
      if (err) {
        console.error("Database error checking order assignment:", err.message);
        return reject(new Error("Failed to check order assignment"));
      }

      if (results.length > 0) {
        const assignment = results[0];

        if (assignment.assignedDriverId == driverId) {
          resolve({
            isAssigned: true,
            assignedToSameDriver: true,
            message: "This order is already in your target list.",
          });
        } else {
          resolve({
            isAssigned: true,
            assignedToSameDriver: false,
            assignedDriverEmpId: assignment.assignedDriverEmpId,
            assignedDriverName: assignment.assignedDriverName,
            message: `This order has already been assigned to another driver (Driver ID: ${assignment.assignedDriverEmpId}).`,
          });
        }
      } else {
        resolve({
          isAssigned: false,
          assignedToSameDriver: false,
        });
      }
    });
  });
};

// Get Driver's EmpId
exports.GetDriverEmpId = async (driverId) => {
  return new Promise((resolve, reject) => {
    const sql = `
            SELECT empId 
            FROM collection_officer.collectionofficer 
            WHERE id = ? 
            LIMIT 1
        `;

    db.collectionofficer.query(sql, [driverId], (err, results) => {
      if (err) {
        console.error("Database error fetching driver empId:", err.message);
        return reject(new Error("Failed to fetch driver details"));
      }

      if (results.length === 0) {
        return reject(new Error("Driver not found"));
      }

      resolve(results[0].empId);
    });
  });
};

// Get Driver's Order DAO
exports.getDriverOrdersDAO = async (driverId, statuses, isHandOver = 0) => {
  return new Promise((resolve, reject) => {
    let sql = `
      SELECT 
        MIN(do.id) as driverOrderId,
        GROUP_CONCAT(do.id ORDER BY do.createdAt) as allDriverOrderIds,
        GROUP_CONCAT(po.id ORDER BY po.id) as allProcessOrderIds,
        GROUP_CONCAT(o.id ORDER BY o.id) as allOrderIds,
        GROUP_CONCAT(o.sheduleTime ORDER BY o.sheduleTime) as allScheduleTimes,
        MIN(o.sheduleTime) as primaryScheduleTime,
        COUNT(*) as jobCount,
        MAX(do.drvStatus) as drvStatus,
        MAX(do.isHandOver) as isHandOver,
        u.id as userId,
        u.title as userTitle,
        u.firstName,
        u.lastName,
        u.phoneCode,
        u.phoneNumber,
        u.image
      FROM collection_officer.driverorders do
      INNER JOIN market_place.processorders po ON do.orderId = po.id
      INNER JOIN market_place.orders o ON po.orderId = o.id
      INNER JOIN market_place.marketplaceusers u ON o.userId = u.id
      WHERE do.driverId = ?
        AND do.isHandOver = ?
    `;

    const params = [driverId, isHandOver];

    if (statuses && statuses.length > 0) {
      const validStatuses = statuses.filter((s) =>
        ["Todo", "Completed", "Hold", "Return", "On the way"].includes(s)
      );
      if (validStatuses.length > 0) {
        sql += ` AND do.drvStatus IN (?)`;
        params.push(validStatuses);
      }
    }

    sql += ` GROUP BY u.id ORDER BY MIN(o.sheduleTime) ASC, MAX(do.createdAt) DESC`;

    db.collectionofficer.query(sql, params, (err, results) => {
      if (err) {
        console.error("Database error fetching driver orders:", err.message);
        console.error("SQL:", sql);
        return reject(new Error("Failed to fetch driver orders"));
      }

      const formattedResults = results.map((row, index) => ({
        driverOrderId: row.driverOrderId,
        drvStatus: row.drvStatus,
        isHandOver: row.isHandOver === 1,
        fullName: `${row.firstName || ""} ${row.lastName || ""}`.trim(),
        jobCount: row.jobCount,
        allDriverOrderIds: row.allDriverOrderIds
          ? row.allDriverOrderIds.split(",").map(Number)
          : [row.driverOrderId],
        allOrderIds: row.allOrderIds
          ? row.allOrderIds.split(",").map(Number)
          : [],
        allProcessOrderIds: row.allProcessOrderIds
          ? row.allProcessOrderIds.split(",").map(Number)
          : [],
        allScheduleTimes: row.allScheduleTimes
          ? row.allScheduleTimes.split(",")
          : [],
        primaryScheduleTime: row.primaryScheduleTime || "Not Scheduled",
        sequenceNumber: (index + 1).toString().padStart(2, "0"),
        userId: row.userId,
        title: row.userTitle,
        firstName: row.firstName,
        lastName: row.lastName,
        phoneCode: row.phoneCode,
        phoneNumber: row.phoneNumber,
        image: row.image,
      }));

      resolve(formattedResults);
    });
  });
};

// Get Order User Details DAO
exports.getOrderUserDetailsDAO = async (driverId, processOrderIds) => {
  return new Promise((resolve, reject) => {
    console.log("DAO received processOrderIds:", processOrderIds);
    console.log("DAO received driverId:", driverId);

    const sql = `
      SELECT 
        u.id as userId,
        u.title,
        u.firstName,
        u.lastName,
        u.phoneCode,
        u.phoneNumber,
        u.image,
        o.fullName as billingName,
        o.title as billingTitle,
        o.phonecode1 as billingPhoneCode,
        o.phone1 as billingPhone,
        o.id as orderId,
        o.sheduleTime,
        o.buildingType,
        o.delivaryMethod,
        o.fullTotal,
        o.deliveryCharge,
        po.id as processOrderId,
        po.invNo,
        po.paymentMethod,
        po.amount,
        po.isPaid,
        po.status as processStatus,
        CASE 
          WHEN o.buildingType = 'House' AND oh.houseNo IS NOT NULL THEN
            CONCAT_WS(', ', oh.houseNo, oh.streetName, oh.city)
          WHEN o.buildingType = 'Apartment' AND oa.buildingNo IS NOT NULL THEN
            CONCAT_WS(', ', 
              CONCAT('No. ', oa.buildingNo),
              oa.buildingName,
              CONCAT('Unit ', oa.unitNo),
              CONCAT('Floor ', oa.floorNo),
              oa.houseNo,
              oa.streetName,
              oa.city
            )
          ELSE 'Address not specified'
        END as userAddress
      FROM collection_officer.driverorders do
      INNER JOIN market_place.processorders po ON do.orderId = po.id  -- Correct FK
      INNER JOIN market_place.orders o ON po.orderId = o.id
      INNER JOIN market_place.marketplaceusers u ON o.userId = u.id
      LEFT JOIN market_place.orderhouse oh ON o.id = oh.orderId AND o.buildingType = 'House'
      LEFT JOIN market_place.orderapartment oa ON o.id = oa.orderId AND o.buildingType = 'Apartment'
      WHERE do.driverId = ?
      AND do.orderId IN (?)
      ORDER BY o.id
    `;

    const params = [driverId, processOrderIds];

    console.log("Executing SQL with params:", params);

    db.collectionofficer.query(sql, params, (err, results) => {
      if (err) {
        console.error(
          "Database error fetching order user details:",
          err.message
        );
        return reject(new Error("Failed to fetch order user details"));
      }

      if (results.length === 0) {
        return resolve({ user: null, orders: [] });
      }

      const firstRow = results[0];
      const user = {
        id: firstRow.userId,
        title: firstRow.title,
        firstName: firstRow.firstName,
        lastName: firstRow.lastName,
        phoneCode: firstRow.phoneCode,
        phoneNumber: firstRow.phoneNumber,
        image: firstRow.image,
        address: firstRow.userAddress || "Address not specified",
      };

      const orders = results.map((row) => ({
        orderId: row.orderId,
        sheduleTime: row.sheduleTime,
        buildingType: row.buildingType,
        deliveryMethod: row.delivaryMethod,
        processOrder: {
          id: row.processOrderId,
          invNo: row.invNo,
          paymentMethod: row.paymentMethod,
          amount: row.amount,
          isPaid: row.isPaid === 1,
          status: row.processStatus,
        },
        pricing: row.fullTotal,
      }));

      resolve({ user, orders });
    });
  });
};

// Start Journey DAO
exports.startJourneyDAO = async (driverId, orderIds) => {
  return new Promise((resolve, reject) => {
    // First, check if driver already has an order with "On the way" status
    const checkSql = `
      SELECT COUNT(*) as ongoingCount
      FROM collection_officer.driverorders
      WHERE driverId = ?
      AND drvStatus = 'On the way'
      AND isHandOver = 0
    `;

    db.collectionofficer.query(
      checkSql,
      [driverId],
      (checkErr, checkResults) => {
        if (checkErr) {
          console.error(
            "Database error checking ongoing orders:",
            checkErr.message
          );
          return reject(new Error("Failed to check ongoing orders"));
        }

        const ongoingCount = checkResults[0]?.ongoingCount || 0;

        if (ongoingCount > 0) {
          return resolve({
            success: false,
            message:
              "You have one ongoing activity. Please end it, put it on hold, or mark it as returned to start this one.",
          });
        }

        // Update driverorders table
        const updateDriverOrdersSql = `
        UPDATE collection_officer.driverorders
        SET drvStatus = 'On the way',
            createdAt = CURRENT_TIMESTAMP
        WHERE driverId = ?
        AND orderId IN (?)
        AND isHandOver = 0
      `;

        console.log("Updating driverorders with SQL:", updateDriverOrdersSql);
        console.log("Parameters:", [driverId, orderIds]);

        db.collectionofficer.query(
          updateDriverOrdersSql,
          [driverId, orderIds],
          (err1, result1) => {
            if (err1) {
              console.error("Error updating driverorders:", err1.message);
              return reject(new Error("Failed to update driver orders"));
            }

            console.log(
              "Driver orders updated. Affected rows:",
              result1.affectedRows
            );

            // Update processorders table
            const updateProcessOrdersSql = `
          UPDATE market_place.processorders
          SET status = 'On the way'
          WHERE orderId IN (?)
        `;

            console.log(
              "Updating processorders with SQL:",
              updateProcessOrdersSql
            );
            console.log("Parameters:", [orderIds]);

            db.collectionofficer.query(
              updateProcessOrdersSql,
              [orderIds],
              (err2, result2) => {
                if (err2) {
                  console.error("Error updating processorders:", err2.message);
                  return reject(new Error("Failed to update process orders"));
                }

                console.log(
                  "Process orders updated. Affected rows:",
                  result2.affectedRows
                );

                // Get updated order details for response
                const getUpdatedOrdersSql = `
            SELECT 
              do.id as driverOrderId,
              do.orderId as processOrderId,
              po.orderId as marketOrderId,
              po.invNo,
              po.status as processStatus,
              do.drvStatus,
              do.createdAt as journeyStartedAt
            FROM collection_officer.driverorders do
            INNER JOIN market_place.processorders po ON do.orderId = po.id
            WHERE do.driverId = ?
            AND do.orderId IN (?)
            AND do.drvStatus = 'On the way'
          `;

                db.collectionofficer.query(
                  getUpdatedOrdersSql,
                  [driverId, orderIds],
                  (err3, updatedResults) => {
                    if (err3) {
                      console.error(
                        "Error fetching updated orders:",
                        err3.message
                      );
                      // Still resolve success since the updates worked
                      return resolve({
                        success: true,
                        message: "Journey started successfully",
                        updatedOrders: [],
                      });
                    }

                    resolve({
                      success: true,
                      message: "Journey started successfully",
                      updatedOrders: updatedResults.map((row) => ({
                        driverOrderId: row.driverOrderId,
                        processOrderId: row.processOrderId,
                        marketOrderId: row.marketOrderId,
                        invNo: row.invNo,
                        processStatus: row.processStatus,
                        drvStatus: row.drvStatus,
                        journeyStartedAt: row.journeyStartedAt,
                      })),
                    });
                  }
                );
              }
            );
          }
        );
      }
    );
  });
};
