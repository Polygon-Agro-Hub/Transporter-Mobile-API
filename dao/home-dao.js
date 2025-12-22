// const db = require("../startup/database");

// // Get Amount
// exports.getAmount = async (driverId) => {
//     return new Promise((resolve, reject) => {
//         const sql = `
//             SELECT 
//                 COUNT(DISTINCT do.orderId) as totalOrders,
//                 COALESCE(
//                     (SELECT SUM(po2.amount) 
//                      FROM market_place.processorders po2 
//                      INNER JOIN collection_officer.driverorders do2 ON po2.orderId = do2.orderId
//                      WHERE do2.driverId = ? 
//                      AND DATE(do2.createdAt) = CURDATE() 
//                      AND do2.isHandOver = 0
//                      AND po2.paymentMethod = 'Cash'), 0
//                 ) as totalCashAmount,
//                 COUNT(DISTINCT CASE WHEN do.drvStatus = 'Todo' THEN do.orderId END) as todoOrders,
//                 COUNT(DISTINCT CASE WHEN do.drvStatus = 'Completed' THEN do.orderId END) as completedOrders,
//                 COUNT(DISTINCT CASE WHEN do.drvStatus = 'On the way' THEN do.orderId END) as onTheWayOrders,
//                 COUNT(DISTINCT CASE WHEN do.drvStatus = 'Hold' THEN do.orderId END) as holdOrders,
//                 COUNT(DISTINCT CASE WHEN do.drvStatus = 'Return' THEN do.orderId END) as returnOrders,
//                 COUNT(DISTINCT CASE WHEN do.drvStatus = 'Return Received' THEN do.orderId END) as returnReceivedOrders,
//                 COUNT(DISTINCT CASE WHEN po.paymentMethod = 'Cash' THEN do.orderId END) as cashOrders
//             FROM 
//                 collection_officer.driverorders do
//             LEFT JOIN 
//                 market_place.processorders po ON do.orderId = po.orderId
//             WHERE 
//                 do.driverId = ?
//                 AND DATE(do.createdAt) = CURDATE()
//                 AND do.isHandOver = 0
//         `;
//         db.collectionofficer.query(sql, [driverId, driverId], (err, results) => {
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

const db = require("../startup/database");

// Get Amount
exports.getAmount = async (driverId) => {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT 
                COUNT(DISTINCT do.orderId) as totalOrders,
                COALESCE(SUM(CASE WHEN po.paymentMethod = 'Cash' THEN po.amount ELSE 0 END), 0) as totalCashAmount,
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