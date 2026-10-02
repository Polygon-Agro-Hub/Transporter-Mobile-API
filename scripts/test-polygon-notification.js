require("dotenv").config();
const { triggerPolygonNotification } = require("../services/polygon-notification-service");

async function runTest() {
  console.log("=================================================");
  console.log("🧪 Testing Polygon Notification Socket Trigger");
  console.log("=================================================");
  console.log("Polygon API URL:", process.env.POLYGON_API_URL || "https://dev-mob-api.polygon.lk/polygon");
  console.log("Secret Token:", process.env.POLYGON_TRIGGER_SECRET ? "Present" : "Missing");

  // Test with orderId or mock
  const testOrderId = process.argv[2] || 1;

  console.log(`\nSending test notification for Order ID: ${testOrderId}...`);

  const success = await triggerPolygonNotification({
    orderId: Number(testOrderId),
    title: "Order Delivered (Test from Govi Transport)",
    message: "This is a real-time socket test triggered from Govi Transport.",
    eventType: "order_delivered",
    data: { test: true, timestamp: new Date().toISOString() },
    skipDbInsert: true,
  });

  if (success) {
    console.log("✅ Socket event successfully dispatched to Polygon API!");
  } else {
    console.log("❌ Failed to dispatch socket event to Polygon API.");
  }
  process.exit(0);
}

runTest();
