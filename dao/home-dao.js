const db = require("../startup/database");

// Get Amount
// exports.getAmount = async (driverId) => {
//     return new Promise((resolve, reject) => {
//         const sql = `
//             SELECT 
//                 COUNT(DISTINCT do.orderId) as totalOrders,
//                 COALESCE(SUM(CASE WHEN po.paymentMethod = 'Cash' THEN po.amount ELSE 0 END), 0) as totalCashAmount,
//                 COUNT(DISTINCT CASE WHEN do.drvStatus = 'Todo' THEN do.orderId END) as todoOrders,
//                 COUNT(DISTINCT CASE WHEN do.drvStatus = 'Completed' THEN do.orderId END) as completedOrders,
//                 COUNT(DISTINCT CASE WHEN do.drvStatus = 'On the way' THEN do.orderId END) as onTheWayOrders,
//                 COUNT(DISTINCT CASE WHEN do.drvStatus = 'Hold' THEN do.orderId END) as holdOrders,
//                 COUNT(DISTINCT CASE WHEN do.drvStatus = 'Return' THEN do.orderId END) as returnOrders,
//                 COUNT(DISTINCT CASE WHEN do.drvStatus = 'Return Received' THEN do.orderId END) as returnReceivedOrders,
//                 COUNT(DISTINCT CASE WHEN po.paymentMethod = 'Cash' THEN do.orderId END) as cashOrders
//             FROM 
//                 collection_officer.driverorders do
//             INNER JOIN 
//                 market_place.processorders po ON do.orderId = po.id
//             WHERE 
//                 do.driverId = ?
//                 AND DATE(do.createdAt) = CURDATE()
//                 AND do.isHandOver = 0
//             GROUP BY do.driverId
//         `;
//         db.collectionofficer.query(sql, [driverId], (err, results) => {
//             if (err) {
//                 console.error("Database error fetching amount:", err.message);
//                 return reject(new Error("Failed to fetch amount"));
//             }
//             resolve(results[0] || {
//                 totalOrders: 0,
//                 totalCashAmount: 0,
//                 todoOrders: 0,
//                 completedOrders: 0,
//                 onTheWayOrders: 0,
//                 holdOrders: 0,
//                 returnOrders: 0,
//                 returnReceivedOrders: 0,
//                 cashOrders: 0
//             });
//         });
//     });
// };


exports.getAmount = async (driverId) => {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT 
                COUNT(DISTINCT do.orderId) as totalOrders,
                COALESCE(SUM(CASE WHEN po.paymentMethod = 'Cash' THEN o.fullTotal ELSE 0 END), 0) as totalCashAmount,
                COUNT(DISTINCT CASE WHEN do.drvStatus = 'Todo' THEN do.orderId END) as todoOrders,
                COUNT(DISTINCT CASE WHEN do.drvStatus = 'Completed' THEN do.orderId END) as completedOrders,
                COUNT(DISTINCT CASE WHEN do.drvStatus = 'On the way' THEN do.orderId END) as onTheWayOrders,
                COUNT(DISTINCT CASE WHEN do.drvStatus = 'Hold' THEN do.orderId END) as holdOrders,
                COUNT(DISTINCT CASE WHEN do.drvStatus = 'Return' THEN do.orderId END) as returnOrders,
                COUNT(DISTINCT CASE WHEN do.drvStatus = 'Return Received' THEN do.orderId END) as returnReceivedOrders,
                COUNT(DISTINCT CASE WHEN po.paymentMethod = 'Cash' THEN do.orderId END) as cashOrders
            FROM 
                collection_officer.driverorders do
            INNER JOIN 
                market_place.processorders po ON do.orderId = po.id
            INNER JOIN 
                market_place.orders o ON po.orderId = o.id
            WHERE 
                do.driverId = ?
                AND DATE(do.createdAt) = CURDATE()
                AND do.isHandOver = 0
            GROUP BY do.driverId
        `;
        db.collectionofficer.query(sql, [driverId], (err, results) => {
            if (err) {
                console.error("Database error fetching amount:", err.message);
                return reject(new Error("Failed to fetch amount"));
            }
            resolve(results[0] || {
                totalOrders: 0,
                totalCashAmount: 0,
                todoOrders: 0,
                completedOrders: 0,
                onTheWayOrders: 0,
                holdOrders: 0,
                returnOrders: 0,
                returnReceivedOrders: 0,
                cashOrders: 0
            });
        });
    });
};



// Get Reveived Cash
exports.getReceivedCash = async (driverId) => {
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
            ORDER BY 
                do.createdAt DESC
        `;

        db.collectionofficer.query(sql, [driverId], (err, results) => {
            if (err) {
                console.error("Database error fetching amount:", err.message);
                return reject(new Error("Failed to fetch amount"));
            }

            console.log("Raw DB results:", results);

            // Format the results
            const formattedResults = results.map(item => ({
                id: String(item.driverOrderId),
                orderId: item.processOrderId,
                invoNo: item.invoNo,
                amount: parseFloat(item.amount) || 0,
                selected: false,
                createdAt: item.createdAt
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
exports.handOverCash = async (driverOrderIds, officerId, totalAmount) => {
    return new Promise((resolve, reject) => {
        const sql = `
            UPDATE collection_officer.driverorders
            SET 
                isHandOver = 1,
                handOverOfficer = ?,
                handOverTime = NOW(),
                handOverPrice = ?
            WHERE 
                id IN (?)
                AND isHandOver = 0
        `;
        db.collectionofficer.query(sql, [officerId, totalAmount, driverOrderIds], (err, results) => {
            if (err) {
                console.error("Database error updating hand over:", err.message);
                return reject(new Error("Failed to hand over cash"));
            }

            console.log("Hand over update results:", results);

            if (results.affectedRows === 0) {
                return reject(new Error("No orders were updated"));
            }

            resolve(results);
        });
    });
};