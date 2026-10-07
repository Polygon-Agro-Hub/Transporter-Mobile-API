const axios = require("axios");

/**
 * Service to notify Polygon Mobile API over HTTP webhook.
 * This triggers real-time Socket.IO events (new_notification, notification_unread_count)
 * and Firebase Push Notifications directly to the customer's mobile device (Zero Polling).
 */

const getPolygonBaseUrl = () => {
  const url = process.env.POLYGON_API_URL || "https://dev-mob-api.polygon.lk/polygon";
  return url.replace(/\/+$/, "");
};

const { POLYGON_TRIGGER_SECRET } = require("../constants/notification-secrets");

const getServiceHeaders = () => {
  const secret = POLYGON_TRIGGER_SECRET;
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
 * Dispatches a notification to Polygon customer via Polygon API webhook.
 * Non-blocking: will never crash or block the caller if Polygon API is slow or unreachable.
 */
const triggerPolygonNotification = async ({
  orderId,
  title,
  message,
  eventType,
  data = {},
  skipDbInsert = true,
}) => {
  if (!orderId) {
    console.warn("[Polygon Notification] orderId is required to trigger notification.");
    return false;
  }

  const polygonBase = getPolygonBaseUrl();
  const url = `${polygonBase}/api/notification/trigger`;

  try {
    const payload = {
      orderId,
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
      `📢 [Polygon Socket] Dispatched "${title}" for order ${orderId} (Status: ${response.status})`
    );
    return true;
  } catch (err) {
    console.warn(
      `⚠️ [Polygon Socket] Could not dispatch notification to Polygon API (${url}) for order ${orderId}:`,
      err.response?.data?.message || err.message
    );
    return false;
  }
};

/**
 * Driver accepts / collects order
 */
const notifyOrderCollected = async (processOrderId, invNo) => {
  return triggerPolygonNotification({
    orderId: processOrderId,
    title: "Order Collected by Driver",
    message: `Your order #${invNo}, has been collected by our driver.`,
    eventType: "order_collected",
    data: { processOrderId, invNo },
    skipDbInsert: true,
  });
};

/**
 * Driver starts delivery journey
 */
const notifyOrderOnTheWay = async (processOrderId, invNo) => {
  return triggerPolygonNotification({
    orderId: processOrderId,
    title: "Order is On the Way",
    message: `Your order #${invNo}, is on the way! Our driver has started the journey and will deliver your order soon.`,
    eventType: "order_on_the_way",
    data: { processOrderId, invNo },
    skipDbInsert: true,
  });
};

/**
 * Driver restarts delivery journey from Hold
 */
const notifyOrderOnTheWayAgain = async (processOrderId, invNo) => {
  return triggerPolygonNotification({
    orderId: processOrderId,
    title: "Order is On the Way Again",
    message: `Your order #${invNo}, is back on the way to you. Our driver will deliver your order shortly.`,
    eventType: "order_on_the_way_again",
    data: { processOrderId, invNo },
    skipDbInsert: true,
  });
};

/**
 * Driver marks order as Delivered with signature
 */
const notifyOrderDelivered = async (processOrderId, invNo) => {
  return triggerPolygonNotification({
    orderId: processOrderId,
    title: "Order Delivered",
    message: `Your order #${invNo}, has been successfully delivered. We hope you're happy with our service and had a great experience. Thank you for choosing us!`,
    eventType: "order_delivered",
    data: { processOrderId, invNo },
    skipDbInsert: true,
  });
};

/**
 * Driver marks order as Hold
 */
const notifyOrderOnHold = async (processOrderId, invNo, reasonText = "") => {
  const reasonSuffix = reasonText ? ` Reason : “${reasonText}”` : "";
  return triggerPolygonNotification({
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
const notifyOrderReturned = async (processOrderId, invNo, reasonText = "") => {
  const reasonSuffix = reasonText ? ` Reason : “${reasonText}”` : "";
  return triggerPolygonNotification({
    orderId: processOrderId,
    title: "Order Returned",
    message: `Your order #${invNo} could not be delivered and has been returned.${reasonSuffix}`,
    eventType: "order_returned",
    data: { processOrderId, invNo, reason: reasonText },
    skipDbInsert: true,
  });
};

module.exports = {
  triggerPolygonNotification,
  notifyOrderCollected,
  notifyOrderOnTheWay,
  notifyOrderOnTheWayAgain,
  notifyOrderDelivered,
  notifyOrderOnHold,
  notifyOrderReturned,
};
