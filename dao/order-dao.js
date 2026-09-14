const db = require("../startup/database");

// Get process order ID by invoice number
exports.GetProcessOrderInfoByInvNo = async (invNo) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        id,
        status,
        invNo
      FROM collection_officer.processorders 
      WHERE invNo = ? 
      LIMIT 1
    `;

    db.collectionofficer.query(sql, [invNo], (err, results) => {
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

exports.SaveDriverOrder = async (driverId, processOrderId) => {
  return new Promise(async (resolve, reject) => {
    try {
      db.collectionofficer.getConnection(async (connErr, connection) => {
        if (connErr) return reject(connErr);

        connection.beginTransaction(async (beginErr) => {
          if (beginErr) {
            connection.release();
            return reject(beginErr);
          }

          try {
            // Condition 1: driverId matches AND isHandOver = 0 -> reuse that main row
            const activeMain = await queryAsync(
              connection,
              "SELECT id FROM collection_officer.driverordermain WHERE driverId = ? AND isHandOver = 0 LIMIT 1",
              [driverId],
            );

            let mainId;
            if (activeMain.length > 0) {
              mainId = activeMain[0].id;
            } else {
              const insertMainResult = await queryAsync(
                connection,
                "INSERT INTO collection_officer.driverordermain (driverId, isHandOver, createdAt) VALUES (?, 0, NOW())",
                [driverId],
              );
              mainId = insertMainResult.insertId;
            }

            const insertSql = `
              INSERT IGNORE INTO collection_officer.driverorders
              (drvOrderMainId, orderId, drvStatus, createdAt)
              VALUES (?, ?, 'Todo', NOW())
            `;

            const insertResult = await queryAsync(connection, insertSql, [
              mainId,
              processOrderId,
            ]);

            if (insertResult.affectedRows === 0) {
              return connection.rollback(() => {
                connection.release();
                reject(
                  new Error(
                    "This order has already been assigned to another driver.",
                  ),
                );
              });
            }

            connection.commit(async (commitErr) => {
              if (commitErr) {
                return connection.rollback(() => {
                  connection.release();
                  reject(commitErr);
                });
              }
              connection.release();

              try {
                const updateSql = `
                  UPDATE collection_officer.processorders
                  SET status = 'Collected',
                      isTargetAssigned = 1
                  WHERE id = ?
                `;
                await new Promise((res, rej) => {
                  db.collectionofficer.query(
                    updateSql,
                    [processOrderId],
                    (err, result) => {
                      if (err) return rej(err);
                      res(result);
                    },
                  );
                });

                const notificationSql = `
                  INSERT INTO collection_officer.dashnotification
                  (orderId, readStatus, title, createdAt)
                  VALUES (?, 0, 'Driver has collected the order', NOW())
                `;
                await new Promise((res, rej) => {
                  db.collectionofficer.query(
                    notificationSql,
                    [processOrderId],
                    (err, result) => {
                      if (err) return rej(err);
                      res(result);
                    },
                  );
                });

                // Insert customer-facing ordernotfication for "Order Collected by Driver"
                try {
                  const invNoRows = await new Promise((res, rej) => {
                    db.collectionofficer.query(
                      `SELECT invNo FROM collection_officer.processorders WHERE id = ? LIMIT 1`,
                      [processOrderId],
                      (err, rows) => {
                        if (err) return rej(err);
                        res(rows);
                      },
                    );
                  });
                  const invNo = invNoRows.length > 0 ? invNoRows[0].invNo : processOrderId;
                  const collectedMsg = `Your order #${invNo}, has been collected by our driver.`;
                  await new Promise((res, rej) => {
                    db.collectionofficer.query(
                      `INSERT INTO collection_officer.ordernotfication (orderId, Title, message, isRead, createdAt) VALUES (?, ?, ?, 0, NOW())`,
                      [processOrderId, 'Order Collected by Driver', collectedMsg],
                      (err, result) => {
                        if (err) return rej(err);
                        res(result);
                      },
                    );
                  });
                } catch (notifErr) {
                  console.error('[SaveDriverOrder] Failed to insert ordernotfication:', notifErr.message);
                }

                resolve({
                  message: "Order assigned successfully",
                  driverOrderId: insertResult.insertId,
                  processOrderId,
                  status: "Collected",
                });
              } catch (err) {
                reject(err);
              }
            });
          } catch (txErr) {
            connection.rollback(() => {
              connection.release();
              reject(txErr);
            });
          }
        });
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
          dom.driverId as assignedDriverId,
          co.empId as assignedDriverEmpId,
          CONCAT(co.firstNameEnglish, ' ', co.lastNameEnglish) as assignedDriverName
      FROM collection_officer.driverorders do
      INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
      INNER JOIN collection_officer.collectionofficer co ON dom.driverId = co.id
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
        dom.isHandOver,
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
        o.longitude,
        o.latitude,
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
      INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
      INNER JOIN collection_officer.processorders po ON do.orderId = po.id
      INNER JOIN collection_officer.orders o ON po.orderId = o.id
      INNER JOIN collection_officer.marketplaceusers u ON o.userId = u.id
      LEFT JOIN collection_officer.orderhouse oh ON o.id = oh.orderId AND o.buildingType = 'House'
      LEFT JOIN collection_officer.orderapartment oa ON o.id = oa.orderId AND o.buildingType = 'Apartment'
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
      WHERE dom.driverId = ?
    `;

    const params = [driverId];

    if (isHandOver !== null && isHandOver !== undefined) {
      sql += ` AND dom.isHandOver = ?`;
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
            longitude: order.longitude,
            latitude: order.latitude,
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
            longitude: group.longitude || null,
            latitude: group.latitude || null,
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

      resolve(formattedResults);
    });
  });
};

// Get Order User Details DAO
// Shared helper - keep in sync with other DAOs
function isFreeDeliveryCoupon(row) {
  return (
    !!row.isCoupon &&
    (row.couponType || "").toString().trim().toLowerCase() === "free delivery"
  );
}

exports.getOrderUserDetailsDAO = async (driverId, processOrderIds) => {
  return new Promise((resolve, reject) => {
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
        o.isCoupon,
        o.couponType,
        po.id as processOrderId,
        po.invNo,
        po.paymentMethod,
        po.isPaid,
        po.creditPaid,                 -- ✅ ADDED
        do.drvStatus as status,
        oh.houseNo as house_houseNo,
        oh.streetName as house_streetName,
        oh.city as house_city,
        oa.buildingNo as apartment_buildingNo,
        oa.buildingName as apartment_buildingName,
        oa.unitNo as apartment_unitNo,
        oa.floorNo as apartment_floorNo,
        oa.houseNo as apartment_houseNo,
        oa.streetName as apartment_streetName,
        oa.city as apartment_city
      FROM collection_officer.driverorders do
      INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
      INNER JOIN collection_officer.processorders po ON do.orderId = po.id
      INNER JOIN collection_officer.orders o ON po.orderId = o.id
      INNER JOIN collection_officer.marketplaceusers u ON o.userId = u.id
      LEFT JOIN collection_officer.orderhouse oh ON o.id = oh.orderId AND o.buildingType = 'House'
      LEFT JOIN collection_officer.orderapartment oa ON o.id = oa.orderId AND o.buildingType = 'Apartment'
      WHERE dom.driverId = ?
      AND do.orderId IN (?)
      ORDER BY o.id
    `;

    const params = [driverId, processOrderIds];

    db.collectionofficer.query(sql, params, async (err, results) => {
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

      const formatHouseAddress = (row) => {
        const parts = [];
        if (row.house_houseNo) parts.push(`House.No ${row.house_houseNo}`);
        if (row.house_streetName)
          parts.push(`Street : ${row.house_streetName}`);
        if (row.house_city) parts.push(`City : ${row.house_city}`);
        return parts.length > 0 ? parts.join(", ") : "Address not specified";
      };

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

      try {
        const rowCity = (row) => {
          if (row.buildingType === "House") return row.house_city;
          if (row.buildingType === "Apartment") return row.apartment_city;
          return null;
        };

        const cities = [...new Set(results.map(rowCity).filter(Boolean))];
        const cityToCharge = {};

        if (cities.length > 0) {
          const chargeRows = await new Promise((res, rej) => {
            db.collectionofficer.query(
              `SELECT city, charge FROM collection_officer.deliverycharge WHERE city IN (?)`,
              [cities],
              (err, rows) => (err ? rej(err) : res(rows)),
            );
          });

          chargeRows.forEach((r) => {
            if (cityToCharge[r.city] === undefined) {
              cityToCharge[r.city] = r.charge;
            }
          });
        }

        const orders = results.map((row) => {
          let orderAddress = "Address not specified";
          if (row.buildingType === "House") {
            orderAddress = formatHouseAddress(row);
          } else if (row.buildingType === "Apartment") {
            orderAddress = formatApartmentAddress(row);
          }

          const paymentMethod = (row.paymentMethod || "").toLowerCase();
          let cashAmountDue = null;

          if (paymentMethod === "cash") {
            const oldDeliveryCharge = Number(row.deliveryCharge) || 0;
            const orderValue = (Number(row.fullTotal) || 0) - oldDeliveryCharge;
            const creditPaid = Number(row.creditPaid) || 0;

            if (isFreeDeliveryCoupon(row)) {
              // Free-delivery coupon: skip delivery-charge component entirely
              cashAmountDue = orderValue - creditPaid;
            } else {
              const city = rowCity(row);
              const todaysDeliveryCharge =
                city && cityToCharge[city] !== undefined
                  ? Number(cityToCharge[city])
                  : oldDeliveryCharge;

              cashAmountDue = orderValue + todaysDeliveryCharge - creditPaid;
            }
          }

          return {
            orderId: row.orderId,
            sheduleTime: row.sheduleTime,
            fullName: row.billingName,
            title: row.billingTitle,
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
              status: row.status,
              cashAmountDue,
            },
            pricing: row.fullTotal,
          };
        });

        resolve({ user, orders });
      } catch (chargeErr) {
        console.error(
          "Error resolving today's delivery charge:",
          chargeErr.message,
        );
        return reject(new Error("Failed to resolve delivery charges"));
      }
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
      INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
      WHERE dom.driverId = ?
      AND do.drvStatus = 'On the way'
      AND dom.isHandOver = 0
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
          const ongoingIdsArray = ongoingOrderIds
            .split(",")
            .map((id) => parseInt(id.trim()))
            .filter((id) => !isNaN(id));

          return resolve({
            success: false,
            message:
              "You have one ongoing activity. Please end it, put it on hold, or mark it as returned to start this one.",
            ongoingProcessOrderIds: ongoingIdsArray,
          });
        }

        // Update driverorders → set On the way + startTime
        const updateDriverOrdersSql = `
          UPDATE collection_officer.driverorders do
          INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
          SET 
            do.drvStatus = 'On the way',
            do.startTime = CURRENT_TIMESTAMP
          WHERE dom.driverId = ?
          AND do.orderId IN (?)
          AND dom.isHandOver = 0
        `;

        db.collectionofficer.query(
          updateDriverOrdersSql,
          [driverId, orderIds],
          (err1, result1) => {
            if (err1) {
              console.error("Error updating driverorders:", err1.message);
              return reject(new Error("Failed to update driver orders"));
            }

            if (result1.affectedRows === 0) {
              return resolve({
                success: false,
                message: "No orders found or orders already in progress",
              });
            }

            // Update processorders status
            const updateProcessOrdersSql = `
              UPDATE collection_officer.processorders
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

                const insertNotificationSql = `
                  INSERT INTO collection_officer.dashnotification (orderId, title, readStatus, createdAt)
                  VALUES ?
                `;

                const notificationValues = orderIds.map((id) => [
                  id,
                  "Order is on the way",
                  0,
                  new Date(),
                ]);

                db.collectionofficer.query(
                  insertNotificationSql,
                  [notificationValues],
                  (errN, resultN) => {
                    if (errN) {
                      console.error(
                        "Error inserting dashnotification:",
                        errN.message,
                      );
                      // Non-blocking: log error but continue
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
                      INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
                      INNER JOIN collection_officer.processorders po 
                        ON do.orderId = po.id
                      WHERE dom.driverId = ?
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

                        // Insert customer-facing ordernotfication for "Order is On the Way"
                        if (updatedResults.length > 0) {
                          const onTheWayNotifValues = updatedResults.map((row) => [
                            row.processOrderId,
                            'Order is On the Way',
                            `Your order #${row.invNo}, is on its way to you. Our driver will deliver your order shortly.`,
                            0,
                            new Date(),
                          ]);
                          db.collectionofficer.query(
                            `INSERT INTO collection_officer.ordernotfication (orderId, Title, message, isRead, createdAt) VALUES ?`,
                            [onTheWayNotifValues],
                            (errON) => {
                              if (errON) {
                                console.error('[startJourneyDAO] Failed to insert ordernotfication:', errON.message);
                              }
                            },
                          );
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
      },
    );
  });
};

