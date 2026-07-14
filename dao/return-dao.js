const db = require("../startup/database");
const { HANDLING_FEE_CONSTANTS } = require("../constants/handling-fee");

// Get All Return Reasons
exports.getReason = async () => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT id, indexNo, rsnEnglish, rsnSinhala, rsnTamil, createdAt 
      FROM returnreason 
      ORDER BY indexNo ASC
    `;

    db.collectionofficer.query(query, (error, results) => {
      if (error) {
        console.error("Error fetching return reasons:", error);
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
};

// Submit Return Order
function getHandlingFee(fullTotal) {
  const total = Number(fullTotal) || 0;
  if (total < HANDLING_FEE_CONSTANTS.LOW_TOTAL_LIMIT) {
    return HANDLING_FEE_CONSTANTS.LOW_FEE;
  }
  if (total < HANDLING_FEE_CONSTANTS.MID_TOTAL_LIMIT) {
    return HANDLING_FEE_CONSTANTS.MID_FEE;
  }
  return HANDLING_FEE_CONSTANTS.HIGH_FEE;
}

function queryAsync(connection, sql, params) {
  return new Promise((resolve, reject) => {
    connection.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

exports.submitReturn = async ({ orderIds, returnReasonId, note, userId }) => {
  return new Promise((resolve, reject) => {
    // Get a connection from the pool
    db.collectionofficer.getConnection((err, connection) => {
      if (err) {
        console.error("Error getting connection:", err);
        return reject(new Error("Database connection failed: " + err.message));
      }

      connection.beginTransaction((err) => {
        if (err) {
          connection.release();
          return reject(new Error("Transaction start failed: " + err.message));
        }

        const getInvoiceNumbersQuery = `
          SELECT
            po.id,
            po.invNo,
            po.paymentMethod,
            po.orderId,
            o.fullTotal,
            o.deliveryCharge,
            o.userId
          FROM market_place.processorders po
          JOIN market_place.orders o ON po.orderId = o.id
          WHERE po.id IN (?)
        `;

        connection.query(
          getInvoiceNumbersQuery,
          [orderIds],
          (error, invoiceResult) => {
            if (error) {
              connection.release();
              return reject(
                new Error("Failed to fetch invoice numbers: " + error.message),
              );
            }

            if (invoiceResult.length === 0) {
              connection.release();
              return reject(new Error("No orders found with the provided IDs"));
            }

            const invoiceNumbers = invoiceResult
              .map((row) => row.invNo)
              .filter(Boolean);
            const orderDetails = invoiceResult.map((row) => ({
              id: row.id,
              invNo: row.invNo,
            }));

            const creditBalanceDeltaByUser = {};
            const creditBalanceBreakdown = [];

            invoiceResult.forEach((row) => {
              const deliveryCharge = Number(row.deliveryCharge) || 0;
              const handlingFee = getHandlingFee(row.fullTotal);
              const deduction = deliveryCharge + handlingFee;
              const delta = -deduction;

              creditBalanceDeltaByUser[row.userId] =
                (creditBalanceDeltaByUser[row.userId] || 0) + delta;

              creditBalanceBreakdown.push({
                processOrderId: row.id,
                orderId: row.orderId,
                userId: row.userId,
                paymentMethod: row.paymentMethod,
                fullTotal: row.fullTotal,
                deliveryCharge,
                handlingFee,
                creditBalanceDelta: delta,
              });
            });

            const updateProcessOrdersQuery = `
            UPDATE market_place.processorders 
            SET status = 'Return'
            WHERE id IN (?)
          `;

            connection.query(
              updateProcessOrdersQuery,
              [orderIds],
              (error, processOrdersResult) => {
                if (error) {
                  return connection.rollback(() => {
                    connection.release();
                    reject(
                      new Error(
                        "Failed to update process orders: " + error.message,
                      ),
                    );
                  });
                }

                if (processOrdersResult.affectedRows === 0) {
                  return connection.rollback(() => {
                    connection.release();
                    reject(new Error("No orders updated in processorders"));
                  });
                }

                const getDriverOrdersQuery = `
                  SELECT id 
                  FROM collection_officer.driverorders 
                  WHERE orderId IN (?)
                `;

                connection.query(
                  getDriverOrdersQuery,
                  [orderIds],
                  (error, driverOrdersResult) => {
                    if (error) {
                      return connection.rollback(() => {
                        connection.release();
                        reject(
                          new Error(
                            "Failed to fetch driver orders: " + error.message,
                          ),
                        );
                      });
                    }

                    if (driverOrdersResult.length === 0) {
                      return connection.rollback(() => {
                        connection.release();
                        reject(new Error("No driver orders found"));
                      });
                    }

                    const driverOrderIds = driverOrdersResult.map(
                      (row) => row.id,
                    );

                    const checkExistingReturnsQuery = `
                      SELECT drvOrderId 
                      FROM collection_officer.driverreturnorders 
                      WHERE drvOrderId IN (?)
                    `;

                    connection.query(
                      checkExistingReturnsQuery,
                      [driverOrderIds],
                      (error, existingReturnsResult) => {
                        if (error) {
                          return connection.rollback(() => {
                            connection.release();
                            reject(
                              new Error(
                                "Failed to check existing returns: " +
                                error.message,
                              ),
                            );
                          });
                        }

                        if (existingReturnsResult.length > 0) {
                          return connection.rollback(() => {
                            connection.release();
                            reject(
                              new Error("Order has already been returned."),
                            );
                          });
                        }

                        const updateDriverOrdersQuery = `
                          UPDATE collection_officer.driverorders 
                          SET drvStatus = 'Return'
                          WHERE id IN (?)
                        `;

                        connection.query(
                          updateDriverOrdersQuery,
                          [driverOrderIds],
                          (error, updateDriverResult) => {
                            if (error) {
                              return connection.rollback(() => {
                                connection.release();
                                reject(
                                  new Error(
                                    "Failed to update driver orders: " +
                                    error.message,
                                  ),
                                );
                              });
                            }

                            const insertReturnOrdersQuery = `
                              INSERT INTO collection_officer.driverreturnorders 
                              (drvOrderId, returnReasonId, note)
                              VALUES ?
                            `;

                            const returnOrdersData = driverOrderIds.map(
                              (drvOrderId) => [
                                drvOrderId,
                                returnReasonId,
                                note,
                              ],
                            );

                            connection.query(
                              insertReturnOrdersQuery,
                              [returnOrdersData],
                              async (error, insertResult) => {
                                if (error) {
                                  return connection.rollback(() => {
                                    connection.release();
                                    reject(
                                      new Error(
                                        "Failed to insert return orders: " +
                                        error.message,
                                      ),
                                    );
                                  });
                                }

                                let creditBalanceUpdateResults = [];
                                try {
                                  creditBalanceUpdateResults =
                                    await Promise.all(
                                      Object.entries(
                                        creditBalanceDeltaByUser,
                                      ).map(async ([uid, delta]) => {
                                        if (delta === 0) return null;

                                        const numericUserId = Number(uid);
                                        const result = await queryAsync(
                                          connection,
                                          `UPDATE market_place.marketplaceusers SET creditBalance = creditBalance + ? WHERE id = ?`,
                                          [delta, numericUserId],
                                        );

                                        if (result.affectedRows === 0) {
                                          console.warn(
                                            `[submitReturn][creditBalance update] ⚠️ No row matched for marketplaceusers.id = ${numericUserId} — creditBalance was NOT updated.`,
                                          );
                                        }

                                        return {
                                          userId: numericUserId,
                                          delta,
                                          affectedRows: result.affectedRows,
                                          changedRows: result.changedRows,
                                        };
                                      }),
                                    );
                                  creditBalanceUpdateResults =
                                    creditBalanceUpdateResults.filter(Boolean);
                                } catch (creditErr) {
                                  return connection.rollback(() => {
                                    connection.release();
                                    console.error(
                                      "[submitReturn] Failed to update creditBalance:",
                                      creditErr,
                                    );
                                    reject(
                                      new Error(
                                        "Failed to update creditBalance: " +
                                        creditErr.message,
                                      ),
                                    );
                                  });
                                }

                                // Commit transaction
                                connection.commit((err) => {
                                  if (err) {
                                    return connection.rollback(() => {
                                      connection.release();
                                      reject(
                                        new Error(
                                          "Transaction commit failed: " +
                                          err.message,
                                        ),
                                      );
                                    });
                                  }

                                  connection.release();

                                  resolve({
                                    processOrdersUpdated:
                                      processOrdersResult.affectedRows,
                                    driverOrdersUpdated:
                                      updateDriverResult.affectedRows,
                                    returnOrdersInserted:
                                      insertResult.affectedRows,
                                    driverOrderIds,
                                    invoiceNumbers,
                                    orderDetails,
                                    creditBalanceUpdateResults,
                                    creditBalanceBreakdown,
                                  });
                                });
                              },
                            );
                          },
                        );
                      },
                    );
                  },
                );
              },
            );
          },
        );
      });
    });
  });
};

// Get Driver's Return Orders
exports.getDriverReturnOrdersDAO = async (driverId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        do.id as driverOrderId,
        do.drvStatus,
        dom.isHandOver,
        do.createdAt as driverOrderCreatedAt,
        
        -- Process Order Details
        po.id as processOrderId,
        po.invNo,
        po.amount,
        po.isPaid,
        po.status as processStatus,
        po.paymentMethod,
        
        -- Order Details
        o.id as orderId,
        o.title as orderTitle,
        o.fullName,
        o.phone1,
        o.phonecode1,
        o.phone2,
        o.phonecode2,
        o.sheduleTime,
        o.buildingType,
        o.total,
        o.fullTotal,
        
        -- User Details
        u.id as userId,
        u.title as userTitle,
        u.firstName,
        u.lastName,
        u.phoneCode,
        u.phoneNumber,
        u.image,
        
        -- Get the latest return reason details
        dro.note as returnNote,
        dro.createdAt as returnCreatedAt,
        rr.rsnEnglish as returnReasonEnglish,
        rr.rsnSinhala as returnReasonSinhala,
        rr.rsnTamil as returnReasonTamil,
        rr.id as returnReasonId,
        
        -- Address Details (House)
        oh.houseNo as house_houseNo,
        oh.streetName as house_streetName,
        oh.city as house_city,
        
        -- Address Details (Apartment)
        oa.buildingNo as apartment_buildingNo,
        oa.buildingName as apartment_buildingName,
        oa.unitNo as apartment_unitNo,
        oa.floorNo as apartment_floorNo,
        oa.houseNo as apartment_houseNo,
        oa.streetName as apartment_streetName,
        oa.city as apartment_city
        
      FROM collection_officer.driverorders do
      INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
      
      -- Join with processorders
      INNER JOIN market_place.processorders po ON do.orderId = po.id
      
      -- Join with orders
      INNER JOIN market_place.orders o ON po.orderId = o.id
      
      -- Join with marketplaceusers
      INNER JOIN market_place.marketplaceusers u ON o.userId = u.id
      
      -- LEFT JOIN with the LATEST driverreturnorders using a subquery
      LEFT JOIN (
        SELECT drvOrderId, note, returnReasonId, createdAt,
               ROW_NUMBER() OVER (PARTITION BY drvOrderId ORDER BY createdAt DESC) as rn
        FROM collection_officer.driverreturnorders
      ) dro_latest ON do.id = dro_latest.drvOrderId AND dro_latest.rn = 1
      
      -- LEFT JOIN with returnreason using the latest return order
      LEFT JOIN collection_officer.returnreason rr ON dro_latest.returnReasonId = rr.id
      
      -- LEFT JOIN the actual driverreturnorders for all fields
      LEFT JOIN collection_officer.driverreturnorders dro ON dro_latest.drvOrderId = dro.drvOrderId 
        AND dro_latest.createdAt = dro.createdAt
        AND dro_latest.returnReasonId = dro.returnReasonId
      
      -- LEFT JOIN with address tables
      LEFT JOIN market_place.orderhouse oh ON o.id = oh.orderId AND o.buildingType = 'House'
      LEFT JOIN market_place.orderapartment oa ON o.id = oa.orderId AND o.buildingType = 'Apartment'
      
      WHERE dom.driverId = ?
        AND do.drvStatus = 'Return'
        AND (dom.isHandOver = 0 OR dom.isHandOver IS NULL)
        
      ORDER BY do.createdAt DESC, po.id DESC
    `;

    const params = [driverId];

    db.collectionofficer.query(sql, params, (err, results) => {
      if (err) {
        console.error(
          "Database error fetching driver return orders:",
          err.message,
        );
        console.error("SQL:", sql);
        console.error("Params:", params);
        return reject(new Error("Failed to fetch driver return orders"));
      }

      const uniqueOrdersMap = new Map();

      results.forEach((row) => {
        if (!uniqueOrdersMap.has(row.driverOrderId)) {
          uniqueOrdersMap.set(row.driverOrderId, row);
        }
      });

      const uniqueResults = Array.from(uniqueOrdersMap.values());

      const formattedResults = uniqueResults.map((row) => {
        let formattedAddress = "No Address";
        if (row.buildingType === "House") {
          const parts = [
            row.house_houseNo,
            row.house_streetName,
            row.house_city,
          ].filter(Boolean);
          formattedAddress = parts.join(", ") || "No Address";
        } else if (row.buildingType === "Apartment") {
          const parts = [
            row.apartment_buildingNo
              ? `Building ${row.apartment_buildingNo}`
              : null,
            row.apartment_buildingName,
            row.apartment_unitNo ? `Unit ${row.apartment_unitNo}` : null,
            row.apartment_floorNo ? `Floor ${row.apartment_floorNo}` : null,
            row.apartment_houseNo,
            row.apartment_streetName,
            row.apartment_city,
          ].filter(Boolean);
          formattedAddress = parts.join(", ") || "No Address";
        }

        // Determine return reason text (use the latest one)
        let returnReasonText = "";
        if (row.returnReasonEnglish) {
          returnReasonText = row.returnReasonEnglish;
        } else if (row.returnNote) {
          returnReasonText = row.returnNote;
        } else {
          returnReasonText = "No reason specified";
        }

        const customerName =
          row.fullName ||
          `${row.firstName || ""} ${row.lastName || ""}`.trim() ||
          "Customer";

        const customerTitle = row.orderTitle || row.userTitle || "";

        // Format the return order
        const formattedOrder = {
          driverOrderId: row.driverOrderId,
          processOrderId: row.processOrderId,
          orderId: row.orderId,
          userId: row.userId,

          // Invoice and payment details
          invoiceNumber: row.invNo,
          amount: row.amount,
          totalAmount: row.fullTotal || row.total,
          isPaid: row.isPaid === 1,
          paymentMethod: row.paymentMethod,
          processStatus: row.processStatus,

          // Customer details
          customer: {
            title: customerTitle,
            fullName: customerName,
            nameWithTitle: customerTitle
              ? `${customerTitle}. ${customerName}`
              : customerName,
            phoneCode: row.phonecode1 || row.phoneCode,
            phoneNumber: row.phone1 || row.phoneNumber,
            secondaryPhoneCode: row.phonecode2,
            secondaryPhone: row.phone2,
            image: row.image,
          },

          // Return details (latest one only)
          returnDetails: {
            reason: returnReasonText,
            reasonEnglish: row.returnReasonEnglish,
            reasonSinhala: row.returnReasonSinhala,
            reasonTamil: row.returnReasonTamil,
            note: row.returnNote,
            returnReasonId: row.returnReasonId,
            createdAt: row.returnCreatedAt,
          },

          // Delivery details
          scheduleTime: row.sheduleTime,
          buildingType: row.buildingType,
          address: formattedAddress,

          // Status
          drvStatus: row.drvStatus,
          isHandOver: row.isHandOver === 1,
          driverOrderCreatedAt: row.driverOrderCreatedAt,
        };

        return formattedOrder;
      });

      resolve(formattedResults);
    });
  });
};

