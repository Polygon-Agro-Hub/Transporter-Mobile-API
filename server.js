const http = require("http");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();
const {
  plantcare,
  collectionofficer,
  admin,
} = require("./startup/database");
const { initSocket } = require("./socket/socket");

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = initSocket(server);

// Base path for the API
const BASE_PATH = "/transporter";

// CORS configuration
const corsOptions = {
  origin: process.env.CLIENT_ORIGIN || "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
};

// Middleware
app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));

// Function to check database connection
const DatabaseConnection = (db, name) => {
  db.getConnection((err, connection) => {
    if (err) {
      console.error(`Error getting connection from ${name}:`, err);
    } else {
      connection.ping((err) => {
        if (err) {
          console.error(`Error pinging ${name} database:`, err);
        } else {
          console.log(`✅ Ping to ${name} database successful.`);
        }
        connection.release();
      });
    }
  });
};

// Initial database connections
DatabaseConnection(plantcare, "PlantCare");
DatabaseConnection(collectionofficer, "CollectionOfficer");
DatabaseConnection(admin, "Admin");

// Setup routes
const userroute = require("./routes/userAuth-routes");
const complainroute = require("./routes/complain-routes");
const orderroute = require("./routes/order-routes");
const returnrote = require("./routes/return-routes");
const holdroute = require("./routes/hold-routes");
const homeroute = require("./routes/home-routes");
const healthroute = require("./routes/health-routes");
const loadroute = require("./routes/load-routes");
const setupSwagger = require("./startup/swagger");

// Setup Swagger UI
setupSwagger(app, BASE_PATH);

// Routes
app.use(`${BASE_PATH}/api/auth`, userroute);
app.use(`${BASE_PATH}/api/complain`, complainroute);
app.use(`${BASE_PATH}/api/order`, orderroute);
app.use(`${BASE_PATH}/api/return`, returnrote);
app.use(`${BASE_PATH}/api/hold`, holdroute);
app.use(`${BASE_PATH}/api/home`, homeroute);
app.use(`${BASE_PATH}/api/load`, loadroute);
app.use(`${BASE_PATH}`, healthroute);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!!");
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔌 Socket.IO initialized`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`📍 Base Path: ${BASE_PATH}`);
  console.log(`💓 Health Check URL: ${BASE_PATH}/health`);
});

app.server = server;
app.io = io;
module.exports = app;
