const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const complainEp = require('../endpoint/complain-ep');

router.post('/add-complain', auth, complainEp.AddComplain);
router.get('/complain-categories', auth, complainEp.GetComplainCategories);
router.get('/my-complains', auth, complainEp.GetMyComplains);

module.exports = router;