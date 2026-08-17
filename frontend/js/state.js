(() => {
// =========================================================
// SmartPark — State & business logic
// Mirrors the original Java Main/ParkingSlot/Vehicle logic:
//   hours = outTime - inTime; if (hours <= 0) hours = 24 - (inTime - outTime);
//   fee = hours * rate
// =========================================================

const STORAGE_KEY = 'smartpark.state.v1';

const VEHICLE_TYPES = ['Car', 'Bike', 'Truck'];

function defaultState() {
  const slots = [];
  for (let i = 1; i <= 25; i++) {
    slots.push({ slotNumber: i, vehicle: null, inTime: null });
  }
  return {
    slots,
    history: [],          // { id, event: 'park'|'remove', slotNumber, type, plate, owner, inTime, outTime, hours, fee, ts }
    settings: {
      rate: 20,
      totalSlots: 25,
      theme: 'dark',
      notifications: true,
      motion: true,
    },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // basic shape guard
    if (!parsed || !Array.isArray(parsed.slots)) return defaultState();
    if (!parsed.settings) parsed.settings = defaultState().settings;
    if (!Array.isArray(parsed.history)) parsed.history = [];
    return parsed;
  } catch (e) {
    console.error('SmartPark: failed to load state, resetting.', e);
    return defaultState();
  }
}

const store = {
  state: loadState(),
  listeners: [],

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.error('SmartPark: failed to save state.', e);
    }
  },

  subscribe(fn) {
    this.listeners.push(fn);
  },

  emit() {
    this.listeners.forEach((fn) => fn(this.state));
  },

  commit() {
    this.save();
    this.emit();
  },
};

// ---------- derived helpers ----------

function getOccupiedSlots() {
  return store.state.slots.filter((s) => s.vehicle !== null);
}

function getAvailableSlots() {
  return store.state.slots.filter((s) => s.vehicle === null);
}

function getOccupancyRate() {
  const total = store.state.slots.length || 1;
  return Math.round((getOccupiedSlots().length / total) * 100);
}

function findPlate(plate) {
  const norm = plate.trim().toLowerCase();
  return store.state.slots.find(
    (s) => s.vehicle && s.vehicle.plate.trim().toLowerCase() === norm
  );
}

function computeHours(inTime, outTime) {
  let hours = outTime - inTime;
  if (hours <= 0) {
    hours = 24 - (inTime - outTime);
  }
  return hours;
}

function computeFee(hours) {
  return hours * store.state.settings.rate;
}

