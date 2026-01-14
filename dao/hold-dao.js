const db = require("../startup/database");

exports.getReason = async () => {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT 
                id,
                indexNo,
                rsnEnglish,
                rsnSinhala,
                rsnTamil,
                createdAt
            FROM holdreason
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




// exports.submitHold = async ({ orderIds, holdReasonId, note, userId }) => {
//     return new Promise((resolve, reject) => {
//         // Get a connection from the pool
//         db.collectionofficer.getConnection((err, connection) => {
//             if (err) {
//                 console.error("Error getting connection:", err);
//                 return reject(new Error("Database connection failed: " + err.message));
//             }

//             // Begin transaction
//             connection.beginTransaction((err) => {
//                 if (err) {
//                     connection.release();
//                     return reject(new Error("Transaction start failed: " + err.message));
//                 }

//                 const getInvoiceNumbersQuery = `
//                     SELECT id, invNo 
//                     FROM market_place.processorders 
//                     WHERE id IN (?)
//                 `;

//                 connection.query(
//                     getInvoiceNumbersQuery,
//                     [orderIds],
//                     (error, invoiceResult) => {
//                         if (error) {
//                             connection.release();
//                             return reject(
//                                 new Error("Failed to fetch invoice numbers: " + error.message)
//                             );
//                         }

//                         if (invoiceResult.length === 0) {
//                             connection.release();
//                             return reject(new Error("No orders found with the provided IDs"));
//                         }

//                         const invoiceNumbers = invoiceResult
//                             .map((row) => row.invNo)
//                             .filter(Boolean);
//                         const orderDetails = invoiceResult.map((row) => ({
//                             id: row.id,
//                             invNo: row.invNo,
//                         }));

//                         // Step 1: Update processorders table status to "Hold"
//                         const updateProcessOrdersQuery = `
//           UPDATE market_place.processorders 
//           SET status = 'Hold' 
//           WHERE id IN (?)
//         `;

//                         connection.query(updateProcessOrdersQuery, [orderIds], (error, processOrdersResult) => {
//                             if (error) {
//                                 return connection.rollback(() => {
//                                     connection.release();
//                                     reject(new Error("Failed to update process orders: " + error.message));
//                                 });
//                             }

//                             // Check if any orders were updated
//                             if (processOrdersResult.affectedRows === 0) {
//                                 return connection.rollback(() => {
//                                     connection.release();
//                                     reject(new Error("No orders found with the provided IDs"));
//                                 });
//                             }

//                             // Step 2: Get driver order IDs from driverorders table
//                             const getDriverOrdersQuery = `
//             SELECT id 
//             FROM collection_officer.driverorders 
//             WHERE orderId IN (?)
//           `;

//                             connection.query(getDriverOrdersQuery, [orderIds], (error, driverOrdersResult) => {
//                                 if (error) {
//                                     return connection.rollback(() => {
//                                         connection.release();
//                                         reject(new Error("Failed to fetch driver orders: " + error.message));
//                                     });
//                                 }

//                                 if (driverOrdersResult.length === 0) {
//                                     return connection.rollback(() => {
//                                         connection.release();
//                                         reject(new Error("No driver orders found for the provided order IDs"));
//                                     });
//                                 }

//                                 const driverOrderIds = driverOrdersResult.map(row => row.id);

//                                 // Step 2.5: Check if any driverOrderIds already exist in driverholdorders
//                                 const checkExistingHoldQuery = `
//               SELECT drvOrderId 
//               FROM collection_officer.driverholdorders 
//               WHERE drvOrderId IN (?)
//             `;

//                                 connection.query(checkExistingHoldQuery, [driverOrderIds], (error, existingHolds) => {
//                                     if (error) {
//                                         return connection.rollback(() => {
//                                             connection.release();
//                                             reject(new Error("Failed to check existing hold orders: " + error.message));
//                                         });
//                                     }

//                                     // If any orders already have a hold, rollback
//                                     if (existingHolds.length > 0) {
//                                         return connection.rollback(() => {
//                                             connection.release();
//                                             reject(new Error("This order is already on hold"));
//                                         });
//                                     }

//                                     // Step 3: Update driverorders table drvStatus to "Hold"
//                                     const updateDriverOrdersQuery = `
//                 UPDATE collection_officer.driverorders 
//                 SET drvStatus = 'Hold' 
//                 WHERE id IN (?)
//               `;

//                                     connection.query(updateDriverOrdersQuery, [driverOrderIds], (error, updateDriverResult) => {
//                                         if (error) {
//                                             return connection.rollback(() => {
//                                                 connection.release();
//                                                 reject(new Error("Failed to update driver orders status: " + error.message));
//                                             });
//                                         }

//                                         // Step 4: Insert into driverholdorders table
//                                         const insertHoldOrdersQuery = `
//                   INSERT INTO collection_officer.driverholdorders (drvOrderId, holdReasonId) 
//                   VALUES ?
//                 `;

//                                         const holdOrdersData = driverOrderIds.map(drvOrderId => [
//                                             drvOrderId,
//                                             holdReasonId
//                                         ]);

//                                         connection.query(insertHoldOrdersQuery, [holdOrdersData], (error, insertResult) => {
//                                             if (error) {
//                                                 return connection.rollback(() => {
//                                                     connection.release();
//                                                     reject(new Error("Failed to insert hold orders: " + error.message));
//                                                 });
//                                             }

//                                             // Commit transaction
//                                             connection.commit((err) => {
//                                                 if (err) {
//                                                     return connection.rollback(() => {
//                                                         connection.release();
//                                                         reject(new Error("Transaction commit failed: " + err.message));
//                                                     });
//                                                 }

//                                                 // Release connection back to pool
//                                                 connection.release();

//                                                 resolve({
//                                                     processOrdersUpdated: processOrdersResult.affectedRows,
//                                                     driverOrdersUpdated: updateDriverResult.affectedRows,
//                                                     holdOrdersInserted: insertResult.affectedRows,
//                                                     driverOrderIds: driverOrderIds,
//                                                     invoiceNumbers: invoiceNumbers,
//                                                     orderDetails: orderDetails,
//                                                 });
//                                             });
//                                         });
//                                     });
//                                 });
//                             });
//                         });
//                     }
//                 );
//             });
//         });
//     });
// };


exports.submitHold = async ({ orderIds, holdReasonId, note, userId }) => {
    return new Promise((resolve, reject) => {
        // Get a connection from the pool
        db.collectionofficer.getConnection((err, connection) => {
            if (err) {
                console.error("Error getting connection:", err);
                return reject(new Error("Database connection failed: " + err.message));
            }

            // Begin transaction
            connection.beginTransaction((err) => {
                if (err) {
                    connection.release();
                    return reject(new Error("Transaction start failed: " + err.message));
                }

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

                        // Step 1: Update processorders table status to "Hold"
                        const updateProcessOrdersQuery = `
                            UPDATE market_place.processorders 
                            SET status = 'Hold' 
                            WHERE id IN (?)
                        `;

                        connection.query(updateProcessOrdersQuery, [orderIds], (error, processOrdersResult) => {
                            if (error) {
                                return connection.rollback(() => {
                                    connection.release();
                                    reject(new Error("Failed to update process orders: " + error.message));
                                });
                            }

                            // Check if any orders were updated
                            if (processOrdersResult.affectedRows === 0) {
                                return connection.rollback(() => {
                                    connection.release();
                                    reject(new Error("No orders found with the provided IDs"));
                                });
                            }

                            // Step 2: Get driver order IDs from driverorders table
                            const getDriverOrdersQuery = `
                                SELECT id 
                                FROM collection_officer.driverorders 
                                WHERE orderId IN (?)
                            `;

                            connection.query(getDriverOrdersQuery, [orderIds], (error, driverOrdersResult) => {
                                if (error) {
                                    return connection.rollback(() => {
                                        connection.release();
                                        reject(new Error("Failed to fetch driver orders: " + error.message));
                                    });
                                }

                                if (driverOrdersResult.length === 0) {
                                    return connection.rollback(() => {
                                        connection.release();
                                        reject(new Error("No driver orders found for the provided order IDs"));
                                    });
                                }

                                const driverOrderIds = driverOrdersResult.map(row => row.id);

                                // Step 3: Update driverorders table drvStatus to "Hold"
                                const updateDriverOrdersQuery = `
                                    UPDATE collection_officer.driverorders 
                                    SET drvStatus = 'Hold' 
                                    WHERE id IN (?)
                                `;

                                connection.query(updateDriverOrdersQuery, [driverOrderIds], (error, updateDriverResult) => {
                                    if (error) {
                                        return connection.rollback(() => {
                                            connection.release();
                                            reject(new Error("Failed to update driver orders status: " + error.message));
                                        });
                                    }

                                    // Step 4: Insert into driverholdorders table (allows multiple holds)
                                    const insertHoldOrdersQuery = `
                                        INSERT INTO collection_officer.driverholdorders (drvOrderId, holdReasonId) 
                                        VALUES ?
                                    `;

                                    const holdOrdersData = driverOrderIds.map(drvOrderId => [
                                        drvOrderId,
                                        holdReasonId
                                    ]);

                                    connection.query(insertHoldOrdersQuery, [holdOrdersData], (error, insertResult) => {
                                        if (error) {
                                            return connection.rollback(() => {
                                                connection.release();
                                                reject(new Error("Failed to insert hold orders: " + error.message));
                                            });
                                        }

                                        // Commit transaction
                                        connection.commit((err) => {
                                            if (err) {
                                                return connection.rollback(() => {
                                                    connection.release();
                                                    reject(new Error("Transaction commit failed: " + err.message));
                                                });
                                            }

                                            // Release connection back to pool
                                            connection.release();

                                            resolve({
                                                processOrdersUpdated: processOrdersResult.affectedRows,
                                                driverOrdersUpdated: updateDriverResult.affectedRows,
                                                holdOrdersInserted: insertResult.affectedRows,
                                                driverOrderIds: driverOrderIds,
                                                invoiceNumbers: invoiceNumbers,
                                                orderDetails: orderDetails,
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    }
                );
            });
        });
    });
};
