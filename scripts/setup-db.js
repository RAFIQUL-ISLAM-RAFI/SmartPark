// =========================================================
// SmartPark — one-command DB setup
// Runs database/schema.sql then database/seed.sql against
// process.env.DATABASE_URL. Usage: npm run db:setup
// =========================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in first.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  const seed = fs.readFileSync(path.join(__dirname, '..', 'database', 'seed.sql'), 'utf8');

  try {
    console.log('Applying schema.sql...');
    await pool.query(schema);
    console.log('Applying seed.sql...');
    await pool.query(seed);
    console.log('Database setup complete.');
  } catch (err) {
    console.error('Database setup failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
