const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const { validateBody, parkVehicleSchema, removeVehicleSchema } = require('../middleware/validate');

router.post('/park', validateBody(parkVehicleSchema), vehicleController.parkVehicle);
router.post('/remove', validateBody(removeVehicleSchema), vehicleController.removeVehicle);
router.get('/search', vehicleController.searchVehicles);
router.get('/:id', vehicleController.getVehicle);
router.get('/', vehicleController.listVehicles);

module.exports = router;
