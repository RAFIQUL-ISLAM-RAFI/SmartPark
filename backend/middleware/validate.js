// =========================================================
// SmartPark — request validation (zod)
// =========================================================
const { z } = require('zod');
const AppError = require('../utils/AppError');

const VEHICLE_TYPES = ['Car', 'Bike', 'Truck'];

// A "0–23 integer, defaults to current system hour if omitted"
const hourField = z.preprocess((val) => {
  if (val === '' || val === null || val === undefined) return new Date().getHours();
  const n = Number(val);
  return Number.isNaN(n) ? val : n;
}, z.number().int('Please enter a valid time between 0 and 23.').min(0, 'Please enter a valid time between 0 and 23.').max(23, 'Please enter a valid time between 0 and 23.'));

const parkVehicleSchema = z.object({
  type: z.enum(VEHICLE_TYPES, { errorMap: () => ({ message: 'Invalid vehicle type!' }) }),
  plate: z.string({ required_error: 'Plate number is required.' }).trim().min(1, 'Plate number is required.').max(20, 'Plate number is too long.'),
  owner: z.string({ required_error: 'Owner name is required.' }).trim().min(1, 'Owner name is required.').max(80, 'Owner name is too long.'),
  inTime: hourField.default(() => new Date().getHours()),
});

const removeVehicleSchema = z.object({
  slotNumber: z.preprocess((val) => (val === '' || val === null ? undefined : Number(val)), z.number().int('Invalid slot number!').positive('Invalid slot number!')),
  outTime: hourField.default(() => new Date().getHours()),
});

const settingsSchema = z
  .object({
    rate: z.preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().int().positive('Enter a parking rate of at least 1.')).optional(),
    totalSlots: z.preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().int().min(1, 'Enter at least 1 total slot.').max(200, 'Total slots cannot exceed 200.')).optional(),
    theme: z.enum(['dark', 'light']).optional(),
    notifications: z.boolean().optional(),
    motion: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'No settings provided.' });

const importSlotSchema = z.object({
  slotNumber: z.number().int().positive(),
  vehicle: z
    .object({
      type: z.enum(VEHICLE_TYPES),
      plate: z.string().trim().min(1),
      owner: z.string().trim().min(1),
    })
    .nullable(),
  inTime: z.number().int().min(0).max(23).nullable(),
});

const importHistorySchema = z.object({
  event: z.enum(['park', 'remove']),
  slotNumber: z.number().int().positive(),
  type: z.enum(VEHICLE_TYPES),
  plate: z.string().trim().min(1),
  owner: z.string().trim().min(1),
  inTime: z.number().int().min(0).max(23),
  outTime: z.number().int().min(0).max(23).nullable().optional(),
  hours: z.number().int().positive().nullable().optional(),
  fee: z.number().int().nonnegative().nullable().optional(),
  ts: z.number().optional(),
});

const importSchema = z
  .object({
    slots: z.array(importSlotSchema).optional().default([]),
    history: z.array(importHistorySchema).optional().default([]),
    settings: z
      .object({
        rate: z.number().int().positive().optional(),
        totalSlots: z.number().int().positive().max(200).optional(),
        theme: z.enum(['dark', 'light']).optional(),
        notifications: z.boolean().optional(),
        motion: z.boolean().optional(),
      })
      .optional()
      .default({}),
  })
  .refine((obj) => obj.slots.length > 0 || obj.history.length > 0 || Object.keys(obj.settings).length > 0, {
    message: 'That file doesn\u2019t look like a SmartPark export.',
  });

/**
 * Express middleware factory. Validates req.body against `schema`
 * and replaces req.body with the parsed/coerced result on success.
 * On failure, throws an AppError with a field-keyed `details` map
 * that mirrors the shape the original frontend expects.
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] || 'general';
        if (!details[key]) details[key] = issue.message;
      }
      const message = Object.values(details)[0] || 'Invalid request.';
      return next(new AppError(message, { status: 422, code: 'VALIDATION_ERROR', details }));
    }
    req.body = result.data;
    next();
  };
}

module.exports = {
  validateBody,
  parkVehicleSchema,
  removeVehicleSchema,
  settingsSchema,
  importSchema,
  VEHICLE_TYPES,
};
