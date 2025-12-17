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
exports.SaveDriverOrder = async (driverId, orderId, handOverTime) => {
  return new Promise(async (resolve, reject) => {
    try {
      console.log("Saving driver order with:", {
        driverId,
        orderId,
        handOverTime,
      });

      // Step 1: Insert into driverorders
      const insertSql = `
                INSERT INTO collection_officer.driverorders 
                (driverId, orderId, handOverTime, drvStatus, isHandOver, createdAt) 
                VALUES (?, ?, ?, 'Todo', 0, NOW())
            `;

      // Insert driver order
      const insertResult = await new Promise((insertResolve, insertReject) => {
        db.collectionofficer.query(
          insertSql,
          [driverId, orderId, handOverTime],
          (err, result) => {
            if (err) {
              console.error(
                "Database error inserting driver order:",
                err.message
              );
              return insertReject(new Error("Failed to insert driver order"));
            }
            insertResolve(result);
          }
        );
      });

      // Step 2: Update processorders status to 'Collected'
      const updateSql = `
                UPDATE market_place.processorders 
                SET status = 'Collected',
                    isTargetAssigned = 1
                WHERE orderId = ?
            `;

      // Update process order status
      const updateResult = await new Promise((updateResolve, updateReject) => {
        db.marketPlace.query(updateSql, [orderId], (err, result) => {
          if (err) {
            console.error(
              "Database error updating process order:",
              err.message
            );
            return updateReject(
              new Error("Failed to update process order status")
            );
          }
          updateResolve(result);
        });
      });

      resolve({
        message: "Order assigned successfully and status updated to Collected",
        driverOrderId: insertResult.insertId,
        handOverTime: handOverTime,
        processOrderId: orderId,
        status: "Collected",
      });
    } catch (error) {
      console.error("Error in SaveDriverOrder:", error.message);
      reject(new Error("Failed to assign order: " + error.message));
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
            WHERE do.orderId = ?
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
         INNER JOIN market_place.processorders po2 ON do2.orderId = po2.id
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
      INNER JOIN market_place.processorders po ON do.orderId = po.id
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
      INNER JOIN market_place.processorders po ON do.orderId = po.id
      INNER JOIN market_place.orders o ON po.orderId = o.id
      INNER JOIN market_place.marketplaceusers u ON o.userId = u.id
      -- Get address from first order (use LEFT JOIN and group by user)
      LEFT JOIN market_place.orderhouse oh ON o.id = oh.orderId AND o.buildingType = 'House'
      LEFT JOIN market_place.orderapartment oa ON o.id = oa.orderId AND o.buildingType = 'Apartment'
      WHERE do.driverId = ?
      AND do.orderId IN (?)
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
