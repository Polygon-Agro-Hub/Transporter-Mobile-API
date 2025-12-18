const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const holdEp = require('../endpoint/hold-ep');

// Get hold Reason
router.get('/reason', auth, holdEp.getReason);

// Submit hold Order
router.post('/submit', auth, holdEp.submitHold);

module.exports = router;