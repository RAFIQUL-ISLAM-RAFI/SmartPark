const express = require('express');
const router = express.Router();
const { healthCheck } = require('../config/db');

router.get('/', async (req, res) => {
  const dbOk = await healthCheck();
  res.status(dbOk ? 200 : 503).json({
    success: dbOk,
    status: dbOk ? 'OK' : 'DEGRADED',
    database: dbOk ? 'connected' : 'unreachable',
  });
});

module.exports = router;
