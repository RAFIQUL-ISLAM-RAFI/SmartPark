const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { validateBody, importSchema } = require('../middleware/validate');

router.post('/reset', adminController.resetData);
router.post('/import', validateBody(importSchema), adminController.importData);

module.exports = router;
