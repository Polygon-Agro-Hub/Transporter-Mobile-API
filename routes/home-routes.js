const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const homeEp = require('../endpoint/home-ep');

/**
 * @openapi
 * /api/home/get-amount:
 *   get:
 *     tags:
 *       - Home
 *     summary: Get Amount
 *     description: Retrieve the collected amounts
 *     responses:
 *       200:
 *         description: Amount retrieved
 */
router.get('/get-amount', auth, homeEp.getAmount);

/**
 * @openapi
 * /api/home/get-received-cash:
 *   get:
 *     tags:
 *       - Home
 *     summary: Get Received Cash
 *     description: Retrieve total received cash breakdown
 *     responses:
 *       200:
 *         description: Cash breakdown retrieved
 */
router.get('/get-received-cash', auth, homeEp.getReceivedCash);

/**
 * @openapi
 * /api/home/hand-over-cash:
 *   post:
 *     tags:
 *       - Home
 *     summary: Hand Over Cash
 *     description: Hand over collected cash to the hub
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *               hubId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cash handed over
 */
router.post('/hand-over-cash', auth, homeEp.handOverCash);

module.exports = router;
