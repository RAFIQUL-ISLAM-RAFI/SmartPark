const express = require('express');
const router = express.Router();
const { listActivity } = require('../controllers/activityController');

router.get('/', listActivity);

module.exports = router;
