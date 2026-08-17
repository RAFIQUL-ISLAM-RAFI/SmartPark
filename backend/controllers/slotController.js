const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const parkingService = require('../services/parkingService');

const listSlots = asyncHandler(async (req, res) => {
  const slots = await parkingService.listSlots();
  res.json({ success: true, slots });
});

const getSlot = asyncHandler(async (req, res) => {
  const slotNumber = Number(req.params.slotNumber);
  if (!Number.isInteger(slotNumber) || slotNumber < 1) {
    throw new AppError('Invalid slot number!', { status: 400, code: 'INVALID_SLOT' });
  }
  const slot = await parkingService.getSlot(slotNumber);
  res.json({ success: true, slot });
});

module.exports = { listSlots, getSlot };
