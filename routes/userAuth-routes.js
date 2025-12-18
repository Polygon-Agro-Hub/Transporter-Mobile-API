const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const userAuthEp = require('../endpoint/userAuth-ep');

// Login User
router.post('/login', userAuthEp.login);

// Change Password
router.post('/change-password', auth, userAuthEp.changePassword)

// Get User Profile
router.get('/get-profile', auth, userAuthEp.getProfile);

module.exports = router;