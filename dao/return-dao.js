const db = require("../startup/database");
const { HANDLING_FEE_CONSTANTS } = require("../constants/handling-fee");
const axios = require("axios");

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
  if (total <= HANDLING_FEE_CONSTANTS.LOW_TOTAL_LIMIT) {
    return HANDLING_FEE_CONSTANTS.LOW_FEE;
  }
  if (total <= HANDLING_FEE_CONSTANTS.MID_TOTAL_LIMIT) {
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

const HOUSE_VALUES = ["house"];
const APARTMENT_VALUES = ["apartment", "flat"];

function normalizeBuildingType(buildingType) {
  const val = (buildingType || "").toString().trim().toLowerCase();
  if (HOUSE_VALUES.includes(val)) return "house";
  if (APARTMENT_VALUES.includes(val)) return "apartment";
  return null;
}

// Shared helper - keep in sync with other DAOs (saveSignatureAndUpdateStatusDAO, getReceivedCash)
function isFreeDeliveryCoupon(row) {
  return (
    !!row.isCoupon &&
    (row.couponType || "").toString().trim().toLowerCase() === "free delivery"
  );
}


exports.submitReturn = async ({ orderIds, returnReasonId, note, userId }) => {
  return new Promise((resolve, reject) => {
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
            po.creditPaid,
            po.moneyPaid,
            po.orderId,
            o.fullTotal,
            o.deliveryCharge AS currentDeliveryCharge,
            o.buildingType,
            o.isCoupon,
            o.couponType,
            o.userId,
            mu.phoneCode,
            mu.phoneNumber
          FROM collection_officer.processorders po
          JOIN collection_officer.orders o ON po.orderId = o.id
          LEFT JOIN collection_officer.marketplaceusers mu ON o.userId = mu.id
          WHERE po.id IN (?)
        `;

        connection.query(
          getInvoiceNumbersQuery,
          [orderIds],
          async (error, invoiceResult) => {
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

            try {
              const relevantRows = invoiceResult.filter((row) => {
                const pm = (row.paymentMethod || "").toLowerCase();
                return pm === "cash" || pm === "card";
              });

              const houseOrderIds = [];
              const apartmentOrderIds = [];
              const unknownBuildingTypeOrders = [];

              relevantRows.forEach((row) => {
                const kind = normalizeBuildingType(row.buildingType);
                if (kind === "house") houseOrderIds.push(row.orderId);
                else if (kind === "apartment")
                  apartmentOrderIds.push(row.orderId);
                else unknownBuildingTypeOrders.push(row);
              });

              if (unknownBuildingTypeOrders.length > 0) {
                console.warn(
                  "[submitReturn] Unrecognized buildingType, falling back to stored deliveryCharge for:",
                  unknownBuildingTypeOrders.map((o) => ({
                    orderId: o.orderId,
                    buildingType: o.buildingType,
                  })),
                );
              }

              const orderIdToCity = {};

              if (houseOrderIds.length > 0) {
                const houseRows = await queryAsync(
                  connection,
                  `SELECT orderId, city FROM collection_officer.orderhouse WHERE orderId IN (?)`,
                  [houseOrderIds],
                );
                houseRows.forEach((row) => {
                  orderIdToCity[row.orderId] = row.city;
                });
              }

              if (apartmentOrderIds.length > 0) {
                const apartmentRows = await queryAsync(
                  connection,
                  `SELECT orderId, city FROM collection_officer.orderapartment WHERE orderId IN (?)`,
                  [apartmentOrderIds],
                );
                apartmentRows.forEach((row) => {
                  orderIdToCity[row.orderId] = row.city;
                });
              }

              const cities = [
                ...new Set(Object.values(orderIdToCity).filter(Boolean)),
              ];
              const cityToCharge = {};

              if (cities.length > 0) {
                const chargeRows = await queryAsync(
                  connection,
                  `SELECT city, charge FROM collection_officer.deliverycharge WHERE city IN (?)`,
                  [cities],
                );

                chargeRows.forEach((row) => {
                  if (cityToCharge[row.city] !== undefined) {
                    console.warn(
                      `[submitReturn] Multiple deliverycharge rows for city "${row.city}" — using first match (${cityToCharge[row.city]}), ignoring ${row.charge}.`,
                    );
                    return;
                  }
                  cityToCharge[row.city] = row.charge;
                });
              }

              const creditBalanceDeltaByUser = {};
              const creditBalanceBreakdown = [];
              const cashProcessOrderIds = [];

              invoiceResult.forEach((row) => {
                const paymentMethod = (row.paymentMethod || "").toLowerCase();
                const oldDeliveryCharge =
                  Number(row.currentDeliveryCharge) || 0;
                const city = orderIdToCity[row.orderId];
                const cityCharge = city ? cityToCharge[city] : undefined;
                const freeDelivery = isFreeDeliveryCoupon(row);

                const resolvedTodaysDeliveryCharge =
                  cityCharge !== undefined
                    ? Number(cityCharge)
                    : oldDeliveryCharge;

                // If a free-delivery coupon applies, the delivery-charge component
                // is excluded entirely from the handling-fee base and from the
                // creditBalance delta, and processorders.curDlvrCharge must
                // NOT be corrected for this order.
                const todaysDeliveryCharge = freeDelivery
                  ? 0
                  : resolvedTodaysDeliveryCharge;

                if (paymentMethod === "cash") {
                  cashProcessOrderIds.push(row.id);

                  const orderValue =
                    (Number(row.fullTotal) || 0) - oldDeliveryCharge;
                  const orderAmountWithTodaysDelivery =
                    orderValue + todaysDeliveryCharge;
                  const handlingFee = getHandlingFee(
                    orderAmountWithTodaysDelivery,
                  );
                  const creditPaid = Number(row.creditPaid) || 0;

                  let delta = -(todaysDeliveryCharge + handlingFee);
                  if (creditPaid > 0) delta += creditPaid;

                  creditBalanceDeltaByUser[row.userId] =
                    (creditBalanceDeltaByUser[row.userId] || 0) + delta;

                  creditBalanceBreakdown.push({
                    processOrderId: row.id,
                    orderId: row.orderId,
                    userId: row.userId,
                    paymentMethod: row.paymentMethod,
                    fullTotal: row.fullTotal,
                    oldDeliveryCharge,
                    todaysDeliveryCharge,
                    isFreeDeliveryCoupon: freeDelivery,
                    // used to decide whether processorders.curDlvrCharge should be corrected
                    resolvedTodaysDeliveryCharge,
                    handlingFee,
                    creditPaid,
                    creditBalanceDelta: delta,
                  });
                  return;
                }

                if (paymentMethod === "card") {
                  const orderValue =
                    (Number(row.fullTotal) || 0) - oldDeliveryCharge;
                  const orderAmountWithTodaysDelivery =
                    orderValue + todaysDeliveryCharge;
                  const handlingFee = getHandlingFee(
                    orderAmountWithTodaysDelivery,
                  );
                  const moneyPaid = Number(row.moneyPaid) || 0;
                  const creditPaid = Number(row.creditPaid) || 0;

                  let delta = moneyPaid - todaysDeliveryCharge - handlingFee;
                  if (creditPaid > 0) delta += creditPaid;

                  creditBalanceDeltaByUser[row.userId] =
                    (creditBalanceDeltaByUser[row.userId] || 0) + delta;

                  creditBalanceBreakdown.push({
                    processOrderId: row.id,
                    orderId: row.orderId,
                    userId: row.userId,
                    paymentMethod: row.paymentMethod,
                    fullTotal: row.fullTotal,
                    moneyPaid,
                    oldDeliveryCharge,
                    todaysDeliveryCharge,
                    isFreeDeliveryCoupon: freeDelivery,
                    resolvedTodaysDeliveryCharge,
                    handlingFee,
                    creditPaid,
                    creditBalanceDelta: delta,
                  });
                  return;
                }

                creditBalanceBreakdown.push({
                  processOrderId: row.id,
                  orderId: row.orderId,
                  userId: row.userId,
                  paymentMethod: row.paymentMethod,
                  creditBalanceDelta: 0,
                  note: `Skipped - unsupported payment method (${row.paymentMethod})`,
                });
              });

              const updateProcessOrdersQuery =
                cashProcessOrderIds.length > 0
                  ? `
                    UPDATE collection_officer.processorders
                    SET status = 'Return',
                        isPaid = CASE WHEN id IN (?) THEN 0 ELSE isPaid END
                    WHERE id IN (?)
                  `
                  : `
                    UPDATE collection_officer.processorders
                    SET status = 'Return'
                    WHERE id IN (?)
                  `;

              const updateProcessOrdersParams =
                cashProcessOrderIds.length > 0
                  ? [cashProcessOrderIds, orderIds]
                  : [orderIds];

              connection.query(
                updateProcessOrdersQuery,
                updateProcessOrdersParams,
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

                          const getPayoutsQuery = `
  SELECT 
    do.id AS driverOrderId,
    dcs.slvPayout
  FROM collection_officer.driverorders do
  INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
  INNER JOIN collection_officer.collectionofficer co ON dom.driverId = co.id
  LEFT JOIN collection_officer.drivercategoryslave dcs ON co.driverCatId = dcs.id
  WHERE do.id IN (?)
`;

                          connection.query(
                            getPayoutsQuery,
                            [driverOrderIds],
                            (error, payoutResults) => {
                              if (error) {
                                return connection.rollback(() => {
                                  connection.release();
                                  reject(
                                    new Error(
                                      "Failed to fetch driver category payouts: " +
                                      error.message,
                                    ),
                                  );
                                });
                              }

                              if (payoutResults.length === 0) {
                                return connection.rollback(() => {
                                  connection.release();
                                  reject(
                                    new Error(
                                      "Could not resolve driver category payout for the given orders.",
                                    ),
                                  );
                                });
                              }

                              const earnPriceByDriverOrderId = {};
                              payoutResults.forEach((row) => {
                                const payout = Number(row.slvPayout) || 0;
                                earnPriceByDriverOrderId[row.driverOrderId] =
                                  payout * 0.95;
                              });

                              const earnPriceCaseParts = driverOrderIds
                                .map(
                                  (id) =>
                                    `WHEN ${connection.escape(id)} THEN ${connection.escape(
                                      earnPriceByDriverOrderId[id] !== undefined
                                        ? earnPriceByDriverOrderId[id]
                                        : 0,
                                    )}`,
                                )
                                .join(" ");

                              const updateDriverOrdersQuery = `
                                UPDATE collection_officer.driverorders 
                                SET 
                                  drvStatus = 'Return',
                                  earnPrice = CASE id ${earnPriceCaseParts} END
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
                                                `UPDATE collection_officer.marketplaceusers SET creditBalance = creditBalance + ? WHERE id = ?`,
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
                                                affectedRows:
                                                  result.affectedRows,
                                                changedRows: result.changedRows,
                                              };
                                            }),
                                          );
                                        creditBalanceUpdateResults =
                                          creditBalanceUpdateResults.filter(
                                            Boolean,
                                          );
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

                                      // ── Correct processorders.curDlvrCharge ──
                                      let deliveryChargeUpdateResults = [];
                                      try {
                                        // Only correct processorders.curDlvrCharge for
                                        // Cash/Card rows that are NOT free-delivery
                                        // coupon orders.
                                        const cashOrCardBreakdownRows =
                                          creditBalanceBreakdown.filter((b) => {
                                            const pm = (
                                              b.paymentMethod || ""
                                            ).toLowerCase();
                                            return (
                                              (pm === "cash" ||
                                                pm === "card") &&
                                              b.resolvedTodaysDeliveryCharge !==
                                              undefined &&
                                              !b.isFreeDeliveryCoupon
                                            );
                                          });

                                        deliveryChargeUpdateResults =
                                          await Promise.all(
                                            cashOrCardBreakdownRows.map(
                                              async (b) => {
                                                const result = await queryAsync(
                                                  connection,
                                                  `UPDATE collection_officer.processorders SET curDlvrCharge = ? WHERE id = ?`,
                                                  [
                                                    b.resolvedTodaysDeliveryCharge,
                                                    b.processOrderId,
                                                  ],
                                                );
                                                return {
                                                  processOrderId: b.processOrderId,
                                                  orderId: b.orderId,
                                                  newCharge:
                                                    b.resolvedTodaysDeliveryCharge,
                                                  affectedRows:
                                                    result.affectedRows,
                                                  changedRows:
                                                    result.changedRows,
                                                };
                                              },
                                            ),
                                          );
                                      } catch (dcErr) {
                                        return connection.rollback(() => {
                                          connection.release();
                                          console.error(
                                            "[submitReturn] Failed to update curDlvrCharge:",
                                            dcErr,
                                          );
                                          reject(
                                            new Error(
                                              "Failed to update curDlvrCharge: " +
                                              dcErr.message,
                                            ),
                                          );
                                        });
                                      }

                                      // ── NEW: persist handling fee per returned processOrder ──
                                      // orderhandlingfee.orderId references collection_officer.processorders.id
                                      let handlingFeeInsertResults = [];
                                      try {
                                        const handlingFeeRows =
                                          creditBalanceBreakdown.filter(
                                            (b) => b.handlingFee !== undefined,
                                          );

                                        if (handlingFeeRows.length > 0) {
                                          const insertHandlingFeeQuery = `
                                            INSERT INTO collection_officer.orderhandlingfee
                                            (orderId, fee, createdAt)
                                            VALUES ?
                                          `;

                                          const handlingFeeData =
                                            handlingFeeRows.map((b) => [
                                              b.processOrderId,
                                              b.handlingFee,
                                              new Date(),
                                            ]);

                                          const hfResult = await queryAsync(
                                            connection,
                                            insertHandlingFeeQuery,
                                            [handlingFeeData],
                                          );

                                          handlingFeeInsertResults =
                                            handlingFeeRows.map((b) => ({
                                              processOrderId: b.processOrderId,
                                              fee: b.handlingFee,
                                            }));

                                          if (
                                            hfResult.affectedRows !==
                                            handlingFeeRows.length
                                          ) {
                                            console.warn(
                                              `[submitReturn][orderhandlingfee insert] ⚠️ Expected ${handlingFeeRows.length} rows inserted, got ${hfResult.affectedRows}.`,
                                            );
                                          }
                                        }
                                      } catch (hfErr) {
                                        return connection.rollback(() => {
                                          connection.release();
                                          console.error(
                                            "[submitReturn] Failed to insert orderhandlingfee:",
                                            hfErr,
                                          );
                                          reject(
                                            new Error(
                                              "Failed to save handling fee: " +
                                              hfErr.message,
                                            ),
                                          );
                                        });
                                      }

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

                                        db.collectionofficer.query(
                                          `SELECT rsnEnglish FROM collection_officer.returnreason WHERE id = ? LIMIT 1`,
                                          [returnReasonId],
                                          (errRsn, rsnRows) => {
                                            const reasonText = (rsnRows && rsnRows.length > 0)
                                              ? rsnRows[0].rsnEnglish
                                              : (note || 'Returned');
                                            const returnedNotifValues = invoiceResult.map((row) => [
                                              row.id,
                                              'Order Returned',
                                              `Your order #${row.invNo}, has been returned. Reason : "${reasonText}"`,
                                              0,
                                              new Date(),
                                            ]);
                                            db.collectionofficer.query(
                                              `INSERT INTO collection_officer.ordernotfication (orderId, Title, message, isRead, createdAt) VALUES ?`,
                                              [returnedNotifValues],
                                              (errON) => {
                                                if (errON) {
                                                  console.error('[submitReturn] Failed to insert ordernotfication:', errON.message);
                                                }
                                              },
                                            );

                                            // Send SMS to customer for each returned order (fire-and-forget)
                                            const SHOUTOUT_API_URL = process.env.SHOUTOUT_API_URL || "https://api.getshoutout.com/coreservice/messages";
                                            const apiKey = process.env.SHOUTOUT_API_KEY;
                                            const smsHeaders = {
                                              "Content-Type": "application/json",
                                              ...(apiKey ? { Authorization: `Apikey ${apiKey}` } : {}),
                                            };

                                            invoiceResult.forEach((row) => {
                                              try {
                                                const rawPhone = (row.phoneNumber || "").toString().trim();
                                                let digitsOnly = rawPhone.replace(/\D/g, "");
                                                if (!digitsOnly) return;

                                                const code = (row.phoneCode || "94").toString().replace(/\D/g, "") || "94";
                                                if (digitsOnly.startsWith("0")) {
                                                  digitsOnly = digitsOnly.substring(1);
                                                }
                                                if (digitsOnly.startsWith(code)) {
                                                  digitsOnly = digitsOnly.substring(code.length);
                                                }
                                                const cleanedPhoneNumber = `+${code}${digitsOnly}`;

                                                const smsMessage = `Your order ${row.invNo} has been returned by the driver.\nReason: ${reasonText}`;

                                                const body = {
                                                  source: "PolygonAgro",
                                                  transport: "sms",
                                                  transports: ["sms"],
                                                  content: {
                                                    sms: smsMessage,
                                                  },
                                                  destination: cleanedPhoneNumber,
                                                  destinations: [cleanedPhoneNumber],
                                                };

                                                axios.post(SHOUTOUT_API_URL, body, {
                                                  headers: smsHeaders,
                                                  timeout: 15000,
                                                }).then((res) => {
                                                  console.log(`[submitReturn] SMS sent for order ${row.invNo} to ${cleanedPhoneNumber}:`, res.data);
                                                }).catch((smsErr) => {
                                                  console.error(`[submitReturn] Failed to send SMS for order ${row.invNo}:`, smsErr.response?.data || smsErr.message);
                                                });
                                              } catch (smsErr) {
                                                console.error(`[submitReturn] Error preparing SMS for order ${row.invNo}:`, smsErr.message);
                                              }
                                            });
                                          },
                                        );

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
                                          deliveryChargeUpdateResults,
                                          handlingFeeInsertResults,
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
            } catch (asyncErr) {
              connection.rollback(() => {
                connection.release();
              });
              console.error(
                "[submitReturn] Error resolving city/delivery-charge:",
                asyncErr,
              );
              reject(
                new Error(
                  "Failed to resolve delivery charges: " + asyncErr.message,
                ),
              );
            }
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
        po.creditPaid,
        po.curDlvrCharge,
        
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
        o.deliveryCharge,
        o.isCoupon,
        o.couponType,
        
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
      INNER JOIN collection_officer.processorders po ON do.orderId = po.id
      
      -- Join with orders
      INNER JOIN collection_officer.orders o ON po.orderId = o.id
      
      -- Join with marketplaceusers
      INNER JOIN collection_officer.marketplaceusers u ON o.userId = u.id
      
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
      LEFT JOIN collection_officer.orderhouse oh ON o.id = oh.orderId AND o.buildingType = 'House'
      LEFT JOIN collection_officer.orderapartment oa ON o.id = oa.orderId AND o.buildingType = 'Apartment'
      
      WHERE dom.driverId = ?
        AND do.drvStatus = 'Return'
        AND (dom.isHandOver = 0 OR dom.isHandOver IS NULL)
        
      ORDER BY do.createdAt DESC, po.id DESC
    `;

    const params = [driverId];

    db.collectionofficer.query(sql, params, async (err, results) => {
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

        let cashAmountDue = null;
        const paymentMethod = (row.paymentMethod || "").toLowerCase();

        if (paymentMethod === "cash") {
          const fullTotal = Number(row.fullTotal) || 0;
          const deliveryCharge = Number(row.deliveryCharge) || 0;
          const curDlvrCharge = Number(row.curDlvrCharge) || 0;
          const creditPaid = Number(row.creditPaid) || 0;

          cashAmountDue = fullTotal - deliveryCharge + curDlvrCharge - creditPaid;
        }

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
          cashAmountDue,
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
      FROM collection_officer.processorders po
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
          UPDATE collection_officer.processorders 
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
            FROM collection_officer.processorders po
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

/**
 * Scan DCM QR and create 5-digit OTP with 2-minute expiration
 */
exports.scanDcmAndCreateReturnOtp = async ({ orderId, invoiceNumber, dcmEmpId, driverId }) => {
  return new Promise((resolve, reject) => {
    // 1. First locate the return order
    let orderSql = `
      SELECT 
        do.id as driverOrderId,
        do.drvStatus,
        po.id as processOrderId,
        po.invNo,
        po.status as processStatus
      FROM collection_officer.driverorders do
      INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
      INNER JOIN collection_officer.processorders po ON do.orderId = po.id
      WHERE dom.driverId = ?
    `;
    const orderParams = [driverId];

    if (invoiceNumber && orderId) {
      orderSql += " AND (po.invNo = ? OR po.id = ? OR do.orderId = ? OR do.id = ?)";
      orderParams.push(String(invoiceNumber), isNaN(invoiceNumber) ? -1 : parseInt(invoiceNumber, 10), orderId, orderId);
    } else if (invoiceNumber) {
      orderSql += " AND (po.invNo = ? OR po.id = ? OR do.id = ?)";
      orderParams.push(String(invoiceNumber), isNaN(invoiceNumber) ? -1 : parseInt(invoiceNumber, 10), isNaN(invoiceNumber) ? -1 : parseInt(invoiceNumber, 10));
    } else if (orderId) {
      orderSql += " AND (po.id = ? OR do.orderId = ? OR do.id = ?)";
      orderParams.push(orderId, orderId, orderId);
    }
    orderSql += " ORDER BY do.id DESC LIMIT 1";

    db.collectionofficer.query(orderSql, orderParams, (orderErr, orderResults) => {
      if (orderErr) {
        console.error("Database error fetching return order:", orderErr.message);
        return reject(new Error("Failed to find return order"));
      }

      const proceedWithOrder = (driverOrder) => {
        if (!driverOrder) {
          const err = new Error("Return order not found");
          err.statusCode = 404;
          return reject(err);
        }

        const isReturnReceived =
          driverOrder.drvStatus === "Return Received" ||
          driverOrder.processStatus === "Return Received" ||
          String(driverOrder.drvStatus || "").toLowerCase().includes("return received") ||
          String(driverOrder.processStatus || "").toLowerCase().includes("return received");

        if (isReturnReceived) {
          const err = new Error("This order has already been returned to the center and cannot proceed again!");
          err.statusCode = 400;
          err.currentStatus = "Return Received";
          return reject(err);
        }

        if (driverOrder.drvStatus !== "Return") {
          const err = new Error(`Order is not in Return status (current: ${driverOrder.drvStatus})`);
          err.statusCode = 400;
          err.currentStatus = driverOrder.drvStatus;
          return reject(err);
        }

        // 2. Find officer to issue OTP
        const findOfficer = (cb) => {
          const upperEmpId = String(dcmEmpId || "").trim().toUpperCase();
          if (upperEmpId.startsWith("DCM")) {
            const officerSql = `
              SELECT id, empId, firstNameEnglish, lastNameEnglish, status, distributedCenterId
              FROM collection_officer.collectionofficer
              WHERE (empId = ? OR empId = ?)
              LIMIT 1
            `;
            db.collectionofficer.query(officerSql, [dcmEmpId, upperEmpId], (err, res) => {
              if (!err && res.length > 0 && res[0].status === "Approved") {
                return cb(null, res[0]);
              }
              fallbackOfficer();
            });
          } else {
            fallbackOfficer();
          }

          function fallbackOfficer() {
            const driverSql = `
              SELECT d.irmId, d.distributedCenterId,
                     irm.id as irmIdVal, irm.empId as irmEmpId, irm.firstNameEnglish as irmFirstName,
                     irm.status as irmStatus
              FROM collection_officer.collectionofficer d
              LEFT JOIN collection_officer.collectionofficer irm ON d.irmId = irm.id
              WHERE d.id = ?
              LIMIT 1
            `;
            db.collectionofficer.query(driverSql, [driverId], (dErr, dRes) => {
              if (!dErr && dRes.length > 0) {
                const drv = dRes[0];
                if (drv.irmIdVal && drv.irmEmpId && (drv.irmStatus === "Approved" || drv.irmStatus === "Active")) {
                  return cb(null, {
                    id: drv.irmIdVal,
                    empId: drv.irmEmpId,
                    firstNameEnglish: drv.irmFirstName || drv.irmEmpId,
                    status: drv.irmStatus,
                  });
                }

                const dcId = drv.distributedCenterId || 66;
                const centerDcmSql = `
                  SELECT id, empId, firstNameEnglish, lastNameEnglish, status
                  FROM collection_officer.collectionofficer
                  WHERE (distributedCenterId = ? OR UPPER(empId) LIKE 'DCM%')
                    AND status = 'Approved'
                    AND UPPER(empId) LIKE 'DCM%'
                  LIMIT 1
                `;
                db.collectionofficer.query(centerDcmSql, [dcId], (cErr, cRes) => {
                  if (!cErr && cRes.length > 0) {
                    return cb(null, cRes[0]);
                  }
                  db.collectionofficer.query(
                    `SELECT id, empId, firstNameEnglish, status FROM collection_officer.collectionofficer WHERE UPPER(empId) LIKE 'DCM%' AND status = 'Approved' LIMIT 1`,
                    (aErr, aRes) => {
                      if (!aErr && aRes.length > 0) {
                        return cb(null, aRes[0]);
                      }
                      cb(new Error("No approved Distribution Centre Manager found"));
                    }
                  );
                });
              } else {
                cb(new Error("Driver record not found"));
              }
            });
          }
        };

        findOfficer((officerErr, officer) => {
          if (officerErr || !officer) {
            const err = officerErr || new Error("Distribution Centre Manager not found in the system");
            err.statusCode = 404;
            return reject(err);
          }

          const otpCode = Math.floor(10000 + Math.random() * 90000); // 5-digit OTP

          const insertSql = `
            INSERT INTO collection_officer.handoverreturnorder (drvOrderId, handOverOfficerId, otpCode, expireTime, createdAt)
            VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 2 MINUTE), NOW())
          `;

          db.collectionofficer.query(insertSql, [driverOrder.driverOrderId, officer.id, otpCode], (insertErr, insertResult) => {
            if (insertErr) {
              console.error("Database error inserting handover return OTP:", insertErr.message);
              return reject(new Error("Failed to generate OTP"));
            }

            console.log(`🔑 [Return Order OTP] Order: ${driverOrder.invNo}, drvOrderId: ${driverOrder.driverOrderId}, Officer: ${officer.empId}, OTP: ${otpCode}`);

            resolve({
              drvOrderId: driverOrder.driverOrderId,
              processOrderId: driverOrder.processOrderId,
              invoiceNumber: driverOrder.invNo,
              dcmEmpId: officer.empId,
              officerId: officer.id,
              officerName: officer.firstNameEnglish || officer.empId,
              otpId: insertResult.insertId,
              otpCode: otpCode,
              expiresInSeconds: 120,
            });
          });
        });
      };

      if (orderResults.length === 0) {
        // Fallback check across all driverorders/processorders to detect if order exists and is already Return Received
        let fallbackSql = `
          SELECT do.id as driverOrderId, do.drvStatus, po.id as processOrderId, po.invNo, po.status as processStatus
          FROM collection_officer.driverorders do
          INNER JOIN collection_officer.processorders po ON do.orderId = po.id
          WHERE 1=1
        `;
        const fallbackParams = [];
        if (invoiceNumber && orderId) {
          fallbackSql += " AND (po.invNo = ? OR po.id = ? OR do.orderId = ? OR do.id = ?)";
          fallbackParams.push(String(invoiceNumber), isNaN(invoiceNumber) ? -1 : parseInt(invoiceNumber, 10), orderId, orderId);
        } else if (invoiceNumber) {
          fallbackSql += " AND (po.invNo = ? OR po.id = ? OR do.id = ?)";
          fallbackParams.push(String(invoiceNumber), isNaN(invoiceNumber) ? -1 : parseInt(invoiceNumber, 10), isNaN(invoiceNumber) ? -1 : parseInt(invoiceNumber, 10));
        } else if (orderId) {
          fallbackSql += " AND (po.id = ? OR do.orderId = ? OR do.id = ?)";
          fallbackParams.push(orderId, orderId, orderId);
        }
        fallbackSql += " ORDER BY do.id DESC LIMIT 1";

        db.collectionofficer.query(fallbackSql, fallbackParams, (fErr, fRes) => {
          if (!fErr && fRes.length > 0) {
            return proceedWithOrder(fRes[0]);
          }

          // Also check directly in processorders if not in driverorders
          let directPoSql = `SELECT id as processOrderId, invNo, status as processStatus FROM collection_officer.processorders WHERE 1=1`;
          const directParams = [];
          if (invoiceNumber) {
            directPoSql += " AND (invNo = ? OR id = ?)";
            directParams.push(String(invoiceNumber), isNaN(invoiceNumber) ? -1 : parseInt(invoiceNumber, 10));
          } else if (orderId) {
            directPoSql += " AND id = ?";
            directParams.push(orderId);
          }
          directPoSql += " LIMIT 1";

          db.collectionofficer.query(directPoSql, directParams, (pErr, pRes) => {
            if (!pErr && pRes.length > 0) {
              const poOrder = pRes[0];
              if (poOrder.processStatus === "Return Received") {
                const err = new Error("This order has already been returned to the center and cannot proceed again!");
                err.statusCode = 400;
                err.currentStatus = "Return Received";
                return reject(err);
              }
            }
            return proceedWithOrder(null);
          });
        });
      } else {
        proceedWithOrder(orderResults[0]);
      }
    });
  });
};

/**
 * Resend OTP for Return Order
 */
exports.resendReturnOtp = async ({ drvOrderId, dcmEmpId, driverId, orderId, invoiceNumber }) => {
  return new Promise((resolve, reject) => {
    let findOrderSql = `
      SELECT 
        do.id as driverOrderId,
        do.drvStatus,
        po.invNo
      FROM collection_officer.driverorders do
      INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
      INNER JOIN collection_officer.processorders po ON do.orderId = po.id
      WHERE dom.driverId = ?
    `;
    const params = [driverId];
    if (drvOrderId) {
      findOrderSql += " AND do.id = ?";
      params.push(drvOrderId);
    } else if (invoiceNumber) {
      findOrderSql += " AND po.invNo = ?";
      params.push(invoiceNumber);
    } else if (orderId) {
      findOrderSql += " AND (po.id = ? OR do.id = ?)";
      params.push(orderId, orderId);
    }
    findOrderSql += " LIMIT 1";

    db.collectionofficer.query(findOrderSql, params, (findErr, findResults) => {
      if (findErr || findResults.length === 0) {
        const err = new Error("Return order not found");
        err.statusCode = 404;
        return reject(err);
      }

      const driverOrder = findResults[0];

      if (driverOrder.drvStatus === "Return Received") {
        const err = new Error("This order has already been marked as Return Received");
        err.statusCode = 400;
        err.currentStatus = "Return Received";
        return reject(err);
      }

      const officerSql = `
        SELECT co.id, co.empId, co.firstNameEnglish, co.status
        FROM collection_officer.collectionofficer co
        WHERE co.empId = ? OR co.empId = ?
        LIMIT 1
      `;
      const upperEmpId = String(dcmEmpId || "").trim().toUpperCase();

      db.collectionofficer.query(officerSql, [dcmEmpId, upperEmpId], (offErr, offResults) => {
        let officerId = null;
        let officerEmpId = upperEmpId;

        if (!offErr && offResults.length > 0) {
          officerId = offResults[0].id;
          officerEmpId = offResults[0].empId;
        }

        const otpCode = Math.floor(10000 + Math.random() * 90000);

        const insertSql = `
          INSERT INTO collection_officer.handoverreturnorder (drvOrderId, handOverOfficerId, otpCode, expireTime, createdAt)
          VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 2 MINUTE), NOW())
        `;

        db.collectionofficer.query(insertSql, [driverOrder.driverOrderId, officerId, otpCode], (insErr, insRes) => {
          if (insErr) {
            console.error("Database error resending OTP:", insErr.message);
            return reject(new Error("Failed to resend OTP"));
          }

          console.log(`🔄 [Resend Return OTP] Order: ${driverOrder.invNo}, drvOrderId: ${driverOrder.driverOrderId}, Officer: ${officerEmpId}, OTP: ${otpCode}`);

          resolve({
            drvOrderId: driverOrder.driverOrderId,
            invoiceNumber: driverOrder.invNo,
            dcmEmpId: officerEmpId,
            otpId: insRes.insertId,
            otpCode: otpCode,
            expiresInSeconds: 120,
          });
        });
      });
    });
  });
};

/**
 * Verify OTP and update order to 'Return Received'
 */
exports.verifyOtpReturnReceived = async ({ drvOrderId, orderId, invoiceNumber, otpCode, driverId }) => {
  return new Promise((resolve, reject) => {
    let findOrderSql = `
      SELECT 
        do.id as driverOrderId,
        do.drvStatus,
        po.id as processOrderId,
        po.invNo
      FROM collection_officer.driverorders do
      INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
      INNER JOIN collection_officer.processorders po ON do.orderId = po.id
      WHERE dom.driverId = ?
    `;
    const params = [driverId];
    if (drvOrderId) {
      findOrderSql += " AND do.id = ?";
      params.push(drvOrderId);
    } else if (invoiceNumber) {
      findOrderSql += " AND (po.invNo = ? OR po.id = ?)";
      params.push(invoiceNumber, isNaN(invoiceNumber) ? -1 : parseInt(invoiceNumber, 10));
    } else if (orderId) {
      findOrderSql += " AND (po.id = ? OR do.id = ?)";
      params.push(orderId, orderId);
    }
    findOrderSql += " LIMIT 1";

    db.collectionofficer.query(findOrderSql, params, (findErr, findResults) => {
      if (findErr) {
        console.error("Database error looking up driver order:", findErr.message);
        return reject(new Error("Failed to lookup order"));
      }

      if (findResults.length === 0) {
        const err = new Error("Return order not found for this driver");
        err.statusCode = 404;
        return reject(err);
      }

      const driverOrder = findResults[0];

      if (driverOrder.drvStatus === "Return Received") {
        const err = new Error("This order has already been marked as Return Received");
        err.statusCode = 400;
        err.currentStatus = "Return Received";
        return reject(err);
      }

      const otpSql = `
        SELECT 
          id,
          drvOrderId,
          handOverOfficerId,
          otpCode,
          expireTime,
          createdAt,
          CASE WHEN NOW() > expireTime THEN 1 ELSE 0 END as isExpired
        FROM collection_officer.handoverreturnorder
        WHERE drvOrderId = ?
        ORDER BY id DESC
        LIMIT 1
      `;

      db.collectionofficer.query(otpSql, [driverOrder.driverOrderId], (otpErr, otpResults) => {
        if (otpErr) {
          console.error("Database error looking up OTP:", otpErr.message);
          return reject(new Error("Failed to verify OTP"));
        }

        if (otpResults.length === 0) {
          const err = new Error("No OTP found. Please scan the DCM QR code again.");
          err.statusCode = 400;
          return reject(err);
        }

        const latestOtp = otpResults[0];

        if (latestOtp.isExpired === 1) {
          const err = new Error("The OTP has expired. Please request a new one.");
          err.statusCode = 400;
          err.errorType = "EXPIRED";
          return reject(err);
        }

        if (Number(otpCode) !== Number(latestOtp.otpCode)) {
          const err = new Error("The OTP is incorrect. Please check and try again.");
          err.statusCode = 400;
          err.errorType = "INCORRECT";
          return reject(err);
        }

        const updateDriverSql = `
          UPDATE collection_officer.driverorders
          SET drvStatus = 'Return Received', receivedTime = NOW()
          WHERE id = ?
        `;

        db.collectionofficer.query(updateDriverSql, [driverOrder.driverOrderId], (updateDriverErr) => {
          if (updateDriverErr) {
            console.error("Database error updating driver order to Return Received:", updateDriverErr.message);
            return reject(new Error("Failed to update return order"));
          }

          const updateProcessSql = `
            UPDATE collection_officer.processorders
            SET status = 'Return Received'
            WHERE id = ?
          `;

          db.collectionofficer.query(updateProcessSql, [driverOrder.processOrderId], (updateProcessErr) => {
            if (updateProcessErr) {
              console.error("Database error updating process order:", updateProcessErr.message);
            }

            resolve({
              success: true,
              drvOrderId: driverOrder.driverOrderId,
              processOrderId: driverOrder.processOrderId,
              invoiceNumber: driverOrder.invNo,
              message: `Order : ${driverOrder.invNo} has been successfully returned to the centre.`,
            });
          });
        });
      });
    });
  });
};
