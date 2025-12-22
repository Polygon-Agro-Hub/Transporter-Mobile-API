const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const homeEp = require('../endpoint/home-ep');



// Get My Amount
router.get('/get-amount', auth, homeEp.getAmount);


// Get Received Cash
router.get('/get-received-cash', auth, homeEp.getReceivedCash);

//Post Reveived cash
router.post('/hand-over-cash', auth, homeEp.handOverCash);

module.exports = router;