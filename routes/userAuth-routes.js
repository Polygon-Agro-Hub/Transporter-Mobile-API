const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const userAuthEp = require('../endpoint/userAuth-ep');
const { upload } = require('../middlewares/multer.middleware');

/**
 * @openapi
 * /transporter/api/auth/login:
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
 *               email:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successfully logged in
 *       400:
 *         description: Bad Request
 */
router.post('/login', userAuthEp.login);

/**
 * @openapi
 * /transporter/api/auth/change-password:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Change Password
 *     description: Update the currently logged in user's password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               oldPassword:
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
 * /transporter/api/auth/get-profile:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Get Profile
 *     description: Retrieve the currently logged in user's profile
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 */
router.get('/get-profile', auth, userAuthEp.getProfile);

/**
 * @openapi
 * /transporter/api/auth/update-profile-image:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Update Profile Image
 *     description: Upload a new profile image (multipart/form-data)
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