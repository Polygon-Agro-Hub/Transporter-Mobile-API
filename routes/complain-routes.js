const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const complainEp = require('../endpoint/complain-ep');

/**
 * @openapi
 * /api/complain/add-complain:
 *   post:
 *     tags:
 *       - Complain
 *     summary: Add Complain
 *     description: Submit a new complain against an order or general service
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               complainCategoryId:
 *                 type: string
 *               description:
 *                 type: string
 *               orderId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Complain added successfully
 */
router.post('/add-complain', auth, complainEp.AddComplain);

/**
 * @openapi
 * /api/complain/complain-categories:
 *   get:
 *     tags:
 *       - Complain
 *     summary: Get Complain Categories
 *     description: Retrieve all available complain categories
 *     responses:
 *       200:
 *         description: Complain categories retrieved successfully
 */
router.get('/complain-categories', auth, complainEp.GetComplainCategories);

/**
 * @openapi
 * /api/complain/my-complains:
 *   get:
 *     tags:
 *       - Complain
 *     summary: Get My Complains
 *     description: Retrieves the list of complains made by the auth user
 *     responses:
 *       200:
 *         description: Complains list
 */
router.get('/my-complains', auth, complainEp.GetMyComplains);

module.exports = router;
