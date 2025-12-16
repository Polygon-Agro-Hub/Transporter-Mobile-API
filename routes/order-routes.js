const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const orderEp = require('../endpoint/order-ep');

// Assign Driver Orders
router.post('/assign-driver-order', auth, orderEp.assignDriverOrder);

module.exports = router;