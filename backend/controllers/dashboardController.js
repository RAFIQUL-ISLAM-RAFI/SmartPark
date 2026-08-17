const asyncHandler = require('../utils/asyncHandler');
const { getDashboard } = require('../services/reportService');

const dashboard = asyncHandler(async (req, res) => {
  const data = await getDashboard();
  res.json({ success: true, dashboard: data });
});

module.exports = { dashboard };
