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
      INNER JOIN collection_officer.processorders po ON do.orderId = po.id
      INNER JOIN collection_officer.orders o ON po.orderId = o.id
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

          // Locations use the SAME grouping as getDriverOrdersDAO (userId + address).
          // Counted in SQL so NULL address parts and timezone issues are handled in one place.
          const locationCountSql = `
            SELECT
              COALESCE(SUM(loc.pendingOrders > 0), 0) AS pendingLocationsCount,
              COALESCE(SUM(loc.pendingOrders = 0 AND loc.todayFinished > 0), 0) AS todayCompletedLocationsCount
            FROM (
              SELECT
                CONCAT_WS('_',
                  o.userId,
                  CASE
                    WHEN o.buildingType = 'House' THEN
                      CONCAT_WS('_', 'HOUSE', oh.houseNo, oh.streetName, oh.city)
                    WHEN o.buildingType = 'Apartment' THEN
                      CONCAT_WS('_', 'APARTMENT', oa.buildingNo, oa.buildingName,
                                oa.unitNo, oa.floorNo, oa.streetName, oa.city)
                    ELSE CONCAT('OTHER_', o.id)
                  END
                ) AS locKey,
                SUM(do.drvStatus IN ('Todo', 'Hold', 'On the way')) AS pendingOrders,
                SUM(
                  do.drvStatus IN ('Completed', 'Return', 'Return Received')
                  AND (
                    CASE
                      WHEN do.drvStatus IN ('Return', 'Return Received') THEN (
                        SELECT DATE(CONVERT_TZ(MAX(dro.createdAt), '+00:00', '+05:30'))
                        FROM collection_officer.driverreturnorders dro
                        WHERE dro.drvOrderId = do.id
                      )
                      ELSE DATE(CONVERT_TZ(po.deliveredTime, '+00:00', '+05:30'))
                    END
                  ) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30'))
                ) AS todayFinished
              FROM collection_officer.driverorders do
              INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
              INNER JOIN collection_officer.processorders po ON do.orderId = po.id
              INNER JOIN collection_officer.orders o ON po.orderId = o.id
              LEFT JOIN collection_officer.orderhouse oh
                ON o.id = oh.orderId AND o.buildingType = 'House'
              LEFT JOIN collection_officer.orderapartment oa
                ON o.id = oa.orderId AND o.buildingType = 'Apartment'
              WHERE dom.driverId = ?
                AND dom.isHandOver = 0
              GROUP BY locKey
            ) loc
          `;

          db.collectionofficer.query(
            locationCountSql,
            [driverId],
            (allErr, allResults) => {
              if (allErr) {
                console.error(
                  "Database error fetching location counts:",
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

              result.pendingLocationsCount =
                Number(allResults[0]?.pendingLocationsCount) || 0;
              result.todayCompletedLocationsCount =
                Number(allResults[0]?.todayCompletedLocationsCount) || 0;

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
                collection_officer.processorders po ON do.orderId = po.id
            INNER JOIN 
                collection_officer.orders o ON po.orderId = o.id
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

exports.getDriverCenterLocation = async (driverId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        co.id AS officerId,
        co.centerId,
        co.distributedCenterId,
        -- collectioncenter (from centerId)
        cc.id AS collectionCenterId,
        cc.regCode AS ccRegCode,
        cc.centerName AS ccCenterName,
        cc.code1 AS ccCode1,
        cc.contact01 AS ccContact01,
        cc.code2 AS ccCode2,
        cc.contact02 AS ccContact02,
        cc.buildingNumber AS ccBuildingNumber,
        cc.street AS ccStreet,
        cc.city AS ccCity,
        cc.district AS ccDistrict,
        cc.province AS ccProvince,
        cc.country AS ccCountry,
        -- distributedcenter (from distributedCenterId)
        dc.id AS dcId,
        dc.centerName AS dcCenterName,
        dc.city AS dcCity,
        dc.district AS dcDistrict,
        dc.province AS dcProvince,
        dc.country AS dcCountry,
        dc.latitude AS dcLatitude,
        dc.longitude AS dcLongitude
      FROM collection_officer.collectionofficer co
      LEFT JOIN collection_officer.collectioncenter cc ON co.centerId = cc.id
      LEFT JOIN collection_officer.distributedcenter dc ON co.distributedCenterId = dc.id
      WHERE co.id = ?
      LIMIT 1
    `;

    db.collectionofficer.query(sql, [driverId], (err, results) => {
      if (err) {
        console.error(
          "Database error getting driver center location:",
          err.message,
        );
        return reject(new Error("Failed to retrieve driver centre location"));
      }

      if (!results || results.length === 0) {
        return resolve(null);
      }

      const row = results[0];

      // Prioritize distributedcenter (co.distributedCenterId -> distributedcenter)
      const centerName = row.dcCenterName || row.ccCenterName || "Distribution Centre";
      const city = row.dcCity || row.ccCity || null;
      const district = row.dcDistrict || row.ccDistrict || null;
      const province = row.dcProvince || row.ccProvince || null;
      const country = row.dcCountry || row.ccCountry || "Sri Lanka";

      const latitude =
        row.dcLatitude != null && row.dcLatitude !== ""
          ? parseFloat(row.dcLatitude)
          : null;
      const longitude =
        row.dcLongitude != null && row.dcLongitude !== ""
          ? parseFloat(row.dcLongitude)
          : null;

      const buildingNumber = row.ccBuildingNumber || null;
      const street = row.ccStreet || null;

      const addressParts = [
        buildingNumber,
        street,
        city,
        district,
        province,
        country,
      ].filter(Boolean);
      const formattedAddress = addressParts.join(", ");

      resolve({
        officerId: row.officerId,
        distributedCenterId: row.distributedCenterId,
        centerId: row.distributedCenterId || row.centerId,
        collectionCenterId: row.collectionCenterId,
        regCode: row.ccRegCode || null,
        centerName,
        buildingNumber,
        street,
        city,
        district,
        province,
        country,
        latitude,
        longitude,
        formattedAddress,
        contact01: row.ccContact01 || null,
        contact02: row.ccContact02 || null,
      });
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
        COALESCE(po.fullTotal, 0) as amount
      FROM 
        collection_officer.driverorders do
      INNER JOIN 
        collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
      INNER JOIN 
        collection_officer.processorders po ON do.orderId = po.id
      INNER JOIN 
        collection_officer.orders o ON po.orderId = o.id
      WHERE 
        do.id IN (?)
        AND dom.isHandOver = 0
        AND po.fullTotal IS NOT NULL
        AND po.fullTotal > 0
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
