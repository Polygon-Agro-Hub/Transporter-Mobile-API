const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const homeEp = require('../endpoint/home-ep');
const { upload } = require('../middlewares/multer.middleware');

/**
 * @openapi
 * /api/home/get-amount:
 *   get:
 *     tags:
 *       - Home
 *     summary: Get Amount & Order Breakdowns
 *     description: Retrieve total cash amount to collect and current counts of orders grouped by driver status.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Amount and order count breakdown retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Amount fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalOrders:
 *                       type: integer
 *                       example: 15
 *                     totalCashAmount:
 *                       type: number
 *                       example: 45000.00
 *                     todoOrders:
 *                       type: integer
 *                       example: 5
 *                     completedOrders:
 *                       type: integer
 *                       example: 8
 *                     onTheWayOrders:
 *                       type: integer
 *                       example: 1
 *                     holdOrders:
 *                       type: integer
 *                       example: 0
 *                     returnOrders:
 *                       type: integer
 *                       example: 1
 *                     returnReceivedOrders:
 *                       type: integer
 *                       example: 0
 *                     cashOrders:
 *                       type: integer
 *                       example: 12
 *                     ongoingProcessOrderIds:
 *                       type: array
 *                       items:
 *                         type: integer
 *                       example: [18, 19]
 *       401:
 *         description: Unauthorized / Driver authentication required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Failed to fetch amounts / Database error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/get-amount', auth, homeEp.getAmount);

/**
 * @openapi
 * /api/home/get-received-cash:
 *   get:
 *     tags:
 *       - Home
 *     summary: Get Received Cash Breakdown
 *     description: Retrieve detailed list of cash collected from completed orders.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cash breakdown retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Amount fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 22
 *                       orderId:
 *                         type: integer
 *                         example: 45
 *                       invNo:
 *                         type: string
 *                         example: "INV-2026-0001"
 *                       amount:
 *                         type: number
 *                         example: 1500.50
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-06-25T12:00:00.000Z"
 *       401:
 *         description: Unauthorized / Driver authentication required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Failed to fetch cash list / Database error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/get-received-cash', auth, homeEp.getReceivedCash);

/**
 * @openapi
 * /api/home/hand-over-cash:
 *   post:
 *     tags:
 *       - Home
 *     summary: Hand Over Cash
 *     description: Hand over collected COD cash for a batch of completed orders to an authorized Distribution Centre Manager (DCM).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderIds
 *               - totalAmount
 *               - officerId
 *             properties:
 *               orderIds:
 *                 type: array
 *                 description: Array of order database IDs.
 *                 items:
 *                   type: integer
 *                 example: [101, 102]
 *               totalAmount:
 *                 type: number
 *                 description: Total cash amount being handed over.
 *                 example: 3000.00
 *               officerId:
 *                 type: string
 *                 description: Employee ID of the officer receiving the cash (must start with 'DCM').
 *                 example: "DCM001"
 *     responses:
 *       200:
 *         description: Cash handed over successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Cash handed over successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     empId:
 *                       type: string
 *                       example: "DCM001"
 *                     officerId:
 *                       type: integer
 *                       example: 10
 *                     totalAmount:
 *                       type: number
 *                       example: 3000.00
 *                     orderCount:
 *                       type: integer
 *                       example: 2
 *       400:
 *         description: Bad Request / Validation failed (e.g. no orders, missing officerId).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized / Driver token is invalid.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden (DCM not approved, officer is not a DCM, distribution center mismatch, or driver distribution center lookup failed).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Not Found / Officer or orders not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Database error or internal failure.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/hand-over-cash', auth, homeEp.handOverCash);

/**
 * @openapi
 * /api/home/get-officer-details/{empId}:
 *   get:
 *     tags:
 *       - Home
 *     summary: Get Officer Details
 *     description: Retrieve details of a collection officer (DCM) by their employee ID. Validates if they are in approved status, starts with prefix 'DCM', matches the driver's distribution center, and has a registered mobile number.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: empId
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID of the collection officer (e.g. DCM001).
 *     responses:
 *       200:
 *         description: Officer details retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Officer validated"
 *                 data:
 *                   type: object
 *                   properties:
 *                     officerId:
 *                       type: integer
 *                       example: 12
 *                     empId:
 *                       type: string
 *                       example: "DCM001"
 *                     firstNameEnglish:
 *                       type: string
 *                       example: "Jane"
 *                     lastNameEnglish:
 *                       type: string
 *                       example: "Doe"
 *                     mobileNumber:
 *                       type: string
 *                       example: "+94771234567"
 *       400:
 *         description: Bad Request / Officer Employee ID missing or officer does not have a registered mobile number.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized / Driver token is invalid.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden / Distribution Centre Manager not approved, not authorized, distribution center mismatch, or driver distribution center lookup failed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Not Found / Officer not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Database error or internal failure.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/get-officer-details/:empId', auth, homeEp.getOfficerDetails);

/**
 * @openapi
 * /api/home/upload-transfer-slip:
 *   post:
 *     tags:
 *       - Home
 *     summary: Upload Bank Transfer Slip
 *     description: Upload a bank transfer slip image or PDF and create a transaction for cash handover review.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - slip
 *               - amount
 *             properties:
 *               slip:
 *                 type: string
 *                 format: binary
 *                 description: Bank transfer slip document (JPEG, JPG, PNG, PDF).
 *               amount:
 *                 type: number
 *                 description: Transfer amount.
 *                 example: 9000.00
 *     responses:
 *       200:
 *         description: Transfer slip uploaded successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Slip uploaded successfully. Transaction is pending review."
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactionId:
 *                       type: integer
 *                       example: 12
 *                     transCode:
 *                       type: string
 *                       example: "TXN-1718290310239"
 *                     amount:
 *                       type: number
 *                       example: 9000.00
 *                     paySlip:
 *                       type: string
 *                       example: "https://r2.example.com/rider/transfer-slips/file.pdf"
 *       400:
 *         description: Bad Request (missing file, invalid amount, or no active shift).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/upload-transfer-slip', auth, upload.single('slip'), homeEp.uploadTransferSlip);

/**
 * @openapi
 * /api/home/get-latest-transaction-status:
 *   get:
 *     tags:
 *       - Home
 *     summary: Get Latest Transaction Status
 *     description: Retrieve status metadata of the latest bank transfer slip upload associated with the active shift.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Transaction status fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Transaction status fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 12
 *                     transCode:
 *                       type: string
 *                       example: "TXN-1718290310239"
 *                     transAmount:
 *                       type: number
 *                       example: 9000.00
 *                     paySlip:
 *                       type: string
 *                       example: "https://r2.example.com/rider/transfer-slips/file.pdf"
 *                     transStatus:
 *                       type: string
 *                       enum: ["To Review", "Approved", "Rejected"]
 *                       example: "To Review"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-06-25T12:00:00.000Z"
 *       401:
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No transactions found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/get-latest-transaction-status', auth, homeEp.getLatestTransactionStatus);

module.exports = router;
