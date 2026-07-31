const db = require("../startup/database");

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
              THEN COALESCE(po.moneyPaid, 0)
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
          INNER JOIN collection_officer.driverordermain dom2 ON do2.drvOrderMainId = dom2.id
          WHERE dom2.driverId = ?
            AND do2.drvStatus = 'On the way'
            AND dom2.isHandOver = 0
        ) as ongoingProcessOrderIds
      FROM collection_officer.driverorders do
      INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
      INNER JOIN market_place.processorders po ON do.orderId = po.id
      INNER JOIN market_place.orders o ON po.orderId = o.id
      WHERE 
        dom.driverId = ?
        AND dom.isHandOver = 0
      GROUP BY dom.driverId;
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
        INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
        WHERE 
          dom.driverId = ?
          AND dom.isHandOver = 0
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
            INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
            INNER JOIN market_place.processorders po ON do.orderId = po.id
            INNER JOIN market_place.orders o ON po.orderId = o.id
            INNER JOIN market_place.orderhouse oh ON o.id = oh.orderId
            WHERE 
              dom.driverId = ?
              AND dom.isHandOver = 0
              AND o.buildingType = 'House'
            
            UNION ALL
            
            SELECT 
              CONCAT(oa.buildingNo, '-', oa.buildingName, '-', oa.streetName, '-', oa.city) as locationKey,
              po.id as processOrderId,
              po.orderId as ordersId
            FROM collection_officer.driverorders do
            INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
            INNER JOIN market_place.processorders po ON do.orderId = po.id
            INNER JOIN market_place.orders o ON po.orderId = o.id
            INNER JOIN market_place.orderapartment oa ON o.id = oa.orderId
            WHERE 
              dom.driverId = ?
              AND dom.isHandOver = 0
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

                if (pendingOrders > 0) {
                  pendingLocationsCount++;
                }

                if (
                  totalOrders > 0 &&
                  pendingOrders === 0 &&
                  todayFinishedOrders > 0
                ) {
                  todayCompletedLocationsCount++;
                }
              });

              result.pendingLocationsCount = pendingLocationsCount;
              result.todayCompletedLocationsCount =
                todayCompletedLocationsCount;

              const txSql = `
                SELECT tx.transStatus 
                FROM collection_officer.driverordertransaction tx
                INNER JOIN collection_officer.driverordermain dom ON tx.drvOrderMainId = dom.id
                WHERE dom.driverId = ? AND dom.isHandOver = 0
                ORDER BY tx.createdAt DESC
                LIMIT 1
              `;

              db.collectionofficer.query(
                txSql,
                [driverId],
                (txErr, txResults) => {
                  if (txErr) {
                    console.error(
                      "Database error fetching transaction status:",
                      txErr.message,
                    );
                    result.activeTransactionStatus = null;
                  } else {
                    result.activeTransactionStatus =
                      txResults.length > 0 ? txResults[0].transStatus : null;
                  }

                  resolve({
                    ...result,
                    ongoingProcessOrderIds: ongoingProcessOrderIdsArray,
                  });
                },
              );
            },
          );
        },
      );
    });
  });
};


exports.getReceivedCash = async (driverId, paymentMethod = "Cash") => {
  return new Promise((resolve, reject) => {
    const sql = `
            SELECT 
                do.id as driverOrderId,
                do.orderId as processOrderId,
                po.invNo as invoNo,
                po.moneyPaid,
                COALESCE(do.earnPrice, 0) as earned,
                do.createdAt,
                dom.driverId,
                o.id as orderId
            FROM 
                collection_officer.driverorders do
            INNER JOIN 
                collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
            INNER JOIN 
                market_place.processorders po ON do.orderId = po.id
            INNER JOIN 
                market_place.orders o ON po.orderId = o.id
            WHERE 
                dom.driverId = ?
                AND dom.isHandOver = 0
                AND do.drvStatus = 'Completed'
                AND po.moneyPaid IS NOT NULL
                AND po.moneyPaid > 0
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

        const formattedResults = results.map((item) => {
          return {
            id: String(item.driverOrderId),
            orderId: item.processOrderId,
            invoNo: item.invoNo,
            amount: Number(item.moneyPaid) || 0,
            earned: parseFloat(item.earned) || 0,
            selected: false,
            createdAt: item.createdAt,
          };
        });

        resolve(formattedResults);
      },
    );
  });
};



exports.getDriverDistributedCenter = async (driverId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT id, distributedCenterId
      FROM collection_officer.collectionofficer
      WHERE id = ?
      LIMIT 1
    `;
    db.collectionofficer.query(sql, [driverId], (err, results) => {
      if (err) {
        console.error(
          "Database error getting driver distributed center:",
          err.message,
        );
        return reject(new Error("Failed to retrieve driver centre"));
      }

      resolve(results.length > 0 ? results[0] : null);
    });
  });
};

