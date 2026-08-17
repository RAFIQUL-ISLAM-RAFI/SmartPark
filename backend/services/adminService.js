// =========================================================
// SmartPark — admin operations: clear-all data, JSON import
// =========================================================
const { withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');

async function clearAllData() {
  return withTransaction(async (client) => {
    await client.query('TRUNCATE parking_sessions, vehicles RESTART IDENTITY');
    await client.query(`UPDATE parking_slots SET status = 'empty'`);
  });
}

/**
 * Rebuilds the entire dataset from a previously-exported JSON payload
 * ({ slots, history, settings }). Runs inside a single transaction so
 * a malformed or partial import can never leave the database in a
 * half-restored state — validation happens before any write (via the
 * zod schema at the route layer), and any failure here rolls back
 * everything.
 */
async function importData({ slots = [], history = [], settings = {} }) {
  return withTransaction(async (client) => {
    await client.query('TRUNCATE parking_sessions, vehicles RESTART IDENTITY');

    const { rows: settingsRows } = await client.query('SELECT * FROM settings WHERE id = 1 FOR UPDATE');
    const current = settingsRows[0];
    if (!current) throw new AppError('Settings not configured.', { status: 500, code: 'SETTINGS_MISSING' });

    const totalSlots = settings.totalSlots ?? current.total_slots;

    await client.query('DELETE FROM parking_slots');
    if (totalSlots > 0) {
      const values = [];
      const params = [];
      for (let n = 1; n <= totalSlots; n++) {
        params.push(n);
        values.push(`($${params.length}, 'empty')`);
      }
      await client.query(`INSERT INTO parking_slots (slot_number, status) VALUES ${values.join(',')}`, params);
    }

    const slotIdByNumber = new Map();
    const { rows: slotRows } = await client.query('SELECT id, slot_number FROM parking_slots');
    slotRows.forEach((r) => slotIdByNumber.set(r.slot_number, r.id));

    // Rebuild active sessions from the currently-occupied slots in the export.
    for (const s of slots) {
      if (!s.vehicle) continue;
      const slotId = slotIdByNumber.get(s.slotNumber);
      if (!slotId) continue; // slot no longer exists after resize — skip rather than fail the whole import
      const plateNormalized = s.vehicle.plate.trim().toLowerCase();
      const { rows: vRows } = await client.query(
        `INSERT INTO vehicles (type, plate, plate_normalized, owner) VALUES ($1,$2,$3,$4) RETURNING id`,
        [s.vehicle.type, s.vehicle.plate.trim(), plateNormalized, s.vehicle.owner.trim()]
      );
      await client.query(
        `INSERT INTO parking_sessions (vehicle_id, slot_id, slot_number, type, plate, plate_normalized, owner, in_time, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active')`,
        [vRows[0].id, slotId, s.slotNumber, s.vehicle.type, s.vehicle.plate.trim(), plateNormalized, s.vehicle.owner.trim(), s.inTime]
      );
      await client.query(`UPDATE parking_slots SET status = 'occupied' WHERE id = $1`, [slotId]);
    }

    // Rebuild completed sessions from 'remove' events in the history log.
    for (const h of history) {
      if (h.event !== 'remove') continue;
      const plateNormalized = h.plate.trim().toLowerCase();
      const { rows: vRows } = await client.query(
        `INSERT INTO vehicles (type, plate, plate_normalized, owner) VALUES ($1,$2,$3,$4) RETURNING id`,
        [h.type, h.plate.trim(), plateNormalized, h.owner.trim()]
      );
      const closedAt = h.ts ? new Date(h.ts) : new Date();
      await client.query(
        `INSERT INTO parking_sessions
           (vehicle_id, slot_id, slot_number, type, plate, plate_normalized, owner, in_time, out_time, hours, fee, status, closed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'completed', $12)`,
        [
          vRows[0].id,
          slotIdByNumber.get(h.slotNumber) ?? null,
          h.slotNumber,
          h.type,
          h.plate.trim(),
          plateNormalized,
          h.owner.trim(),
          h.inTime,
          h.outTime,
          h.hours,
          h.fee,
          closedAt,
        ]
      );
    }

    const next = {
      rate: settings.rate ?? current.rate,
      total_slots: totalSlots,
      theme: settings.theme ?? current.theme,
      notifications: settings.notifications ?? current.notifications,
      motion: settings.motion ?? current.motion,
    };
    await client.query(
      `UPDATE settings SET rate=$1, total_slots=$2, theme=$3, notifications=$4, motion=$5, updated_at=now() WHERE id=1`,
      [next.rate, next.total_slots, next.theme, next.notifications, next.motion]
    );
  });
}

module.exports = { clearAllData, importData };
