const asyncHandler = require('../utils/asyncHandler');
const adminService = require('../services/adminService');

const resetData = asyncHandler(async (req, res) => {
  await adminService.clearAllData();
  res.json({ success: true, message: 'All parking data cleared.' });
});

const importData = asyncHandler(async (req, res) => {
  await adminService.importData(req.body);
  res.json({ success: true, message: 'Data imported successfully.' });
});

module.exports = { resetData, importData };
