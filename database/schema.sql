-- =========================================================
-- SmartPark — PostgreSQL schema
-- =========================================================

DROP TABLE IF EXISTS parking_sessions CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;
DROP TABLE IF EXISTS parking_slots CASCADE;
DROP TABLE IF EXISTS settings CASCADE;

-- ---------------------------------------------------------
-- parking_slots
-- ---------------------------------------------------------
CREATE TABLE parking_slots (
  id          SERIAL PRIMARY KEY,
  slot_number INTEGER NOT NULL UNIQUE CHECK (slot_number > 0),
  status      TEXT NOT NULL DEFAULT 'empty' CHECK (status IN ('empty', 'occupied')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------
-- vehicles
-- A row per physical vehicle "identity" as entered. A plate may
-- reappear across many separate visits — that's expected — so
-- there is intentionally no global unique constraint on plate.
-- ---------------------------------------------------------
CREATE TABLE vehicles (
  id                SERIAL PRIMARY KEY,
  type              TEXT NOT NULL CHECK (type IN ('Car', 'Bike', 'Truck')),
  plate             TEXT NOT NULL,
  plate_normalized  TEXT NOT NULL,
  owner             TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vehicles_plate_normalized ON vehicles (plate_normalized);

-- ---------------------------------------------------------
-- parking_sessions
-- One row per park→remove lifecycle. `plate_normalized` is
-- denormalized onto the session so we can enforce "no two
-- active sessions for the same plate" with a partial unique
-- index, and so history/activity queries don't need a join.
-- ---------------------------------------------------------
CREATE TABLE parking_sessions (
  id                SERIAL PRIMARY KEY,
  vehicle_id        INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  -- Nullable on purpose: a completed session must survive even if its
  -- slot is later removed (e.g. after reducing total slot count).
  slot_id           INTEGER REFERENCES parking_slots(id) ON DELETE SET NULL,
  slot_number       INTEGER NOT NULL,
  type              TEXT NOT NULL CHECK (type IN ('Car', 'Bike', 'Truck')),
  plate             TEXT NOT NULL,
  plate_normalized  TEXT NOT NULL,
  owner             TEXT NOT NULL,
  in_time           INTEGER NOT NULL CHECK (in_time BETWEEN 0 AND 23),
  out_time          INTEGER CHECK (out_time BETWEEN 0 AND 23),
  hours             INTEGER CHECK (hours IS NULL OR hours > 0),
  fee               INTEGER CHECK (fee IS NULL OR fee >= 0),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at         TIMESTAMPTZ
);

-- Double-parking protection: only one active session per slot at a time.
CREATE UNIQUE INDEX uniq_active_session_per_slot
  ON parking_sessions (slot_id)
  WHERE status = 'active';

-- Only one active session per plate at a time.
CREATE UNIQUE INDEX uniq_active_session_per_plate
  ON parking_sessions (plate_normalized)
  WHERE status = 'active';

CREATE INDEX idx_sessions_status ON parking_sessions (status);
CREATE INDEX idx_sessions_created_at ON parking_sessions (created_at);
CREATE INDEX idx_sessions_closed_at ON parking_sessions (closed_at);

-- ---------------------------------------------------------
-- settings — single row, id is always 1
-- ---------------------------------------------------------
CREATE TABLE settings (
  id             INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  rate           INTEGER NOT NULL DEFAULT 60 CHECK (rate > 0),
  total_slots    INTEGER NOT NULL DEFAULT 25 CHECK (total_slots > 0 AND total_slots <= 200),
  theme          TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
  notifications  BOOLEAN NOT NULL DEFAULT true,
  motion         BOOLEAN NOT NULL DEFAULT true,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_parking_slots_updated_at
  BEFORE UPDATE ON parking_slots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
