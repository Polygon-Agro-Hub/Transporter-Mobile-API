const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const complainEp = require('../endpoint/complain-ep');

// Add Complain
router.post('/add-complain', auth, complainEp.AddComplain);

// Get Complain Categories
router.get('/complain-categories', auth, complainEp.GetComplainCategories);

// Get My Complain
router.get('/my-complains', auth, complainEp.GetMyComplains);

module.exports = router;