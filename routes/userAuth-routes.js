const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const userAuthEp = require('../endpoint/userAuth-ep');
const { upload } = require('../middlewares/multer.middleware');

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Login User
 *     description: Authenticate a user and receive a token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               empId:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successfully logged in, token returned in data.token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *       400:
 *         description: Bad Request
 */
router.post('/login', userAuthEp.login);

/**
 * @openapi
 * /api/auth/change-password:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Change Password
 *     description: Update the currently logged in user's password
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 */
router.post('/change-password', auth, userAuthEp.changePassword)

/**
 * @openapi
 * /api/auth/get-profile:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Get Profile
 *     description: Retrieve the currently logged in user's profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 */
// router.get('/get-profile', auth, userAuthEp.getProfile);

/**
 * @openapi
 * /api/auth/update-profile-image:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Update Profile Image
 *     description: Upload a new profile image (multipart/form-data)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               profileImage:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Profile image updated
 */
router.post('/update-profile-image', 
  auth, 
  upload.single('profileImage'), 
  userAuthEp.updateProfileImage
);

module.exports = router;
