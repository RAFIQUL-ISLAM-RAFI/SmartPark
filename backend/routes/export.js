const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');

router.get('/json', exportController.exportJson);
router.get('/csv', exportController.exportCsv);

module.exports = router;
