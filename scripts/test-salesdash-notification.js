require("dotenv").config();
const { triggerSalesDashNotification } = require("../services/salesdash-notification-service");

async function runTest() {
  console.log("=================================================");
  console.log("🧪 Testing Sales Dash Notification Socket Trigger");
  console.log("=================================================");
  console.log("Sales Dash API URL:", process.env.SALESDASH_API_URL || "https://dev.polygonagro.com/dash-api/agro-api/salesdash");
  console.log("Secret Token:", process.env.SALESDASH_TRIGGER_SECRET ? "Present" : "Missing");

  const testOrderId = process.argv[2] || 4283;

  console.log(`\nSending test notification for Order ID: ${testOrderId}...`);

  const success = await triggerSalesDashNotification({
    orderId: Number(testOrderId),
    title: "Order Delivered (Test from Govi Transport)",
    message: "This is a real-time socket test triggered from Govi Transport to Sales Dash.",
    eventType: "order_delivered",
    data: { test: true, timestamp: new Date().toISOString() },
    skipDbInsert: true,
  });

  if (success) {
    console.log("✅ Socket event successfully dispatched to Sales Dash API!");
  } else {
    console.log("❌ Failed to dispatch socket event to Sales Dash API.");
  }
  process.exit(0);
}

runTest();