function isSameDay(ts, ref = new Date()) {
  const d = new Date(ts);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

function makeId() {
  return 'h_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// ---------- validation ----------

function validatePark({ type, plate, owner, inTime }) {
  const errors = {};

  if (!VEHICLE_TYPES.includes(type)) {
    errors.type = 'Invalid vehicle type!';
  }
  if (!plate || !plate.trim()) {
    errors.plate = 'Plate number is required.';
  }
  if (!owner || !owner.trim()) {
    errors.owner = 'Owner name is required.';
  }
  if (
    inTime === '' ||
    inTime === null ||
    inTime === undefined ||
    isNaN(inTime) ||
    Number(inTime) < 0 ||
    Number(inTime) > 23 ||
    !Number.isInteger(Number(inTime))
  ) {
    errors.inTime = 'Please enter a valid time between 0 and 23.';
  }
  if (!errors.plate && findPlate(plate)) {
    errors.plate = 'Vehicle with this plate number is already parked.';
  }

  return errors;
}

// ---------- actions ----------

/**
 * Parks a vehicle in the first available slot.
 * Returns { ok, slot, error }
 */
function parkVehicle({ type, plate, owner, inTime }) {
  const errors = validatePark({ type, plate, owner, inTime });
  if (Object.keys(errors).length) {
    return { ok: false, errors };
  }

  const slot = store.state.slots.find((s) => s.vehicle === null);
  if (!slot) {
    return { ok: false, errors: { general: 'No empty parking slots available!' } };
  }

  const t = Number(inTime);
  slot.vehicle = { type, plate: plate.trim(), owner: owner.trim() };
  slot.inTime = t;

  store.state.history.unshift({
    id: makeId(),
    event: 'park',
    slotNumber: slot.slotNumber,
    type,
    plate: plate.trim(),
    owner: owner.trim(),
    inTime: t,
    outTime: null,
    hours: null,
    fee: null,
    ts: Date.now(),
  });

  store.commit();
  return { ok: true, slot };
}

/**
 * Removes a vehicle from a slot number.
 * Returns { ok, receipt, error }
 */
function removeVehicle({ slotNumber, outTime }) {
  const n = Number(slotNumber);

  if (!Number.isInteger(n) || n < 1 || n > store.state.slots.length) {
    return { ok: false, error: 'Invalid slot number!' };
  }

  const slot = store.state.slots[n - 1];

  if (slot.vehicle === null) {
    return { ok: false, error: 'Slot is already empty!' };
  }

  if (
    outTime === '' ||
    outTime === null ||
    outTime === undefined ||
    isNaN(outTime) ||
    Number(outTime) < 0 ||
    Number(outTime) > 23 ||
    !Number.isInteger(Number(outTime))
  ) {
    return { ok: false, error: 'Please enter a valid time between 0 and 23.' };
  }

  const out = Number(outTime);
  const inTime = slot.inTime;
  const vehicle = slot.vehicle;
  const hours = computeHours(inTime, out);
  const fee = computeFee(hours);

  slot.vehicle = null;
  slot.inTime = null;

  store.state.history.unshift({
    id: makeId(),
    event: 'remove',
    slotNumber: n,
    type: vehicle.type,
    plate: vehicle.plate,
    owner: vehicle.owner,
    inTime,
    outTime: out,
    hours,
    fee,
    ts: Date.now(),
  });

  store.commit();

  return {
    ok: true,
    receipt: {
      slotNumber: n,
      type: vehicle.type,
      plate: vehicle.plate,
      owner: vehicle.owner,
      inTime,
      outTime: out,
      hours,
      fee,
    },
  };
}

function updateSettings(partial) {
  const s = store.state.settings;
  const next = { ...s, ...partial };

  if (partial.totalSlots !== undefined) {
    const newTotal = Math.max(1, Math.min(200, Number(partial.totalSlots) || s.totalSlots));
    const slots = store.state.slots;
    if (newTotal > slots.length) {
      for (let i = slots.length + 1; i <= newTotal; i++) {
        slots.push({ slotNumber: i, vehicle: null, inTime: null });
      }
    } else if (newTotal < slots.length) {
      // remove only empty trailing slots
      while (slots.length > newTotal && slots[slots.length - 1].vehicle === null) {
        slots.pop();
      }
    }
    next.totalSlots = slots.length;
  }

  store.state.settings = next;
  store.commit();
  return next;
}

function clearAllData() {
  const fresh = defaultState();
  fresh.settings = { ...store.state.settings }; // keep preferences
  store.state = fresh;
  store.commit();
}

function exportJSON() {
  return JSON.stringify(store.state, null, 2);
}

function exportCSV() {
  const rows = [
    ['Event', 'Slot', 'Type', 'Plate', 'Owner', 'InTime', 'OutTime', 'Hours', 'Fee', 'Timestamp'],
  ];
  store.state.history.forEach((h) => {
    rows.push([
      h.event,
      h.slotNumber,
      h.type,
      h.plate,
      h.owner,
      h.inTime,
      h.outTime ?? '',
      h.hours ?? '',
      h.fee ?? '',
      new Date(h.ts).toISOString(),
    ]);
  });
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function importJSON(text) {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.slots) || !Array.isArray(parsed.history)) {
      return { ok: false, error: 'That file doesn\u2019t look like a SmartPark export.' };
    }
    store.state = {
      slots: parsed.slots,
      history: parsed.history,
      settings: { ...defaultState().settings, ...(parsed.settings || {}) },
    };
    store.commit();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'Could not read that file. Make sure it\u2019s valid JSON.' };
  }
}

window.SP = window.SP || {};
window.SP.state = {
  store, getOccupiedSlots, getAvailableSlots, getOccupancyRate, findPlate,
  computeHours, computeFee, isSameDay, validatePark, parkVehicle, removeVehicle,
  updateSettings, clearAllData, exportJSON, exportCSV, importJSON,
};

})();
