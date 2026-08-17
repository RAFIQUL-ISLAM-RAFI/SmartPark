const asyncHandler = require('../utils/asyncHandler');
const exportService = require('../services/exportService');

const exportJson = asyncHandler(async (req, res) => {
  const json = await exportService.exportJSON();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="smartpark-data.json"');
  res.send(json);
});

const exportCsv = asyncHandler(async (req, res) => {
  const csv = await exportService.exportCSV();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="smartpark-history.csv"');
  res.send(csv);
});

module.exports = { exportJson, exportCsv };
