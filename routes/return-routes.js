const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const returnEp = require('../endpoint/return-ep');

// Get Return Reason
router.get('/reason', auth, returnEp.getReason);

// Submit Return Order
router.post('/submit', auth, returnEp.submitReturn);

module.exports = router;