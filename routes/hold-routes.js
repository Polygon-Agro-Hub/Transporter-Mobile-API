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
 *     summary: Get Hold Reason
 *     description: Retrieve valid reasons for placing an order on hold
 *     responses:
 *       200:
 *         description: Reasons retrieved successfully
 */
router.get('/reason', auth, holdEp.getReason);

/**
 * @openapi
 * /api/hold/submit:
 *   post:
 *     tags:
 *       - Hold
 *     summary: Submit Hold Order
 *     description: Place an assigned order on hold with a specific reason
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
 *         description: Order placed on hold successfully
 */
router.post('/submit', auth, holdEp.submitHold);

module.exports = router;
