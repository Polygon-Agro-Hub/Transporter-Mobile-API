const db = require("../startup/database");

exports.AddComplain = async (driverId, complainCategory, complain) => {
    return new Promise((resolve, reject) => {
        const getEmpIdSql = `
            SELECT empId 
            FROM collection_officer.collectionofficer 
            WHERE id = ?
            LIMIT 1
        `;

        db.collectionofficer.query(getEmpIdSql, [driverId], (err, empResults) => {
            if (err) {
                console.error("Database error fetching empId:", err.message);
                return reject(new Error("Failed to fetch officer details"));
            }

            if (empResults.length === 0) {
                return reject(new Error("Officer not found"));
            }

            const empId = empResults[0].empId;

            const today = new Date();
            const year = today.getFullYear().toString().slice(-2);
            const month = String(today.getMonth() + 1).padStart(2, "0");
            const day = String(today.getDate()).padStart(2, "0");
            const dateStr = year + month + day;

            const refPrefix = `${empId}${dateStr}`;

            const getCountSql = `
                SELECT COUNT(*) as count 
                FROM collection_officer.drivercomplains 
                WHERE refNo LIKE ? 
                AND DATE(createdAt) = CURDATE()
            `;

            db.collectionofficer.query(
                getCountSql,
                [`${refPrefix}%`],
                (err, countResults) => {
                    if (err) {
                        console.error("Database error counting complaints:", err.message);
                        return reject(new Error("Failed to generate reference number"));
                    }

                    const nextNumber = (countResults[0].count + 1)
                        .toString()
                        .padStart(3, "0");
                    const refNo = `${refPrefix}${nextNumber}`;

                    const insertSql = `
                    INSERT INTO collection_officer.drivercomplains 
                    (driverId, complainCategory, refNo, complain, status, createdAt) 
                    VALUES (?, ?, ?, ?, 'Opened', NOW())
                `;

                    db.collectionofficer.query(
                        insertSql,
                        [driverId, complainCategory, refNo, complain],
                        (err, result) => {
                            if (err) {
                                console.error(
                                    "Database error inserting complaint:",
                                    err.message,
                                );
                                return reject(new Error("Failed to insert complaint"));
                            }

                            resolve({
                                message: "Complaint submitted successfully",
                                refNo: refNo,
                                complainId: result.insertId,
                            });
                        },
                    );
                },
            );
        });
    });
};

exports.GetComplainCategories = async () => {
    return new Promise((resolve, reject) => {
        const getAppIdSql = `
            SELECT id 
            FROM agro_world_admin.systemapplications 
            WHERE appName = 'Transport'
            LIMIT 1
        `;

        db.admin.query(getAppIdSql, (err, appResults) => {
            if (err) {
                console.error("Database error fetching app:", err.message);
                return reject(new Error("Failed to fetch application"));
            }

            if (appResults.length === 0) {
                return reject(new Error("SalesDash application not found"));
            }

            const appId = appResults[0].id;

            const getCategoriesSql = `
                SELECT 
                    id,
                    appId,
                    categoryEnglish,
                    categorySinhala,
                    categoryTamil
                FROM agro_world_admin.complaincategory 
                WHERE appId = ?
                ORDER BY categoryEnglish ASC
            `;

            db.admin.query(getCategoriesSql, [appId], (err, categoryResults) => {
                if (err) {
                    console.error("Database error fetching categories:", err.message);
                    return reject(new Error("Failed to fetch categories"));
                }

                resolve(categoryResults);
            });
        });
    });
};

// Get My Complains
exports.GetMyComplains = async (driverId) => {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT 
                dc.id,
                dc.driverId,
                dc.complainCategory,
                dc.refNo,
                dc.complain,
                dc.reply,
                dc.status,
                dc.adminReplyBy,
                dc.replyTime,
                dc.createdAt,
                cc.categoryEnglish,
                cc.categorySinhala,
                cc.categoryTamil,
                co.firstNameEnglish,
                co.lastNameEnglish,
                co.firstNameSinhala,
                co.lastNameSinhala,
                co.firstNameTamil,
                co.lastNameTamil
            FROM collection_officer.drivercomplains dc
            LEFT JOIN agro_world_admin.complaincategory cc ON dc.complainCategory = cc.id
            LEFT JOIN collection_officer.collectionofficer co ON dc.driverId = co.id
            WHERE dc.driverId = ?
            ORDER BY dc.createdAt DESC
        `;

        db.collectionofficer.query(sql, [driverId], (err, results) => {
            if (err) {
                console.error("Database error fetching complaints:", err.message);
                return reject(new Error("Failed to fetch complaints"));
            }

            resolve(results);
        });
    });
};
