const db = require("../startup/database");

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

        // Step 1: First, get invoice numbers
        const getInvoiceNumbersQuery = `
          SELECT id, invNo 
          FROM market_place.processorders 
          WHERE id IN (?)
        `;

        connection.query(
          getInvoiceNumbersQuery,
          [orderIds],
          (error, invoiceResult) => {
            if (error) {
              connection.release();
              return reject(
                new Error("Failed to fetch invoice numbers: " + error.message)
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

            // Step 2: Update processorders
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
                        "Failed to update process orders: " + error.message
                      )
                    );
                  });
                }

                if (processOrdersResult.affectedRows === 0) {
                  return connection.rollback(() => {
                    connection.release();
                    reject(new Error("No orders updated in processorders"));
                  });
                }

                // Step 3: Get driver order
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
                            "Failed to fetch driver orders: " + error.message
                          )
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
                      (row) => row.id
                    );

                    // Step 3.5: Check if any drvOrderId already exists in driverreturnorders
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
                                  error.message
                              )
                            );
                          });
                        }

                        if (existingReturnsResult.length > 0) {
                          return connection.rollback(() => {
                            connection.release();
                            reject(
                              new Error("Order has already been returned.")
                            );
                          });
                        }

                        // Step 4: Update driver orders
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
                                      error.message
                                  )
                                );
                              });
                            }

                            // Step 5: Insert into driverreturnorders table
                            const insertReturnOrdersQuery = `
                              INSERT INTO collection_officer.driverreturnorders 
                              (drvOrderId, returnReasonId, note)
                              VALUES ?
                            `;

                            const returnOrdersData = driverOrderIds.map(
                              (drvOrderId) => [drvOrderId, returnReasonId, note]
                            );

                            connection.query(
                              insertReturnOrdersQuery,
                              [returnOrdersData],
                              (error, insertResult) => {
                                if (error) {
                                  return connection.rollback(() => {
                                    connection.release();
                                    reject(
                                      new Error(
                                        "Failed to insert return orders: " +
                                          error.message
                                      )
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
                                            err.message
                                        )
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
                                  });
                                });
                              }
                            );
                          }
                        );
                      }
                    );
                  }
                );
              }
            );
          }
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
        do.isHandOver,
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
      
      WHERE do.driverId = ?
        AND do.drvStatus = 'Return'
        AND (do.isHandOver = 0 OR do.isHandOver IS NULL)
        
      ORDER BY do.createdAt DESC, po.id DESC
    `;

    const params = [driverId];

    console.log("Fetching return orders for driver ID:", driverId);

    db.collectionofficer.query(sql, params, (err, results) => {
      if (err) {
        console.error(
          "Database error fetching driver return orders:",
          err.message
        );
        console.error("SQL:", sql);
        console.error("Params:", params);
        return reject(new Error("Failed to fetch driver return orders"));
      }

      console.log(
        `Found ${results.length} return orders for driver ${driverId}`
      );

      // Use a Map to store unique driver orders (based on driverOrderId)
      const uniqueOrdersMap = new Map();

      results.forEach((row) => {
        // If we haven't seen this driverOrderId yet, add it to the map
        if (!uniqueOrdersMap.has(row.driverOrderId)) {
          uniqueOrdersMap.set(row.driverOrderId, row);
        }
      });

      // Convert map values to array
      const uniqueResults = Array.from(uniqueOrdersMap.values());

      console.log(
        `After deduplication: ${uniqueResults.length} unique return orders`
      );

      if (uniqueResults.length > 0) {
        console.log("Sample unique return order data:", {
          driverOrderId: uniqueResults[0].driverOrderId,
          drvStatus: uniqueResults[0].drvStatus,
          isHandOver: uniqueResults[0].isHandOver,
          processOrderId: uniqueResults[0].processOrderId,
          invNo: uniqueResults[0].invNo,
          returnReasonEnglish: uniqueResults[0].returnReasonEnglish,
          returnNote: uniqueResults[0].returnNote,
        });
      }

      // Format the results
      const formattedResults = uniqueResults.map((row) => {
        // Format address based on building type
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

        // Get customer full name (prefer order.fullName, fallback to user details)
        const customerName =
          row.fullName ||
          `${row.firstName || ""} ${row.lastName || ""}`.trim() ||
          "Customer";

        // Get title (prefer order.title, fallback to user.title)
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

        console.log(`Formatted order ${row.driverOrderId}:`, {
          drvStatus: formattedOrder.drvStatus,
          isHandOver: formattedOrder.isHandOver,
          invoiceNumber: formattedOrder.invoiceNumber,
          returnReason: formattedOrder.returnDetails.reason,
        });

        return formattedOrder;
      });

      resolve(formattedResults);
    });
  });
};

// Update Return Order to Return Received
exports.updateReturnReceived = async ({ invoiceNumbers, driverId }) => {
  return new Promise((resolve, reject) => {
    console.log(
      `Updating return orders for driver ${driverId}, invoices:`,
      invoiceNumbers
    );

    // Step 1: Get process order IDs and validate driver ownership
    const getOrdersSql = `
      SELECT 
        po.id as processOrderId,
        po.invNo,
        po.status as processStatus,
        do.id as driverOrderId,
        do.driverId,
        do.drvStatus,
        do.isHandOver
      FROM market_place.processorders po
      INNER JOIN collection_officer.driverorders do ON po.id = do.orderId
      WHERE po.invNo IN (?)
        AND do.driverId = ?
        AND do.drvStatus = 'Return'
        AND (do.isHandOver = 0 OR do.isHandOver IS NULL)
    `;

    console.log("SQL Query:", getOrdersSql);
    console.log("Query Params:", [invoiceNumbers, driverId]);

    db.collectionofficer.query(
      getOrdersSql,
      [invoiceNumbers, driverId],
      (err, orderResults) => {
        if (err) {
          console.error("Error fetching orders:", err);
          return reject(new Error("Failed to fetch orders"));
        }

        console.log("Query Results:", orderResults);
        console.log(`Found ${orderResults.length} return orders to update`);

        if (orderResults.length === 0) {
          return reject(
            new Error(
              "No return orders found with the provided invoice numbers for this driver"
            )
          );
        }

        // Extract IDs
        const processOrderIds = orderResults.map((row) => row.processOrderId);
        const driverOrderIds = orderResults.map((row) => row.driverOrderId);
        const foundInvoiceNumbers = orderResults.map((row) => row.invNo);

        console.log("Process Order IDs to update:", processOrderIds);
        console.log("Driver Order IDs to update:", driverOrderIds);
        console.log("Found Invoice Numbers:", foundInvoiceNumbers);

        // Step 2: Update driverorders table - set drvStatus to 'Return Received'
        const updateDriverOrdersSql = `
          UPDATE collection_officer.driverorders 
          SET 
            drvStatus = 'Return Received',
            receivedTime = NOW()
          WHERE id IN (?)
            AND driverId = ?
            AND drvStatus = 'Return'
        `;

        console.log("Update Driver SQL:", updateDriverOrdersSql);
        console.log("Update Driver Params:", [driverOrderIds, driverId]);

        db.collectionofficer.query(
          updateDriverOrdersSql,
          [driverOrderIds, driverId],
          (err, driverResult) => {
            if (err) {
              console.error("Error updating driverorders:", err);
              return reject(new Error("Failed to update driver orders"));
            }

            console.log(
              `Updated ${driverResult.affectedRows} driver orders to 'Return Received'`
            );

            // Step 3: Update processorders table - set status to 'Return Received'
            const updateProcessOrdersSql = `
          UPDATE market_place.processorders 
          SET status = 'Return Received'
          WHERE id IN (?)
        `;

            console.log("Update Process SQL:", updateProcessOrdersSql);
            console.log("Update Process Params:", [processOrderIds]);

            db.collectionofficer.query(
              updateProcessOrdersSql,
              [processOrderIds],
              (err, processResult) => {
                if (err) {
                  console.error("Error updating processorders:", err);
                  return reject(new Error("Failed to update process orders"));
                }

                console.log(
                  `Updated ${processResult.affectedRows} process orders to 'Return Received'`
                );

                // Step 4: Get updated order details for response
                const getUpdatedOrdersSql = `
            SELECT 
              po.id as processOrderId,
              po.invNo,
              po.status as processStatus,
              do.id as driverOrderId,
              do.drvStatus,
              do.isHandOver
            FROM market_place.processorders po
            INNER JOIN collection_officer.driverorders do ON po.id = do.orderId
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
                        new Error("Failed to fetch updated orders")
                      );
                    }

                    console.log("Updated Results:", updatedResults);

                    resolve({
                      success: true,
                      driverOrdersUpdated: driverResult.affectedRows,
                      processOrdersUpdated: processResult.affectedRows,
                      updatedOrders: updatedResults,
                      invoiceNumbers: foundInvoiceNumbers,
                      timestamp: new Date().toISOString(),
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
