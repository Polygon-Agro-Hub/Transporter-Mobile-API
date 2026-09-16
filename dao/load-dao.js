const { collectionofficer: db } = require("../startup/database");

/**
 * Get count of active/pending loads for a heavy vehicle driver.
 * A load is considered "To Do" if unloadTime and unloadOfficerId are NULL.
 */
exports.getDriverLoadsCount = async (driverId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        COUNT(id) as totalLoads,
        SUM(CASE WHEN unloadTime IS NULL AND unloadOfficerId IS NULL THEN 1 ELSE 0 END) as todoLoads,
        SUM(CASE WHEN unloadTime IS NOT NULL THEN 1 ELSE 0 END) as completedLoads
      FROM collection_officer.transportload
      WHERE driverId = ?
    `;

    db.query(sql, [driverId], (err, results) => {
      if (err) {
        console.error("Database error fetching driver loads count:", err.message);
        return reject(new Error("Failed to fetch driver loads count"));
      }

      const row = results[0] || {};
      const todo = Number(row.todoLoads || 0);
      const total = Number(row.totalLoads || 0);
      const completed = Number(row.completedLoads || 0);
      resolve({
        totalLoads: total,
        todoLoads: todo,
        todoLoadsCount: todo,
        todoCount: todo,
        completedLoads: completed,
        deliveredLoads: completed,
      });
    });
  });
};

/**
 * Get driver loads list filtered by status ('todo', 'delivered', or 'all').
 */
exports.getDriverLoads = async (driverId, status = "all") => {
  return new Promise((resolve, reject) => {
    let sql = `
      SELECT 
        tl.id,
        tl.transferCode,
        tl.driverId,
        tl.comCenId,
        tl.disComCenId,
        tl.unloadOfficerId,
        tl.unloadTime,
        tl.recomandation,
        tl.createdAt,
        COALESCE(dc.centerName, 'Colombo Distribution Centre') as destinationCenterName,
        COALESCE(dc.city, '') as destinationCity,
        COALESCE(colc.centerName, '') as sourceCenterName,
        COUNT(DISTINCT li.id) as totalItemsCount,
        COALESCE(SUM(lc.crateCount), 0) as totalCrates,
        COALESCE(SUM(lc.qty), 0) as totalWeightKg
      FROM collection_officer.transportload tl
      LEFT JOIN collection_officer.distributedcompanycenter dcc ON tl.disComCenId = dcc.id
      LEFT JOIN collection_officer.distributedcenter dc ON dcc.centerId = dc.id
      LEFT JOIN collection_officer.companycenter cc ON tl.comCenId = cc.id
      LEFT JOIN collection_officer.collectioncenter colc ON cc.centerId = colc.id
      LEFT JOIN collection_officer.loadeditems li ON li.transportId = tl.id
      LEFT JOIN collection_officer.loadedcrates lc ON lc.loadId = li.id
      WHERE tl.driverId = ?
    `;

    const params = [driverId];

    if (status === "todo") {
      sql += " AND tl.unloadTime IS NULL AND tl.unloadOfficerId IS NULL";
    } else if (status === "delivered") {
      sql += " AND tl.unloadTime IS NOT NULL";
    }

    sql += " GROUP BY tl.id ORDER BY tl.createdAt DESC";

    db.query(sql, params, (err, results) => {
      if (err) {
        console.error("Database error fetching driver loads:", err.message);
        return reject(new Error("Failed to fetch driver loads"));
      }

      const formattedLoads = results.map((row, index) => {
        const isDelivered = row.unloadTime !== null;
        return {
          id: `#${String(index + 1).padStart(2, "0")}`,
          loadId: row.id,
          loadCode: row.transferCode,
          destination: row.destinationCenterName
            ? `${row.destinationCenterName}${row.destinationCity ? " - " + row.destinationCity : ""}`
            : "Colombo Distribution Centre",
          destinationCity: row.destinationCity,
          sourceCenter: row.sourceCenterName,
          status: isDelivered ? "delivered" : "todo",
          totalWeightKg: parseFloat(Number(row.totalWeightKg).toFixed(2)),
          totalCrates: Number(row.totalCrates || 0),
          totalItemsCount: Number(row.totalItemsCount || 0),
          unloadTime: row.unloadTime,
          createdAt: row.createdAt,
          recomandation: row.recomandation,
        };
      });

      const todoLoads = formattedLoads.filter((l) => l.status === "todo");
      const deliveredLoads = formattedLoads.filter((l) => l.status === "delivered");

      resolve({
        allLoads: formattedLoads,
        todoLoads,
        deliveredLoads,
        todoCount: todoLoads.length,
        deliveredCount: deliveredLoads.length,
      });
    });
  });
};