const HOUSE_VALUES = ["house"];
const APARTMENT_VALUES = ["apartment", "flat"];

function normalizeBuildingType(buildingType) {
  const val = (buildingType || "").toString().trim().toLowerCase();
  if (HOUSE_VALUES.includes(val)) return "house";
  if (APARTMENT_VALUES.includes(val)) return "apartment";
  return null;
}

function queryAsync(connection, sql, params) {
  return new Promise((resolve, reject) => {
    connection.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

exports.verifyDriverAccessToOrdersDAO = async (driverId, processOrderIds) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT COUNT(*) as count
      FROM collection_officer.driverorders do
      INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
      WHERE dom.driverId = ?
        AND do.orderId IN (?)
        AND do.drvStatus IN ('Todo', 'On the way', 'Hold')
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
          accessibleCount,
          totalRequested,
        });
      },
    );
  });
};

exports.saveSignatureAndUpdateStatusDAO = async (
  processOrderIds,
  signaturePath,
  driverId,
  latitude,
  longitude,
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
          SELECT
            po.id AS processOrderId,
            po.paymentMethod,
            po.orderId,
            po.amount AS paidAmount,
            po.creditPaid,
            o.fullTotal,
            o.userId,
            o.deliveryCharge AS currentDeliveryCharge,
            o.buildingType,
            o.isCoupon,
            o.couponType,
            o.couponValue,
            mu.creditBalance
          FROM collection_officer.processorders po
          JOIN collection_officer.orders o ON po.orderId = o.id
          JOIN collection_officer.marketplaceusers mu ON o.userId = mu.id
          WHERE po.id IN (?)
        `;

        connection.query(
          fetchPaymentDetailsQuery,
          [processOrderIds],
          async (fetchErr, paymentDetails) => {
            if (fetchErr) {
              connection.rollback(() => {
                connection.release();
              });
              console.error("Error fetching payment details:", fetchErr);
              reject(
                new Error(
                  `Failed to fetch payment details: ${fetchErr.message}`,
                ),
              );
              return;
            }

            try {
              const cashOrders = paymentDetails.filter(
                (order) => order.paymentMethod === "Cash",
              );
              const cardOrders = paymentDetails.filter(
                (order) => order.paymentMethod === "Card",
              );

              const houseOrderIds = [];
              const apartmentOrderIds = [];
              const unknownBuildingTypeOrders = [];

              for (const order of paymentDetails) {
                const kind = normalizeBuildingType(order.buildingType);
                if (kind === "house") houseOrderIds.push(order.orderId);
                else if (kind === "apartment")
                  apartmentOrderIds.push(order.orderId);
                else unknownBuildingTypeOrders.push(order);
              }

              if (unknownBuildingTypeOrders.length > 0) {
                console.warn(
                  "[saveSignatureAndUpdateStatusDAO] Unrecognized buildingType, skipping delivery-charge check for:",
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
                      `[saveSignatureAndUpdateStatusDAO] Multiple deliverycharge rows found for city "${row.city}" — using the first match (${cityToCharge[row.city]}), ignoring ${row.charge}.`,
                    );
                    return;
                  }
                  cityToCharge[row.city] = row.charge;
                });
              }

              const cashOrderUpdates = [];

              const cashDeliveryChargeUpdates = [];

              for (const order of cashOrders) {
                const orderValue =
                  (Number(order.fullTotal) || 0) -
                  (Number(order.currentDeliveryCharge) || 0);

                const creditPaid = Number(order.creditPaid) || 0;
                const freeDelivery = isFreeDeliveryCoupon(order);

                let newDeliveryCharge;
                let totalDue;

                if (freeDelivery) {
                  newDeliveryCharge = Number(order.currentDeliveryCharge) || 0;
                  totalDue = orderValue;
                } else {
                  const city = orderIdToCity[order.orderId];
                  const cityCharge = city ? cityToCharge[city] : undefined;

                  newDeliveryCharge =
                    cityCharge !== undefined
                      ? Number(cityCharge)
                      : Number(order.currentDeliveryCharge) || 0;

                  totalDue = orderValue + newDeliveryCharge;

                  // Only correct the curDlvrCharge column when no coupon applies
                  cashDeliveryChargeUpdates.push({
                    processOrderId: order.processOrderId,
                    orderId: order.orderId,
                    newDeliveryCharge,
                  });
                }

                const amount = totalDue;
                const moneyPaid =
                  creditPaid > 0 ? totalDue - creditPaid : totalDue;

                cashOrderUpdates.push({
                  processOrderId: order.processOrderId,
                  orderId: order.orderId,
                  amount,
                  moneyPaid,
                  newDeliveryCharge,
                });
              }

              const creditBalanceDeltaByUser = {};
              const cardDeliveryChargeCorrections = [];

              for (const order of cardOrders) {
                if (isFreeDeliveryCoupon(order)) {
                  continue;
                }

                const city = orderIdToCity[order.orderId];
                if (!city) continue;

                const newCharge = cityToCharge[city];
                if (newCharge === undefined) {
                  console.warn(
                    `[saveSignatureAndUpdateStatusDAO] No deliverycharge entry for city "${city}" (orderId ${order.orderId}) — skipping Card curDlvrCharge update.`,
                  );
                  continue;
                }

                const oldCharge = Number(order.currentDeliveryCharge) || 0;
                const numericNewCharge = Number(newCharge);
                const hasDifference = numericNewCharge !== oldCharge;

                let delta = 0;

                if (hasDifference) {
                  delta = oldCharge - numericNewCharge;

                  creditBalanceDeltaByUser[order.userId] =
                    (creditBalanceDeltaByUser[order.userId] || 0) + delta;
                }

                cardDeliveryChargeCorrections.push({
                  processOrderId: order.processOrderId,
                  orderId: order.orderId,
                  userId: order.userId,
                  city,
                  storedOrderDeliveryCharge: oldCharge,
                  correctDeliveryCharge: numericNewCharge,
                  creditBalanceDelta: delta,
                  chargeChanged: hasDifference,
                });
              }

              const earnPriceInfoQuery = `
  SELECT
    do.id AS driverOrderId,
    do.orderId,
    do.drvOrderMainId,
    dcs.slvPayout
  FROM collection_officer.driverorders do
  INNER JOIN collection_officer.driverordermain dom ON do.drvOrderMainId = dom.id
  INNER JOIN collection_officer.collectionofficer co ON dom.driverId = co.id
  LEFT JOIN collection_officer.drivercategoryslave dcs ON co.driverCatId = dcs.id
  WHERE do.orderId IN (?)
`;

              const earnPriceRows = await queryAsync(
                connection,
                earnPriceInfoQuery,
                [processOrderIds],
              );

              if (earnPriceRows.length === 0) {
                connection.rollback(() => {
                  connection.release();
                });
                console.error(
                  "[saveSignatureAndUpdateStatusDAO] Could not resolve driver category payout for orders:",
                  processOrderIds,
                );
                reject(
                  new Error(
                    "Could not resolve driver category payout for the given orders.",
                  ),
                );
                return;
              }

              const earnPriceByDriverOrderId = {};
              for (const row of earnPriceRows) {
                earnPriceByDriverOrderId[row.driverOrderId] =
                  Number(row.slvPayout) || 0;
              }

              const driverOrderIds = Object.keys(earnPriceByDriverOrderId);

              const earnPriceCaseParts = driverOrderIds
                .map(
                  (id) =>
                    `WHEN ${connection.escape(id)} THEN ${connection.escape(
                      earnPriceByDriverOrderId[id],
                    )}`,
                )
                .join(" ");

              const updateDriverOrdersQuery = `
                UPDATE collection_officer.driverorders
                SET
                  signature = ?,
                  drvStatus = 'Completed',
                  earnPrice = CASE id ${earnPriceCaseParts} END
                WHERE id IN (?)
              `;

              connection.query(
                updateDriverOrdersQuery,
                [signaturePath, driverOrderIds],
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

                  const updatePromises = [];

                  const updateAllOrdersStatusQuery = `
                    UPDATE collection_officer.processorders
                    SET
                      status = 'Delivered',
                      deliveredTime = CURRENT_TIMESTAMP,
                      deliveredLatitude = ?,
                      deliveredLongitude = ?
                    WHERE id IN (?)
                  `;

                  updatePromises.push(
                    new Promise((resolve, reject) => {
                      connection.query(
                        updateAllOrdersStatusQuery,
                        [latitude, longitude, processOrderIds],
                        (err, result) => {
                          if (err) reject(err);
                          else resolve({ type: "status", result });
                        },
                      );
                    }),
                  );

                  if (cashOrderUpdates.length > 0) {
                    const cashProcessOrderIds = cashOrderUpdates.map(
                      (u) => u.processOrderId,
                    );

                    const amountCaseParts = cashOrderUpdates
                      .map(
                        (u) =>
                          `WHEN ${connection.escape(
                            u.processOrderId,
                          )} THEN ${connection.escape(u.amount)}`,
                      )
                      .join(" ");

                    const moneyPaidCaseParts = cashOrderUpdates
                      .map(
                        (u) =>
                          `WHEN ${connection.escape(
                            u.processOrderId,
                          )} THEN ${connection.escape(u.moneyPaid)}`,
                      )
                      .join(" ");

                    const updateCashOrdersQuery = `
                      UPDATE collection_officer.processorders
                      SET
                        isPaid = 1,
                        amount = CASE id ${amountCaseParts} END,
                        moneyPaid = CASE id ${moneyPaidCaseParts} END
                      WHERE id IN (?)
                    `;

                    updatePromises.push(
                      new Promise((resolve, reject) => {
                        connection.query(
                          updateCashOrdersQuery,
                          [cashProcessOrderIds],
                          (err, result) => {
                            if (err) {
                              console.error(
                                "[cash payment update] FAILED:",
                                err.message,
                              );
                              return reject(err);
                            }
                            resolve({ type: "cashPayment", result });
                          },
                        );
                      }),
                    );

                    cashDeliveryChargeUpdates.forEach(
                      ({ processOrderId, orderId, newDeliveryCharge }) => {
                        updatePromises.push(
                          new Promise((resolve, reject) => {
                            connection.query(
                              `UPDATE collection_officer.processorders SET curDlvrCharge = ? WHERE id = ?`,
                              [newDeliveryCharge, processOrderId],
                              (err, result) => {
                                if (err) {
                                  console.error(
                                    `[cash curDlvrCharge update] FAILED for processOrderId ${processOrderId}:`,
                                    err.message,
                                  );
                                  return reject(err);
                                }
                                if (result.affectedRows === 0) {
                                  console.warn(
                                    `[cash curDlvrCharge update] ⚠️ No row matched for processorders.id = ${processOrderId}.`,
                                  );
                                }
                                resolve({
                                  type: "deliveryCharge",
                                  orderId,
                                  newCharge: newDeliveryCharge,
                                  affectedRows: result.affectedRows,
                                  changedRows: result.changedRows,
                                  result,
                                });
                              },
                            );
                          }),
                        );
                      },
                    );
                  }

                  if (cardOrders.length > 0) {
                    const cardOrderIds = cardOrders.map(
                      (o) => o.processOrderId,
                    );
                    const updatePayableOrdersQuery = `
                      UPDATE collection_officer.processorders po
                      JOIN collection_officer.orders o ON po.orderId = o.id
                      SET po.isPaid = 1, po.amount = o.fullTotal
                      WHERE po.id IN (?)
                    `;

                    updatePromises.push(
                      new Promise((resolve, reject) => {
                        connection.query(
                          updatePayableOrdersQuery,
                          [cardOrderIds],
                          (err, result) => {
                            if (err) reject(err);
                            else resolve({ type: "payable", result });
                          },
                        );
                      }),
                    );
                  }

                  cardDeliveryChargeCorrections.forEach(
                    ({ processOrderId, orderId, correctDeliveryCharge }) => {
                      updatePromises.push(
                        new Promise((resolve, reject) => {
                          connection.query(
                            `UPDATE collection_officer.processorders SET curDlvrCharge = ? WHERE id = ?`,
                            [correctDeliveryCharge, processOrderId],
                            (err, result) => {
                              if (err) {
                                console.error(
                                  `[Card curDlvrCharge update] FAILED for processOrderId ${processOrderId}:`,
                                  err.message,
                                );
                                return reject(err);
                              }
                              if (result.affectedRows === 0) {
                                console.warn(
                                  `[Card curDlvrCharge update] ⚠️ No row matched for processorders.id = ${processOrderId} — curDlvrCharge was NOT updated.`,
                                );
                              }
                              resolve({
                                type: "deliveryCharge",
                                orderId,
                                newCharge: correctDeliveryCharge,
                                affectedRows: result.affectedRows,
                                changedRows: result.changedRows,
                                result,
                              });
                            },
                          );
                        }),
                      );
                    },
                  );

                  Object.entries(creditBalanceDeltaByUser).forEach(
                    ([userId, delta]) => {
                      if (delta === 0) return;
                      const numericUserId = Number(userId);

                      updatePromises.push(
                        new Promise((resolve, reject) => {
                          connection.query(
                            `UPDATE collection_officer.marketplaceusers SET creditBalance = creditBalance + ? WHERE id = ?`,
                            [delta, numericUserId],
                            (err, result) => {
                              if (err) {
                                console.error(
                                  `[creditBalance update] FAILED for userId ${numericUserId}, delta ${delta}:`,
                                  err.message,
                                );
                                return reject(err);
                              }
                              if (result.affectedRows === 0) {
                                console.warn(
                                  `[creditBalance update] ⚠️ No row matched for marketplaceusers.id = ${numericUserId} — creditBalance was NOT updated.`,
                                );
                              }
                              resolve({
                                type: "creditBalance",
                                userId: numericUserId,
                                delta,
                                affectedRows: result.affectedRows,
                                changedRows: result.changedRows,
                                result,
                              });
                            },
                          );
                        }),
                      );
                    },
                  );

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

                        const insertNotificationSql = `
                          INSERT INTO collection_officer.dashnotification (orderId, title, readStatus, createdAt)
                          VALUES ?
                        `;

                        const notificationValues = processOrderIds.map((id) => [
                          id,
                          "Order is Delivered",
                          0,
                          new Date(),
                        ]);

                        db.collectionofficer.query(
                          insertNotificationSql,
                          [notificationValues],
                          (errN) => {
                            if (errN) {
                              console.error(
                                "Error inserting dashnotification:",
                                errN.message,
                              );
                            }

                            // Insert customer-facing ordernotfication for "Order Delivered"
                            db.collectionofficer.query(
                              `SELECT id, invNo FROM collection_officer.processorders WHERE id IN (?)`,
                              [processOrderIds],
                              (errInv, invRows) => {
                                if (!errInv && invRows && invRows.length > 0) {
                                  const deliveredNotifValues = invRows.map((row) => [
                                    row.id,
                                    'Order Delivered',
                                    `Your order #${row.invNo}, has been successfully delivered. We hope you're happy with our service and had a great experience. Thank you for choosing us!`,
                                    0,
                                    new Date(),
                                  ]);
                                  db.collectionofficer.query(
                                    `INSERT INTO collection_officer.ordernotfication (orderId, Title, message, isRead, createdAt) VALUES ?`,
                                    [deliveredNotifValues],
                                    (errON) => {
                                      if (errON) {
                                        console.error('[saveSignatureAndUpdateStatusDAO] Failed to insert ordernotfication:', errON.message);
                                      }
                                    },
                                  );
                                } else if (errInv) {
                                  console.error('[saveSignatureAndUpdateStatusDAO] Failed to fetch invNo for ordernotfication:', errInv.message);
                                }
                              },
                            );

                            const statusUpdateResult = results.find(
                              (r) => r.type === "status",
                            )?.result;

                            const cashPaymentUpdateResult = results.find(
                              (r) => r.type === "cashPayment",
                            )?.result;

                            const payableUpdateResult = results.find(
                              (r) => r.type === "payable",
                            )?.result;

                            const creditBalanceUpdateResults = results
                              .filter((r) => r.type === "creditBalance")
                              .map((r) => ({
                                userId: r.userId,
                                delta: r.delta,
                                affectedRows: r.affectedRows,
                                changedRows: r.changedRows,
                              }));

                            const deliveryChargeUpdateResults = results
                              .filter((r) => r.type === "deliveryCharge")
                              .map((r) => ({
                                orderId: r.orderId,
                                newCharge: r.newCharge,
                                affectedRows: r.affectedRows,
                                changedRows: r.changedRows,
                              }));

                            const earnPriceUpdateResults = driverOrderIds.map(
                              (id) => ({
                                driverOrderId: Number(id),
                                earnPrice: earnPriceByDriverOrderId[id],
                              }),
                            );

                            resolve({
                              driverOrdersUpdated: result1.affectedRows,
                              processOrdersUpdated:
                                statusUpdateResult?.affectedRows || 0,
                              cashOrdersUpdated:
                                cashPaymentUpdateResult?.affectedRows || 0,
                              cardOrdersUpdated:
                                payableUpdateResult?.affectedRows || 0,
                              signatureUrl: signaturePath,
                              totalOrders: processOrderIds.length,
                              cashOrdersCount: cashOrders.length,
                              cashOrderBreakdown: cashOrderUpdates,
                              cardOrdersCount: cardOrders.length,

                              deliveryChargeCorrections:
                                cardDeliveryChargeCorrections,
                              creditBalanceUpdateResults,
                              deliveryChargeUpdateResults,
                              earnPriceUpdateResults,
                            });
                          },
                        );
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
            } catch (asyncErr) {
              connection.rollback(() => {
                connection.release();
              });
              console.error(
                "Error during delivery-charge/earnPrice reconciliation:",
                asyncErr,
              );
              reject(
                new Error(
                  `Failed to reconcile order updates: ${asyncErr.message}`,
                ),
              );
              return;
            }
          },
        );
      });
    });
  });
};
// Restart Journey DAO
exports.reStartJourneyDAO = async (driverId, orderIds) => {
  try {
    // Step 1: Get driverorders records for the given orderIds and driverId
    const [driverOrders] = await db.collectionofficer.promise().query(
      `SELECT do.id, do.orderId, do.drvStatus 
       FROM driverorders do
       INNER JOIN driverordermain dom ON do.drvOrderMainId = dom.id
       WHERE dom.driverId = ? AND do.orderId IN (?)`,
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
        order.drvStatus === "On the way" || order.drvStatus === "Arrived",
    );

    if (ongoingOrders.length > 0) {
      return {
        success: false,
        message: "Some orders are already in ongoing process",
        ongoingProcessOrderIds: ongoingOrders.map((order) => order.orderId),
      };
    }

    // Step 3: Update driverorders table - set drvStatus to "On the way"
    await db.collectionofficer.promise().query(
      `UPDATE driverorders 
       SET drvStatus = 'On the way'
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

    // Step 5: Update processorders table status to "On the way"

    await db.collectionofficer.promise().query(
      `UPDATE collection_officer.processorders 
       SET status = 'On the way'
       WHERE id IN (?)`,
      [validOrderIds],
    );

    // Insert customer-facing ordernotfication for "Order is On the Way Again"
    try {
      const [invNoRows] = await db.collectionofficer.promise().query(
        `SELECT id, invNo FROM collection_officer.processorders WHERE id IN (?)`,
        [validOrderIds],
      );
      if (invNoRows && invNoRows.length > 0) {
        const onTheWayAgainNotifValues = invNoRows.map((row) => [
          row.id,
          'Order is On the Way Again',
          `Your order #${row.invNo}, is back on the way to you. Our driver will deliver your order shortly.`,
          0,
          new Date(),
        ]);
        await db.collectionofficer.promise().query(
          `INSERT INTO collection_officer.ordernotfication (orderId, Title, message, isRead, createdAt) VALUES ?`,
          [onTheWayAgainNotifValues],
        );
      }
    } catch (notifErr) {
      console.error('[reStartJourneyDAO] Failed to insert ordernotfication:', notifErr.message);
    }

    return {
      success: true,
      message: `Successfully restarted journey for ${driverOrders.length} order(s)`,
      updatedOrders: driverOrders.map((order) => ({
        orderId: order.orderId,
        driverOrderId: order.id,
        drvStatus: "On the way",
      })),
    };
  } catch (error) {
    console.error("Error in reStartJourneyDAO:", error);
    throw error;
  }
};

// Get Distribution Center by ID
exports.getDistributedCenterById = async (centerId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT id, centerName, city, district, province, country, longitude, latitude
      FROM collection_officer.distributedcenter
      WHERE id = ?
      LIMIT 1
    `;
    db.collectionofficer.query(sql, [centerId], (err, results) => {
      if (err) {
        console.error(
          "Database error getting distribution centre:",
          err.message,
        );
        return reject(new Error("Failed to retrieve distribution centre"));
      }
      resolve(results.length > 0 ? results[0] : null);
    });
  });
};
