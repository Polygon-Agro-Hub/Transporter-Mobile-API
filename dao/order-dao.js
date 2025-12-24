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

// Save driver order and update processorders status
exports.SaveDriverOrder = async (driverId, processOrderId, handOverTime) => {
  return new Promise(async (resolve, reject) => {
    try {
      // STEP 1: Insert using processorders.id (FK correct)
      const insertSql = `
        INSERT INTO collection_officer.driverorders
        (driverId, orderId, handOverTime, drvStatus, isHandOver, createdAt)
        VALUES (?, ?, ?, 'Todo', 0, NOW())
      `;

      const insertResult = await new Promise((res, rej) => {
        db.collectionofficer.query(
          insertSql,
          [driverId, processOrderId, handOverTime],
          (err, result) => {
            if (err) return rej(err);
            res(result);
          }
        );
      });

      // STEP 2: Update processorders
      const updateSql = `
        UPDATE market_place.processorders
        SET status = 'Collected',
            isTargetAssigned = 1
        WHERE id = ?
      `;

      await new Promise((res, rej) => {
        db.marketPlace.query(updateSql, [processOrderId], (err, result) => {
          if (err) return rej(err);
          res(result);
        });
      });

      resolve({
        message: "Order assigned successfully",
        driverOrderId: insertResult.insertId,
        processOrderId,
        status: "Collected",
      });
    } catch (error) {
      reject(error);
    }
  });
};

