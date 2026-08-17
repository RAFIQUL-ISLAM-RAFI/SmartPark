// =========================================================
// SmartPark — PostgreSQL connection pool
// =========================================================
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // A dead connection should fail fast rather than hang requests forever.
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
});

pool.on('error', (err) => {
  // Errors on idle clients (e.g. connection dropped by the server) should
  // not crash the whole process — log and let the pool recover.
  console.error('[db] unexpected error on idle client', err);
});

/**
 * Run a single query against the pool.
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run a callback inside a transaction. The callback receives a
 * dedicated client and must use it (not `pool`/`query`) for every
 * statement so everything happens on the same connection.
 * Automatically COMMITs on success and ROLLBACKs on any thrown error.
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[db] rollback failed', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

async function healthCheck() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = { pool, query, withTransaction, healthCheck };
