// =========================================================
// SmartPark — dashboard / activity / reports read models
// =========================================================
const { query } = require('../config/db');
const { getSettingsRow } = require('./parkingService');

// A single query that produces the same "history" shape the original
// frontend used: every session contributes a 'park' event, and a
// completed session additionally contributes a 'remove' event.
const ACTIVITY_UNION_SQL = `
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
`;

async function getDashboard() {
  const settings = await getSettingsRow();

  const [{ rows: slotCounts }, { rows: todayRows }, { rows: recentRows }] = await Promise.all([
    query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'occupied')::int AS occupied,
         COUNT(*) FILTER (WHERE status = 'empty')::int AS available
       FROM parking_slots`
    ),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE)::int AS "totalVehiclesToday",
         COALESCE(SUM(fee) FILTER (WHERE status = 'completed' AND closed_at::date = CURRENT_DATE), 0)::int AS "todaysRevenue"
       FROM parking_sessions`
    ),
    query(`SELECT * FROM (${ACTIVITY_UNION_SQL}) t ORDER BY ts DESC LIMIT 8`),
  ]);

  const counts = slotCounts[0];
  const occRate = counts.total ? Math.round((counts.occupied / counts.total) * 100) : 0;

  return {
    totalSlots: counts.total,
    occupiedSlots: counts.occupied,
    availableSlots: counts.available,
    occupancyRate: occRate,
    totalVehiclesToday: todayRows[0].totalVehiclesToday,
    todaysRevenue: todayRows[0].todaysRevenue,
    rate: settings.rate,
    recentActivity: recentRows.map((r) => ({ ...r, ts: Number(r.ts) })),
  };
}

async function getActivity({ filter = 'all', search = '', sort = 'newest', page = 1, pageSize = 50 } = {}) {
  const q = (search || '').trim().toLowerCase();
  const clauses = [];
  const params = [];

  if (filter && filter !== 'all') {
    params.push(filter);
    clauses.push(`event = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    const idx = params.length;
    clauses.push(`(LOWER(plate) LIKE $${idx} OR LOWER(owner) LIKE $${idx} OR CAST("slotNumber" AS TEXT) LIKE $${idx})`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const orderDir = sort === 'oldest' ? 'ASC' : 'DESC';
  const limit = Math.max(1, Math.min(500, Number(pageSize) || 50));
  const offset = Math.max(0, (Number(page) || 1) - 1) * limit;

  params.push(limit, offset);

  const { rows } = await query(
    `SELECT * FROM (${ACTIVITY_UNION_SQL}) t
     ${where}
     ORDER BY ts ${orderDir}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total FROM (${ACTIVITY_UNION_SQL}) t ${where}`,
    params.slice(0, params.length - 2)
  );

  return {
    rows: rows.map((r) => ({ ...r, ts: Number(r.ts) })),
    total: countRows[0].total,
    page: Number(page) || 1,
    pageSize: limit,
  };
}

function withinRangeSql(column, range) {
  if (range === 'today') return `${column}::date = CURRENT_DATE`;
  if (/^\d+$/.test(String(range))) return `${column} >= now() - interval '${Number(range)} days'`;
  return 'TRUE'; // 'all'
}

async function getReports(range = 'all') {
  const rangeCond = withinRangeSql('created_at', range);
  const closedRangeCond = withinRangeSql('closed_at', range);

  const [{ rows: totalsRows }, { rows: typeRows }, { rows: revenueRows }] = await Promise.all([
    query(
      `SELECT
         COUNT(*) FILTER (WHERE ${rangeCond})::int AS "totalVehicles",
         COUNT(*) FILTER (WHERE status = 'completed' AND ${closedRangeCond})::int AS "totalSessions",
         COALESCE(SUM(fee) FILTER (WHERE status = 'completed' AND ${closedRangeCond}), 0)::int AS "revenue",
         COALESCE(AVG(hours) FILTER (WHERE status = 'completed' AND ${closedRangeCond}), 0)::float AS "avgDuration"
       FROM parking_sessions`
    ),
    query(
      `SELECT type, COUNT(*)::int AS count
       FROM parking_sessions
       WHERE ${rangeCond}
       GROUP BY type`
    ),
    query(
      `SELECT to_char(d::date, 'Dy') AS label, d::date AS day,
              COALESCE(SUM(ps.fee) FILTER (WHERE ps.status = 'completed'), 0)::int AS value
       FROM generate_series(CURRENT_DATE - interval '6 days', CURRENT_DATE, interval '1 day') AS d
       LEFT JOIN parking_sessions ps ON ps.closed_at::date = d::date AND ps.status = 'completed'
       GROUP BY d, label
       ORDER BY d`
    ),
  ]);

  const totals = totalsRows[0];
  const byType = { Car: 0, Bike: 0, Truck: 0 };
  typeRows.forEach((r) => { byType[r.type] = r.count; });

  const occupancy = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'occupied')::int AS occupied
     FROM parking_slots`
  );
  const occ = occupancy.rows[0];
  const occupancyRate = occ.total ? Math.round((occ.occupied / occ.total) * 100) : 0;

  return {
    totalVehicles: totals.totalVehicles,
    totalSessions: totals.totalSessions,
    revenue: totals.revenue,
    avgDuration: Math.round(totals.avgDuration * 10) / 10,
    byType,
    occupancyRate,
    revenueByDay: revenueRows.map((r) => ({ label: r.label, value: r.value })),
  };
}

module.exports = { getDashboard, getActivity, getReports };
