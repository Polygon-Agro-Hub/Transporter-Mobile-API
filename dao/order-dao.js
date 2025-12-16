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

// Get Driver's Order
exports.getDriverOrdersDAO = async (
  driverId,
  statuses,
  isHandOver = 0
) => {
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
                o.fullName,
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
                MAX(do.createdAt) as latestCreatedAt
            FROM collection_officer.driverorders do
            INNER JOIN market_place.processorders po ON do.orderId = po.id
            INNER JOIN market_place.orders o ON po.orderId = o.id
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
        fullName: order.fullName || "N/A",
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
      }));

      resolve(formattedResults);
    });
  });
};
