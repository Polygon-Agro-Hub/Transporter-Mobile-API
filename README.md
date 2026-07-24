# GoVi Transport — Backend REST API

Welcome to the backend service for **GoVi Transport**, a serverless-ready Node.js REST API designed to power the driver mobile application. This system manages logistics workflows, order scanning, journeys tracking, proof of delivery (POD), cash handovers, and driver complaints.

Developed and maintained by **Polygon Holdings Private Limited**.

---

## 🚀 Features

*   **Authentication & Session Management**: Driver login (`empId` and password), profile management, and automatic credentials validation.
*   **Order Operations**: Assign driver orders via QR/Invoice scanning, status management (Todo, On the way, Hold, Completed, Return), and user detail extraction.
*   **Logistics Workflows**: Journey starting/restarting, hold order reason submission, return order flow, and return package check-in.
*   **Object Storage**: Uploading client digital signature images (POD) and driver profile images directly to Cloudflare R2 using AWS S3 clients.
*   **Cash Handover Verification**: Reconciliation of collected Cash on Delivery (COD) amounts via DCM (Distribution Centre Manager) QR validations.
*   **Health & Liveness checks**: Detailed system info (RAM, CPU average) and multi-database connection status probes.
*   **Interactive Documentation**: Real-time Swagger OpenAPI 3.0 workspace exposed directly on the backend.

---

## 🛠️ Technology Stack

*   **Runtime Environment**: Node.js
*   **Web Framework**: Express.js (v5.1.0)
*   **Database Integration**: MySQL (`mysql2` connection pooling)
*   **Object Storage**: Cloudflare R2 (`@aws-sdk/client-s3`)
*   **Payload Validation**: Joi
*   **API Specs**: Swagger-UI-Express and Swagger-JSDoc
*   **Testing**: Jest and Supertest (for endpoint mocking and performance testing)

---

## 📁 Project Structure

```
Transporter-Mobile-API/
├── api/                  # Vercel Serverless Function entrypoint
├── endpoint/             # Controller Layer (Express req/res handlers)
├── dao/                  # Data Access Object Layer (SQL queries)
├── middlewares/          # Custom Middlewares (JWT auth, Multer upload, s3 client)
├── routes/               # Express Route Definitions
├── startup/              # App startups (database pools, Swagger configs)
├── validations/          # Joi schemas for payload validations
├── tests/                # Jest test files (endpoint & performance)
├── .env                  # Environment Variables (ignored in Git)
├── server.js             # Express application main entry point
└── package.json          # Package manifest
```

---

## ⚙️ Getting Started

### 1. Pre-requisites
Ensure you have the following installed on your machine:
*   [Node.js](https://nodejs.org/) (v16 or higher recommended)
*   Access to a running MySQL instance (Railway, local, etc.)

### 2. Installation
Clone the repository and install the dependencies:
```bash
npm install
```

### 3. Environment Setup
Create a `.env` file in the root of the `Transporter-Mobile-API` directory. Follow this template:

```env
# JWT CONFIGURATION
JWT_SECRET=your_jwt_secret_key

# DATABASE NAMES
DB_NAME_PC=plant_care
DB_NAME_CO=collection_officer
DB_NAME_MP=market_place
DB_NAME_AD=agro_world_admin

# DATABASE CONFIGURATION
DB_HOST=your_database_host
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_PORT=your_database_port

# CLOUDFLARE R2 ACCOUNT DETAILS
R2_ACCOUNT_ID=your_cloudflare_r2_account_id
R2_BUCKET_NAME=your_r2_bucket_name
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_ENDPOINT=your_r2_public_endpoint_url
```

### 4. Running the Server

#### Development Mode (with Nodemon):
```bash
npm run dev
```

#### Production Mode:
```bash
npm start
```
By default, the server runs on `http://localhost:3000/transporter`.

---

## 📚 API Documentation

Interactive API documentation is generated using Swagger. Once the backend server is running, you can access the Swagger UI in your browser at:

👉 [http://localhost:3000/transporter/api-docs](http://localhost:3000/transporter/api-docs)

The documentation lists all available endpoints, required payloads, headers, query parameters, security requirements (Bearer JWT), and standard error status responses.

---

## 🧪 Testing

The project uses Jest for unit, endpoint, and performance testing.

*   To run the entire test suite:
    ```bash
    npm run test
    ```
*   To test a specific module (e.g. User Auth):
    ```bash
    npm run test:auth
    ```
*   To run performance tests:
    ```bash
    npm run test:performance
    ```

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

Copyright (c) 2026 **Polygon Holdings Private Limited**.