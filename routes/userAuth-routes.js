const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const userAuthEp = require('../endpoint/userAuth-ep');
const { upload } = require('../middlewares/multer.middleware');

// Login User
router.post('/login', userAuthEp.login);

// Change Password
router.post('/change-password', auth, userAuthEp.changePassword)

// Get User Profile
router.get('/get-profile', auth, userAuthEp.getProfile);

// Update Profile Image
router.post('/update-profile-image', 
  auth, 
  upload.single('profileImage'), 
  userAuthEp.updateProfileImage
);

module.exports = router;