/**
 * Get detailed load summary by transferCode or loadId including grouped crops and crates.
 */
exports.getLoadDetails = async (transferCodeOrId, driverId = null) => {
  return new Promise((resolve, reject) => {
    let loadSql = `
      SELECT 
        tl.id,
        tl.transferCode,
        tl.driverId,
        tl.comCenId,
        tl.disComCenId,
        tl.unloadOfficerId,
        tl.unloadTime,
        tl.recomandation,
        tl.createdAt,
        COALESCE(dc.centerName, 'Colombo Distribution Centre') as destinationCenterName,
        COALESCE(dc.city, '') as destinationCity,
        dc.latitude as destinationLatitude,
        dc.longitude as destinationLongitude,
        COALESCE(colc.centerName, '') as sourceCenterName
      FROM collection_officer.transportload tl
      LEFT JOIN collection_officer.distributedcompanycenter dcc ON tl.disComCenId = dcc.id
      LEFT JOIN collection_officer.distributedcenter dc ON dcc.centerId = dc.id
      LEFT JOIN collection_officer.companycenter cc ON tl.comCenId = cc.id
      LEFT JOIN collection_officer.collectioncenter colc ON cc.centerId = colc.id
      WHERE (tl.transferCode = ? OR tl.id = ?)
    `;

    const isNumeric = !isNaN(transferCodeOrId) && !isNaN(parseInt(transferCodeOrId, 10));
    const paramId = isNumeric ? parseInt(transferCodeOrId, 10) : -1;
    const params = [String(transferCodeOrId), paramId];

    if (driverId) {
      loadSql += " AND tl.driverId = ?";
      params.push(driverId);
    }
    loadSql += " LIMIT 1";

    db.query(loadSql, params, (loadErr, loadResults) => {
      if (loadErr) {
        console.error("Database error fetching load header:", loadErr.message);
        return reject(new Error("Failed to fetch load header"));
      }

      if (loadResults.length === 0) {
        return resolve(null);
      }

      const loadHeader = loadResults[0];

      // Fetch items and crates for this load
      const itemsSql = `
        SELECT 
          li.id as loadedItemId,
          li.transportId,
          li.varietyId,
          cv.varietyNameEnglish,
          cv.varietyNameSinhala,
          cv.image as varietyImage,
          lc.id as crateId,
          lc.grade,
          lc.crateCount,
          lc.crateIndex,
          lc.qty as weightKg
        FROM collection_officer.loadeditems li
        LEFT JOIN plant_care.cropvariety cv ON li.varietyId = cv.id
        LEFT JOIN collection_officer.loadedcrates lc ON lc.loadId = li.id
        WHERE li.transportId = ?
        ORDER BY li.id ASC, lc.grade ASC, lc.crateIndex ASC
      `;

      db.query(itemsSql, [loadHeader.id], (itemsErr, itemsResults) => {
        if (itemsErr) {
          console.error("Database error fetching load items:", itemsErr.message);
          return reject(new Error("Failed to fetch load items"));
        }

        const cropMap = new Map();
        let totalLoadWeightKg = 0;
        let totalLoadCrates = 0;

        itemsResults.forEach((row) => {
          const varId = row.varietyId || row.loadedItemId;
          if (!cropMap.has(varId)) {
            cropMap.set(varId, {
              id: String(varId),
              cropName: row.varietyNameEnglish || "Crop",
              cropNameSinhala: row.varietyNameSinhala || "",
              imageUri:
                row.varietyImage ||
                "https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=150&auto=format&fit=crop&q=80",
              totalWeightKg: 0,
              totalCrates: 0,
              gradeSets: [],
            });
          }

          const crop = cropMap.get(varId);
          if (row.crateId) {
            const weight = parseFloat(Number(row.weightKg).toFixed(2)) || 0;
            const count = parseInt(row.crateCount, 10) || 0;
            crop.totalWeightKg = parseFloat((crop.totalWeightKg + weight).toFixed(2));
            crop.totalCrates += count;

            totalLoadWeightKg = parseFloat((totalLoadWeightKg + weight).toFixed(2));
            totalLoadCrates += count;

            crop.gradeSets.push({
              grade: `Grade ${row.grade || "A"}`,
              set: row.crateIndex || crop.gradeSets.length + 1,
              crates: count,
              weightKg: weight,
            });
          }
        });

        resolve({
          load: {
            id: loadHeader.id,
            transferCode: loadHeader.transferCode,
            driverId: loadHeader.driverId,
            destination: loadHeader.destinationCenterName
              ? `${loadHeader.destinationCenterName}${loadHeader.destinationCity ? " - " + loadHeader.destinationCity : ""}`
              : "Colombo Distribution Centre",
            destinationCity: loadHeader.destinationCity,
            destinationLatitude: loadHeader.destinationLatitude,
            destinationLongitude: loadHeader.destinationLongitude,
            sourceCenter: loadHeader.sourceCenterName,
            status: loadHeader.unloadTime ? "delivered" : "todo",
            unloadTime: loadHeader.unloadTime,
            createdAt: loadHeader.createdAt,
            recomandation: loadHeader.recomandation,
            totalWeightKg: totalLoadWeightKg,
            totalCrates: totalLoadCrates,
          },
          crops: Array.from(cropMap.values()),
        });
      });
    });
  });
};

