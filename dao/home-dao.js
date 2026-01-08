const db = require("../startup/database");




// exports.getAmount = async (driverId) => {
//   return new Promise((resolve, reject) => {
//     const sql = `
//       SELECT 
//         COUNT(DISTINCT do.orderId) as totalOrders,

//         -- Cash only from COMPLETED orders
//         COALESCE(
//           SUM(
//             CASE 
//               WHEN po.paymentMethod = 'Cash' 
//                    AND do.drvStatus = 'Completed'
//               THEN o.fullTotal 
//               ELSE 0 
//             END
//           ), 0
//         ) as totalCashAmount,

//         COUNT(DISTINCT CASE WHEN do.drvStatus = 'Todo' THEN do.orderId END) as todoOrders,

//         -- ALL completed orders (no date filter)
//         COUNT(DISTINCT CASE WHEN do.drvStatus = 'Completed' THEN do.orderId END) as completedOrders,

//         -- TODAY'S completed orders (for progress calculation)
//         COUNT(DISTINCT CASE 
//           WHEN do.drvStatus = 'Completed' 
//                AND DATE(po.deliveredTime) = CURDATE()
//           THEN do.orderId 
//         END) as todayCompletedOrders,

//         COUNT(DISTINCT CASE WHEN do.drvStatus = 'On the way' THEN do.orderId END) as onTheWayOrders,
//         COUNT(DISTINCT CASE WHEN do.drvStatus = 'Hold' THEN do.orderId END) as holdOrders,
//         COUNT(DISTINCT CASE WHEN do.drvStatus = 'Return' THEN do.orderId END) as returnOrders,
//         COUNT(DISTINCT CASE WHEN do.drvStatus = 'Return Received' THEN do.orderId END) as returnReceivedOrders,

//         -- Cash orders count ONLY if completed
//         COUNT(
//           DISTINCT CASE 
//             WHEN po.paymentMethod = 'Cash'
//                  AND do.drvStatus = 'Completed'
//             THEN do.orderId 
//           END
//         ) as cashOrders,

//         -- Get process order IDs for ongoing orders (On the way)
//         (
//           SELECT GROUP_CONCAT(DISTINCT do2.orderId ORDER BY do2.orderId)
//           FROM collection_officer.driverorders do2
//           WHERE do2.driverId = ?
//             AND do2.drvStatus = 'On the way'
//             AND do2.isHandOver = 0
//         ) as ongoingProcessOrderIds

//       FROM collection_officer.driverorders do
//       INNER JOIN market_place.processorders po ON do.orderId = po.id
//       INNER JOIN market_place.orders o ON po.orderId = o.id
//       WHERE 
//         do.driverId = ?
//         AND do.isHandOver = 0
//       GROUP BY do.driverId;
//     `;

//     db.collectionofficer.query(sql, [driverId, driverId], (err, results) => {
//       if (err) {
//         console.error("Database error fetching amount:", err.message);
//         return reject(new Error("Failed to fetch amount"));
//       }

//       const result = results[0] || {
//         totalOrders: 0,
//         totalCashAmount: 0,
//         todoOrders: 0,
//         completedOrders: 0,
//         todayCompletedOrders: 0,
//         onTheWayOrders: 0,
//         holdOrders: 0,
//         returnOrders: 0,
//         returnReceivedOrders: 0,
//         cashOrders: 0,
//         ongoingProcessOrderIds: null,
//       };

//       let ongoingProcessOrderIdsArray = [];
//       if (result.ongoingProcessOrderIds) {
//         ongoingProcessOrderIdsArray = result.ongoingProcessOrderIds
//           .split(",")
//           .map((id) => parseInt(id.trim()))
//           .filter((id) => !isNaN(id));
//       }

//       const returnSql = `
//         SELECT COUNT(DISTINCT dro.id) as todayReturnOrders
//         FROM collection_officer.driverreturnorders dro
//         INNER JOIN collection_officer.driverorders do ON dro.drvOrderId = do.id
//         WHERE 
//           do.driverId = ?
//           AND do.isHandOver = 0
//           AND DATE(dro.createdAt) = CURDATE()
//           AND do.drvStatus IN ('Return', 'Return Received')
//       `;

