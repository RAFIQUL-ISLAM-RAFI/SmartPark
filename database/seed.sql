-- =========================================================
-- SmartPark — Seed data
-- Run after schema.sql. Safe to re-run: it wipes the tables
-- it seeds first.
-- =========================================================

TRUNCATE parking_sessions, vehicles, parking_slots, settings RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------
-- settings
-- ---------------------------------------------------------
INSERT INTO settings (id, rate, total_slots, theme, notifications, motion)
VALUES (1, 20, 25, 'dark', true, true);

-- ---------------------------------------------------------
-- 25 parking slots
-- ---------------------------------------------------------
INSERT INTO parking_slots (slot_number, status)
SELECT gs, 'empty' FROM generate_series(1, 25) AS gs;

-- ---------------------------------------------------------
-- helper: park + optionally remove, using the same fee logic
-- as the backend (hours = out - in; if <=0, 24 - (in - out))
-- ---------------------------------------------------------
DO $$
DECLARE
  v_id INT;
  s_id INT;
  computed_hours INT;
  computed_fee INT;
BEGIN
  -- ---- Currently parked vehicles (active sessions) ----

  INSERT INTO vehicles (type, plate, plate_normalized, owner) VALUES ('Car', 'DHA-1234', 'dha-1234', 'Rahim Ahmed') RETURNING id INTO v_id;
  SELECT id INTO s_id FROM parking_slots WHERE slot_number = 1;
  UPDATE parking_slots SET status = 'occupied' WHERE id = s_id;
  INSERT INTO parking_sessions (vehicle_id, slot_id, slot_number, type, plate, plate_normalized, owner, in_time, status)
  VALUES (v_id, s_id, 1, 'Car', 'DHA-1234', 'dha-1234', 'Rahim Ahmed', 8, 'active');

  INSERT INTO vehicles (type, plate, plate_normalized, owner) VALUES ('Bike', 'DHA-5521', 'dha-5521', 'Karim Sheikh') RETURNING id INTO v_id;
  SELECT id INTO s_id FROM parking_slots WHERE slot_number = 2;
  UPDATE parking_slots SET status = 'occupied' WHERE id = s_id;
  INSERT INTO parking_sessions (vehicle_id, slot_id, slot_number, type, plate, plate_normalized, owner, in_time, status)
  VALUES (v_id, s_id, 2, 'Bike', 'DHA-5521', 'dha-5521', 'Karim Sheikh', 9, 'active');

  INSERT INTO vehicles (type, plate, plate_normalized, owner) VALUES ('Truck', 'CTG-8890', 'ctg-8890', 'Jamal Traders') RETURNING id INTO v_id;
  SELECT id INTO s_id FROM parking_slots WHERE slot_number = 3;
  UPDATE parking_slots SET status = 'occupied' WHERE id = s_id;
  INSERT INTO parking_sessions (vehicle_id, slot_id, slot_number, type, plate, plate_normalized, owner, in_time, status)
  VALUES (v_id, s_id, 3, 'Truck', 'CTG-8890', 'ctg-8890', 'Jamal Traders', 6, 'active');

  INSERT INTO vehicles (type, plate, plate_normalized, owner) VALUES ('Car', 'DHA-7743', 'dha-7743', 'Nasrin Akter') RETURNING id INTO v_id;
  SELECT id INTO s_id FROM parking_slots WHERE slot_number = 4;
  UPDATE parking_slots SET status = 'occupied' WHERE id = s_id;
  INSERT INTO parking_sessions (vehicle_id, slot_id, slot_number, type, plate, plate_normalized, owner, in_time, status)
  VALUES (v_id, s_id, 4, 'Car', 'DHA-7743', 'dha-7743', 'Nasrin Akter', 10, 'active');

  -- ---- Completed sessions (history), spread over the last few days ----

  -- Today, completed
  INSERT INTO vehicles (type, plate, plate_normalized, owner) VALUES ('Car', 'DHA-3301', 'dha-3301', 'Farid Uddin') RETURNING id INTO v_id;
  SELECT id INTO s_id FROM parking_slots WHERE slot_number = 5;
  computed_hours := 4; computed_fee := computed_hours * 20;
  INSERT INTO parking_sessions (vehicle_id, slot_id, slot_number, type, plate, plate_normalized, owner, in_time, out_time, hours, fee, status, created_at, closed_at)
  VALUES (v_id, s_id, 5, 'Car', 'DHA-3301', 'dha-3301', 'Farid Uddin', 7, 11, computed_hours, computed_fee, 'completed', now() - interval '5 hours', now() - interval '1 hour');

  INSERT INTO vehicles (type, plate, plate_normalized, owner) VALUES ('Bike', 'DHA-9012', 'dha-9012', 'Shafiq Islam') RETURNING id INTO v_id;
  SELECT id INTO s_id FROM parking_slots WHERE slot_number = 6;
  computed_hours := 3; computed_fee := computed_hours * 20;
  INSERT INTO parking_sessions (vehicle_id, slot_id, slot_number, type, plate, plate_normalized, owner, in_time, out_time, hours, fee, status, created_at, closed_at)
  VALUES (v_id, s_id, 6, 'Bike', 'DHA-9012', 'dha-9012', 'Shafiq Islam', 9, 12, computed_hours, computed_fee, 'completed', now() - interval '4 hours', now() - interval '2 hours');

  -- Yesterday, completed
  INSERT INTO vehicles (type, plate, plate_normalized, owner) VALUES ('Truck', 'CTG-4410', 'ctg-4410', 'Bilal Motors') RETURNING id INTO v_id;
  SELECT id INTO s_id FROM parking_slots WHERE slot_number = 7;
  computed_hours := 6; computed_fee := computed_hours * 20;
  INSERT INTO parking_sessions (vehicle_id, slot_id, slot_number, type, plate, plate_normalized, owner, in_time, out_time, hours, fee, status, created_at, closed_at)
  VALUES (v_id, s_id, 7, 'Truck', 'CTG-4410', 'ctg-4410', 'Bilal Motors', 8, 14, computed_hours, computed_fee, 'completed', now() - interval '1 day 6 hours', now() - interval '1 day');

  INSERT INTO vehicles (type, plate, plate_normalized, owner) VALUES ('Car', 'DHA-6620', 'dha-6620', 'Tania Rahman') RETURNING id INTO v_id;
  SELECT id INTO s_id FROM parking_slots WHERE slot_number = 8;
  computed_hours := 5; computed_fee := computed_hours * 20;
  INSERT INTO parking_sessions (vehicle_id, slot_id, slot_number, type, plate, plate_normalized, owner, in_time, out_time, hours, fee, status, created_at, closed_at)
  VALUES (v_id, s_id, 8, 'Car', 'DHA-6620', 'dha-6620', 'Tania Rahman', 10, 15, computed_hours, computed_fee, 'completed', now() - interval '1 day 5 hours', now() - interval '1 day 1 hour');

  -- 3 days ago, completed
  INSERT INTO vehicles (type, plate, plate_normalized, owner) VALUES ('Bike', 'DHA-1188', 'dha-1188', 'Milon Hossain') RETURNING id INTO v_id;
  SELECT id INTO s_id FROM parking_slots WHERE slot_number = 9;
  computed_hours := 2; computed_fee := computed_hours * 20;
  INSERT INTO parking_sessions (vehicle_id, slot_id, slot_number, type, plate, plate_normalized, owner, in_time, out_time, hours, fee, status, created_at, closed_at)
  VALUES (v_id, s_id, 9, 'Bike', 'DHA-1188', 'dha-1188', 'Milon Hossain', 14, 16, computed_hours, computed_fee, 'completed', now() - interval '3 days 2 hours', now() - interval '3 days');

  -- Overnight session (wraps past midnight) to exercise the 24h-wrap fee formula
  INSERT INTO vehicles (type, plate, plate_normalized, owner) VALUES ('Car', 'DHA-2255', 'dha-2255', 'Anwar Kabir') RETURNING id INTO v_id;
  SELECT id INTO s_id FROM parking_slots WHERE slot_number = 10;
  computed_hours := 24 - (22 - 6); computed_fee := computed_hours * 20;
  INSERT INTO parking_sessions (vehicle_id, slot_id, slot_number, type, plate, plate_normalized, owner, in_time, out_time, hours, fee, status, created_at, closed_at)
  VALUES (v_id, s_id, 10, 'Car', 'DHA-2255', 'dha-2255', 'Anwar Kabir', 22, 6, computed_hours, computed_fee, 'completed', now() - interval '4 days', now() - interval '3 days 14 hours');

END $$;
