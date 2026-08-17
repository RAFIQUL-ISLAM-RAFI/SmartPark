// =========================================================
// SmartPark — parking domain logic
// Every write here runs inside a DB transaction with row locks
// so concurrent requests can never double-book a slot or let
// the same plate hold two active sessions.
// =========================================================
const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { computeHours, computeFee } = require('../utils/feeCalculator');

function normalizePlate(plate) {
  return plate.trim().toLowerCase();
}

async function getSettingsRow(client) {
  const runner = client || { query };
  const { rows } = await runner.query('SELECT * FROM settings WHERE id = 1');
  if (!rows[0]) throw new AppError('Settings not configured.', { status: 500, code: 'SETTINGS_MISSING' });
  return rows[0];
}

// ---------------------------------------------------------
// Park a vehicle
// ---------------------------------------------------------
async function parkVehicle({ type, plate, owner, inTime }) {
  const plateNormalized = normalizePlate(plate);
  const assignedInTime = (inTime === undefined || inTime === null || inTime === '')
    ? new Date().getHours()
    : Number(inTime);

  return withTransaction(async (client) => {
    // Reject if this plate already has an active session anywhere.
    const activeForPlate = await client.query(
      `SELECT id FROM parking_sessions WHERE plate_normalized = $1 AND status = 'active' LIMIT 1`,
      [plateNormalized]
    );
    if (activeForPlate.rows.length) {
      throw new AppError('Vehicle with this plate number is already parked.', {
        status: 409,
        code: 'VEHICLE_ALREADY_PARKED',
        details: { plate: 'Vehicle with this plate number is already parked.' },
      });
    }

    // Lock and grab the first available slot. SKIP LOCKED means concurrent
    // park requests each get a *different* free slot instead of blocking
    // on (and then failing against) the same row.
    const slotResult = await client.query(
      `SELECT id, slot_number FROM parking_slots
       WHERE status = 'empty'
       ORDER BY slot_number
       FOR UPDATE SKIP LOCKED
       LIMIT 1`
    );
    const slot = slotResult.rows[0];
    if (!slot) {
      throw new AppError('No empty parking slots available!', { status: 409, code: 'PARKING_FULL' });
    }

    const vehicleResult = await client.query(
      `INSERT INTO vehicles (type, plate, plate_normalized, owner)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [type, plate.trim(), plateNormalized, owner.trim()]
    );
    const vehicleId = vehicleResult.rows[0].id;

    await client.query(
      `INSERT INTO parking_sessions
         (vehicle_id, slot_id, slot_number, type, plate, plate_normalized, owner, in_time, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')`,
      [vehicleId, slot.id, slot.slot_number, type, plate.trim(), plateNormalized, owner.trim(), assignedInTime]
    );

    await client.query(`UPDATE parking_slots SET status = 'occupied' WHERE id = $1`, [slot.id]);

    return { slotNumber: slot.slot_number };
  });
}

// ---------------------------------------------------------
// Remove a vehicle
// ---------------------------------------------------------
async function removeVehicle({ slotNumber, outTime }) {
  const assignedOutTime = (outTime === undefined || outTime === null || outTime === '')
    ? new Date().getHours()
    : Number(outTime);

  return withTransaction(async (client) => {
    const slotResult = await client.query(
      `SELECT id, status FROM parking_slots WHERE slot_number = $1 FOR UPDATE`,
      [slotNumber]
    );
    const slot = slotResult.rows[0];
    if (!slot) {
      throw new AppError('Invalid slot number!', { status: 404, code: 'INVALID_SLOT' });
    }

    const sessionResult = await client.query(
      `SELECT * FROM parking_sessions WHERE slot_id = $1 AND status = 'active' FOR UPDATE`,
      [slot.id]
    );
    const session = sessionResult.rows[0];
    if (!session) {
      throw new AppError('Slot is already empty!', { status: 409, code: 'SLOT_EMPTY' });
    }

    const settings = await getSettingsRow(client);
    const hours = computeHours(session.in_time, assignedOutTime);
    const fee = computeFee(hours, settings.rate);

    await client.query(
      `UPDATE parking_sessions
         SET status = 'completed', out_time = $1, hours = $2, fee = $3, closed_at = now()
       WHERE id = $4`,
      [assignedOutTime, hours, fee, session.id]
    );
    await client.query(`UPDATE parking_slots SET status = 'empty' WHERE id = $1`, [slot.id]);

    return {
      receipt: {
        slotNumber: slot.slot_number ?? slotNumber,
        type: session.type,
        plate: session.plate,
        owner: session.owner,
        inTime: session.in_time,
        outTime: assignedOutTime,
        hours,
        fee,
      },
    };
  });
}

// ---------------------------------------------------------
// Reads
// ---------------------------------------------------------
async function listSlots() {
  const { rows } = await query(
    `SELECT
       ps.slot_number AS "slotNumber",
       ps.status,
       s.type, s.plate, s.owner, s.in_time AS "inTime"
     FROM parking_slots ps
     LEFT JOIN parking_sessions s ON s.slot_id = ps.id AND s.status = 'active'
     ORDER BY ps.slot_number`
  );
  return rows.map((r) => ({
    slotNumber: r.slotNumber,
    vehicle: r.status === 'occupied' ? { type: r.type, plate: r.plate, owner: r.owner } : null,
    inTime: r.status === 'occupied' ? r.inTime : null,
  }));
}

async function getSlot(slotNumber) {
  const { rows } = await query(
    `SELECT
       ps.slot_number AS "slotNumber",
       ps.status,
       s.type, s.plate, s.owner, s.in_time AS "inTime"
     FROM parking_slots ps
     LEFT JOIN parking_sessions s ON s.slot_id = ps.id AND s.status = 'active'
     WHERE ps.slot_number = $1`,
    [slotNumber]
  );
  const r = rows[0];
  if (!r) throw new AppError('Invalid slot number!', { status: 404, code: 'INVALID_SLOT' });
  return {
    slotNumber: r.slotNumber,
    vehicle: r.status === 'occupied' ? { type: r.type, plate: r.plate, owner: r.owner } : null,
    inTime: r.status === 'occupied' ? r.inTime : null,
  };
}

async function listOccupiedVehicles({ filter = 'all', search = '' } = {}) {
  const settings = await getSettingsRow();
  const params = [];
  const clauses = [`s.status = 'active'`];

  if (filter && filter !== 'all') {
    params.push(filter);
    clauses.push(`s.type = $${params.length}`);
  }
  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    const idx = params.length;
    clauses.push(`(LOWER(s.plate) LIKE $${idx} OR LOWER(s.owner) LIKE $${idx} OR CAST(s.slot_number AS TEXT) LIKE $${idx})`);
  }

  const { rows } = await query(
    `SELECT s.slot_number AS "slotNumber", s.type, s.plate, s.owner, s.in_time AS "inTime"
     FROM parking_sessions s
     WHERE ${clauses.join(' AND ')}
     ORDER BY s.slot_number`,
    params
  );

  const currentHour = new Date().getHours();
  return rows.map((r) => {
    const hours = computeHours(r.inTime, currentHour);
    const fee = computeFee(hours, settings.rate);
    return { ...r, hoursSoFar: hours, estimatedFee: fee };
  });
}

async function searchVehicles(qRaw) {
  const q = (qRaw || '').trim().toLowerCase();
  if (!q) return [];
  const { rows } = await query(
    `SELECT s.slot_number AS "slotNumber", s.type, s.plate, s.owner, s.in_time AS "inTime"
     FROM parking_sessions s
     WHERE s.status = 'active'
       AND (LOWER(s.plate) LIKE $1 OR LOWER(s.owner) LIKE $1 OR CAST(s.slot_number AS TEXT) LIKE $1)
     ORDER BY s.slot_number`,
    [`%${q}%`]
  );
  return rows;
}

async function getVehicleById(id) {
  const { rows } = await query(
    `SELECT id, type, plate, owner, created_at AS "createdAt" FROM vehicles WHERE id = $1`,
    [id]
  );
  const row = rows[0];
  if (!row) throw new AppError('Vehicle not found.', { status: 404, code: 'VEHICLE_NOT_FOUND' });
  return row;
}

module.exports = {
  normalizePlate,
  getSettingsRow,
  parkVehicle,
  removeVehicle,
  listSlots,
  getSlot,
  listOccupiedVehicles,
  searchVehicles,
  getVehicleById,
};
