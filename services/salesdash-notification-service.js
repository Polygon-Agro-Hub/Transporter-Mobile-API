const axios = require("axios");

/**
 * Service to notify Sales Dash Mobile API over HTTP webhook.
 * This triggers real-time Socket.IO events (newNotification, new_notification)
 * and Firebase FCM / Expo Push Notifications to the assigned Sales Agent (Zero Polling).
 */

const getSalesDashBaseUrl = () => {
  const url =
    process.env.SALESDASH_API_URL ||
    "https://dev.polygonagro.com/dash-api/agro-api/salesdash";
  return url.replace(/\/+$/, "");
};

const { SALESDASH_TRIGGER_SECRET } = require("../constants/notification-secrets");

const getServiceHeaders = () => {
  const secret = SALESDASH_TRIGGER_SECRET;
  const headers = {
    "Content-Type": "application/json",
  };
  if (secret) {
    headers["x-service-token"] = secret;
    headers["Authorization"] = `Bearer ${secret}`;
  }
  return headers;
};

/**
 * Resolves assigned salesAgent ID for an order directly from DB.
 * Returns null if the order belongs to a direct/retail customer without a sales agent.
 */
const resolveSalesAgentId = async (orderId) => {
  try {
    const db = require("../startup/database");
    const [rows] = await db.collectionofficer.promise().query(
      `SELECT mps.salesAgent 
       FROM collection_officer.processorders po 
       JOIN collection_officer.orders o ON po.orderId = o.id 
       JOIN collection_officer.marketplaceusers mps ON o.userId = mps.id 
       WHERE po.id = ? OR po.orderId = ? OR o.id = ?
       ORDER BY (po.id = ?) DESC
       LIMIT 1`,
      [orderId, orderId, orderId, orderId]
    );
    if (rows && rows.length > 0 && rows[0].salesAgent) {
      return rows[0].salesAgent;
    }
  } catch (err) {
    console.warn("[SalesDash Notification] DB resolveSalesAgentId error:", err.message);
  }
  return null;
};

/**
 * Dispatches a notification to Sales Agent via Sales Dash API webhook.
 * Non-blocking: will never crash or block the caller if Sales Dash API is slow or unreachable.
 */
const triggerSalesDashNotification = async ({
  orderId,
  title,
  message,
  eventType,
  data = {},
  skipDbInsert = true,
}) => {
  if (!orderId) {
    console.warn("[SalesDash Notification] orderId is required to trigger notification.");
    return false;
  }

  // Pre-resolve sales agent to avoid notifying unassigned orders
  let salesAgentId = data?.salesAgentId;
  if (!salesAgentId) {
    salesAgentId = await resolveSalesAgentId(orderId);
  }

  if (!salesAgentId) {
    console.log(
      `ℹ️ [SalesDash Notification] Order ${orderId} is not assigned to any Sales Agent. Skipping.`
    );
    return true;
  }

  const salesDashBase = getSalesDashBaseUrl();
  const url = `${salesDashBase}/api/notifications/trigger`;

  try {
    const payload = {
      orderId,
      salesAgentId,
      title,
      message,
      eventType,
      data,
      skipDbInsert,
    };

    const response = await axios.post(url, payload, {
      timeout: 5000,
      headers: getServiceHeaders(),
    });

    console.log(
      `📢 [SalesDash Socket] Dispatched "${title}" to Sales Agent ${salesAgentId} for order ${orderId} (Status: ${response.status})`
    );
    return true;
  } catch (err) {
    console.warn(
      `⚠️ [SalesDash Socket] Could not dispatch notification to Sales Dash API (${url}) for order ${orderId}:`,
      err.response?.data?.message || err.message
    );
    return false;
  }
};

/**
 * Driver accepts / collects order
 */
const notifySalesDashOrderCollected = async (processOrderId, invNo) => {
  return triggerSalesDashNotification({
    orderId: processOrderId,
    title: "Order Collected by Driver",
    message: `Order #${invNo} has been assigned and collected by the transport driver.`,
    eventType: "order_collected",
    data: { processOrderId, invNo },
    skipDbInsert: true,
  });
};

/**
 * Driver starts delivery journey
 */
const notifySalesDashOrderOnTheWay = async (processOrderId, invNo) => {
  return triggerSalesDashNotification({
    orderId: processOrderId,
    title: "Order is On the Way",
    message: `Order #${invNo} is now out for delivery with the transport driver.`,
    eventType: "order_on_the_way",
    data: { processOrderId, invNo },
    skipDbInsert: true,
  });
};

/**
 * Driver restarts delivery journey from Hold
 */
const notifySalesDashOrderOnTheWayAgain = async (processOrderId, invNo) => {
  return triggerSalesDashNotification({
    orderId: processOrderId,
    title: "Order is On the Way Again",
    message: `Order #${invNo} is back on the way for delivery.`,
    eventType: "order_on_the_way_again",
    data: { processOrderId, invNo },
    skipDbInsert: true,
  });
};

/**
 * Driver marks order as Delivered with signature
 */
const notifySalesDashOrderDelivered = async (processOrderId, invNo) => {
  return triggerSalesDashNotification({
    orderId: processOrderId,
    title: "Order Delivered",
    message: `Order #${invNo} has been successfully delivered and signed by the customer.`,
    eventType: "order_delivered",
    data: { processOrderId, invNo },
    skipDbInsert: true,
  });
};

/**
 * Driver marks order as Hold
 */
const notifySalesDashOrderOnHold = async (processOrderId, invNo, reasonText = "") => {
  const reasonSuffix = reasonText ? ` Reason: ${reasonText}` : "";
  return triggerSalesDashNotification({
    orderId: processOrderId,
    title: "Order Delivery on Hold",
    message: `Delivery attempt for order #${invNo} was put on hold.${reasonSuffix}`,
    eventType: "order_hold",
    data: { processOrderId, invNo, reason: reasonText },
    skipDbInsert: true,
  });
};

/**
 * Driver marks order as Return
 */
const notifySalesDashOrderReturned = async (processOrderId, invNo, reasonText = "") => {
  const reasonSuffix = reasonText ? ` Reason: ${reasonText}` : "";
  return triggerSalesDashNotification({
    orderId: processOrderId,
    title: "Order Returned",
    message: `Order #${invNo} could not be delivered and has been returned.${reasonSuffix}`,
    eventType: "order_returned",
    data: { processOrderId, invNo, reason: reasonText },
    skipDbInsert: true,
  });
};

module.exports = {
  triggerSalesDashNotification,
  notifySalesDashOrderCollected,
  notifySalesDashOrderOnTheWay,
  notifySalesDashOrderOnTheWayAgain,
  notifySalesDashOrderDelivered,
  notifySalesDashOrderOnHold,
  notifySalesDashOrderReturned,
};
