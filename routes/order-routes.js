const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const orderEp = require('../endpoint/order-ep');
const { upload } = require('../middlewares/multer.middleware');

// Assign Driver Orders
router.post('/assign-driver-order', auth, orderEp.assignDriverOrder);

// Get Driver's Order
router.get('/get-driver-orders', auth, orderEp.GetDriverOrders);

// Get Order User Details
router.get('/get-order-user-details', auth, orderEp.GetOrderUserDetails);

// Start Journey
router.post('/start-journey', auth, orderEp.StartJourney);

// Save Signature 
router.post('/save-signature',
  auth,
  upload.single('signature'),
  orderEp.saveSignature
);

//re start journey
router.post('/re-start-journey', auth, orderEp.ReStartJourney);

module.exports = router;