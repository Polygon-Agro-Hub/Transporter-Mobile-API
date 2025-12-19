const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const homeEp = require('../endpoint/home-ep');



// Get My Complain
router.get('/get-amount', auth, homeEp.getAmount);

module.exports = router;