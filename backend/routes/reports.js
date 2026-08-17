const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

router.get('/revenue', reportController.revenueReport);
router.get('/vehicles', reportController.vehiclesReport);
router.get('/', reportController.reports);

module.exports = router;