// Update Return Order to Return Received
exports.updateReturnReceived = async ({ invoiceNumbers, driverId }) => {
  return new Promise((resolve, reject) => {
    // Step 1: Get process order IDs and validate driver ownership
    const getOrdersSql = `
      SELECT 
        po.id as processOrderId,
        po.invNo,
        po.status as processStatus,
        do.id as driverOrderId,
        dom.driverId,
        do.drvStatus,
        dom.isHandOver
      FROM market_place.processorders po
      INNER JOIN collection_officer.driverorders do ON po.id = do.orderId
      INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
      WHERE po.invNo IN (?)
        AND dom.driverId = ?
        AND do.drvStatus = 'Return'
        AND (dom.isHandOver = 0 OR dom.isHandOver IS NULL)
    `;

    db.collectionofficer.query(
      getOrdersSql,
      [invoiceNumbers, driverId],
      (err, orderResults) => {
        if (err) {
          console.error("Error fetching orders:", err);
          return reject(new Error("Failed to fetch orders"));
        }

        if (orderResults.length === 0) {
          return reject(
            new Error(
              "No return orders found with the provided invoice numbers for this driver",
            ),
          );
        }

        // Extract IDs
        const processOrderIds = orderResults.map((row) => row.processOrderId);
        const driverOrderIds = orderResults.map((row) => row.driverOrderId);
        const foundInvoiceNumbers = orderResults.map((row) => row.invNo);

        // Step 2: Update driverorders table - set drvStatus to 'Return Received'
        const updateDriverOrdersSql = `
          UPDATE collection_officer.driverorders do
          INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
          SET 
            do.drvStatus = 'Return Received',
            do.receivedTime = NOW()
          WHERE do.id IN (?)
            AND dom.driverId = ?
            AND do.drvStatus = 'Return'
        `;

        db.collectionofficer.query(
          updateDriverOrdersSql,
          [driverOrderIds, driverId],
          (err, driverResult) => {
            if (err) {
              console.error("Error updating driverorders:", err);
              return reject(new Error("Failed to update driver orders"));
            }

            // Step 3: Update processorders table - set status to 'Return Received'
            const updateProcessOrdersSql = `
          UPDATE market_place.processorders 
          SET status = 'Return Received'
          WHERE id IN (?)
        `;

            db.collectionofficer.query(
              updateProcessOrdersSql,
              [processOrderIds],
              (err, processResult) => {
                if (err) {
                  console.error("Error updating processorders:", err);
                  return reject(new Error("Failed to update process orders"));
                }

                // Step 4: Get updated order details for response
                const getUpdatedOrdersSql = `
            SELECT 
              po.id as processOrderId,
              po.invNo,
              po.status as processStatus,
              do.id as driverOrderId,
              do.drvStatus,
              dom.isHandOver
            FROM market_place.processorders po
            INNER JOIN collection_officer.driverorders do ON po.id = do.orderId
            INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
            WHERE po.id IN (?)
              AND do.id IN (?)
          `;

                db.collectionofficer.query(
                  getUpdatedOrdersSql,
                  [processOrderIds, driverOrderIds],
                  (err, updatedResults) => {
                    if (err) {
                      console.error("Error fetching updated orders:", err);
                      return reject(
                        new Error("Failed to fetch updated orders"),
                      );
                    }

                    resolve({
                      success: true,
                      driverOrdersUpdated: driverResult.affectedRows,
                      processOrdersUpdated: processResult.affectedRows,
                      updatedOrders: updatedResults,
                      invoiceNumbers: foundInvoiceNumbers,
                      timestamp: new Date().toISOString(),
                    });
                  },
                );
              },
            );
          },
        );
      },
    );
  });
};
