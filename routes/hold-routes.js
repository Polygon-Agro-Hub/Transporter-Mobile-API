const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const holdEp = require('../endpoint/hold-ep');

/**
 * @openapi
 * /api/hold/reason:
 *   get:
 *     tags:
 *       - Hold
 *     summary: Get Hold Reasons
 *     description: Retrieve all valid reasons/categories for placing an assigned delivery order on hold.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Hold reasons retrieved successfully.
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
 *                   example: "Reason fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/HoldReason'
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
router.get('/reason', auth, holdEp.getReason);

/**
 * @openapi
 * /api/hold/submit:
 *   post:
 *     tags:
 *       - Hold
 *     summary: Submit Hold Order
 *     description: Place one or more assigned orders on hold status with a specific reason and optional comments.
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
 *               - holdReasonId
 *             properties:
 *               orderIds:
 *                 type: array
 *                 description: Array of process order IDs to place on hold.
 *                 items:
 *                   type: integer
 *                 example: [12, 13]
 *               holdReasonId:
 *                 type: integer
 *                 description: ID of the selected hold reason.
 *                 example: 2
 *               note:
 *                 type: string
 *                 description: Optional additional explanation/comments.
 *                 example: "Customer asked to deliver tomorrow morning instead."
 *     responses:
 *       200:
 *         description: Order(s) successfully placed on hold.
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
 *                   example: "Hold order submitted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     processOrdersUpdated:
 *                       type: integer
 *                       example: 2
 *                     driverOrdersUpdated:
 *                       type: integer
 *                       example: 2
 *                     returnOrdersInserted:
 *                       type: integer
 *                       example: 2
 *                     orderIds:
 *                       type: array
 *                       items:
 *                         type: integer
 *                       example: [12, 13]
 *                     invoiceNumbers:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["INV-00123", "INV-00124"]
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
 *         description: Unauthorized / Token invalid or expired.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Order not found / No orders match the provided IDs for this driver.
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
router.post('/submit', auth, holdEp.submitHold);

module.exports = router;
