const orderDao = require("../dao/order-dao");
const homeDao = require("../dao/home-dao");
const asyncHandler = require("express-async-handler");
const http = require("http");
const https = require("https");
const uploadFileToS3 = require("../middlewares/s3upload");
const {
  assignDriverOrderSchema,
  startJourneySchema,
  saveSignatureSchema,
} = require("../validations/order-validation");

// Assign Driver Order
exports.assignDriverOrder = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  const { error } = assignDriverOrderSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      status: "error",
      message: error.details[0].message,
      errors: error.details.map((detail) => detail.message),
    });
  }

  const driverId = req.user.id;
  const { invNo } = req.body;

  try {
    const driverEmpId = await orderDao.GetDriverEmpId(driverId);
    const orderInfo = await orderDao.GetProcessOrderInfoByInvNo(invNo);
    const assignmentCheck = await orderDao.CheckOrderAlreadyAssigned(
      orderInfo.id,
      driverId,
    );

    if (assignmentCheck.isAssigned) {
      // Return specific error messages based on assignment
      if (assignmentCheck.assignedToSameDriver) {
        return res.status(409).json({
          status: "error",
          message: "This order is already in your target list.",
          driverEmpId: driverEmpId,
          currentStatus: orderInfo.status,  // ADDED
          invNo: orderInfo.invNo,           // ADDED
        });
      } else {
        return res.status(409).json({
          status: "error",
          message: `This order has already been collected by another officer (Officer ID: ${assignmentCheck.assignedDriverEmpId}).`,
          assignedDriverEmpId: assignmentCheck.assignedDriverEmpId,
          assignedDriverName: assignmentCheck.assignedDriverName,
          currentStatus: orderInfo.status,  // ADDED
          invNo: orderInfo.invNo,           // ADDED
        });
      }
    }

    if (orderInfo.status !== "Out For Delivery") {
      return res.status(400).json({
        status: "error",
        message:
          "Still processing this order. Scanning will be available after it's set to Out For Delivery.",
        currentStatus: orderInfo.status,
        invNo: orderInfo.invNo,
      });
    }

    const handOverTime = new Date();
    handOverTime.setHours(handOverTime.getHours() + 24);
    const result = await orderDao.SaveDriverOrder(
      driverId,
      orderInfo.id,
      handOverTime,
    );

    res.status(201).json({
      status: "success",
      message: "Order assigned successfully to your target list",
      data: {
        ...result,
        driverEmpId: driverEmpId,
        assignedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error assigning driver order:", error.message);

    // Determine appropriate status code
    let statusCode = 500;
    let errorMessage = error.message;

    if (error.message.includes("not found")) {
      statusCode = 404;
    } else if (
      error.message.includes("already assigned") ||
      error.message.includes("already in your target list") ||
      error.message.includes("already been collected")
    ) {
      statusCode = 409;
    } else if (error.message.includes("Unauthorized")) {
      statusCode = 401;
    } else if (error.message.includes("required")) {
      statusCode = 400;
    } else if (error.message.includes("Still processing")) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      status: "error",
      message: errorMessage,
    });
  }
});

// Get Driver Orders
exports.GetDriverOrders = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  const driverId = req.user.id;
  let { status, isHandOver, date } = req.query;

  try {
    // Get current date for logging
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // Only filter by isHandOver if explicitly provided (0 or 1)
    const handoverFilter =
      isHandOver !== undefined ? parseInt(isHandOver) : null;

    let statuses = [];
    if (status) {
      if (typeof status === "string") {
        statuses = status.split(",").map((s) => s.trim());
      } else if (Array.isArray(status)) {
        statuses = status;
      }

      statuses = statuses.map((s) => {
        const lower = s.toLowerCase();
        if (lower === "todo") return "Todo";
        if (lower === "completed") return "Completed";
        if (lower === "hold") return "Hold";
        if (lower === "return") return "Return";
        if (lower === "on the way") return "On the way";
        return s;
      });
    }

    // Use provided date or default to today
    let filterDate = date || todayStr;

    const orders = await orderDao.getDriverOrdersDAO(
      driverId,
      statuses,
      handoverFilter,
      filterDate,
    );

    res.status(200).json({
      status: "success",
      data: {
        orders,
        totalOrders: orders.length,
      },
    });
  } catch (error) {
    console.error("Error fetching driver orders:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch orders",
    });
  }
});

