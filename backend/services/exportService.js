// =========================================================
// SmartPark — data export (JSON / CSV)
// =========================================================
const { query } = require('../config/db');
const { listSlots, getSettingsRow } = require('./parkingService');

const HISTORY_SQL = `
  SELECT
    id::text || '-park' AS id, 'park' AS event, slot_number AS "slotNumber",
    type, plate, owner, in_time AS "inTime", NULL::int AS "outTime",
    NULL::int AS hours, NULL::int AS fee,
    (EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS ts
  FROM parking_sessions
  UNION ALL
  SELECT
    id::text || '-remove' AS id, 'remove' AS event, slot_number AS "slotNumber",
    type, plate, owner, in_time AS "inTime", out_time AS "outTime",
    hours, fee,
    (EXTRACT(EPOCH FROM closed_at) * 1000)::bigint AS ts
  FROM parking_sessions
  WHERE status = 'completed'
  ORDER BY ts DESC
`;

async function exportJSON() {
  const [slots, settings, { rows: history }] = await Promise.all([
    listSlots(),
    getSettingsRow(),
    query(HISTORY_SQL),
  ]);
  return JSON.stringify(
    {
      slots,
      history,
      settings: {
        rate: settings.rate,
        totalSlots: settings.total_slots,
        theme: settings.theme,
        notifications: settings.notifications,
        motion: settings.motion,
      },
      exportedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

async function exportCSV() {
  const { rows: history } = await query(HISTORY_SQL);
  const header = ['Event', 'Slot', 'Type', 'Plate', 'Owner', 'InTime', 'OutTime', 'Hours', 'Fee', 'Timestamp'];
  const lines = [header];
  history.forEach((h) => {
    lines.push([
      h.event,
      h.slotNumber,
      h.type,
      h.plate,
      h.owner,
      h.inTime,
      h.outTime ?? '',
      h.hours ?? '',
      h.fee ?? '',
      new Date(Number(h.ts)).toISOString(),
    ]);
  });
  return lines.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

module.exports = { exportJSON, exportCSV };
