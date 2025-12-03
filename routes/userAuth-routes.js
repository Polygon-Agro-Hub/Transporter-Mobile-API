const express = require('express');
const router = express.Router();
const auth = require('../Middlewares/auth.middleware');

const userAuthEp = require('../endpoint/userAuth-ep');

router.post('/login', userAuthEp.login);
router.post('/change-password', auth, userAuthEp.changePassword)


module.exports = router;