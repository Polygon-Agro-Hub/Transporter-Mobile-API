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

// Check if driver order already exists for this driver
exports.CheckDriverOrderExists = async (driverId, orderId) => {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT id 
            FROM collection_officer.driverorders 
            WHERE driverId = ? AND orderId = ? 
            LIMIT 1
        `;

        db.collectionofficer.query(sql, [driverId, orderId], (err, results) => {
            if (err) {
                console.error("Database error checking driver order:", err.message);
                return reject(new Error("Failed to check driver order"));
            }

            resolve(results.length > 0);
        });
    });
};

// Save driver order
exports.SaveDriverOrder = async (driverId, orderId, handOverTime) => {
    return new Promise((resolve, reject) => {
        const sql = `
            INSERT INTO collection_officer.driverorders 
            (driverId, orderId, handOverTime, drvStatus, isHandOver, createdAt) 
            VALUES (?, ?, ?, 'Todo', 0, NOW())
        `;

        db.collectionofficer.query(sql, [driverId, orderId, handOverTime], (err, result) => {
            if (err) {
                console.error("Database error saving driver order:", err.message);
                return reject(new Error("Failed to save driver order"));
            }

            resolve({
                message: "Driver order saved successfully",
                driverOrderId: result.insertId,
                handOverTime: handOverTime
            });
        });
    });
};

// Get driver's distributed center
exports.GetDriverDistributedCenter = async (driverId) => {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT distributedCenterId 
            FROM collection_officer.collectionofficer 
            WHERE id = ? 
            LIMIT 1
        `;

        db.collectionofficer.query(sql, [driverId], (err, results) => {
            if (err) {
                console.error("Database error fetching driver's distributed center:", err.message);
                return reject(new Error("Failed to fetch driver details"));
            }

            if (results.length === 0) {
                return reject(new Error("Driver not found"));
            }

            resolve(results[0].distributedCenterId);
        });
    });
};

// Check if order is already assigned to another driver with their empId
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
                        message: "This order is already in your target list."
                    });
                } else {
                    // Assigned to different driver
                    resolve({
                        isAssigned: true,
                        assignedToSameDriver: false,
                        assignedDriverEmpId: assignment.assignedDriverEmpId,
                        assignedDriverName: assignment.assignedDriverName,
                        message: `This order has already been assigned to another driver (Driver ID: ${assignment.assignedDriverEmpId}).`
                    });
                }
            } else {
                resolve({ 
                    isAssigned: false,
                    assignedToSameDriver: false
                });
            }
        });
    });
};

// Get driver's empId for response
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