const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const orderEp = require('../endpoint/order-ep');
const { upload } = require('../middlewares/multer.middleware');

/**
 * @openapi
 * /transporter/api/order/assign-driver-order:
 *   post:
 *     tags:
 *       - Order
 *     summary: Assign Driver Order
 *     description: Assign an order to the currently authenticated driver
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
 *         description: Order assigned successfully
 */
router.post('/assign-driver-order', auth, orderEp.assignDriverOrder);

/**
 * @openapi
 * /transporter/api/order/get-driver-orders:
 *   get:
 *     tags:
 *       - Order
 *     summary: Get Driver's Orders
 *     description: Retrieve orders assigned to the logged in driver
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
 */
router.get('/get-driver-orders', auth, orderEp.GetDriverOrders);

/**
 * @openapi
 * /transporter/api/order/get-order-user-details:
 *   get:
 *     tags:
 *       - Order
 *     summary: Get Order User Details
 *     description: Retrieve details about the user associated with an order
 *     parameters:
 *       - in: query
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details retrieved
 */
router.get('/get-order-user-details', auth, orderEp.GetOrderUserDetails);

/**
 * @openapi
 * /transporter/api/order/start-journey:
 *   post:
 *     tags:
 *       - Order
 *     summary: Start Journey
 *     description: Start journey for a specific order delivery
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
 *         description: Journey started
 */
router.post('/start-journey', auth, orderEp.StartJourney);

/**
 * @openapi
 * /transporter/api/order/save-signature:
 *   post:
 *     tags:
 *       - Order
 *     summary: Save Signature
 *     description: Upload delivery completion signature
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               orderId:
 *                 type: string
 *               signature:
 *                 type: string
 *                 format: binary
 *               userRole:
 *                 type: string
 *     responses:
 *       200:
 *         description: Signature saved successfully
 */
router.post('/save-signature',
  auth,
  upload.single('signature'),
  orderEp.saveSignature
);

/**
 * @openapi
 * /transporter/api/order/re-start-journey:
 *   post:
 *     tags:
 *       - Order
 *     summary: Restart Journey
 *     description: Re-Start journey for a specific order
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
 *         description: Journey re-started
 */
router.post('/re-start-journey', auth, orderEp.ReStartJourney);

module.exports = router;