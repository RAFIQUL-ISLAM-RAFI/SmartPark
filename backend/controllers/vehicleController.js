const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const parkingService = require('../services/parkingService');

const parkVehicle = asyncHandler(async (req, res) => {
  const { slotNumber } = await parkingService.parkVehicle(req.body);
  res.status(201).json({ success: true, message: 'Vehicle parked successfully', slot: slotNumber });
});

const removeVehicle = asyncHandler(async (req, res) => {
  const { receipt } = await parkingService.removeVehicle(req.body);
  res.json({ success: true, receipt });
});

const listVehicles = asyncHandler(async (req, res) => {
  const { filter, search } = req.query;
  const vehicles = await parkingService.listOccupiedVehicles({ filter, search });
  res.json({ success: true, vehicles });
});

const searchVehicles = asyncHandler(async (req, res) => {
  const vehicles = await parkingService.searchVehicles(req.query.q);
  res.json({ success: true, vehicles });
});

const getVehicle = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    throw new AppError('Invalid vehicle ID!', { status: 400, code: 'INVALID_ID' });
  }
  const vehicle = await parkingService.getVehicleById(id);
  res.json({ success: true, vehicle });
});

module.exports = { parkVehicle, removeVehicle, listVehicles, searchVehicles, getVehicle };
