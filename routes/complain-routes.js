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
 *     description: Submit a new driver complaint against an order, vehicle, or general service.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - complainCategory
 *               - complain
 *             properties:
 *               complainCategory:
 *                 type: integer
 *                 description: ID of the complain category.
 *                 example: 1
 *               complain:
 *                 type: string
 *                 description: Detailed description of the complaint.
 *                 example: "Vehicle engine broke down near Kandy road."
 *     responses:
 *       200:
 *         description: Complaint submitted successfully.
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
 *                   example: "Complaint submitted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     insertId:
 *                       type: integer
 *                       example: 15
 *                     refNo:
 *                       type: string
 *                       example: "DRV001260626001"
 *       400:
 *         description: Bad Request / Validation failed (e.g. missing category or description).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized / User authentication required or invalid token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Failed to submit complaint / Server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/add-complain', auth, complainEp.AddComplain);

/**
 * @openapi
 * /api/complain/complain-categories:
 *   get:
 *     tags:
 *       - Complain
 *     summary: Get Complain Categories
 *     description: Retrieve all available multilingual complain categories for selection.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Complain categories retrieved successfully.
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
 *                   example: "Categories fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ComplaintCategory'
 *       401:
 *         description: Unauthorized / Invalid token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Failed to fetch categories / Server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/complain-categories', auth, complainEp.GetComplainCategories);

/**
 * @openapi
 * /api/complain/my-complains:
 *   get:
 *     tags:
 *       - Complain
 *     summary: Get My Complains
 *     description: Retrieves the list of complains made by the authenticated driver with admin replies if any.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Driver's complaints list.
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
 *                   example: "Complaints fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 5
 *                       refNo:
 *                         type: string
 *                         example: "DRV001260626001"
 *                       complain:
 *                         type: string
 *                         example: "Customer refused delivery due to quality."
 *                       reply:
 *                         type: string
 *                         nullable: true
 *                         example: "We have updated the order status accordingly."
 *                       status:
 *                         type: string
 *                         example: "Replied"
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-06-26T08:30:00.000Z"
 *                       categoryEnglish:
 *                         type: string
 *                         example: "Late Delivery"
 *                       categorySinhala:
 *                         type: string
 *                         example: "ප්‍රමාද වූ භාරදීම"
 *                       categoryTamil:
 *                         type: string
 *                         example: "தாமதமான விநியோகம்"
 *       401:
 *         description: Unauthorized / Invalid token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Failed to fetch complaints / Database error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/my-complains', auth, complainEp.GetMyComplains);

module.exports = router;
