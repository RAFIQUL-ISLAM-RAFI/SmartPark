const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { validateBody, settingsSchema } = require('../middleware/validate');

router.get('/', settingsController.getSettings);
router.put('/', validateBody(settingsSchema), settingsController.putSettings);

module.exports = router;
