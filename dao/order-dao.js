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
      console.log("Saving driver order with:", {
        driverId,
        processOrderId,
        handOverTime,
      });

      // STEP 1: Get the orderId from processorders
      const getOrderSql = `
        SELECT orderId 
        FROM market_place.processorders 
        WHERE id = ?
        LIMIT 1
      `;

      const processOrder = await new Promise((res, rej) => {
        db.marketPlace.query(getOrderSql, [processOrderId], (err, results) => {
          if (err) {
            console.error("Error fetching process order:", err.message);
            return rej(err);
          }
          if (results.length === 0) {
            return rej(new Error("Process order not found"));
          }
          res(results[0]);
        });
      });

      const marketOrderId = processOrder.orderId;

      // STEP 2: Insert into driverorders with market_place.orders.id
      const insertSql = `
        INSERT INTO collection_officer.driverorders 
        (driverId, orderId, handOverTime, drvStatus, isHandOver, createdAt) 
        VALUES (?, ?, ?, 'Todo', 0, NOW())
      `;

      const insertResult = await new Promise((res, rej) => {
        db.collectionofficer.query(
          insertSql,
          [driverId, marketOrderId, handOverTime],
          (err, result) => {
            if (err) {
              console.error("Insert error:", err.message);
              return rej(err);
            }
            console.log("Driver order inserted:", result.insertId);
            console.log("Saved with market order ID:", marketOrderId);
            res(result);
          }
        );
      });

      // STEP 3: Update processorders
      const updateSql = `
        UPDATE market_place.processorders 
        SET status = 'Collected',
            isTargetAssigned = 1
        WHERE id = ?
      `;

      const updateResult = await new Promise((res, rej) => {
        db.marketPlace.query(updateSql, [processOrderId], (err, result) => {
          if (err) {
            console.error("Update error:", err.message);
            return rej(err);
          }

          console.log("Process order update result:", result);

          if (result.affectedRows === 0) {
            console.warn(
              "No processorders row updated. Invalid processOrderId:",
              processOrderId
            );
          }

          res(result);
        });
      });

      resolve({
        message: "Order assigned successfully and status updated to Collected",
        driverOrderId: insertResult.insertId,
        processOrderId,
        marketOrderId: marketOrderId,
        status: "Collected",
      });
    } catch (error) {
      console.error("SaveDriverOrder failed:", error);
      reject(error);
    }
  });
};

