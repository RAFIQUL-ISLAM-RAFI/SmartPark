const asyncHandler = require('../utils/asyncHandler');
const settingsService = require('../services/settingsService');

const getSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.getSettings();
  res.json({ success: true, settings });
});

const putSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.updateSettings(req.body);
  res.json({ success: true, message: 'Settings updated successfully', settings });
});

module.exports = { getSettings, putSettings };
