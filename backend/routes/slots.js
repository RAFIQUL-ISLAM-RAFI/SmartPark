const express = require('express');
const router = express.Router();
const slotController = require('../controllers/slotController');

router.get('/:slotNumber', slotController.getSlot);
router.get('/', slotController.listSlots);

module.exports = router;
