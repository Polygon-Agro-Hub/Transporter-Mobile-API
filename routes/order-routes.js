const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const orderEp = require('../endpoint/order-ep');

// Assign Driver Orders
router.post('/assign-driver-order', auth, orderEp.assignDriverOrder);

// Get Driver's Order
router.get('/get-driver-orders', auth, orderEp.GetDriverOrders);

// Get Order User Details
router.get('/get-order-user-details', auth, orderEp.GetOrderUserDetails);

module.exports = router;