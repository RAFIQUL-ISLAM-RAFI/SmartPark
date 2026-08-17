// =========================================================
// SmartPark — API integration tests
// Requires DATABASE_URL to point at a real (throwaway/test)
// PostgreSQL database. Resets the schema and reseeds before
// the suite runs, so it's safe to point at a dedicated test DB.
//
//   DATABASE_URL=postgresql://.../smartpark_test npm test
// =========================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { Pool } = require('pg');

const app = require('../backend/server');
const { pool } = require('../backend/config/db');

beforeAll(async () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  await pool.query(schema);
  await pool.query(`INSERT INTO settings (id, rate, total_slots) VALUES (1, 20, 5)`);
  await pool.query(
    `INSERT INTO parking_slots (slot_number, status) SELECT gs, 'empty' FROM generate_series(1, 5) AS gs`
  );
});

afterAll(async () => {
  await pool.end();
});

describe('GET /api/health', () => {
  it('reports a connected database', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('connected');
  });
});

describe('POST /api/vehicles/park', () => {
  it('parks a valid car', async () => {
    const res = await request(app)
      .post('/api/vehicles/park')
      .send({ type: 'Car', plate: 'TEST-001', owner: 'Alice', inTime: 9 });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.slot).toBe(1);
  });

  it('parks a valid bike into the next slot', async () => {
    const res = await request(app)
      .post('/api/vehicles/park')
      .send({ type: 'Bike', plate: 'TEST-002', owner: 'Bob', inTime: 10 });
    expect(res.status).toBe(201);
    expect(res.body.slot).toBe(2);
  });

  it('parks a valid truck', async () => {
    const res = await request(app)
      .post('/api/vehicles/park')
      .send({ type: 'Truck', plate: 'TEST-003', owner: 'Carl', inTime: 11 });
    expect(res.status).toBe(201);
  });

  it('rejects a duplicate active plate', async () => {
    const res = await request(app)
      .post('/api/vehicles/park')
      .send({ type: 'Car', plate: 'TEST-001', owner: 'Alice Again', inTime: 9 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('VEHICLE_ALREADY_PARKED');
  });

  it('rejects an empty plate', async () => {
    const res = await request(app)
      .post('/api/vehicles/park')
      .send({ type: 'Car', plate: '  ', owner: 'Dan', inTime: 9 });
    expect(res.status).toBe(422);
  });

  it('rejects an invalid vehicle type', async () => {
    const res = await request(app)
      .post('/api/vehicles/park')
      .send({ type: 'Airplane', plate: 'TEST-004', owner: 'Eve', inTime: 9 });
    expect(res.status).toBe(422);
  });

  it('rejects an out-of-range inTime', async () => {
    const res = await request(app)
      .post('/api/vehicles/park')
      .send({ type: 'Car', plate: 'TEST-005', owner: 'Frank', inTime: 30 });
    expect(res.status).toBe(422);
  });

  it('rejects parking when the lot is full', async () => {
    // slot 4, 5 still free — fill them, then the 6th attempt should fail
    await request(app).post('/api/vehicles/park').send({ type: 'Car', plate: 'TEST-006', owner: 'Gina', inTime: 8 });
    await request(app).post('/api/vehicles/park').send({ type: 'Car', plate: 'TEST-007', owner: 'Hana', inTime: 8 });
    const res = await request(app)
      .post('/api/vehicles/park')
      .send({ type: 'Car', plate: 'TEST-008', owner: 'Ivan', inTime: 8 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PARKING_FULL');
  });
});

describe('POST /api/vehicles/remove', () => {
  it('removes a parked vehicle and computes the fee', async () => {
    // TEST-001 is in slot 1, inTime 9
    const res = await request(app).post('/api/vehicles/remove').send({ slotNumber: 1, outTime: 12 });
    expect(res.status).toBe(200);
    expect(res.body.receipt.hours).toBe(3);
    expect(res.body.receipt.fee).toBe(60); // 3h * rate 20
  });

  it('computes an overnight wrap correctly', async () => {
    // Park a fresh vehicle at hour 22 into the now-empty slot 1
    await request(app).post('/api/vehicles/park').send({ type: 'Car', plate: 'TEST-009', owner: 'Jon', inTime: 22 });
    const res = await request(app).post('/api/vehicles/remove').send({ slotNumber: 1, outTime: 6 });
    expect(res.status).toBe(200);
    expect(res.body.receipt.hours).toBe(8); // 24 - (22-6)
  });

  it('rejects removal from an already-empty slot', async () => {
    const res = await request(app).post('/api/vehicles/remove').send({ slotNumber: 1, outTime: 10 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SLOT_EMPTY');
  });

  it('rejects an invalid slot number', async () => {
    const res = await request(app).post('/api/vehicles/remove').send({ slotNumber: 999, outTime: 10 });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('INVALID_SLOT');
  });
});

describe('GET /api/slots and /api/vehicles', () => {
  it('lists all slots with correct occupancy', async () => {
    const res = await request(app).get('/api/slots');
    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(5);
  });

  it('lists currently parked vehicles', async () => {
    const res = await request(app).get('/api/vehicles');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.vehicles)).toBe(true);
  });
});

describe('GET /api/dashboard', () => {
  it('returns aggregate stats', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.dashboard).toHaveProperty('totalSlots', 5);
    expect(res.body.dashboard).toHaveProperty('occupancyRate');
  });
});

describe('GET /api/reports', () => {
  it('returns report totals', async () => {
    const res = await request(app).get('/api/reports?range=all');
    expect(res.status).toBe(200);
    expect(res.body.report).toHaveProperty('revenue');
    expect(res.body.report).toHaveProperty('byType');
  });
});

describe('GET/PUT /api/settings', () => {
  it('reads current settings', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.settings.rate).toBe(20);
  });

  it('updates the rate', async () => {
    const res = await request(app).put('/api/settings').send({ rate: 25 });
    expect(res.status).toBe(200);
    expect(res.body.settings.rate).toBe(25);
  });

  it('refuses to shrink total slots below the occupied count', async () => {
    // slots 4 and 5 are still occupied by TEST-006 / TEST-007
    const res = await request(app).put('/api/settings').send({ totalSlots: 1 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SLOTS_OCCUPIED');
  });
});

describe('Unknown route', () => {
  it('returns a clean 404 JSON payload', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