/**
 * Check if a load has been unloaded/delivered (unloadOfficerId and unloadTime are present)
 */
exports.checkLoadStatus = async (transferCodeOrId) => {
  return new Promise((resolve, reject) => {
    const isNumeric = !isNaN(transferCodeOrId) && !isNaN(parseInt(transferCodeOrId, 10));
    const paramId = isNumeric ? parseInt(transferCodeOrId, 10) : -1;

    const sql = `
      SELECT id, transferCode, driverId, unloadOfficerId, unloadTime
      FROM collection_officer.transportload
      WHERE transferCode = ? OR id = ?
      LIMIT 1
    `;

    db.query(sql, [String(transferCodeOrId), paramId], (err, results) => {
      if (err) {
        console.error("Database error checking load status:", err.message);
        return reject(new Error("Failed to check load status"));
      }

      if (results.length === 0) {
        return resolve(null);
      }

      const row = results[0];
      const isDelivered = row.unloadTime !== null && row.unloadOfficerId !== null;

      resolve({
        id: row.id,
        transferCode: row.transferCode,
        driverId: row.driverId,
        unloadOfficerId: row.unloadOfficerId,
        unloadTime: row.unloadTime,
        isDelivered: !!isDelivered,
        status: isDelivered ? "delivered" : "todo",
      });
    });
  });
};

/**
 * Mark a load as unloaded/delivered and emit socket notification
 */
exports.unloadLoad = async (transferCodeOrId, unloadOfficerId = 189) => {
  return new Promise((resolve, reject) => {
    const isNumeric = !isNaN(transferCodeOrId) && !isNaN(parseInt(transferCodeOrId, 10));
    const paramId = isNumeric ? parseInt(transferCodeOrId, 10) : -1;

    const sql = `
      UPDATE collection_officer.transportload
      SET unloadOfficerId = ?, unloadTime = CURRENT_TIMESTAMP
      WHERE transferCode = ? OR id = ?
    `;

    db.query(sql, [unloadOfficerId, String(transferCodeOrId), paramId], (err, result) => {
      if (err) {
        console.error("Database error updating load unload status:", err.message);
        return reject(new Error("Failed to unload load"));
      }

      // Fetch the updated record
      const selectSql = `
        SELECT id, transferCode, driverId, unloadOfficerId, unloadTime
        FROM collection_officer.transportload
        WHERE transferCode = ? OR id = ?
        LIMIT 1
      `;

      db.query(selectSql, [String(transferCodeOrId), paramId], (fetchErr, fetchResults) => {
        if (!fetchErr && fetchResults && fetchResults.length > 0) {
          const row = fetchResults[0];
          try {
            const socketModule = require("../socket/socket");
            socketModule.emitLoadDelivered(row.transferCode, {
              id: row.id,
              transferCode: row.transferCode,
              driverId: row.driverId,
              unloadOfficerId: row.unloadOfficerId,
              unloadTime: row.unloadTime,
            });
          } catch (socketErr) {
            console.warn("Could not emit socket load_delivered:", socketErr.message);
          }
          return resolve(row);
        }
        resolve(result);
      });
    });
  });
};
