const db = require("../startup/database");

// Get My Amount
exports.getAmount = async (driverId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        COUNT(DISTINCT do.orderId) as totalOrders,
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
        COUNT(DISTINCT CASE WHEN do.drvStatus = 'Completed' THEN do.orderId END) as completedOrders,
        COUNT(DISTINCT CASE 
          WHEN do.drvStatus = 'Completed' 
               AND DATE(CONVERT_TZ(po.deliveredTime, '+00:00', '+05:30')) = CURDATE()
          THEN do.orderId 
        END) as todayCompletedOrders,
        COUNT(DISTINCT CASE WHEN do.drvStatus = 'On the way' THEN do.orderId END) as onTheWayOrders,
        COUNT(DISTINCT CASE WHEN do.drvStatus = 'Hold' THEN do.orderId END) as holdOrders,
        COUNT(DISTINCT CASE WHEN do.drvStatus = 'Return' THEN do.orderId END) as returnOrders,
        COUNT(DISTINCT CASE WHEN do.drvStatus = 'Return Received' THEN do.orderId END) as returnReceivedOrders,
        COUNT(
          DISTINCT CASE 
            WHEN po.paymentMethod = 'Cash'
                 AND do.drvStatus = 'Completed'
            THEN do.orderId 
          END
        ) as cashOrders,
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

      const returnSql = `
        SELECT COUNT(DISTINCT dro.id) as todayReturnOrders
        FROM collection_officer.driverreturnorders dro
        INNER JOIN collection_officer.driverorders do ON dro.drvOrderId = do.id
        WHERE 
          do.driverId = ?
          AND do.isHandOver = 0
          AND DATE(CONVERT_TZ(dro.createdAt, '+00:00', '+05:30')) = CURDATE()
          AND do.drvStatus IN ('Return', 'Return Received')
      `;

      db.collectionofficer.query(
        returnSql,
        [driverId],
        (retErr, retResults) => {
          if (retErr) {
            console.error(
              "Database error fetching return orders:",
              retErr.message,
            );
            result.todayReturnOrders = 0;
          } else {
            result.todayReturnOrders = retResults[0]?.todayReturnOrders || 0;
          }

          const allLocationsSql = `
          SELECT 
            locations.locationKey,
            locations.processOrderId,
            do.drvStatus,
            CASE 
              WHEN do.drvStatus IN ('Return', 'Return Received') THEN (
                SELECT DATE(CONVERT_TZ(dro.createdAt, '+00:00', '+05:30'))
                FROM collection_officer.driverreturnorders dro
                WHERE dro.drvOrderId = do.id
                ORDER BY dro.createdAt DESC
                LIMIT 1
              )
              ELSE DATE(CONVERT_TZ(po.deliveredTime, '+00:00', '+05:30'))
            END as deliveredDate,
            CURDATE() as today
          FROM (
            SELECT 
              CONCAT(oh.houseNo, '-', oh.streetName, '-', oh.city) as locationKey,
              po.id as processOrderId,
              po.orderId as ordersId
            FROM collection_officer.driverorders do
            INNER JOIN market_place.processorders po ON do.orderId = po.id
            INNER JOIN market_place.orders o ON po.orderId = o.id
            INNER JOIN market_place.orderhouse oh ON o.id = oh.orderId
            WHERE 
              do.driverId = ?
              AND do.isHandOver = 0
              AND o.buildingType = 'House'
            
            UNION ALL
            
            SELECT 
              CONCAT(oa.buildingNo, '-', oa.buildingName, '-', oa.streetName, '-', oa.city) as locationKey,
              po.id as processOrderId,
              po.orderId as ordersId
            FROM collection_officer.driverorders do
            INNER JOIN market_place.processorders po ON do.orderId = po.id
            INNER JOIN market_place.orders o ON po.orderId = o.id
            INNER JOIN market_place.orderapartment oa ON o.id = oa.orderId
            WHERE 
              do.driverId = ?
              AND do.isHandOver = 0
              AND o.buildingType = 'Apartment'
          ) as locations
          INNER JOIN collection_officer.driverorders do ON locations.processOrderId = do.orderId
          INNER JOIN market_place.processorders po ON do.orderId = po.id
          ORDER BY locations.locationKey, locations.processOrderId
        `;

          db.collectionofficer.query(
            allLocationsSql,
            [driverId, driverId],
            (allErr, allResults) => {
              if (allErr) {
                console.error(
                  "Database error fetching all locations:",
                  allErr.message,
                );
                result.pendingLocationsCount = 0;
                result.todayCompletedLocationsCount = 0;
                resolve({
                  ...result,
                  ongoingProcessOrderIds: ongoingProcessOrderIdsArray,
                });
                return;
              }

              const locationMap = new Map();

              allResults.forEach((row) => {
                if (!locationMap.has(row.locationKey)) {
                  locationMap.set(row.locationKey, {
                    locationKey: row.locationKey,
                    orders: [],
                  });
                }
                locationMap.get(row.locationKey).orders.push({
                  orderId: row.processOrderId,
                  drvStatus: row.drvStatus,
                  deliveredDate: row.deliveredDate,
                  today: row.today,
                });
              });

              console.log("Total unique locations:", locationMap.size);

              let pendingLocationsCount = 0;
              let todayCompletedLocationsCount = 0;

              locationMap.forEach((location) => {
                const orders = location.orders;
                const totalOrders = orders.length;

                const todayDate = orders[0]?.today;

                const pendingOrders = orders.filter((o) =>
                  ["Todo", "Hold", "On the way"].includes(o.drvStatus),
                ).length;

                const todayFinishedOrders = orders.filter((o) => {
                  const isFinished = [
                    "Completed",
                    "Return",
                    "Return Received",
                  ].includes(o.drvStatus);
                  if (!isFinished || !o.deliveredDate || !todayDate)
                    return false;

                  const orderDate = new Date(o.deliveredDate).toDateString();
                  const todayDateStr = new Date(todayDate).toDateString();

                  return orderDate === todayDateStr;
                }).length;

                console.log(`\nLocation: ${location.locationKey}`);
                console.log(
                  `  Order IDs: ${orders.map((o) => o.orderId).join(", ")}`,
                );
                console.log(
                  `  Statuses: ${orders.map((o) => o.drvStatus).join(", ")}`,
                );
                console.log(
                  `  Delivered Dates: ${orders.map((o) => (o.deliveredDate ? new Date(o.deliveredDate).toDateString() : "NULL")).join(", ")}`,
                );
                console.log(
                  `  Today: ${todayDate ? new Date(todayDate).toDateString() : "NULL"}`,
                );

                if (pendingOrders > 0) {
                  pendingLocationsCount++;
                }

                if (
                  totalOrders > 0 &&
                  pendingOrders === 0 &&
                  todayFinishedOrders === totalOrders
                ) {
                  todayCompletedLocationsCount++;
                }
              });

              result.pendingLocationsCount = pendingLocationsCount;
              result.todayCompletedLocationsCount =
                todayCompletedLocationsCount;

              resolve({
                ...result,
                ongoingProcessOrderIds: ongoingProcessOrderIdsArray,
              });
            },
          );
        },
      );
    });
  });
};

// Get Reveived Cash
exports.getReceivedCash = async (driverId, paymentMethod = "Cash") => {
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

    db.collectionofficer.query(
      sql,
      [driverId, paymentMethod],
      (err, results) => {
        if (err) {
          console.error("Database error fetching amount:", err.message);
          return reject(new Error("Failed to fetch amount"));
        }

        // Format the results
        const formattedResults = results.map((item) => ({
          id: String(item.driverOrderId),
          orderId: item.processOrderId,
          invoNo: item.invoNo,
          amount: parseFloat(item.amount) || 0,
          selected: false,
          createdAt: item.createdAt,
        }));

        resolve(formattedResults);
      },
    );
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

// Get order amounts
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
    const caseStatements = orderDetails
      .map((order) => `WHEN id = ${order.id} THEN ${order.amount}`)
      .join(" ");

    const orderIds = orderDetails.map((order) => order.id);

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

    db.collectionofficer.query(sql, [officerId, orderIds], (err, results) => {
      if (err) {
        console.error("Database error updating hand over:", err.message);
        return reject(new Error("Failed to hand over cash"));
      }

      if (results.affectedRows === 0) {
        return reject(new Error("No orders were updated"));
      }

      resolve(results);
    });
  });
};