// Get Order User Details
exports.GetOrderUserDetails = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  const driverId = req.user.id;
  const { orderIds } = req.query;

  try {
    // Validate orderIds parameter
    if (!orderIds) {
      return res.status(400).json({
        status: "error",
        message: "orderIds parameter is required",
      });
    }

    // Convert comma-separated string to array
    let orderIdArray = [];
    if (typeof orderIds === "string") {
      orderIdArray = orderIds
        .split(",")
        .map((id) => parseInt(id.trim()))
        .filter((id) => !isNaN(id));
    } else if (Array.isArray(orderIds)) {
      orderIdArray = orderIds
        .map((id) => parseInt(id))
        .filter((id) => !isNaN(id));
    }

    if (orderIdArray.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Valid order IDs are required",
      });
    }

    // Fetch user and order details
    const result = await orderDao.getOrderUserDetailsDAO(
      driverId,
      orderIdArray,
    );

    if (!result || !result.user) {
      return res.status(404).json({
        status: "error",
        message: "No user or orders found",
      });
    }

    res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    console.error("Error fetching order user details:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch order details",
    });
  }
});

// Start Journey
exports.StartJourney = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    const response = {
      status: "error",
      message: "Unauthorized: User authentication required",
    };

    return res.status(401).json(response);
  }

  const { error } = startJourneySchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      status: "error",
      message: error.details[0].message,
      errors: error.details.map((detail) => detail.message),
    });
  }

  const driverId = req.user.id;
  const { orderIds } = req.body;

  try {

    // Convert to array
    let orderIdArray = [];
    if (typeof orderIds === "string") {
      orderIdArray = orderIds
        .split(",")
        .map((id) => parseInt(id.trim()))
        .filter((id) => !isNaN(id));
    } else if (Array.isArray(orderIds)) {
      orderIdArray = orderIds
        .map((id) => parseInt(id))
        .filter((id) => !isNaN(id));
    }

    if (orderIdArray.length === 0) {
      const response = {
        status: "error",
        message: "Valid order IDs are required",
      };

      return res.status(400).json(response);
    }

    // Start the journey
    const result = await orderDao.startJourneyDAO(driverId, orderIdArray);

    if (result.success) {
      const response = {
        status: "success",
        message: result.message,
        data: {
          updatedOrders: result.updatedOrders,
        },
      };

      return res.status(200).json(response);
    } else {
      const response = {
        status: "error",
        message: result.message,
        ongoingProcessOrderIds: result.ongoingProcessOrderIds || [],
      };

      return res.status(400).json(response);
    }
  } catch (error) {
    console.error("Error starting journey:", error);
    const response = {
      status: "error",
      message: "Failed to start journey",
    };

    return res.status(500).json(response);
  }
});

