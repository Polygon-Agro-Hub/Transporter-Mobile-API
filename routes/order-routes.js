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
 *     description: Scan or enter an invoice number to assign an order to the currently authenticated driver's target list.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - invNo
 *             properties:
 *               invNo:
 *                 type: string
 *                 description: Unique commercial invoice number.
 *                 example: "INV-00123"
 *     responses:
 *       201:
 *         description: Order assigned successfully.
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
 *                   example: "Order assigned successfully to your target list"
 *                 data:
 *                   type: object
 *                   properties:
 *                     insertId:
 *                       type: integer
 *                       example: 10
 *                     driverEmpId:
 *                       type: string
 *                       example: "DRV001"
 *                     assignedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-06-26T08:00:00.000Z"
 *       400:
 *         description: Bad Request / Invoice number required, or order is not set to 'Out For Delivery' status yet.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized / Driver authentication required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Order not found matching the provided invoice number.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Conflict / Order is already in driver's target list, or has been collected by another driver.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "This order is already in your target list."
 *                 driverEmpId:
 *                   type: string
 *                   example: "DRV001"
 *                 assignedDriverEmpId:
 *                   type: string
 *                   example: "DRV002"
 *                 assignedDriverName:
 *                   type: string
 *                   example: "Jane Smith"
 *                 currentStatus:
 *                   type: string
 *                   example: "Collected"
 *                 invNo:
 *                   type: string
 *                   example: "INV-00123"
 *       500:
 *         description: Database error or internal failure.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/assign-driver-order', auth, orderEp.assignDriverOrder);

/**
 * @openapi
 * /api/order/get-driver-orders:
 *   get:
 *     tags:
 *       - Order
 *     summary: Get Driver's Orders
 *     description: Retrieve all active and historic orders assigned to the logged-in driver. Support filtering by status, handover status, and assignment date.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Comma-separated list of statuses to filter by (e.g., 'Todo', 'On the way', 'Hold', 'Completed', 'Return').
 *         example: "Todo,On the way"
 *       - in: query
 *         name: isHandOver
 *         schema:
 *           type: integer
 *           enum: [0, 1]
 *         description: Filter by COD cash handover status (0 = pending, 1 = completed).
 *         example: 0
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *         description: Filter by assignment date (format YYYY-MM-DD). Defaults to current system date.
 *         example: "2026-06-26"
 *     responses:
 *       200:
 *         description: Driver's orders list retrieved successfully.
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
 *                     orders:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/DriverOrder'
 *                     totalOrders:
 *                       type: integer
 *                       example: 5
 *       401:
 *         description: Unauthorized / Invalid credentials.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Server database error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/get-driver-orders', auth, orderEp.GetDriverOrders);

/**
 * @openapi
 * /api/order/get-optimized-route:
 *   get:
 *     tags:
 *       - Order
 *     summary: Get Optimized Delivery Route
 *     description: Calculate the optimized delivery route for the driver's current todo orders using the distribution centre as the starting point and the Nearest-Neighbor algorithm.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Optimized route calculated successfully.
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
 *                     distributionCenter:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         name:
 *                           type: string
 *                         latitude:
 *                           type: number
 *                         longitude:
 *                           type: number
 *                     optimizedRoute:
 *                       type: object
 *                       properties:
 *                         routingType:
 *                           type: string
 *                         algorithm:
 *                           type: string
 *                         totalDistanceMeters:
 *                           type: number
 *                         stops:
 *                           type: array
 *                           items:
 *                             type: object
 *                     optimizedOrders:
 *                       type: array
 *                       items:
 *                         type: object
 *                     totalOrders:
 *                       type: integer
 *                     optimizedCount:
 *                       type: integer
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Distribution centre not found.
 *       500:
 *         description: Server error.
 */
router.get('/get-optimized-route', auth, orderEp.GetOptimizedRoute);