// Check If Order Is Already Assigned
exports.CheckOrderAlreadyAssigned = async (orderId, driverId) => {
  return new Promise((resolve, reject) => {
    const sql = `
            SELECT 
                do.id as driverOrderId,
                do.driverId as assignedDriverId,
                co.empId as assignedDriverEmpId,
                CONCAT(co.firstNameEnglish, ' ', co.lastNameEnglish) as assignedDriverName
            FROM collection_officer.driverorders do
            INNER JOIN collection_officer.collectionofficer co ON do.driverId = co.id
            INNER JOIN market_place.processorders po ON do.orderId = po.orderId
            WHERE po.id = ?  -- Now checking by processorders.id
            LIMIT 1
        `;

    db.collectionofficer.query(sql, [orderId], (err, results) => {
      if (err) {
        console.error("Database error checking order assignment:", err.message);
        return reject(new Error("Failed to check order assignment"));
      }

      if (results.length > 0) {
        const assignment = results[0];

        // Check if it's assigned to the same driver
        if (assignment.assignedDriverId == driverId) {
          resolve({
            isAssigned: true,
            assignedToSameDriver: true,
            message: "This order is already in your target list.",
          });
        } else {
          // Assigned to different driver
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
        MIN(do.orderId) as orderId,
        (SELECT do2.drvStatus 
         FROM collection_officer.driverorders do2
         INNER JOIN market_place.processorders po2 ON do2.orderId = po2.orderId  -- Changed: po2.orderId
         INNER JOIN market_place.orders o2 ON po2.orderId = o2.id
         WHERE do2.driverId = do.driverId 
         AND o2.fullName = o.fullName
         AND do2.isHandOver = do.isHandOver
         GROUP BY do2.drvStatus
         ORDER BY COUNT(*) DESC
         LIMIT 1) as drvStatus,
        MAX(do.isHandOver) as isHandOver,
        o.fullName as originalFullName,  -- Keep original for reference
        MIN(o.sheduleTime) as sheduleTime,
        COUNT(*) as jobCount,
        GROUP_CONCAT(DISTINCT do.id ORDER BY do.createdAt) as driverOrderIds,
        GROUP_CONCAT(DISTINCT do.orderId ORDER BY po.createdAt) as orderIds,
        GROUP_CONCAT(DISTINCT o.sheduleTime ORDER BY o.sheduleTime) as allScheduleTimes,
        GROUP_CONCAT(DISTINCT do.drvStatus ORDER BY 
            CASE do.drvStatus 
                WHEN 'Todo' THEN 1
                WHEN 'Hold' THEN 2
                WHEN 'On the way' THEN 3
                WHEN 'Completed' THEN 4
                WHEN 'Return' THEN 5
                ELSE 6
            END) as allDrvStatuses,
        MAX(do.createdAt) as latestCreatedAt,
        -- User details with aggregate functions
        MIN(u.id) as userId,
        MIN(u.title) as userTitle,
        MIN(u.firstName) as firstName,
        MIN(u.lastName) as lastName,
        MIN(u.phoneCode) as phoneCode,
        MIN(u.phoneNumber) as phoneNumber,
        MIN(u.image) as image
      FROM collection_officer.driverorders do
      INNER JOIN market_place.processorders po ON do.orderId = po.orderId  -- Changed: po.orderId
      INNER JOIN market_place.orders o ON po.orderId = o.id
      INNER JOIN market_place.marketplaceusers u ON o.userId = u.id
      WHERE do.driverId = ?
      AND do.isHandOver = ?
    `;

    const params = [driverId, isHandOver];

    if (statuses && statuses.length > 0) {
      const statusArray = Array.isArray(statuses) ? statuses : [statuses];
      const validStatuses = statusArray.filter((status) =>
        ["Todo", "Completed", "Hold", "Return", "On the way"].includes(status)
      );

      if (validStatuses.length > 0) {
        sql += ` AND do.drvStatus IN (?)`;
        params.push(validStatuses);
      }
    }

    sql += ` GROUP BY o.fullName`;
    sql += ` ORDER BY latestCreatedAt DESC`;

    db.collectionofficer.query(sql, params, (err, results) => {
      if (err) {
        console.error("Database error fetching driver orders:", err.message);
        console.error("SQL:", sql);
        return reject(new Error("Failed to fetch driver orders"));
      }

      const formattedResults = results.map((order, index) => ({
        driverOrderId: order.driverOrderId,
        orderId: order.orderId,
        drvStatus: order.drvStatus || "Todo",
        isHandOver: order.isHandOver === 1,
        fullName:
          `${order.firstName || ""} ${order.lastName || ""}`.trim() ||
          order.originalFullName ||
          "N/A",
        sheduleTime: order.sheduleTime || "Not Scheduled",
        jobCount: order.jobCount || 1,
        allDriverOrderIds: order.driverOrderIds
          ? order.driverOrderIds.split(",").map(Number)
          : [order.driverOrderId],
        allOrderIds: order.orderIds
          ? order.orderIds.split(",").map(Number)
          : [order.orderId],
        allScheduleTimes: order.allScheduleTimes
          ? order.allScheduleTimes.split(",")
          : [order.sheduleTime],
        sequenceNumber: (index + 1).toString().padStart(2, "0"),
        userId: order.userId,
        title: order.userTitle,
        firstName: order.firstName,
        lastName: order.lastName,
        phoneCode: order.phoneCode,
        phoneNumber: order.phoneNumber,
        image: order.image,
      }));

      resolve(formattedResults);
    });
  });
};

// Get Order User Details DAO
exports.getOrderUserDetailsDAO = async (driverId, orderIds) => {
  return new Promise((resolve, reject) => {
    console.log("DAO received orderIds:", orderIds);
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
        -- Get address from first order (assuming all orders have same address for same user)
        CASE 
          WHEN o.buildingType = 'House' AND oh.houseNo IS NOT NULL THEN
            CONCAT_WS(', ', 
              oh.houseNo, 
              oh.streetName, 
              oh.city
            )
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
      INNER JOIN market_place.processorders po ON do.orderId = po.orderId  -- Changed: do.orderId = po.orderId
      INNER JOIN market_place.orders o ON po.orderId = o.id  -- po.orderId = o.id
      INNER JOIN market_place.marketplaceusers u ON o.userId = u.id
      -- Get address from first order (use LEFT JOIN and group by user)
      LEFT JOIN market_place.orderhouse oh ON o.id = oh.orderId AND o.buildingType = 'House'
      LEFT JOIN market_place.orderapartment oa ON o.id = oa.orderId AND o.buildingType = 'Apartment'
      WHERE do.driverId = ?
      AND do.orderId IN (?)  -- This is driverorders.orderId which should match processorders.orderId
      ORDER BY o.id
    `;

    const params = [driverId, orderIds];

    console.log("Executing SQL with params:", params);

    db.collectionofficer.query(sql, params, (err, results) => {
      if (err) {
        console.error(
          "Database error fetching order user details:",
          err.message
        );
        console.error("SQL:", sql);
        return reject(new Error("Failed to fetch order user details"));
      }

      console.log("Database results:", results);

      if (results.length === 0) {
        console.log("No results found in database");
        return resolve({ user: null, orders: [] });
      }

      // Extract user details from first row
      const firstRow = results[0];
      console.log("First row data:", firstRow);

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

      console.log("Extracted user:", user);

      // Extract orders
      const orders = results.map((row) => {
        return {
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
        };
      });

      console.log("Extracted orders:", orders);

      resolve({
        user,
        orders,
      });
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

    db.collectionofficer.query(checkSql, [driverId], (checkErr, checkResults) => {
      if (checkErr) {
        console.error("Database error checking ongoing orders:", checkErr.message);
        return reject(new Error("Failed to check ongoing orders"));
      }

      const ongoingCount = checkResults[0]?.ongoingCount || 0;
      
      if (ongoingCount > 0) {
        return resolve({
          success: false,
          message: "You have one ongoing activity. Please end it, put it on hold, or mark it as returned to start this one."
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

      db.collectionofficer.query(updateDriverOrdersSql, [driverId, orderIds], (err1, result1) => {
        if (err1) {
          console.error("Error updating driverorders:", err1.message);
          return reject(new Error("Failed to update driver orders"));
        }

        console.log("Driver orders updated. Affected rows:", result1.affectedRows);

        // Update processorders table
        const updateProcessOrdersSql = `
          UPDATE market_place.processorders
          SET status = 'On the way'
          WHERE orderId IN (?)
        `;

        console.log("Updating processorders with SQL:", updateProcessOrdersSql);
        console.log("Parameters:", [orderIds]);

        db.collectionofficer.query(updateProcessOrdersSql, [orderIds], (err2, result2) => {
          if (err2) {
            console.error("Error updating processorders:", err2.message);
            return reject(new Error("Failed to update process orders"));
          }

          console.log("Process orders updated. Affected rows:", result2.affectedRows);

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

          db.collectionofficer.query(getUpdatedOrdersSql, [driverId, orderIds], (err3, updatedResults) => {
            if (err3) {
              console.error("Error fetching updated orders:", err3.message);
              // Still resolve success since the updates worked
              return resolve({
                success: true,
                message: "Journey started successfully",
                updatedOrders: []
              });
            }

            resolve({
              success: true,
              message: "Journey started successfully",
              updatedOrders: updatedResults.map(row => ({
                driverOrderId: row.driverOrderId,
                processOrderId: row.processOrderId,
                marketOrderId: row.marketOrderId,
                invNo: row.invNo,
                processStatus: row.processStatus,
                drvStatus: row.drvStatus,
                journeyStartedAt: row.journeyStartedAt
              }))
            });
          });
        });
      });
    });
  });
};