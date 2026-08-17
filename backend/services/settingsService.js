// =========================================================
// SmartPark — settings read/update
// =========================================================
const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');

function rowToSettings(row) {
  return {
    rate: row.rate,
    totalSlots: row.total_slots,
    theme: row.theme,
    notifications: row.notifications,
    motion: row.motion,
  };
}

async function getSettings() {
  const { rows } = await query('SELECT * FROM settings WHERE id = 1');
  if (!rows[0]) throw new AppError('Settings not configured.', { status: 500, code: 'SETTINGS_MISSING' });
  return rowToSettings(rows[0]);
}

async function updateSettings(partial) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM settings WHERE id = 1 FOR UPDATE');
    const current = rows[0];
    if (!current) throw new AppError('Settings not configured.', { status: 500, code: 'SETTINGS_MISSING' });

    const next = {
      rate: partial.rate ?? current.rate,
      total_slots: current.total_slots,
      theme: partial.theme ?? current.theme,
      notifications: partial.notifications ?? current.notifications,
      motion: partial.motion ?? current.motion,
    };

    if (partial.totalSlots !== undefined) {
      const requested = partial.totalSlots;
      const { rows: slotRows } = await client.query('SELECT id, slot_number, status FROM parking_slots ORDER BY slot_number');

      if (requested > slotRows.length) {
        // Add empty trailing slots.
        const inserts = [];
        for (let n = slotRows.length + 1; n <= requested; n++) {
          inserts.push(client.query(`INSERT INTO parking_slots (slot_number, status) VALUES ($1, 'empty')`, [n]));
        }
        await Promise.all(inserts);
        next.total_slots = requested;
      } else if (requested < slotRows.length) {
        // Only remove empty trailing slots — never touch occupied ones,
        // and never remove a slot that isn't at the tail.
        let removable = 0;
        for (let i = slotRows.length - 1; i >= requested; i--) {
          if (slotRows[i].status !== 'empty') break;
          removable++;
        }
        const wouldRemoveOccupied = slotRows.length - removable > requested;
        if (wouldRemoveOccupied) {
          throw new AppError(
            'Cannot reduce total slots below the number of currently occupied bays.',
            { status: 409, code: 'SLOTS_OCCUPIED', details: { totalSlots: 'Cannot reduce below occupied slot count.' } }
          );
        }
        const toRemove = slotRows.slice(slotRows.length - removable).map((s) => s.id);
        if (toRemove.length) {
          await client.query(`DELETE FROM parking_slots WHERE id = ANY($1::int[])`, [toRemove]);
        }
        next.total_slots = slotRows.length - removable;
      } else {
        next.total_slots = requested;
      }
    }

    const { rows: updatedRows } = await client.query(
      `UPDATE settings
         SET rate = $1, total_slots = $2, theme = $3, notifications = $4, motion = $5, updated_at = now()
       WHERE id = 1
       RETURNING *`,
      [next.rate, next.total_slots, next.theme, next.notifications, next.motion]
    );

    return rowToSettings(updatedRows[0]);
  });
}

module.exports = { getSettings, updateSettings };