/**
 * @openapi
 * /api/order/get-order-user-details:
 *   get:
 *     tags:
 *       - Order
 *     summary: Get Order Customer Details
 *     description: Retrieve recipient customer information and summary of associated orders for a batch of order IDs.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orderIds
 *         required: true
 *         schema:
 *           type: string
 *         description: Comma-separated list of process order IDs.
 *         example: "12,13"
 *     responses:
 *       200:
 *         description: Client details and orders list retrieved.
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
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 45
 *                         title:
 *                           type: string
 *                           example: "Mr"
 *                         firstName:
 *                           type: string
 *                           example: "Kamal"
 *                         lastName:
 *                           type: string
 *                           example: "Perera"
 *                         phoneCode:
 *                           type: string
 *                           example: "+94"
 *                         phoneNumber:
 *                           type: string
 *                           example: "771234567"
 *                         image:
 *                           type: string
 *                           example: "https://r2.example.com/users/profile-images/img.png"
 *                         address:
 *                           type: object
 *                           properties:
 *                             houseNo:
 *                               type: string
 *                               example: "No 15/A"
 *                             streetName:
 *                               type: string
 *                               example: "Galle Road"
 *                             city:
 *                               type: string
 *                               example: "Colombo 03"
 *                             buildingType:
 *                               type: string
 *                               example: "House"
 *                     orders:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 12
 *                           invNo:
 *                             type: string
 *                             example: "INV-00123"
 *                           amount:
 *                             type: number
 *                             example: 1500.00
 *                           paymentMethod:
 *                             type: string
 *                             example: "Cash"
 *       400:
 *         description: Bad Request / orderIds parameter missing or formatted incorrectly.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized / Driver authentication required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Customer details or orders not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Server/database error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/get-order-user-details', auth, orderEp.GetOrderUserDetails);

/**
 * @openapi
 * /api/order/start-journey:
 *   post:
 *     tags:
 *       - Order
 *     summary: Start Journey
 *     description: Transition a batch of assigned orders to 'On the way' status to begin delivery. Only permitted if no other journey is currently active.
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
 *             properties:
 *               orderIds:
 *                 type: array
 *                 description: Array of order database IDs (or comma-separated string) to transition.
 *                 items:
 *                   type: integer
 *                 example: [12, 13]
 *     responses:
 *       200:
 *         description: Delivery journey started.
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
 *                   example: "Journey started successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     updatedOrders:
 *                       type: integer
 *                       example: 2
 *       400:
 *         description: Bad Request / Invalid order IDs, or driver has an ongoing active journey already.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "You have an active ongoing journey. Please complete it first."
 *                 ongoingProcessOrderIds:
 *                   type: array
 *                   items:
 *                     type: integer
 *                   example: [9, 10]
 *       401:
 *         description: Unauthorized / Token invalid.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Database error or process failure.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/start-journey', auth, orderEp.StartJourney);

/**
 * @openapi
 * /api/order/save-signature:
 *   post:
 *     tags:
 *       - Order
 *     summary: Complete Order with Signature
 *     description: Upload digital signature image as Proof of Delivery (POD) to Cloudflare R2 and mark orders as Completed (and isPaid=1 for COD orders).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - processOrderIds
 *               - signature
 *             properties:
 *               processOrderIds:
 *                 type: array
 *                 description: Array of order database IDs. Send as multiple fields in form or custom array syntax.
 *                 items:
 *                   type: integer
 *                 example: [12]
 *               signature:
 *                 type: string
 *                 format: binary
 *                 description: Signature image file to upload (JPEG, JPG, PNG).
 *     responses:
 *       200:
 *         description: Signature saved and orders marked completed.
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
 *                   example: "Signature saved and orders marked as delivered successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     signatureUrl:
 *                       type: string
 *                       example: "https://r2.example.com/signatures/pod.png"
 *                     driverOrdersUpdated:
 *                       type: integer
 *                       example: 1
 *                     processOrdersUpdated:
 *                       type: integer
 *                       example: 1
 *                     updatedOrders:
 *                       type: integer
 *                       example: 1
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-06-26T08:50:00.000Z"
 *       400:
 *         description: Bad Request / Parameters missing or signature file invalid type/missing.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized / Driver authentication required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden / Driver does not have permission/access to the requested orders.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: File upload to R2 or database query error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
 *     summary: Restart Hold Journey
 *     description: Restart journey for order(s) that were previously placed on hold. Transition them back to 'On the way' status.
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
 *             properties:
 *               orderIds:
 *                 type: array
 *                 description: Array of order database IDs.
 *                 items:
 *                   type: integer
 *                 example: [12]
 *     responses:
 *       200:
 *         description: Journey successfully restarted.
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
 *                   example: "Journey restarted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     updatedOrders:
 *                       type: integer
 *                       example: 1
 *       400:
 *         description: Bad Request / Invalid order IDs, or driver has an ongoing active journey already.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "You have an active ongoing journey. Please complete it first."
 *                 ongoingProcessOrderIds:
 *                   type: array
 *                   items:
 *                     type: integer
 *                   example: [9, 10]
 *       401:
 *         description: Unauthorized / Driver authentication required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Database error or process failure.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/re-start-journey', auth, orderEp.ReStartJourney);


module.exports = router;