//       db.collectionofficer.query(returnSql, [driverId], (retErr, retResults) => {
//         if (retErr) {
//           console.error("Database error fetching return orders:", retErr.message);
//           result.todayReturnOrders = 0;
//         } else {
//           result.todayReturnOrders = retResults[0]?.todayReturnOrders || 0;
//         }

//         const locationSql = `
//           SELECT COUNT(DISTINCT locationKey) as uniqueLocationsCount
//           FROM (
//             SELECT 
//               CONCAT(oh.houseNo, '-', oh.streetName, '-', oh.city) as locationKey
//             FROM collection_officer.driverorders do
//             INNER JOIN market_place.processorders po ON do.orderId = po.id
//             INNER JOIN market_place.orders o ON po.orderId = o.id
//             INNER JOIN market_place.orderhouse oh ON o.id = oh.orderId
//             WHERE 
//               do.driverId = ?
//               AND do.isHandOver = 0
//               AND do.drvStatus IN ('Todo', 'Hold', 'On the way')
//               AND o.buildingType = 'House'

//             UNION ALL

//             SELECT 
//               CONCAT(oa.buildingNo, '-', oa.buildingName, '-', oa.streetName, '-', oa.city) as locationKey
//             FROM collection_officer.driverorders do
//             INNER JOIN market_place.processorders po ON do.orderId = po.id
//             INNER JOIN market_place.orders o ON po.orderId = o.id
//             INNER JOIN market_place.orderapartment oa ON o.id = oa.orderId
//             WHERE 
//               do.driverId = ?
//               AND do.isHandOver = 0
//               AND do.drvStatus IN ('Todo', 'Hold', 'On the way')
//               AND o.buildingType = 'Apartment'
//           ) as allLocations
//         `;

//         db.collectionofficer.query(
//           locationSql,
//           [driverId, driverId],
//           (locErr, locResults) => {
//             if (locErr) {
//               console.error(
//                 "Database error fetching unique locations:",
//                 locErr.message
//               );
//               result.uniqueLocationsCount = 0;
//             } else {
//               result.uniqueLocationsCount =
//                 locResults[0]?.uniqueLocationsCount || 0;
//             }

//             resolve({
//               ...result,
//               ongoingProcessOrderIds: ongoingProcessOrderIdsArray,
//             });
//           }
//         );
//       });
//     });
//   });
// };

