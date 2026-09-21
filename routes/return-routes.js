const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const returnEp = require('../endpoint/return-ep');

/**
 * @openapi
 * /api/return/reason:
 *   get:
 *     tags:
 *       - Return
 *     summary: Get Return Reasons
 *     description: Retrieve all valid reasons/categories for returning an order.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Return reasons retrieved successfully.
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
 *                   example: "Reasons fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ReturnReason'
 *       401:
 *         description: Unauthorized / Driver authentication required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Failed to fetch reasons / Database error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/reason', auth, returnEp.getReason);

/**
 * @openapi
 * /api/return/submit:
 *   post:
 *     tags:
 *       - Return
 *     summary: Submit Return Order
 *     description: Submit a return request for one or more assigned orders with a specific return reason and driver notes.
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
 *               - returnReasonId
 *             properties:
 *               orderIds:
 *                 type: array
 *                 description: Array of order database IDs.
 *                 items:
 *                   type: integer
 *                 example: [12]
 *               returnReasonId:
 *                 type: integer
 *                 description: ID of the selected return reason.
 *                 example: 3
 *               note:
 *                 type: string
 *                 description: Optional explanatory note from the driver.
 *                 example: "Items damaged during transit."
 *     responses:
 *       200:
 *         description: Return request submitted successfully.
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
 *                   example: "Return order submitted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     processOrdersUpdated:
 *                       type: integer
 *                       example: 1
 *                     driverOrdersUpdated:
 *                       type: integer
 *                       example: 1
 *                     returnOrdersInserted:
 *                       type: integer
 *                       example: 1
 *                     orderIds:
 *                       type: array
 *                       items:
 *                         type: integer
 *                       example: [12]
 *                     invoiceNumbers:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["INV-00123"]
 *                     orderDetails:
 *                       type: array
 *                       items:
 *                         type: object
 *                       example: []
 *       400:
 *         description: Bad Request / Input validation failed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized / Token invalid.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Order not found / Driver order not found matching the provided IDs.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Database transaction error or execution failure.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/submit', auth, returnEp.submitReturn);

/**
 * @openapi
 * /api/return/get-driver-return-orders:
 *   get:
 *     tags:
 *       - Return
 *     summary: Get Driver's Return Orders
 *     description: Retrieve all return orders currently assigned to the authenticated driver.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Return orders list.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     returnOrders:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 5
 *                           drvOrderId:
 *                             type: integer
 *                             example: 12
 *                           returnReasonId:
 *                             type: integer
 *                             example: 3
 *                           note:
 *                             type: string
 *                             nullable: true
 *                             example: "Damaged packing"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-06-25T15:00:00.000Z"
 *                           invNo:
 *                             type: string
 *                             example: "INV-00123"
 *                           amount:
 *                             type: number
 *                             example: 1200.00
 *                           paymentMethod:
 *                             type: string
 *                             example: "Cash"
 *                           categoryEnglish:
 *                             type: string
 *                             example: "Damaged Items"
 *                     totalReturnOrders:
 *                       type: integer
 *                       example: 1
 *       401:
 *         description: Unauthorized / Driver session invalid.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Database lookup failed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/get-driver-return-orders', auth, returnEp.GetDriverReturnOrders);

/**
 * @openapi
 * /api/return/update-return-received:
 *   post:
 *     tags:
 *       - Return
 *     summary: Update Return to Received
 *     description: Mark returned order(s) as physically received at the warehouse/distribution center.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - invoiceNumbers
 *             properties:
 *               invoiceNumbers:
 *                 type: array
 *                 description: List of order invoice numbers to update.
 *                 items:
 *                   type: string
 *                 example: ["INV-00123"]
 *     responses:
 *       200:
 *         description: Status updated to 'Return Received' successfully.
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
 *                   example: "Return orders updated to 'Return Received' successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     driverOrdersUpdated:
 *                       type: integer
 *                       example: 1
 *                     processOrdersUpdated:
 *                       type: integer
 *                       example: 1
 *                     invoiceNumbers:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["INV-00123"]
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-06-26T10:00:00.000Z"
 *       400:
 *         description: Bad Request / Invoice numbers array is empty or missing.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized / Invalid token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden / Driver does not have permission to update these return orders.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Not Found / No return orders found matching the provided invoice numbers.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Database error or status update transaction failed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/update-return-received', auth, returnEp.updateReturnReceived);

// Scan DCM QR and generate OTP
router.post('/scan-dcm-generate-otp', auth, returnEp.scanDcmGenerateOtp);

// Resend Return OTP
router.post('/resend-otp', auth, returnEp.resendReturnOtp);

// Verify Return OTP and mark as Return Received
router.post('/verify-otp-return-received', auth, returnEp.verifyOtpReturnReceived);

module.exports = router;