// Save Signature
exports.saveSignature = asyncHandler(async (req, res) => {
  try {
    // Get driver ID from token
    const driverId = req.user.id;

    if (!driverId) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized: Driver authentication required",
      });
    }

    const { error } = saveSignatureSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        status: "error",
        message: error.details[0].message,
        errors: error.details.map((detail) => detail.message),
      });
    }

    // Get process order IDs from request body
    const { processOrderIds, latitude, longitude } = req.body;

    // Check if signature file is uploaded
    if (!req.file) {
      return res.status(400).json({
        status: "error",
        message: "Signature image is required",
      });
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        status: "error",
        message: "Only JPEG, JPG, and PNG images are allowed",
      });
    }

    // Parse & validate GPS coordinates
    const parsedLatitude = parseCoordinate(latitude, -90, 90);
    const parsedLongitude = parseCoordinate(longitude, -180, 180);

    if ((latitude || longitude) && (parsedLatitude === null || parsedLongitude === null)) {
      console.warn(
        "[save-signature] Received latitude/longitude but failed validation:",
        { latitude, longitude, parsedLatitude, parsedLongitude },
      );
    }

    // Verify driver has access to these orders
    const verification = await orderDao.verifyDriverAccessToOrdersDAO(
      driverId,
      processOrderIds,
    );

    if (!verification.hasAccess) {
      return res.status(403).json({
        status: "error",
        message: `You don't have access to all requested orders. Accessible: ${verification.accessibleCount}/${verification.totalRequested}`,
      });
    }

    // Upload signature image to S3/R2
    const signatureUrl = await uploadFileToS3(
      req.file.buffer,
      req.file.originalname,
      "signatures",
    );

    // Save signature and update order statuses
    const result = await orderDao.saveSignatureAndUpdateStatusDAO(
      processOrderIds,
      signatureUrl,
      driverId,
      parsedLatitude,
      parsedLongitude,
    );

    res.status(200).json({
      status: "success",
      message: "Signature saved and orders marked as delivered successfully",
      data: {
        signatureUrl: result.signatureUrl,
        driverOrdersUpdated: result.driverOrdersUpdated,
        processOrdersUpdated: result.processOrdersUpdated,
        updatedOrders: result.updatedOrders,
        deliveryChargeCorrections: result.deliveryChargeCorrections,
        creditBalanceUpdateResults: result.creditBalanceUpdateResults,
        deliveryChargeUpdateResults: result.deliveryChargeUpdateResults,
        deliveredLatitude: parsedLatitude,
        deliveredLongitude: parsedLongitude,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error in saveSignature endpoint:", error);
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to save signature and update orders",
    });
  }
});

// Returns a finite number within [min, max], or null if the input is
// missing/empty/non-numeric/out of range. Never throws.
function parseCoordinate(value, min, max) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < min || num > max) return null;
  return num;
}

//Re start Journey
exports.ReStartJourney = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    const response = {
      status: "error",
      message: "Unauthorized: User authentication required",
    };

    return res.status(401).json(response);
  }

  const { error } = startJourneySchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      status: "error",
      message: error.details[0].message,
      errors: error.details.map((detail) => detail.message),
    });
  }

  const driverId = req.user.id;
  const { orderIds } = req.body;

  try {

    // Convert to array
    let orderIdArray = [];
    if (typeof orderIds === "string") {
      orderIdArray = orderIds
        .split(",")
        .map((id) => parseInt(id.trim()))
        .filter((id) => !isNaN(id));
    } else if (Array.isArray(orderIds)) {
      orderIdArray = orderIds
        .map((id) => parseInt(id))
        .filter((id) => !isNaN(id));
    }

    if (orderIdArray.length === 0) {
      const response = {
        status: "error",
        message: "Valid order IDs are required",
      };

      return res.status(400).json(response);
    }

    // Start the journey
    const result = await orderDao.reStartJourneyDAO(driverId, orderIdArray);

    if (result.success) {
      const response = {
        status: "success",
        message: result.message,
        data: {
          updatedOrders: result.updatedOrders,
        },
      };

      return res.status(200).json(response);
    } else {
      const response = {
        status: "error",
        message: result.message,
        ongoingProcessOrderIds: result.ongoingProcessOrderIds || [],
      };

      return res.status(400).json(response);
    }
  } catch (error) {
    console.error("Error starting journey:", error);
    const response = {
      status: "error",
      message: "Failed to start journey",
    };

    return res.status(500).json(response);
  }
});

