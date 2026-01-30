const db = require("../startup/database");

// Get process order ID by invoice number
exports.GetProcessOrderInfoByInvNo = async (invNo) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        id,
        status,
        invNo
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

      resolve({
        id: results[0].id,
        status: results[0].status,
        invNo: results[0].invNo,
      });
    });
  });
};

// Save driver order and update processorders status
exports.SaveDriverOrder = async (driverId, processOrderId) => {
  return new Promise(async (resolve, reject) => {
    try {
      // STEP 1: Insert driver order
      const insertSql = `
        INSERT INTO collection_officer.driverorders
        (driverId, orderId, drvStatus, isHandOver, createdAt)
        VALUES (?, ?, 'Todo', 0, NOW())
      `;

      const insertResult = await new Promise((res, rej) => {
        db.collectionofficer.query(
          insertSql,
          [driverId, processOrderId],
          (err, result) => {
            if (err) return rej(err);
            res(result);
          },
        );
      });

      // STEP 2: Update processorders status
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

      // STEP 3: Insert notification
      const notificationSql = `
        INSERT INTO market_place.dashnotification
        (orderId, readStatus, title, createdAt)
        VALUES (?, 0, 'Driver has collected the order', NOW())
      `;

      await new Promise((res, rej) => {
        db.marketPlace.query(
          notificationSql,
          [processOrderId],
          (err, result) => {
            if (err) return rej(err);
            res(result);
          },
        );
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

// Get Driver Orders DAO
exports.getDriverOrdersDAO = async (
  driverId,
  statuses,
  isHandOver = null,
  filterDate = null,
) => {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    let sql = `
      SELECT 
        do.id as driverOrderId,
        do.drvStatus,
        do.isHandOver,
        do.createdAt as driverOrderCreatedAt,
        po.deliveredTime AS deliveredTime,
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
        oh.houseNo as house_houseNo,
        oh.streetName as house_streetName,
        oh.city as house_city,
        oa.buildingNo as apartment_buildingNo,
        oa.buildingName as apartment_buildingName,
        oa.unitNo as apartment_unitNo,
        oa.floorNo as apartment_floorNo,
        oa.houseNo as apartment_houseNo,
        oa.streetName as apartment_streetName,
        oa.city as apartment_city,
        dho.holdReasonId,
        hr.indexNo as holdReasonIndexNo,
        hr.rsnEnglish as holdReasonEnglish,
        hr.rsnSinhala as holdReasonSinhala,
        hr.rsnTamil as holdReasonTamil,
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
      LEFT JOIN (
        -- Get only the most recent hold record for each drvOrderId
        SELECT dho1.*
        FROM collection_officer.driverholdorders dho1
        INNER JOIN (
          SELECT drvOrderId, MAX(createdAt) as maxCreatedAt
          FROM collection_officer.driverholdorders
          GROUP BY drvOrderId
        ) dho2 ON dho1.drvOrderId = dho2.drvOrderId 
               AND dho1.createdAt = dho2.maxCreatedAt
      ) dho ON do.id = dho.drvOrderId
      LEFT JOIN collection_officer.holdreason hr ON dho.holdReasonId = hr.id
      WHERE do.driverId = ?
    `;

    const params = [driverId];

    if (isHandOver !== null && isHandOver !== undefined) {
      sql += ` AND do.isHandOver = ?`;
      params.push(isHandOver);
    }

    if (statuses && statuses.length > 0) {
      const validStatuses = statuses.filter((s) =>
        ["Todo", "Completed", "Hold", "Return", "On the way"].includes(s),
      );
      if (validStatuses.length > 0) {
        sql += ` AND do.drvStatus IN (?)`;
        params.push(validStatuses);
      }
    }

    if (statuses && statuses.includes("Completed")) {
      const targetDate = filterDate || todayStr;

      if (statuses.length === 1 && statuses[0] === "Completed") {
        sql += ` AND do.drvStatus = 'Completed' AND DATE(po.deliveredTime) = DATE(?)`;
        params.push(targetDate);
      } else {
        sql += ` AND (
          do.drvStatus != 'Completed' 
          OR (
            do.drvStatus = 'Completed' 
            AND DATE(po.deliveredTime) = DATE(?)
          )
        )`;
        params.push(targetDate);
      }
    }

    sql += ` ORDER BY o.userId, o.sheduleTime ASC, do.createdAt ASC`;

    db.collectionofficer.query(sql, params, (err, results) => {
      if (err) {
        return reject(new Error("Failed to fetch driver orders"));
      }

      const groupedOrders = results.reduce((groups, order) => {
        const userId = order.userId;
        const buildingType = order.buildingType;

        let addressKey = `${userId}_`;

        if (buildingType === "House") {
          addressKey += `HOUSE_${order.house_houseNo || ""}_${order.house_streetName || ""}_${order.house_city || ""}`;
        } else if (buildingType === "Apartment") {
          addressKey += `APARTMENT_${order.apartment_buildingNo || ""}_${order.apartment_buildingName || ""}_${order.apartment_unitNo || ""}_${order.apartment_floorNo || ""}_${order.apartment_streetName || ""}_${order.apartment_city || ""}`;
        } else {
          addressKey += `OTHER_${order.orderId}`;
        }

        addressKey = addressKey
          .replace(/undefined/g, "")
          .replace(/null/g, "")
          .replace(/_+/g, "_")
          .replace(/_$/, "");

        if (!groups[addressKey]) {
          groups[addressKey] = {
            driverOrderId: order.driverOrderId,
            allDriverOrderIds: [],
            allProcessOrderIds: [],
            allOrderIds: [],
            allScheduleTimes: [],
            allCompleteTimes: [],
            holdReasons: [],
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

        const group = groups[addressKey];
        group.allDriverOrderIds.push(order.driverOrderId);
        group.allProcessOrderIds.push(order.processOrderId);
        group.allOrderIds.push(order.orderId);

        if (order.sheduleTime) {
          group.allScheduleTimes.push(order.sheduleTime);
        }

        if (order.deliveredTime) {
          let deliveredTimeStr = order.deliveredTime;
          if (order.deliveredTime instanceof Date) {
            deliveredTimeStr = order.deliveredTime.toISOString();
          } else if (typeof order.deliveredTime === "string") {
            if (
              order.deliveredTime.includes(" ") &&
              !order.deliveredTime.includes("T")
            ) {
              const date = new Date(order.deliveredTime + "Z");
              deliveredTimeStr = date.toISOString();
            }
          }
          group.allCompleteTimes.push(deliveredTimeStr);
        }

        // Only add hold reason if it exists and hasn't been added yet
        if (order.drvStatus === "Hold" && order.holdReasonId) {
          const exists = group.holdReasons.some(
            (hr) =>
              hr.holdReasonId === order.holdReasonId &&
              hr.driverOrderId === order.driverOrderId,
          );

          if (!exists) {
            group.holdReasons.push({
              driverOrderId: order.driverOrderId,
              holdReasonId: order.holdReasonId,
              indexNo: order.holdReasonIndexNo,
              rsnEnglish: order.holdReasonEnglish,
              rsnSinhala: order.holdReasonSinhala,
              rsnTamil: order.holdReasonTamil,
            });
          }
        }

        const statusPriority = {
          Return: 1,
          Hold: 2,
          "On the way": 3,
          Todo: 4,
          Completed: 5,
        };

        if (
          (statusPriority[order.drvStatus] || 5) <
          (statusPriority[group.drvStatus] || 5)
        ) {
          group.drvStatus = order.drvStatus;
        }

        if (order.isHandOver === 1) {
          group.isHandOver = 1;
        }

        return groups;
      }, {});

      const formattedResults = Object.values(groupedOrders).map(
        (group, index) => {
          group.allDriverOrderIds.sort((a, b) => a - b);
          group.allProcessOrderIds.sort((a, b) => a - b);
          group.allOrderIds.sort((a, b) => a - b);

          const uniqueScheduleTimes = [
            ...new Set(group.allScheduleTimes),
          ].sort();
          const primaryScheduleTime =
            uniqueScheduleTimes.length > 0
              ? uniqueScheduleTimes[0]
              : "Not Scheduled";

          let completeTime = null;
          if (group.allCompleteTimes.length > 0) {
            const sortedTimes = group.allCompleteTimes
              .filter((time) => time)
              .sort()
              .reverse();
            completeTime = sortedTimes.length > 0 ? sortedTimes[0] : null;
          }

          let formattedAddress = "No Address";
          if (group.buildingType === "House" && group.addressDetails) {
            const a = group.addressDetails;
            formattedAddress =
              `${a.houseNo || ""}, ${a.streetName || ""}, ${a.city || ""}`
                .trim()
                .replace(/^,\s*|\s*,/g, "");
          } else if (
            group.buildingType === "Apartment" &&
            group.addressDetails
          ) {
            const a = group.addressDetails;
            formattedAddress = [
              a.buildingNo && `Building ${a.buildingNo}`,
              a.buildingName,
              a.unitNo && `Unit ${a.unitNo}`,
              a.floorNo && `Floor ${a.floorNo}`,
              a.houseNo,
              a.streetName,
              a.city,
            ]
              .filter(Boolean)
              .join(", ");
          }

          return {
            driverOrderId: group.allDriverOrderIds[0],
            drvStatus: group.drvStatus,
            isHandOver: group.isHandOver === 1,
            fullName: `${group.firstName || ""} ${group.lastName || ""}`.trim(),
            jobCount: group.allOrderIds.length,
            allDriverOrderIds: group.allDriverOrderIds,
            allOrderIds: group.allOrderIds,
            allProcessOrderIds: group.allProcessOrderIds,
            allScheduleTimes: uniqueScheduleTimes,
            primaryScheduleTime,
            completeTime: completeTime,
            allCompleteTimes: group.allCompleteTimes,
            sequenceNumber: (index + 1).toString().padStart(2, "0"),
            userId: group.userId,
            title: group.userTitle,
            firstName: group.firstName,
            lastName: group.lastName,
            phoneCode: group.phoneCode,
            phoneNumber: group.phoneNumber,
            image: group.image,
            buildingType: group.buildingType,
            address: formattedAddress,
            addressDetails: group.addressDetails,
            phoneNumbers: [group.phone1, group.phone2]
              .filter(Boolean)
              .map((phone, idx) => ({
                phone,
                code: idx === 0 ? group.phonecode1 : group.phonecode2,
              })),
            holdReasons: group.holdReasons.length ? group.holdReasons : null,
          };
        },
      );

      formattedResults.sort((a, b) => {
        if (a.primaryScheduleTime === "Not Scheduled") return 1;
        if (b.primaryScheduleTime === "Not Scheduled") return -1;
        return a.primaryScheduleTime.localeCompare(b.primaryScheduleTime);
      });

      const statusCount = formattedResults.reduce((acc, order) => {
        acc[order.drvStatus] = (acc[order.drvStatus] || 0) + 1;
        return acc;
      }, {});
      Object.entries(statusCount).forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`);
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
        o.title as billingTitle, -- Already selected
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

    db.collectionofficer.query(sql, params, (err, results) => {
      if (err) {
        console.error(
          "Database error fetching order user details:",
          err.message,
        );
        return reject(new Error("Failed to fetch order user details"));
      }

      if (results.length === 0) {
        return resolve({ user: null, orders: [] });
      }

      const firstRow = results[0];

      // Helper function to format House address
      const formatHouseAddress = (row) => {
        const parts = [];
        if (row.house_houseNo) parts.push(`House.No ${row.house_houseNo}`);
        if (row.house_streetName)
          parts.push(`Street : ${row.house_streetName}`);
        if (row.house_city) parts.push(`City : ${row.house_city}`);
        return parts.length > 0 ? parts.join(", ") : "Address not specified";
      };

      // Helper function to format Apartment address
      const formatApartmentAddress = (row) => {
        const parts = [];
        if (row.apartment_buildingNo)
          parts.push(`B.No : ${row.apartment_buildingNo}`);
        if (row.apartment_buildingName)
          parts.push(`B.Name : ${row.apartment_buildingName}`);
        if (row.apartment_unitNo)
          parts.push(`Unit.No : ${row.apartment_unitNo}`);
        if (row.apartment_floorNo)
          parts.push(`Floor.No : ${row.apartment_floorNo}`);
        if (row.apartment_houseNo)
          parts.push(`House.No : ${row.apartment_houseNo}`);
        if (row.apartment_streetName)
          parts.push(`Street : ${row.apartment_streetName}`);
        if (row.apartment_city) parts.push(`City : ${row.apartment_city}`);
        return parts.length > 0 ? parts.join(", ") : "Address not specified";
      };

      // Format user address based on building type
      let userAddress = "Address not specified";
      if (firstRow.buildingType === "House") {
        userAddress = formatHouseAddress(firstRow);
      } else if (firstRow.buildingType === "Apartment") {
        userAddress = formatApartmentAddress(firstRow);
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
        deliveryMethod: firstRow.delivaryMethod,
      };

      const orders = results.map((row) => {
        // Format order-specific address
        let orderAddress = "Address not specified";
        if (row.buildingType === "House") {
          orderAddress = formatHouseAddress(row);
        } else if (row.buildingType === "Apartment") {
          orderAddress = formatApartmentAddress(row);
        }

        return {
          orderId: row.orderId,
          sheduleTime: row.sheduleTime,
          fullName: row.billingName,
          title: row.billingTitle, // Add title to order object
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
    // Check if driver already has an ongoing journey
    const checkSql = `
      SELECT 
        COUNT(*) as ongoingCount,
        GROUP_CONCAT(DISTINCT do.orderId) as ongoingOrderIds
      FROM collection_officer.driverorders do
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
            checkErr.message,
          );
          return reject(new Error("Failed to check ongoing orders"));
        }

        const ongoingCount = checkResults[0]?.ongoingCount || 0;
        const ongoingOrderIds = checkResults[0]?.ongoingOrderIds || "";

        if (ongoingCount > 0) {
          // Split the ongoingOrderIds string into an array
          const ongoingIdsArray = ongoingOrderIds
            .split(",")
            .map((id) => parseInt(id.trim()))
            .filter((id) => !isNaN(id));

          return resolve({
            success: false,
            message:
              "You have one ongoing activity. Please end it, put it on hold, or mark it as returned to start this one.",
            ongoingProcessOrderIds: ongoingIdsArray, // Return the ongoing order IDs
          });
        }

        // Update driverorders → set On the way + startTime
        const updateDriverOrdersSql = `
          UPDATE collection_officer.driverorders
          SET 
            drvStatus = 'On the way',
            startTime = CURRENT_TIMESTAMP
          WHERE driverId = ?
          AND orderId IN (?)
          AND isHandOver = 0
        `;

        db.collectionofficer.query(
          updateDriverOrdersSql,
          [driverId, orderIds],
          (err1, result1) => {
            if (err1) {
              console.error("Error updating driverorders:", err1.message);
              return reject(new Error("Failed to update driver orders"));
            }

            // Check if any rows were updated
            if (result1.affectedRows === 0) {
              return resolve({
                success: false,
                message: "No orders found or orders already in progress",
              });
            }

            // Update processorders status
            const updateProcessOrdersSql = `
              UPDATE market_place.processorders
              SET status = 'On the way'
              WHERE id IN (?)
            `;

            db.collectionofficer.query(
              updateProcessOrdersSql,
              [orderIds],
              (err2, result2) => {
                if (err2) {
                  console.error("Error updating processorders:", err2.message);
                  return reject(new Error("Failed to update process orders"));
                }

                // Fetch updated records
                const getUpdatedOrdersSql = `
                  SELECT 
                    do.id AS driverOrderId,
                    do.orderId AS processOrderId,
                    po.orderId AS marketOrderId,
                    po.invNo,
                    po.status AS processStatus,
                    do.drvStatus,
                    do.startTime AS journeyStartedAt
                  FROM collection_officer.driverorders do
                  INNER JOIN market_place.processorders po 
                    ON do.orderId = po.id
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
                        err3.message,
                      );
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

// Save Signature DAO
exports.saveSignatureAndUpdateStatusDAO = async (
  processOrderIds,
  signaturePath,
) => {
  return new Promise((resolve, reject) => {
    db.collectionofficer.getConnection((err, connection) => {
      if (err) {
        console.error("Error getting database connection:", err);
        return reject(
          new Error(`Failed to get database connection: ${err.message}`),
        );
      }

      connection.beginTransaction((beginErr) => {
        if (beginErr) {
          connection.release();
          return reject(
            new Error(`Failed to begin transaction: ${beginErr.message}`),
          );
        }

        const fetchPaymentDetailsQuery = `
          SELECT po.id as processOrderId, po.paymentMethod, po.orderId, o.fullTotal
          FROM market_place.processorders po
          JOIN market_place.orders o ON po.orderId = o.id
          WHERE po.id IN (?)
        `;

        connection.query(
          fetchPaymentDetailsQuery,
          [processOrderIds],
          (fetchErr, paymentDetails) => {
            if (fetchErr) {
              return connection.rollback(() => {
                connection.release();
                console.error("Error fetching payment details:", fetchErr);
                reject(
                  new Error(
                    `Failed to fetch payment details: ${fetchErr.message}`,
                  ),
                );
              });
            }

            const cashOrders = paymentDetails.filter(
              (order) => order.paymentMethod === "Cash",
            );
            const nonCashOrders = paymentDetails.filter(
              (order) => order.paymentMethod !== "Cash",
            );

            const cashOrderIds = cashOrders.map(
              (order) => order.processOrderId,
            );
            const nonCashOrderIds = nonCashOrders.map(
              (order) => order.processOrderId,
            );

            // 1. Update driverorders (NO completeTime here)
            const updateDriverOrdersQuery = `
              UPDATE collection_officer.driverorders 
              SET 
                signature = ?,
                drvStatus = 'Completed'
              WHERE orderId IN (?)
            `;

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
                        `Failed to update driverorders: ${queryErr1.message}`,
                      ),
                    );
                  });
                }

                let updatePromises = [];

                // 2. Update processorders: Delivered + deliveredTime
                const updateAllOrdersStatusQuery = `
                  UPDATE market_place.processorders 
                  SET 
                    status = 'Delivered',
                    deliveredTime = CURRENT_TIMESTAMP
                  WHERE id IN (?)
                `;

                updatePromises.push(
                  new Promise((resolve, reject) => {
                    connection.query(
                      updateAllOrdersStatusQuery,
                      [processOrderIds],
                      (err, result) => {
                        if (err) reject(err);
                        else resolve({ type: "status", result });
                      },
                    );
                  }),
                );

                // 3. Cash orders handling (UNCHANGED)
                if (cashOrderIds.length > 0) {
                  const updateCashOrdersQuery = `
                    UPDATE market_place.processorders po
                    JOIN market_place.orders o ON po.orderId = o.id
                    SET po.isPaid = 1, po.amount = o.fullTotal
                    WHERE po.id IN (?)
                  `;

                  updatePromises.push(
                    new Promise((resolve, reject) => {
                      connection.query(
                        updateCashOrdersQuery,
                        [cashOrderIds],
                        (err, result) => {
                          if (err) reject(err);
                          else resolve({ type: "cash", result });
                        },
                      );
                    }),
                  );
                }

                Promise.all(updatePromises)
                  .then((results) => {
                    connection.commit((commitErr) => {
                      if (commitErr) {
                        return connection.rollback(() => {
                          connection.release();
                          console.error(
                            "Error committing transaction:",
                            commitErr,
                          );
                          reject(
                            new Error(
                              `Failed to commit transaction: ${commitErr.message}`,
                            ),
                          );
                        });
                      }

                      connection.release();

                      const statusUpdateResult = results.find(
                        (r) => r.type === "status",
                      )?.result;

                      const cashUpdateResult = results.find(
                        (r) => r.type === "cash",
                      )?.result;

                      console.log("Signature update successful:", {
                        driverOrdersUpdated: result1.affectedRows,
                        processOrdersUpdated:
                          statusUpdateResult?.affectedRows || 0,
                        cashOrdersUpdated: cashUpdateResult?.affectedRows || 0,
                        totalOrders: processOrderIds.length,
                        cashOrdersCount: cashOrderIds.length,
                        nonCashOrdersCount: nonCashOrderIds.length,
                      });

                      resolve({
                        driverOrdersUpdated: result1.affectedRows,
                        processOrdersUpdated:
                          statusUpdateResult?.affectedRows || 0,
                        cashOrdersUpdated: cashUpdateResult?.affectedRows || 0,
                        signatureUrl: signaturePath,
                        totalOrders: processOrderIds.length,
                        cashOrdersCount: cashOrderIds.length,
                        nonCashOrdersCount: nonCashOrderIds.length,
                      });
                    });
                  })
                  .catch((promiseErr) => {
                    return connection.rollback(() => {
                      connection.release();
                      console.error("Error in update promises:", promiseErr);
                      reject(
                        new Error(
                          `Failed to update process orders: ${promiseErr.message}`,
                        ),
                      );
                    });
                  });
              },
            );
          },
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
      },
    );
  });
};

// Restart Journey DAO
exports.reStartJourneyDAO = async (driverId, orderIds) => {
  try {
    // Step 1: Get driverorders records for the given orderIds and driverId
    const [driverOrders] = await db.collectionofficer.promise().query(
      `SELECT id, orderId, drvStatus 
       FROM driverorders 
       WHERE driverId = ? AND orderId IN (?)`,
      [driverId, orderIds],
    );

    if (driverOrders.length === 0) {
      return {
        success: false,
        message: "No valid orders found for this driver",
        ongoingProcessOrderIds: [],
      };
    }

    const driverOrderIds = driverOrders.map((order) => order.id);
    const validOrderIds = driverOrders.map((order) => order.orderId);

    // Step 2: Check if any orders are already in ongoing process
    const ongoingOrders = driverOrders.filter(
      (order) =>
        order.drvStatus === "On the Way" || order.drvStatus === "Arrived",
    );

    if (ongoingOrders.length > 0) {
      return {
        success: false,
        message: "Some orders are already in ongoing process",
        ongoingProcessOrderIds: ongoingOrders.map((order) => order.orderId),
      };
    }

    // Step 3: Update driverorders table - set drvStatus to "On the Way"
    await db.collectionofficer.promise().query(
      `UPDATE driverorders 
       SET drvStatus = 'On the Way'
       WHERE id IN (?)`,
      [driverOrderIds],
    );

    // Step 4: Update ONLY the latest (last inserted) record in driverholdorders for each drvOrderId
    await db.collectionofficer.promise().query(
      `UPDATE driverholdorders 
       SET restartedTime = NOW() 
       WHERE id IN (
         SELECT * FROM (
           SELECT MAX(id) 
           FROM driverholdorders 
           WHERE drvOrderId IN (?)
           GROUP BY drvOrderId
         ) AS latest_records
       )`,
      [driverOrderIds],
    );

    // Step 5: Update processorders table status to "On the Way"

    await db.marketPlace.promise().query(
      `UPDATE processorders 
       SET status = 'On the Way'
       WHERE id IN (?)`,
      [validOrderIds],
    );

    return {
      success: true,
      message: `Successfully restarted journey for ${driverOrders.length} order(s)`,
      updatedOrders: driverOrders.map((order) => ({
        orderId: order.orderId,
        driverOrderId: order.id,
        drvStatus: "On the Way",
      })),
    };
  } catch (error) {
    console.error("Error in reStartJourneyDAO:", error);
    throw error;
  }
};