// Check If Order Is Already Assigned
exports.CheckOrderAlreadyAssigned = async (processOrderId, driverId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
          do.id as driverOrderId,
          do.driverId as assignedDriverId,
          co.empId as assignedDriverEmpId,
          CONCAT(co.firstNameEnglish, ' ', co.lastNameEnglish) as assignedDriverName
      FROM collection_officer.driverorders do
      INNER JOIN collection_officer.collectionofficer co ON do.driverId = co.id
      WHERE do.orderId = ?  -- direct FK match
      LIMIT 1
    `;

    db.collectionofficer.query(sql, [processOrderId], (err, results) => {
      if (err) {
        console.error("Database error checking order assignment:", err.message);
        return reject(new Error("Failed to check order assignment"));
      }

      if (results.length > 0) {
        const assignment = results[0];

        if (assignment.assignedDriverId == driverId) {
          resolve({
            isAssigned: true,
            assignedToSameDriver: true,
            message: "This order is already in your target list.",
          });
        } else {
          resolve({
            isAssigned: true,
            assignedToSameDriver: false,
            assignedDriverEmpId: assignment.assignedDriverEmpId,
            assignedDriverName: assignment.assignedDriverName,
            message: `This order has already been assigned to another driver (Driver ID: ${assignment.assignedDriverEmpId}).`,
          });
        }
      } else {
        resolve({
          isAssigned: false,
          assignedToSameDriver: false,
        });
      }
    });
  });
};

// Get Driver's EmpId
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

// Get Driver's Order DAO
exports.getDriverOrdersDAO = async (driverId, statuses, isHandOver = 0) => {
  return new Promise((resolve, reject) => {
    let sql = `
      SELECT 
        do.id as driverOrderId,
        do.drvStatus,
        do.isHandOver,
        do.createdAt as driverOrderCreatedAt,
        po.id as processOrderId,
        po.status as processStatus,
        o.id as orderId,
        o.userId,
        o.sheduleTime,
        o.buildingType,
        o.fullName,
        o.phone1,
        o.phonecode1,
        o.phone2,
        o.phonecode2,
        -- House address details
        oh.houseNo as house_houseNo,
        oh.streetName as house_streetName,
        oh.city as house_city,
        -- Apartment address details  
        oa.buildingNo as apartment_buildingNo,
        oa.buildingName as apartment_buildingName,
        oa.unitNo as apartment_unitNo,
        oa.floorNo as apartment_floorNo,
        oa.houseNo as apartment_houseNo,
        oa.streetName as apartment_streetName,
        oa.city as apartment_city,
        u.title as userTitle,
        u.firstName,
        u.lastName,
        u.phoneCode,
        u.phoneNumber,
        u.image
      FROM collection_officer.driverorders do
      INNER JOIN market_place.processorders po ON do.orderId = po.id
      INNER JOIN market_place.orders o ON po.orderId = o.id
      INNER JOIN market_place.marketplaceusers u ON o.userId = u.id
      LEFT JOIN market_place.orderhouse oh ON o.id = oh.orderId AND o.buildingType = 'House'
      LEFT JOIN market_place.orderapartment oa ON o.id = oa.orderId AND o.buildingType = 'Apartment'
      WHERE do.driverId = ?
        AND do.isHandOver = ?
    `;

    const params = [driverId, isHandOver];

    if (statuses && statuses.length > 0) {
      const validStatuses = statuses.filter((s) =>
        ["Todo", "Completed", "Hold", "Return", "On the way"].includes(s)
      );
      if (validStatuses.length > 0) {
        sql += ` AND do.drvStatus IN (?)`;
        params.push(validStatuses);
      }
    }

    sql += ` ORDER BY o.userId, o.sheduleTime ASC, do.createdAt ASC`;

    db.collectionofficer.query(sql, params, (err, results) => {
      if (err) {
        console.error("Database error fetching driver orders:", err.message);
        console.error("SQL:", sql);
        return reject(new Error("Failed to fetch driver orders"));
      }

      // Group orders by user and address
      const groupedOrders = results.reduce((groups, order) => {
        const userId = order.userId;
        const buildingType = order.buildingType;

        // Create address key based on building type
        let addressKey = `${userId}_`;

        if (buildingType === "House") {
          addressKey += `HOUSE_${order.house_houseNo || ""}_${
            order.house_streetName || ""
          }_${order.house_city || ""}`;
        } else if (buildingType === "Apartment") {
          addressKey += `APARTMENT_${order.apartment_buildingNo || ""}_${
            order.apartment_buildingName || ""
          }_${order.apartment_unitNo || ""}_${order.apartment_floorNo || ""}_${
            order.apartment_streetName || ""
          }_${order.apartment_city || ""}`;
        } else {
          addressKey += `OTHER_${order.orderId}`; // No address or other type
        }

        // Clean the address key (remove undefined/null, trim)
        addressKey = addressKey
          .replace(/undefined/g, "")
          .replace(/null/g, "")
          .replace(/_+/g, "_")
          .replace(/_$/, "");

        // Initialize group if doesn't exist
        if (!groups[addressKey]) {
          groups[addressKey] = {
            driverOrderId: order.driverOrderId,
            allDriverOrderIds: [],
            allProcessOrderIds: [],
            allOrderIds: [],
            allScheduleTimes: [],
            drvStatus: order.drvStatus,
            isHandOver: order.isHandOver,
            userId: order.userId,
            userTitle: order.userTitle,
            firstName: order.firstName,
            lastName: order.lastName,
            phoneCode: order.phoneCode,
            phoneNumber: order.phoneNumber,
            image: order.image,
            buildingType: order.buildingType,
            fullName: order.fullName,
            phone1: order.phone1,
            phonecode1: order.phonecode1,
            phone2: order.phone2,
            phonecode2: order.phonecode2,
            // Address details
            addressDetails:
              buildingType === "House"
                ? {
                    houseNo: order.house_houseNo,
                    streetName: order.house_streetName,
                    city: order.house_city,
                  }
                : buildingType === "Apartment"
                ? {
                    buildingNo: order.apartment_buildingNo,
                    buildingName: order.apartment_buildingName,
                    unitNo: order.apartment_unitNo,
                    floorNo: order.apartment_floorNo,
                    houseNo: order.apartment_houseNo,
                    streetName: order.apartment_streetName,
                    city: order.apartment_city,
                  }
                : null,
          };
        }

        // Add this order to the group
        const group = groups[addressKey];
        group.allDriverOrderIds.push(order.driverOrderId);
        group.allProcessOrderIds.push(order.processOrderId);
        group.allOrderIds.push(order.orderId);

        if (order.sheduleTime) {
          group.allScheduleTimes.push(order.sheduleTime);
        }

        // Update status to most critical (non-completed takes priority)
        const statusPriority = {
          Return: 1,
          Hold: 2,
          "On the way": 3,
          Todo: 4,
          Completed: 5,
        };

        const currentPriority = statusPriority[group.drvStatus] || 5;
        const newPriority = statusPriority[order.drvStatus] || 5;

        if (newPriority < currentPriority) {
          group.drvStatus = order.drvStatus;
        }

        // Update isHandOver (if any is handover, mark as handover)
        if (order.isHandOver === 1) {
          group.isHandOver = 1;
        }

        return groups;
      }, {});

      // Convert grouped object to array and format
      const groupedArray = Object.values(groupedOrders);

      const formattedResults = groupedArray.map((group, index) => {
        // Sort all IDs
        group.allDriverOrderIds.sort((a, b) => a - b);
        group.allProcessOrderIds.sort((a, b) => a - b);
        group.allOrderIds.sort((a, b) => a - b);

        // Get unique sorted schedule times
        const uniqueScheduleTimes = [...new Set(group.allScheduleTimes)].sort();
        const primaryScheduleTime =
          uniqueScheduleTimes.length > 0
            ? uniqueScheduleTimes[0]
            : "Not Scheduled";

        // Format address for display
        let formattedAddress = "No Address";
        if (group.buildingType === "House" && group.addressDetails) {
          const addr = group.addressDetails;
          formattedAddress = `${addr.houseNo || ""}, ${
            addr.streetName || ""
          }, ${addr.city || ""}`
            .trim()
            .replace(/^,\s*|\s*,/g, "");
        } else if (group.buildingType === "Apartment" && group.addressDetails) {
          const addr = group.addressDetails;
          const parts = [];
          if (addr.buildingNo) parts.push(`Building ${addr.buildingNo}`);
          if (addr.buildingName) parts.push(addr.buildingName);
          if (addr.unitNo) parts.push(`Unit ${addr.unitNo}`);
          if (addr.floorNo) parts.push(`Floor ${addr.floorNo}`);
          if (addr.houseNo) parts.push(addr.houseNo);
          if (addr.streetName) parts.push(addr.streetName);
          if (addr.city) parts.push(addr.city);
          formattedAddress = parts.join(", ");
        }

        return {
          driverOrderId: group.allDriverOrderIds[0], // First driver order ID
          drvStatus: group.drvStatus,
          isHandOver: group.isHandOver === 1,
          fullName: `${group.firstName || ""} ${group.lastName || ""}`.trim(),
          jobCount: group.allOrderIds.length,
          allDriverOrderIds: group.allDriverOrderIds,
          allOrderIds: group.allOrderIds,
          allProcessOrderIds: group.allProcessOrderIds,
          allScheduleTimes: uniqueScheduleTimes,
          primaryScheduleTime: primaryScheduleTime,
          sequenceNumber: (index + 1).toString().padStart(2, "0"),
          userId: group.userId,
          title: group.userTitle,
          firstName: group.firstName,
          lastName: group.lastName,
          phoneCode: group.phoneCode,
          phoneNumber: group.phoneNumber,
          image: group.image,
          // Additional address info
          buildingType: group.buildingType,
          address: formattedAddress,
          addressDetails: group.addressDetails,
          phoneNumbers: [group.phone1, group.phone2]
            .filter((phone) => phone)
            .map((phone, idx) => ({
              phone: phone,
              code: idx === 0 ? group.phonecode1 : group.phonecode2,
            })),
        };
      });

      // Sort by primary schedule time
      formattedResults.sort((a, b) => {
        if (
          a.primaryScheduleTime === "Not Scheduled" &&
          b.primaryScheduleTime === "Not Scheduled"
        )
          return 0;
        if (a.primaryScheduleTime === "Not Scheduled") return 1;
        if (b.primaryScheduleTime === "Not Scheduled") return -1;
        return a.primaryScheduleTime.localeCompare(b.primaryScheduleTime);
      });

      resolve(formattedResults);
    });
  });
};

// Get Order User Details DAO
exports.getOrderUserDetailsDAO = async (driverId, processOrderIds) => {
  return new Promise((resolve, reject) => {
    console.log("DAO received processOrderIds:", processOrderIds);
    console.log("DAO received driverId:", driverId);

    const sql = `
      SELECT 
        u.id as userId,
        u.title,
        u.firstName,
        u.lastName,
        u.phoneCode,
        u.phoneNumber,
        u.image,
        o.fullName as billingName,
        o.title as billingTitle,
        o.phonecode1 as billingPhoneCode,
        o.phone1 as billingPhone,
        o.phonecode2 as billingPhoneCode2,  
        o.phone2 as billingPhone2,         
        o.longitude,                     
        o.latitude,                       
        o.id as orderId,
        o.sheduleTime,
        o.buildingType,
        o.delivaryMethod,
        o.fullTotal,
        o.deliveryCharge,
        po.id as processOrderId,
        po.invNo,
        po.paymentMethod,
        po.isPaid,
        do.drvStatus as status, -- Get status from driverorders table
        -- House address
        oh.houseNo as house_houseNo,
        oh.streetName as house_streetName,
        oh.city as house_city,
        -- Apartment address
        oa.buildingNo as apartment_buildingNo,
        oa.buildingName as apartment_buildingName,
        oa.unitNo as apartment_unitNo,
        oa.floorNo as apartment_floorNo,
        oa.houseNo as apartment_houseNo,
        oa.streetName as apartment_streetName,
        oa.city as apartment_city
      FROM collection_officer.driverorders do
      INNER JOIN market_place.processorders po ON do.orderId = po.id
      INNER JOIN market_place.orders o ON po.orderId = o.id
      INNER JOIN market_place.marketplaceusers u ON o.userId = u.id
      LEFT JOIN market_place.orderhouse oh ON o.id = oh.orderId AND o.buildingType = 'House'
      LEFT JOIN market_place.orderapartment oa ON o.id = oa.orderId AND o.buildingType = 'Apartment'
      WHERE do.driverId = ?
      AND do.orderId IN (?)
      ORDER BY o.id
    `;

    const params = [driverId, processOrderIds];

    console.log("Executing SQL with params:", params);

    db.collectionofficer.query(sql, params, (err, results) => {
      if (err) {
        console.error(
          "Database error fetching order user details:",
          err.message
        );
        return reject(new Error("Failed to fetch order user details"));
      }

      if (results.length === 0) {
        return resolve({ user: null, orders: [] });
      }

      const firstRow = results[0];
      
      // Format address based on building type
      let userAddress = "Address not specified";
      if (firstRow.buildingType === 'House') {
        const parts = [
          firstRow.house_houseNo,
          firstRow.house_streetName,
          firstRow.house_city
        ].filter(Boolean);
        userAddress = parts.join(', ') || "Address not specified";
      } else if (firstRow.buildingType === 'Apartment') {
        const parts = [
          firstRow.apartment_buildingNo ? `No. ${firstRow.apartment_buildingNo}` : null,
          firstRow.apartment_buildingName,
          firstRow.apartment_unitNo ? `Unit ${firstRow.apartment_unitNo}` : null,
          firstRow.apartment_floorNo ? `Floor ${firstRow.apartment_floorNo}` : null,
          firstRow.apartment_houseNo,
          firstRow.apartment_streetName,
          firstRow.apartment_city
        ].filter(Boolean);
        userAddress = parts.join(', ') || "Address not specified";
      }

      const user = {
        id: firstRow.userId,
        title: firstRow.title,
        firstName: firstRow.firstName,
        lastName: firstRow.lastName,
        phoneCode: firstRow.phoneCode,
        phoneNumber: firstRow.phoneNumber,
        image: firstRow.image,
        address: userAddress,
        billingName: firstRow.billingName,
        billingTitle: firstRow.billingTitle,
        billingPhoneCode: firstRow.billingPhoneCode,
        billingPhone: firstRow.billingPhone,
        billingPhoneCode2: firstRow.billingPhoneCode2,  
        billingPhone2: firstRow.billingPhone2,    
        buildingType: firstRow.buildingType,
        deliveryMethod: firstRow.delivaryMethod
      };

      const orders = results.map((row) => {
        // Format order-specific address
        let orderAddress = "Address not specified";
        if (row.buildingType === 'House') {
          const parts = [
            row.house_houseNo,
            row.house_streetName,
            row.house_city
          ].filter(Boolean);
          orderAddress = parts.join(', ') || "Address not specified";
        } else if (row.buildingType === 'Apartment') {
          const parts = [
            row.apartment_buildingNo ? `No. ${row.apartment_buildingNo}` : null,
            row.apartment_buildingName,
            row.apartment_unitNo ? `Unit ${row.apartment_unitNo}` : null,
            row.apartment_floorNo ? `Floor ${row.apartment_floorNo}` : null,
            row.apartment_houseNo,
            row.apartment_streetName,
            row.apartment_city
          ].filter(Boolean);
          orderAddress = parts.join(', ') || "Address not specified";
        }

        return {
          orderId: row.orderId,
          sheduleTime: row.sheduleTime,
          fullName: row.billingName,
          phonecode1: row.billingPhoneCode, 
          phone1: row.billingPhone,
          phonecode2: row.billingPhoneCode2, 
          phone2: row.billingPhone2,         
          longitude: row.longitude,          
          latitude: row.latitude,       
          address: orderAddress, 
          processOrder: {
            id: row.processOrderId,
            invNo: row.invNo,
            paymentMethod: row.paymentMethod,
            isPaid: row.isPaid === 1,
            status: row.status, // Now using drvStatus from driverorders table
          },
          pricing: row.fullTotal,
        };
      });

      resolve({ user, orders });
    });
  });
};

// Start Journey DAO
exports.startJourneyDAO = async (driverId, orderIds) => {
  return new Promise((resolve, reject) => {
    // First, check if driver already has an order with "On the way" status
    const checkSql = `
      SELECT COUNT(*) as ongoingCount
      FROM collection_officer.driverorders
      WHERE driverId = ?
      AND drvStatus = 'On the way'
      AND isHandOver = 0
    `;

    db.collectionofficer.query(
      checkSql,
      [driverId],
      (checkErr, checkResults) => {
        if (checkErr) {
          console.error(
            "Database error checking ongoing orders:",
            checkErr.message
          );
          return reject(new Error("Failed to check ongoing orders"));
        }

        const ongoingCount = checkResults[0]?.ongoingCount || 0;

        if (ongoingCount > 0) {
          return resolve({
            success: false,
            message:
              "You have one ongoing activity. Please end it, put it on hold, or mark it as returned to start this one.",
          });
        }

        // Update driverorders table
        const updateDriverOrdersSql = `
        UPDATE collection_officer.driverorders
        SET drvStatus = 'On the way',
            createdAt = CURRENT_TIMESTAMP
        WHERE driverId = ?
        AND orderId IN (?)
        AND isHandOver = 0
      `;

        console.log("Updating driverorders with SQL:", updateDriverOrdersSql);
        console.log("Parameters:", [driverId, orderIds]);

        db.collectionofficer.query(
          updateDriverOrdersSql,
          [driverId, orderIds],
          (err1, result1) => {
            if (err1) {
              console.error("Error updating driverorders:", err1.message);
              return reject(new Error("Failed to update driver orders"));
            }

            console.log(
              "Driver orders updated. Affected rows:",
              result1.affectedRows
            );

            // Update processorders table
            const updateProcessOrdersSql = `
          UPDATE market_place.processorders
          SET status = 'On the way'
          WHERE orderId IN (?)
        `;

            console.log(
              "Updating processorders with SQL:",
              updateProcessOrdersSql
            );
            console.log("Parameters:", [orderIds]);

            db.collectionofficer.query(
              updateProcessOrdersSql,
              [orderIds],
              (err2, result2) => {
                if (err2) {
                  console.error("Error updating processorders:", err2.message);
                  return reject(new Error("Failed to update process orders"));
                }

                console.log(
                  "Process orders updated. Affected rows:",
                  result2.affectedRows
                );

                // Get updated order details for response
                const getUpdatedOrdersSql = `
            SELECT 
              do.id as driverOrderId,
              do.orderId as processOrderId,
              po.orderId as marketOrderId,
              po.invNo,
              po.status as processStatus,
              do.drvStatus,
              do.createdAt as journeyStartedAt
            FROM collection_officer.driverorders do
            INNER JOIN market_place.processorders po ON do.orderId = po.id
            WHERE do.driverId = ?
            AND do.orderId IN (?)
            AND do.drvStatus = 'On the way'
          `;

                db.collectionofficer.query(
                  getUpdatedOrdersSql,
                  [driverId, orderIds],
                  (err3, updatedResults) => {
                    if (err3) {
                      console.error(
                        "Error fetching updated orders:",
                        err3.message
                      );
                      // Still resolve success since the updates worked
                      return resolve({
                        success: true,
                        message: "Journey started successfully",
                        updatedOrders: [],
                      });
                    }

                    resolve({
                      success: true,
                      message: "Journey started successfully",
                      updatedOrders: updatedResults.map((row) => ({
                        driverOrderId: row.driverOrderId,
                        processOrderId: row.processOrderId,
                        marketOrderId: row.marketOrderId,
                        invNo: row.invNo,
                        processStatus: row.processStatus,
                        drvStatus: row.drvStatus,
                        journeyStartedAt: row.journeyStartedAt,
                      })),
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

// Save Signature DAO
exports.saveSignatureAndUpdateStatusDAO = async (
  processOrderIds,
  signaturePath
) => {
  return new Promise((resolve, reject) => {
    // Use the collectionofficer pool to get a connection
    db.collectionofficer.getConnection((err, connection) => {
      if (err) {
        console.error("Error getting database connection:", err);
        return reject(
          new Error(`Failed to get database connection: ${err.message}`)
        );
      }

      // Start transaction
      connection.beginTransaction((beginErr) => {
        if (beginErr) {
          connection.release();
          return reject(
            new Error(`Failed to begin transaction: ${beginErr.message}`)
          );
        }

        // 1. Update driverorders table - set signature and drvStatus
        const updateDriverOrdersQuery = `
          UPDATE driverorders 
          SET signature = ?, drvStatus = 'Completed'
          WHERE orderId IN (?)
        `;

        console.log("Updating driverorders with signature:", {
          processOrderIds: processOrderIds,
          signaturePath: signaturePath,
        });

        // Execute the first update
        connection.query(
          updateDriverOrdersQuery,
          [signaturePath, processOrderIds],
          (queryErr1, result1) => {
            if (queryErr1) {
              return connection.rollback(() => {
                connection.release();
                console.error("Error updating driverorders:", queryErr1);
                reject(
                  new Error(
                    `Failed to update driverorders: ${queryErr1.message}`
                  )
                );
              });
            }

            // 2. Update processorders table - set status to 'Delivered'
            const updateProcessOrdersQuery = `
            UPDATE market_place.processorders 
            SET status = 'Delivered'
            WHERE id IN (?)
          `;

            // Use the same connection but specify the database in the query
            connection.query(
              updateProcessOrdersQuery,
              [processOrderIds],
              (queryErr2, result2) => {
                if (queryErr2) {
                  return connection.rollback(() => {
                    connection.release();
                    console.error("Error updating processorders:", queryErr2);
                    reject(
                      new Error(
                        `Failed to update processorders: ${queryErr2.message}`
                      )
                    );
                  });
                }

                // Commit transaction
                connection.commit((commitErr) => {
                  if (commitErr) {
                    return connection.rollback(() => {
                      connection.release();
                      console.error("Error committing transaction:", commitErr);
                      reject(
                        new Error(
                          `Failed to commit transaction: ${commitErr.message}`
                        )
                      );
                    });
                  }

                  connection.release();

                  console.log("Signature update successful:", {
                    driverOrdersUpdated: result1.affectedRows,
                    processOrdersUpdated: result2.affectedRows,
                    totalOrders: processOrderIds.length,
                  });

                  resolve({
                    driverOrdersUpdated: result1.affectedRows,
                    processOrdersUpdated: result2.affectedRows,
                    totalOrders: processOrderIds.length,
                  });
                });
              }
            );
          }
        );
      });
    });
  });
};

// Verify Driver Has Access To The Process Orders
exports.verifyDriverAccessToOrdersDAO = async (driverId, processOrderIds) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT COUNT(*) as count
      FROM collection_officer.driverorders 
      WHERE driverId = ? 
        AND orderId IN (?)
        AND drvStatus IN ('Todo', 'On the way', 'Hold')
    `;

    db.collectionofficer.query(
      sql,
      [driverId, processOrderIds],
      (err, results) => {
        if (err) {
          console.error("Error verifying driver access:", err.message);
          return reject(new Error("Failed to verify driver access"));
        }

        const accessibleCount = results[0].count;
        const totalRequested = processOrderIds.length;

        resolve({
          hasAccess: accessibleCount === totalRequested,
          accessibleCount: accessibleCount,
          totalRequested: totalRequested,
        });
      }
    );
  });
};
