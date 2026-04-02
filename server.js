const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();

const {
  plantcare,
  collectionofficer,
  marketPlace,
  admin,
} = require("./startup/database");

const setupSwagger = require("./startup/swagger");

const app = express();

// Base path
const BASE_PATH = "/transporter";

// Middleware
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
}));

app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

// Database check
const DatabaseConnection = (db, name) => {
  db.getConnection((err, connection) => {
    if (err) {
      console.error(`❌ Error connecting to ${name}:`, err);
    } else {
      connection.ping((err) => {
        if (err) {
          console.error(`❌ Error pinging ${name}:`, err);
        } else {
          console.log(`✅ ${name} DB connected`);
        }
        connection.release();
      });
    }
  });
};

// Initial DB connections
DatabaseConnection(plantcare, "PlantCare");
DatabaseConnection(collectionofficer, "CollectionOfficer");
DatabaseConnection(marketPlace, "MarketPlace");
DatabaseConnection(admin, "Admin");

// Swagger (VERY IMPORTANT: before routes)
setupSwagger(app, BASE_PATH);

// Routes
app.use(`${BASE_PATH}/api/auth`, require("./routes/userAuth-routes"));
app.use(`${BASE_PATH}/api/complain`, require("./routes/complain-routes"));
app.use(`${BASE_PATH}/api/order`, require("./routes/order-routes"));
app.use(`${BASE_PATH}/api/return`, require("./routes/return-routes"));
app.use(`${BASE_PATH}/api/hold`, require("./routes/hold-routes"));
app.use(`${BASE_PATH}/api/home`, require("./routes/home-routes"));
app.use(`${BASE_PATH}`, require("./routes/health-routes"));

// Error handler
app.use((err, req, res, next) => {
  console.error("🔥 Server Error:", err);
  res.status(500).json({ message: "Something went wrong" });
});

// Start server (for local)
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Base Path: ${BASE_PATH}`);
    console.log(`📄 Swagger: http://localhost:${PORT}${BASE_PATH}/api-docs/`);
  });
}

// Export for Vercel
module.exports = app;