// Get Optimized Route
exports.GetOptimizedRoute = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: User authentication required",
    });
  }

  const driverId = req.user.id;

  try {
    // 1. Get driver's distributed center ID
    const driverCentre = await homeDao.getDriverDistributedCenter(driverId);

    if (!driverCentre || !driverCentre.distributedCenterId) {
      console.warn(`[GetOptimizedRoute] Driver ${driverId} has no distribution centre assigned.`);
      return res.status(404).json({
        status: "error",
        message: "Driver distribution centre not found",
      });
    }

    // 2. Get distribution centre details (lat, lng)
    const centre = await orderDao.getDistributedCenterById(
      driverCentre.distributedCenterId,
    );

    if (!centre || !centre.latitude || !centre.longitude) {
      console.warn(`[GetOptimizedRoute] Distribution centre ${driverCentre.distributedCenterId} missing coordinates.`);
      return res.status(404).json({
        status: "error",
        message: "Distribution centre coordinates not found",
      });
    }

    console.log(`[GetOptimizedRoute] Driver ID: ${driverId}, Distribution Center ID: ${driverCentre.distributedCenterId}`);
    console.log(`[GetOptimizedRoute] Distribution Center: "${centre.centerName}", Lat: ${centre.latitude}, Lng: ${centre.longitude}`);

    // 3. Get all Todo/Hold/On the way orders with lat/lng
    const statuses = ["Todo", "Hold", "On the way"];
    const orders = await orderDao.getDriverOrdersDAO(
      driverId,
      statuses,
      0, // isHandOver = 0
      null,
    );

    console.log(`[GetOptimizedRoute] Total orders fetched from DB: ${orders.length}`);

    // Filter orders that have valid coordinates
    const deliveries = orders
      .filter((order) => {
        const hasCoords = order.latitude !== null && order.latitude !== undefined &&
          order.longitude !== null && order.longitude !== undefined;
        if (!hasCoords) {
          console.warn(`[GetOptimizedRoute] Order ID ${order.driverOrderId} missing coordinates (lat: ${order.latitude}, lng: ${order.longitude})`);
        }
        return hasCoords;
      })
      .map((order) => ({
        name: order.fullName || "Delivery",
        lat: parseFloat(order.latitude),
        lng: parseFloat(order.longitude),
        demand: 0,
        driverOrderId: order.driverOrderId,
        allDriverOrderIds: order.allDriverOrderIds,
        allProcessOrderIds: order.allProcessOrderIds,
        drvStatus: order.drvStatus,
      }));

    console.log(`[GetOptimizedRoute] Valid deliveries with coordinates: ${deliveries.length}`);

    if (deliveries.length === 0) {
      console.warn("[GetOptimizedRoute] No valid deliveries with coordinates found.");
      return res.status(200).json({
        status: "success",
        message: "No orders with coordinates found for optimization",
        data: {
          distributionCenter: {
            id: centre.id,
            name: centre.centerName,
            latitude: centre.latitude,
            longitude: centre.longitude,
          },
          optimizedRoute: null,
          orders: orders,
        },
      });
    }

    // 4. Call the route optimization API
    const routeApiUrl = process.env.ROUTE_OPTIMIZATION_API_URL;

    if (!routeApiUrl) {
      console.warn("[GetOptimizedRoute] ROUTE_OPTIMIZATION_API_URL is not configured in .env");
      // Fallback: return orders without optimization
      return res.status(200).json({
        status: "success",
        message: "Route optimization API URL not configured, returning unoptimized orders",
        data: {
          distributionCenter: {
            id: centre.id,
            name: centre.centerName,
            latitude: centre.latitude,
            longitude: centre.longitude,
          },
          optimizedRoute: null,
          orders: orders,
        },
      });
    }

    const routeRequestBody = {
      distribution_center: {
        name: centre.centerName || "Distribution Center",
        lat: parseFloat(centre.latitude),
        lng: parseFloat(centre.longitude),
        demand: 0,
      },
      deliveries: deliveries.map((d) => ({
        name: `ID_${d.driverOrderId}_${d.name}`,
        lat: d.lat,
        lng: d.lng,
        demand: 0,
      })),
      distance_source: "osrm",
      google_api_key: "",
    };

    console.log(`[GetOptimizedRoute] Sending POST payload to ${routeApiUrl}:`);
    console.log(JSON.stringify(routeRequestBody, null, 2));

    const routeResponseData = await httpPost(routeApiUrl, routeRequestBody, 30000);

    console.log(`[GetOptimizedRoute] Optimization API Response Status: ${routeResponseData.status}`);
    console.log(`[GetOptimizedRoute] Routing Type: ${routeResponseData.routing_type}, Algorithm: ${routeResponseData.algorithm}`);
    console.log(`[GetOptimizedRoute] Total Distance: ${routeResponseData.total_distance_meters} meters, Total Stops: ${routeResponseData.stops ? routeResponseData.stops.length : 0}`);


    // 5. Map the optimized route back to orders
    const optimizedStops = routeResponseData.stops || [];

    // Match optimized stops to orders by driverOrderId in name, or by coordinates as fallback
    const optimizedOrders = optimizedStops
      .filter((stop) => stop.order > 0) // Skip the distribution centre (order 0)
      .map((stop) => {
        let matchingDelivery = null;

        // Try extracting driverOrderId from stop.name (formatted as ID_<driverOrderId>_<name>)
        const match = stop.name ? stop.name.match(/^ID_(\d+)_/) : null;
        if (match) {
          const targetDriverOrderId = parseInt(match[1], 10);
          matchingDelivery = deliveries.find(
            (d) => d.driverOrderId === targetDriverOrderId,
          );
        }

        // Fallback to coordinate matching if ID matching did not return a match
        if (!matchingDelivery) {
          matchingDelivery = deliveries.find(
            (d) =>
              Math.abs(d.lat - stop.lat) < 0.0001 &&
              Math.abs(d.lng - stop.lng) < 0.0001,
          );
        }

        // Find the original order
        const originalOrder = matchingDelivery
          ? orders.find(
            (o) => o.driverOrderId === matchingDelivery.driverOrderId,
          )
          : null;

        return {
          routeOrder: stop.order,
          name: stop.name,
          lat: stop.lat,
          lng: stop.lng,
          legDistanceMeters: stop.leg_distance_meters,
          cumulativeDistanceMeters: stop.cumulative_distance_meters,
          driverOrderId: matchingDelivery
            ? matchingDelivery.driverOrderId
            : null,
          allDriverOrderIds: matchingDelivery
            ? matchingDelivery.allDriverOrderIds
            : [],
          allProcessOrderIds: matchingDelivery
            ? matchingDelivery.allProcessOrderIds
            : [],
          drvStatus: matchingDelivery ? matchingDelivery.drvStatus : null,
          orderData: originalOrder || null,
        };
      });

    res.status(200).json({
      status: "success",
      data: {
        distributionCenter: {
          id: centre.id,
          name: centre.centerName,
          latitude: centre.latitude,
          longitude: centre.longitude,
        },
        optimizedRoute: {
          routingType: routeResponseData.routing_type,
          algorithm: routeResponseData.algorithm,
          totalDistanceMeters: routeResponseData.total_distance_meters,
          stops: optimizedStops,
        },
        optimizedOrders: optimizedOrders,
        totalOrders: orders.length,
        optimizedCount: optimizedOrders.length,
      },
    });
  } catch (error) {
    console.error("Error getting optimized route:", error.message);

    // If the route optimization API fails, return orders without optimization
    if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
      try {
        const statuses = ["Todo", "Hold", "On the way"];
        const orders = await orderDao.getDriverOrdersDAO(
          driverId,
          statuses,
          0,
          null,
        );

        return res.status(200).json({
          status: "success",
          message:
            "Route optimization service unavailable, returning default order",
          data: {
            optimizedRoute: null,
            orders: orders,
            totalOrders: orders.length,
          },
        });
      } catch (fallbackError) {
        console.error("Fallback also failed:", fallbackError);
      }
    }

    res.status(500).json({
      status: "error",
      message: "Failed to get optimized route",
    });
  }
});

// Helper function for HTTP/HTTPS POST JSON request without external dependencies
function httpPost(urlStr, data, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr);
      const postData = JSON.stringify(data);
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
          Accept: "application/json",
        },
        timeout: timeoutMs,
      };

      const client = url.protocol === "https:" ? https : http;
      const req = client.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const parsed = JSON.parse(body);
              resolve(parsed);
            } else {
              reject(new Error(`HTTP request failed with status ${res.statusCode}: ${body}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse JSON response: ${e.message}`));
          }
        });
      });

      req.on("error", (err) => {
        reject(err);
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("HTTP request timed out"));
      });

      req.write(postData);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

