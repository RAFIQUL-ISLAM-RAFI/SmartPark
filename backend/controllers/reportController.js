const asyncHandler = require('../utils/asyncHandler');
const { getReports } = require('../services/reportService');

const reports = asyncHandler(async (req, res) => {
  const data = await getReports(req.query.range || 'all');
  res.json({ success: true, report: data });
});

const revenueReport = asyncHandler(async (req, res) => {
  const data = await getReports(req.query.range || 'all');
  res.json({ success: true, revenue: data.revenue, revenueByDay: data.revenueByDay });
});

const vehiclesReport = asyncHandler(async (req, res) => {
  const data = await getReports(req.query.range || 'all');
  res.json({ success: true, totalVehicles: data.totalVehicles, byType: data.byType });
});

module.exports = { reports, revenueReport, vehiclesReport };
