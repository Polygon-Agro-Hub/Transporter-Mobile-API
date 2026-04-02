const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const orderEp = require('../endpoint/order-ep');
const { upload } = require('../middlewares/multer.middleware');

/**
 * @openapi
 * /api/order/assign-driver-order:
 *   post:
 *     tags:
 *       - Order
 *     summary: Assign Driver Order
 *     description: Assign an order to the currently authenticated driver
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               invNo:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order assigned successfully
 */
router.post('/assign-driver-order', auth, orderEp.assignDriverOrder);

/**
 * @openapi
 * /api/order/get-driver-orders:
 *   get:
 *     tags:
 *       - Order
 *     summary: Get Driver's Orders
 *     description: Retrieve orders assigned to the logged in driver
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: isHandOver
 *         schema:
 *           type: integer
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
 */
router.get('/get-driver-orders', auth, orderEp.GetDriverOrders);

/**
 * @openapi
 * /api/order/get-order-user-details:
 *   get:
 *     tags:
 *       - Order
 *     summary: Get Order User Details
 *     description: Retrieve details about the user associated with an order
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orderIds
 *         required: true
 *         schema:
 *           type: string
 *           description: Comma-separated list of order IDs
 *     responses:
 *       200:
 *         description: User details retrieved
 */
router.get('/get-order-user-details', auth, orderEp.GetOrderUserDetails);

/**
 * @openapi
 * /api/order/start-journey:
 *   post:
 *     tags:
 *       - Order
 *     summary: Start Journey
 *     description: Start journey for a specific order delivery
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orderIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Journey started
 */
router.post('/start-journey', auth, orderEp.StartJourney);

/**
 * @openapi
 * /api/order/save-signature:
 *   post:
 *     tags:
 *       - Order
 *     summary: Save Signature
 *     description: Upload delivery completion signature
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               processOrderIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *               signature:
 *                 type: string
 *                 format: binary
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
 * /api/order/re-start-journey:
 *   post:
 *     tags:
 *       - Order
 *     summary: Restart Journey
 *     description: Re-Start journey for a specific order
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orderIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Journey re-started
 */
router.post('/re-start-journey', auth, orderEp.ReStartJourney);

module.exports = router;
