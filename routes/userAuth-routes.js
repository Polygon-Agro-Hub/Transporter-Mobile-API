const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const userAuthEp = require('../endpoint/userAuth-ep');
const { upload } = require('../middlewares/multer.middleware');
const loginRateLimiter = require('../middlewares/rateLimiter.middleware');

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Login User
 *     description: Authenticate a driver using employee ID and password. Returns user profile details and a JWT token.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - empId
 *               - password
 *             properties:
 *               empId:
 *                 type: string
 *                 example: "DRV001"
 *               password:
 *                 type: string
 *                 example: "Password123"
 *     responses:
 *       200:
 *         description: Successfully logged in, token and driver profile details returned.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Login successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     empId:
 *                       type: string
 *                       example: "DRV001"
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     token:
 *                       type: string
 *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                     passwordUpdated:
 *                       type: integer
 *                       example: 1
 *                     firstNameEnglish:
 *                       type: string
 *                       example: "John"
 *                     lastNameEnglish:
 *                       type: string
 *                       example: "Doe"
 *                     image:
 *                       type: string
 *                       example: "https://r2.example.com/users/profile-images/img.png"
 *       400:
 *         description: Bad Request / Validation error (e.g. missing employee ID or password).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized / Invalid login credentials.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden (Account is rejected, pending verification, or not approved).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "This Employee ID is rejected"
 *                 statusType:
 *                   type: string
 *                   enum: ["rejected", "not_approved", "pending"]
 *                   example: "rejected"
 *       429:
 *         description: Too Many Requests / Rate limit exceeded (limits to 5 attempts per 15 minutes per IP address).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/login', loginRateLimiter, userAuthEp.login);

/**
 * @openapi
 * /api/auth/change-password:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Change Password
 *     description: Update the currently logged-in driver's password.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: "OldPassword123"
 *               newPassword:
 *                 type: string
 *                 example: "NewPassword123"
 *     responses:
 *       200:
 *         description: Password updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Bad Request / Input validation failed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized / Current password is incorrect or session expired.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Driver not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Database error or internal server issue.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/change-password', auth, userAuthEp.changePassword)

/**
 * @openapi
 * /api/auth/get-profile:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Get Profile
 *     description: Retrieve the currently logged-in driver's profile info and vehicle assignment.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "User profile fetched successfully"
 *                 data:
 *                   $ref: '#/components/schemas/UserProfile'
 *       400:
 *         description: Bad Request / Employee ID not found in token payload.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized / Missing or invalid token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: User account not found or not approved.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server or database error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/get-profile', auth, userAuthEp.getProfile);

/**
 * @openapi
 * /api/auth/update-profile-image:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Update Profile Image
 *     description: Upload a new profile image (multipart/form-data) to Cloudflare R2 and update the driver record. Max size 5MB.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - profileImage
 *             properties:
 *               profileImage:
 *                 type: string
 *                 format: binary
 *                 description: Image file to upload (JPEG, JPG, PNG).
 *     responses:
 *       200:
 *         description: Profile image updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Profile image updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     imageUrl:
 *                       type: string
 *                       example: "https://r2.example.com/users/profile-images/img.png"
 *                     empId:
 *                       type: string
 *                       example: "DRV001"
 *       400:
 *         description: Bad Request (missing file, invalid format, file size > 5MB, or missing employee token details).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized / Invalid or expired token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Driver not found or not approved.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: File upload or database storage failure.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/update-profile-image', 
  auth, 
  upload.single('profileImage'), 
  userAuthEp.updateProfileImage
);

router.get('/get-earnings', auth, userAuthEp.getEarnings);
router.get('/get-earnings-history', auth, userAuthEp.getEarningsHistory);

module.exports = router;