exports.getOfficerByEmpId = async (empId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT id, empId, firstNameEnglish, lastNameEnglish, status, distributedCenterId,
             phoneCode01, phoneNumber01
      FROM collection_officer.collectionofficer
      WHERE empId = ?
        AND UPPER(empId) LIKE 'DCM%'  
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

exports.getOrderAmounts = async (orderIds) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        do.id,
        COALESCE(o.fullTotal, 0) as amount
      FROM 
        collection_officer.driverorders do
      INNER JOIN 
        collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
      INNER JOIN 
        market_place.processorders po ON do.orderId = po.id
      INNER JOIN 
        market_place.orders o ON po.orderId = o.id
      WHERE 
        do.id IN (?)
        AND dom.isHandOver = 0
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

exports.handOverCash = async (orderDetails, officerId) => {
  return new Promise((resolve, reject) => {
    const orderIds = orderDetails.map((order) => order.id);

    const sql = `
      UPDATE collection_officer.driverordermain dom
      INNER JOIN collection_officer.driverorders do ON dom.id = do.drvOrderMainId
      SET 
        dom.isHandOver = 1
      WHERE 
        do.id IN (?)
        AND dom.isHandOver = 0
    `;

    db.collectionofficer.query(sql, [orderIds], (err, results) => {
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

exports.getOfficerByEmpId = async (empId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT id, empId, firstNameEnglish, lastNameEnglish, status, distributedCenterId, phoneNumber01
      FROM collection_officer.collectionofficer
      WHERE empId = ?
        AND UPPER(empId) LIKE 'DCM%'  
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

exports.getActiveOrderMainId = async (driverId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT id FROM collection_officer.driverordermain 
      WHERE driverId = ? AND isHandOver = 0 
      LIMIT 1
    `;
    db.collectionofficer.query(sql, [driverId], (err, results) => {
      if (err) return reject(err);
      resolve(results.length > 0 ? results[0].id : null);
    });
  });
};

exports.createTransaction = async (
  drvOrderMainId,
  transCode,
  transAmount,
  paySlip,
) => {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO collection_officer.driverordertransaction 
      (drvOrderMainId, transCode, transAmount, paySlip, transStatus) 
      VALUES (?, ?, ?, ?, 'To Review')
    `;
    db.collectionofficer.query(
      sql,
      [drvOrderMainId, transCode, transAmount, paySlip],
      (err, results) => {
        if (err) return reject(err);
        resolve(results.insertId);
      },
    );
  });
};

exports.getLatestTransactionStatus = async (driverId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT tx.id, tx.transCode, tx.transAmount, tx.paySlip, tx.transStatus,tx.updatedAt,tx.rejectReason, tx.createdAt 
      FROM collection_officer.driverordertransaction tx
      INNER JOIN collection_officer.driverordermain dom ON tx.drvOrderMainId = dom.id
      WHERE dom.driverId = ? AND dom.isHandOver = 0
      ORDER BY tx.createdAt DESC
      LIMIT 1
    `;
    db.collectionofficer.query(sql, [driverId], (err, results) => {
      if (err) return reject(err);
      resolve(results.length > 0 ? results[0] : null);
    });
  });
};

exports.updateTransactionStatus = async (transactionId, status) => {
  return new Promise((resolve, reject) => {
    db.collectionofficer.beginTransaction((err) => {
      if (err) return reject(err);

      const updateTxSql = `
        UPDATE collection_officer.driverordertransaction
        SET transStatus = ?
        WHERE id = ?
      `;

      db.collectionofficer.query(
        updateTxSql,
        [status, transactionId],
        (err, results) => {
          if (err) {
            return db.collectionofficer.rollback(() => reject(err));
          }

          if (status === "Approved") {
            const getTxSql = `
            SELECT drvOrderMainId FROM collection_officer.driverordertransaction WHERE id = ?
          `;

            db.collectionofficer.query(
              getTxSql,
              [transactionId],
              (err, txResults) => {
                if (err) {
                  return db.collectionofficer.rollback(() => reject(err));
                }

                if (txResults.length > 0) {
                  const drvOrderMainId = txResults[0].drvOrderMainId;

                  const updateMainSql = `
                UPDATE collection_officer.driverordermain
                SET isHandOver = 1
                WHERE id = ?
              `;

                  db.collectionofficer.query(
                    updateMainSql,
                    [drvOrderMainId],
                    (err, mainResults) => {
                      if (err) {
                        return db.collectionofficer.rollback(() => reject(err));
                      }

                      db.collectionofficer.commit((err) => {
                        if (err) {
                          return db.collectionofficer.rollback(() =>
                            reject(err),
                          );
                        }
                        resolve({
                          transactionId,
                          status,
                          isHandOverUpdated: true,
                        });
                      });
                    },
                  );
                } else {
                  db.collectionofficer.commit((err) => {
                    if (err) {
                      return db.collectionofficer.rollback(() => reject(err));
                    }
                    resolve({
                      transactionId,
                      status,
                      isHandOverUpdated: false,
                    });
                  });
                }
              },
            );
          } else {
            db.collectionofficer.commit((err) => {
              if (err) {
                return db.collectionofficer.rollback(() => reject(err));
              }
              resolve({ transactionId, status, isHandOverUpdated: false });
            });
          }
        },
      );
    });
  });
};

exports.createTransactionWithSeq = async (
  driverId,
  drvOrderMainId,
  empIdDigits,
  dateStr,
  transAmount,
  paySlip,
) => {
  return new Promise((resolve, reject) => {
    db.collectionofficer.getConnection((err, connection) => {
      if (err) return reject(err);

      connection.beginTransaction((err) => {
        if (err) {
          connection.release();
          return reject(err);
        }

        const pattern = `D${empIdDigits}${dateStr}%`;

        const findLastSql = `
          SELECT tx.transCode
          FROM collection_officer.driverordertransaction tx
          INNER JOIN collection_officer.driverordermain dom
            ON tx.drvOrderMainId = dom.id
          WHERE dom.driverId = ?
            AND tx.transCode LIKE ?
          ORDER BY tx.transCode DESC
          LIMIT 1
          FOR UPDATE
        `;

        connection.query(findLastSql, [driverId, pattern], (err, results) => {
          if (err) {
            return connection.rollback(() => {
              connection.release();
              reject(err);
            });
          }

          let nextSeq = 1;
          if (results.length > 0) {
            const lastCode = results[0].transCode;
            const lastSeqStr = lastCode.slice(-2);
            const lastSeq = parseInt(lastSeqStr, 10);
            if (!isNaN(lastSeq)) {
              nextSeq = lastSeq + 1;
            }
          }

          const seqStr = String(nextSeq).padStart(2, "0");
          const transCode = `D${empIdDigits}${dateStr}${seqStr}`;

          const insertSql = `
            INSERT INTO collection_officer.driverordertransaction
            (drvOrderMainId, transCode, transAmount, paySlip, transStatus)
            VALUES (?, ?, ?, ?, 'To Review')
          `;

          connection.query(
            insertSql,
            [drvOrderMainId, transCode, transAmount, paySlip],
            (err, insertResult) => {
              if (err) {
                return connection.rollback(() => {
                  connection.release();
                  reject(err);
                });
              }

              connection.commit((err) => {
                if (err) {
                  return connection.rollback(() => {
                    connection.release();
                    reject(err);
                  });
                }
                connection.release();
                resolve({
                  transactionId: insertResult.insertId,
                  transCode,
                });
              });
            },
          );
        });
      });
    });
  });
};