exports.getAmount = async (driverId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        COUNT(DISTINCT do.orderId) as totalOrders,

        -- Cash only from COMPLETED orders
        COALESCE(
          SUM(
            CASE 
              WHEN po.paymentMethod = 'Cash' 
                   AND do.drvStatus = 'Completed'
              THEN o.fullTotal 
              ELSE 0 
            END
          ), 0
        ) as totalCashAmount,

        COUNT(DISTINCT CASE WHEN do.drvStatus = 'Todo' THEN do.orderId END) as todoOrders,
        
        -- ALL completed orders (no date filter)
        COUNT(DISTINCT CASE WHEN do.drvStatus = 'Completed' THEN do.orderId END) as completedOrders,
        
        -- TODAY'S completed orders (for progress calculation)
        COUNT(DISTINCT CASE 
          WHEN do.drvStatus = 'Completed' 
               AND DATE(po.deliveredTime) = CURDATE()
          THEN do.orderId 
        END) as todayCompletedOrders,
        
        COUNT(DISTINCT CASE WHEN do.drvStatus = 'On the way' THEN do.orderId END) as onTheWayOrders,
        COUNT(DISTINCT CASE WHEN do.drvStatus = 'Hold' THEN do.orderId END) as holdOrders,
        COUNT(DISTINCT CASE WHEN do.drvStatus = 'Return' THEN do.orderId END) as returnOrders,
        COUNT(DISTINCT CASE WHEN do.drvStatus = 'Return Received' THEN do.orderId END) as returnReceivedOrders,

        -- Cash orders count ONLY if completed
        COUNT(
          DISTINCT CASE 
            WHEN po.paymentMethod = 'Cash'
                 AND do.drvStatus = 'Completed'
            THEN do.orderId 
          END
        ) as cashOrders,

        -- Get process order IDs for ongoing orders (On the way)
        (
          SELECT GROUP_CONCAT(DISTINCT do2.orderId ORDER BY do2.orderId)
          FROM collection_officer.driverorders do2
          WHERE do2.driverId = ?
            AND do2.drvStatus = 'On the way'
            AND do2.isHandOver = 0
        ) as ongoingProcessOrderIds

      FROM collection_officer.driverorders do
      INNER JOIN market_place.processorders po ON do.orderId = po.id
      INNER JOIN market_place.orders o ON po.orderId = o.id
      WHERE 
        do.driverId = ?
        AND do.isHandOver = 0
      GROUP BY do.driverId;
    `;

    db.collectionofficer.query(sql, [driverId, driverId], (err, results) => {
      if (err) {
        console.error("Database error fetching amount:", err.message);
        return reject(new Error("Failed to fetch amount"));
      }

      const result = results[0] || {
        totalOrders: 0,
        totalCashAmount: 0,
        todoOrders: 0,
        completedOrders: 0,
        todayCompletedOrders: 0,
        onTheWayOrders: 0,
        holdOrders: 0,
        returnOrders: 0,
        returnReceivedOrders: 0,
        cashOrders: 0,
        ongoingProcessOrderIds: null,
      };

      let ongoingProcessOrderIdsArray = [];
      if (result.ongoingProcessOrderIds) {
        ongoingProcessOrderIdsArray = result.ongoingProcessOrderIds
          .split(",")
          .map((id) => parseInt(id.trim()))
          .filter((id) => !isNaN(id));
      }

      // Get today's return orders count
      const returnSql = `
        SELECT COUNT(DISTINCT dro.id) as todayReturnOrders
        FROM collection_officer.driverreturnorders dro
        INNER JOIN collection_officer.driverorders do ON dro.drvOrderId = do.id
        WHERE 
          do.driverId = ?
          AND do.isHandOver = 0
          AND DATE(dro.createdAt) = CURDATE()
          AND do.drvStatus IN ('Return', 'Return Received')
      `;

      db.collectionofficer.query(returnSql, [driverId], (retErr, retResults) => {
        if (retErr) {
          console.error("Database error fetching return orders:", retErr.message);
          result.todayReturnOrders = 0;
        } else {
          result.todayReturnOrders = retResults[0]?.todayReturnOrders || 0;
        }

        // Get pending locations count (Todo, Hold, On the way)
        // A location is considered PENDING if ANY order at that location is NOT completed
        const pendingLocationSql = `
          SELECT 
            locationKey,
            MAX(CASE WHEN do.drvStatus IN ('Completed', 'Return', 'Return Received') THEN 1 ELSE 0 END) as hasCompleted,
            MAX(CASE WHEN do.drvStatus NOT IN ('Completed', 'Return', 'Return Received') THEN 1 ELSE 0 END) as hasPending
          FROM (
            -- House orders
            SELECT 
              CONCAT(oh.houseNo, '-', oh.streetName, '-', oh.city) as locationKey,
              do.orderId,
              do.drvStatus
            FROM collection_officer.driverorders do
            INNER JOIN market_place.processorders po ON do.orderId = po.id
            INNER JOIN market_place.orders o ON po.orderId = o.id
            INNER JOIN market_place.orderhouse oh ON o.id = oh.orderId
            WHERE 
              do.driverId = ?
              AND do.isHandOver = 0
              AND do.drvStatus IN ('Todo', 'Hold', 'On the way', 'Completed', 'Return', 'Return Received')
              AND o.buildingType = 'House'
            
            UNION ALL
            
            -- Apartment orders
            SELECT 
              CONCAT(oa.buildingNo, '-', oa.buildingName, '-', oa.streetName, '-', oa.city) as locationKey,
              do.orderId,
              do.drvStatus
            FROM collection_officer.driverorders do
            INNER JOIN market_place.processorders po ON do.orderId = po.id
            INNER JOIN market_place.orders o ON po.orderId = o.id
            INNER JOIN market_place.orderapartment oa ON o.id = oa.orderId
            WHERE 
              do.driverId = ?
              AND do.isHandOver = 0
              AND do.drvStatus IN ('Todo', 'Hold', 'On the way', 'Completed', 'Return', 'Return Received')
              AND o.buildingType = 'Apartment'
          ) as locations
          INNER JOIN collection_officer.driverorders do ON locations.orderId = do.orderId
          GROUP BY locationKey
        `;

        db.collectionofficer.query(
          pendingLocationSql,
          [driverId, driverId],
          (pendingErr, pendingResults) => {
            if (pendingErr) {
              console.error(
                "Database error fetching pending locations:",
                pendingErr.message
              );
              result.pendingLocationsCount = 0;
              result.todayCompletedLocationsCount = 0;
            } else {
              // A location is pending if it has ANY pending orders (not completed/returned)
              const pendingLocations = pendingResults.filter(loc => loc.hasPending === 1);
              result.pendingLocationsCount = pendingLocations.length;

              // Get today's completed/returned locations count
              // A location is completed/returned TODAY if ALL orders at that location are completed/returned TODAY
              const todayLocationSql = `
                SELECT 
                  locations.locationKey,
                  COUNT(DISTINCT locations.orderId) as totalOrdersAtLocation,
                  COUNT(DISTINCT CASE 
                    WHEN do.drvStatus IN ('Completed', 'Return', 'Return Received') 
                         AND DATE(po.deliveredTime) = CURDATE()
                    THEN locations.orderId 
                  END) as todayCompletedOrdersAtLocation
                FROM (
                  -- House orders
                  SELECT 
                    CONCAT(oh.houseNo, '-', oh.streetName, '-', oh.city) as locationKey,
                    do.orderId,
                    do.drvStatus
                  FROM collection_officer.driverorders do
                  INNER JOIN market_place.processorders po ON do.orderId = po.id
                  INNER JOIN market_place.orders o ON po.orderId = o.id
                  INNER JOIN market_place.orderhouse oh ON o.id = oh.orderId
                  WHERE 
                    do.driverId = ?
                    AND do.isHandOver = 0
                    AND o.buildingType = 'House'
                  
                  UNION ALL
                  
                  -- Apartment orders
                  SELECT 
                    CONCAT(oa.buildingNo, '-', oa.buildingName, '-', oa.streetName, '-', oa.city) as locationKey,
                    do.orderId,
                    do.drvStatus
                  FROM collection_officer.driverorders do
                  INNER JOIN market_place.processorders po ON do.orderId = po.id
                  INNER JOIN market_place.orders o ON po.orderId = o.id
                  INNER JOIN market_place.orderapartment oa ON o.id = oa.orderId
                  WHERE 
                    do.driverId = ?
                    AND do.isHandOver = 0
                    AND o.buildingType = 'Apartment'
                ) as locations
                INNER JOIN collection_officer.driverorders do ON locations.orderId = do.orderId
                INNER JOIN market_place.processorders po ON do.orderId = po.id
                WHERE do.drvStatus IN ('Completed', 'Return', 'Return Received')
                GROUP BY locations.locationKey
                HAVING totalOrdersAtLocation > 0
              `;

              db.collectionofficer.query(
                todayLocationSql,
                [driverId, driverId],
                (todayErr, todayResults) => {
                  if (todayErr) {
                    console.error(
                      "Database error fetching today's completed locations:",
                      todayErr.message
                    );
                    result.todayCompletedLocationsCount = 0;
                  } else {
                    // A location is "completed today" if ALL orders at that location were completed/returned today
                    const todayCompletedLocations = todayResults.filter(loc =>
                      loc.totalOrdersAtLocation > 0 &&
                      loc.todayCompletedOrdersAtLocation === loc.totalOrdersAtLocation
                    );
                    result.todayCompletedLocationsCount = todayCompletedLocations.length;
                  }

                  resolve({
                    ...result,
                    ongoingProcessOrderIds: ongoingProcessOrderIdsArray,
                  });
                }
              );
            }
          }
        );
      });
    });
  });
};


// Get Reveived Cash
exports.getReceivedCash = async (driverId, paymentMethod = 'Cash') => {
  return new Promise((resolve, reject) => {
    const sql = `
            SELECT 
                do.id as driverOrderId,
                do.orderId as processOrderId,
                po.invNo as invoNo,
                COALESCE(o.fullTotal, 0) as amount,
                do.createdAt,
                do.driverId,
                o.id as orderId
            FROM 
                collection_officer.driverorders do
            INNER JOIN 
                market_place.processorders po ON do.orderId = po.id
            INNER JOIN 
                market_place.orders o ON po.orderId = o.id
            WHERE 
                do.driverId = ?
                AND do.isHandOver = 0
                AND do.drvStatus = 'Completed'
                AND o.fullTotal IS NOT NULL
                AND o.fullTotal > 0
                AND po.paymentMethod = ?  
            ORDER BY 
                do.createdAt DESC
        `;

    db.collectionofficer.query(sql, [driverId, paymentMethod], (err, results) => {
      if (err) {
        console.error("Database error fetching amount:", err.message);
        return reject(new Error("Failed to fetch amount"));
      }

      console.log("Raw DB results:", results);

      // Format the results
      const formattedResults = results.map((item) => ({
        id: String(item.driverOrderId),
        orderId: item.processOrderId,
        invoNo: item.invoNo,
        amount: parseFloat(item.amount) || 0,
        selected: false,
        createdAt: item.createdAt,
      }));

      console.log("Formatted results:", formattedResults);

      resolve(formattedResults);
    });
  });
};

// Get officer by empId
exports.getOfficerByEmpId = async (empId) => {
  return new Promise((resolve, reject) => {
    const sql = `
            SELECT id, empId, firstNameEnglish, lastNameEnglish
            FROM collection_officer.collectionofficer
            WHERE empId = ? 
            LIMIT 1
        `;
    db.collectionofficer.query(sql, [empId], (err, results) => {
      if (err) {
        console.error("Database error getting officer by empId:", err.message);
        return reject(new Error("Failed to retrieve officer"));
      }
      resolve(results.length > 0 ? results[0] : null);
    });
  });
};

// Update Received Cash (unchanged)
// exports.handOverCash = async (driverOrderIds, officerId, totalAmount) => {
//   return new Promise((resolve, reject) => {
//     const sql = `
//             UPDATE collection_officer.driverorders
//             SET 
//                 isHandOver = 1,
//                 handOverOfficer = ?,
//                 handOverTime = NOW(),
//                 handOverPrice = ?
//             WHERE 
//                 id IN (?)
//                 AND isHandOver = 0
//         `;
//     db.collectionofficer.query(
//       sql,
//       [officerId, totalAmount, driverOrderIds],
//       (err, results) => {
//         if (err) {
//           console.error("Database error updating hand over:", err.message);
//           return reject(new Error("Failed to hand over cash"));
//         }

//         console.log("Hand over update results:", results);

//         if (results.affectedRows === 0) {
//           return reject(new Error("No orders were updated"));
//         }

//         resolve(results);
//       }
//     );
//   });
// };

// New DAO method to get order amounts
// New DAO method to get order amounts
exports.getOrderAmounts = async (orderIds) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        do.id,
        COALESCE(o.fullTotal, 0) as amount
      FROM 
        collection_officer.driverorders do
      INNER JOIN 
        market_place.processorders po ON do.orderId = po.id
      INNER JOIN 
        market_place.orders o ON po.orderId = o.id
      WHERE 
        do.id IN (?)
        AND do.isHandOver = 0
        AND o.fullTotal IS NOT NULL
        AND o.fullTotal > 0
    `;

    db.collectionofficer.query(sql, [orderIds], (err, results) => {
      if (err) {
        console.error("Database error getting order amounts:", err.message);
        return reject(new Error("Failed to retrieve order amounts"));
      }
      resolve(results);
    });
  });
};

// Updated handOverCash method
exports.handOverCash = async (orderDetails, officerId) => {
  return new Promise((resolve, reject) => {
    // Build CASE statement for individual amounts
    const caseStatements = orderDetails.map(order =>
      `WHEN id = ${order.id} THEN ${order.amount}`
    ).join(' ');

    const orderIds = orderDetails.map(order => order.id);

    const sql = `
      UPDATE collection_officer.driverorders
      SET 
        isHandOver = 1,
        handOverOfficer = ?,
        handOverTime = NOW(),
        handOverPrice = CASE ${caseStatements} END
      WHERE 
        id IN (?)
        AND isHandOver = 0
    `;

    db.collectionofficer.query(
      sql,
      [officerId, orderIds],
      (err, results) => {
        if (err) {
          console.error("Database error updating hand over:", err.message);
          return reject(new Error("Failed to hand over cash"));
        }

        console.log("Hand over update results:", results);

        if (results.affectedRows === 0) {
          return reject(new Error("No orders were updated"));
        }

        resolve(results);
      }
    );
  });
};