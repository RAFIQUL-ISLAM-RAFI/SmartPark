# SmartPark — Parking Management System

A full-stack parking management system: the original SmartPark frontend, now
backed by a real Express + PostgreSQL API instead of `localStorage`.

## Features

- Live dashboard (occupancy ring, today's revenue, recent activity)
- Visual parking map (25 bays by default), filter/search by type or plate
- Park a vehicle → automatically assigned the next free bay
- Remove a vehicle → backend computes hours/fee authoritatively and returns a receipt
- Vehicles table with live "duration so far" / estimated fee
- Full activity history with filter, search, sort
- Reports: revenue by day, vehicle-type distribution, occupancy gauge
- Settings: parking rate, total slot count (safe to shrink — never deletes an
  occupied bay), theme, notifications, motion
- JSON/CSV export, JSON import (full data restore), clear-all
- Dark/light theme, responsive layout, toasts — all unchanged from the original UI

## Tech stack

- **Frontend:** the original HTML/CSS/vanilla JS, unchanged in structure —
  `render.js` and `charts.js` are byte-for-byte identical to the original.
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (via `pg`, with a proper connection pool)
- **Validation:** zod, enforced server-side regardless of what the client sends

## Project structure

```
SmartPark/
├── frontend/           static site served by Express
│   ├── index.html
│   ├── style.css
│   └── js/
│       ├── api.js      fetch wrapper around the REST API (new)
│       ├── state.js    client-side cache, hydrated from the API (rewritten)
│       ├── utils.js, toast.js, charts.js, render.js   (unchanged)
│       └── app.js      routing/UI wiring, now async (updated)
├── backend/
│   ├── server.js
│   ├── config/db.js            pg pool + transaction helper
│   ├── middleware/              validate.js (zod), errorHandler.js
│   ├── services/                 business logic (see below)
│   ├── controllers/              thin HTTP glue
│   ├── routes/
│   └── utils/                    AppError, asyncHandler, feeCalculator
├── database/
│   ├── schema.sql
│   └── seed.sql
├── scripts/setup-db.js   runs schema.sql + seed.sql for you
├── tests/api.test.js     Jest + Supertest integration tests
├── .env.example
└── package.json
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL` to a real PostgreSQL connection string, e.g.:

```
DATABASE_URL=postgresql://smartpark_user:your_password@localhost:5432/smartpark
```

Create the database and user first if they don't exist:

```sql
CREATE USER smartpark_user WITH PASSWORD 'your_password';
CREATE DATABASE smartpark OWNER smartpark_user;
```

### 3. Set up the database (schema + seed data)

```bash
npm run db:setup
```

This applies `database/schema.sql` and then `database/seed.sql`, so you get 25
slots, a handful of currently-parked vehicles, and some completed sessions to
look at right away. Safe to re-run — it truncates and reseeds each time.

### 4. Run it

```bash
npm run dev     # nodemon, auto-restarts on change
# or
npm start       # plain node
```

Open **http://localhost:5000** — the same Express server serves both the
frontend and the `/api/*` routes, so there's nothing else to configure.

### 5. Run the tests

Point `DATABASE_URL` at a throwaway/test database first (the suite resets the
schema before running), then:

```bash
npm test
```

## API overview

All responses follow `{ success: boolean, ... }`; errors follow
`{ success: false, message, code, details? }`.

| Method | Path                    | Description                              |
|--------|-------------------------|-------------------------------------------|
| GET    | `/api/health`           | DB connectivity check                     |
| GET    | `/api/dashboard`        | Aggregate stats for the dashboard         |
| GET    | `/api/slots`            | All slots with occupancy                  |
| GET    | `/api/slots/:n`         | One slot                                  |
| GET    | `/api/vehicles`         | Currently parked vehicles (`filter`, `search`) |
| GET    | `/api/vehicles/search`  | Search parked vehicles (`?q=`)            |
| GET    | `/api/vehicles/:id`     | One vehicle record                        |
| POST   | `/api/vehicles/park`    | `{ type, plate, owner, inTime }`          |
| POST   | `/api/vehicles/remove`  | `{ slotNumber, outTime }` → receipt       |
| GET    | `/api/activity`         | History (`filter`, `search`, `sort`, `page`, `pageSize`) |
| GET    | `/api/reports`          | `?range=all\|today\|7\|30`                |
| GET    | `/api/reports/revenue`  | Revenue-only slice                        |
| GET    | `/api/reports/vehicles` | Vehicle-type breakdown                    |
| GET    | `/api/settings`         | Current settings                          |
| PUT    | `/api/settings`         | Partial update                            |
| GET    | `/api/export/json`      | Downloads full data as JSON               |
| GET    | `/api/export/csv`       | Downloads history as CSV                  |
| POST   | `/api/admin/import`     | Restores data from an exported JSON file  |
| POST   | `/api/admin/reset`      | Clears all vehicles/sessions (keeps settings) |

### Example: park a vehicle

```bash
curl -X POST http://localhost:5000/api/vehicles/park \
  -H "Content-Type: application/json" \
  -d '{"type":"Car","plate":"DHA-1234","owner":"John Doe","inTime":10}'
```

```json
{ "success": true, "message": "Vehicle parked successfully", "slot": 5 }
```

### Example: remove a vehicle

```bash
curl -X POST http://localhost:5000/api/vehicles/remove \
  -H "Content-Type: application/json" \
  -d '{"slotNumber":5,"outTime":17}'
```

```json
{
  "success": true,
  "receipt": {
    "slotNumber": 5, "type": "Car", "plate": "DHA-1234", "owner": "John Doe",
    "inTime": 10, "outTime": 17, "hours": 7, "fee": 140
  }
}
```

## Business logic (authoritative, backend-only)

```
hours = outTime - inTime
if hours <= 0: hours = 24 - (inTime - outTime)
fee = hours * rate
```

This lives in `backend/utils/feeCalculator.js` and is only ever evaluated on
the server, using the rate stored in the database at the moment of removal.
The frontend shows an estimated "so far" fee using the same formula purely
for display — it is never trusted for the real transaction.

## Concurrency / data-integrity guarantees

- **No double-booking a slot:** `parkVehicle` locks the first free slot with
  `SELECT ... FOR UPDATE SKIP LOCKED`, so two simultaneous park requests each
  land on a different slot instead of racing for the same one.
- **No duplicate active plate:** a partial unique index
  (`uniq_active_session_per_plate`) makes it impossible at the database level
  for the same plate to have two active sessions, even under a race.
- **Transactions everywhere:** park, remove, settings updates, and import all
  run inside `withTransaction(...)` — any failure rolls back the whole
  operation, so the database is never left half-updated.
- **Safe slot-count reduction:** shrinking `totalSlots` only ever removes
  empty *trailing* slots; if that would touch an occupied bay, the request is
  rejected with `409 SLOTS_OCCUPIED` instead of silently corrupting data.

## Known limitations / architecture notes

- The Reports and Dashboard **charts** (`render.js`, unchanged from the
  original) compute their aggregates client-side from a synced copy of the
  full activity history, the same way they did against `localStorage`. The
  backend also exposes `/api/reports` and `/api/dashboard` with the same
  aggregates computed in SQL (and both are covered by the test suite) — a
  future iteration could point the charts at those endpoints directly instead
  of aggregating in the browser, but that would mean rewriting `render.js`,
  which the brief asked to leave alone.
- The client's local history mirror is fetched with `pageSize=1000`, which
  comfortably covers demo/typical use; a very high-volume facility would want
  the frontend switched to true server-side pagination for the Activity page.
- This sandbox has no network access, so `npm install` and a live PostgreSQL
  instance could not be exercised end-to-end here. The code has been written
  and reviewed carefully, but please run `npm install`, `npm run db:setup`,
  and `npm test` locally before relying on it in production.
