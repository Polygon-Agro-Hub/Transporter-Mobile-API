const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const returnEp = require('../endpoint/return-ep');

// Get Return Reason
router.get('/reason', auth, returnEp.getReason);

// Submit Return Order
router.post('/submit', auth, returnEp.submitReturn);

// Get Driver's Return Orders
router.get('/get-driver-return-orders', auth, returnEp.GetDriverReturnOrders);

// Update Return Order to Return Received
router.post('/update-return-received', auth, returnEp.updateReturnReceived);

module.exports = router;