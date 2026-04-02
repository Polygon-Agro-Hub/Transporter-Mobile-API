const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const returnEp = require('../endpoint/return-ep');

/**
 * @openapi
 * /transporter/api/return/reason:
 *   get:
 *     tags:
 *       - Return
 *     summary: Get Return Reason
 *     description: Retrieve reasons for returning an order
 *     responses:
 *       200:
 *         description: Reasons retrieved successfully
 */
router.get('/reason', auth, returnEp.getReason);

/**
 * @openapi
 * /transporter/api/return/submit:
 *   post:
 *     tags:
 *       - Return
 *     summary: Submit Return Order
 *     description: Submit a return request for an order
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orderId:
 *                 type: string
 *               reasonId:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Return order submitted successfully
 */
router.post('/submit', auth, returnEp.submitReturn);

/**
 * @openapi
 * /transporter/api/return/get-driver-return-orders:
 *   get:
 *     tags:
 *       - Return
 *     summary: Get Driver's Return Orders
 *     description: Retrieve all returned orders assigned to the driver
 *     responses:
 *       200:
 *         description: Return orders retrieved
 */
router.get('/get-driver-return-orders', auth, returnEp.GetDriverReturnOrders);

/**
 * @openapi
 * /transporter/api/return/update-return-received:
 *   post:
 *     tags:
 *       - Return
 *     summary: Update Return to Received
 *     description: Mark a return order as received
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orderId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Status updated
 */
router.post('/update-return-received', auth, returnEp.updateReturnReceived);

module.exports = router;