(() => {
// =========================================================
// SmartPark — Reactive State Management (REST API Backed)
// Connects UI actions to the Express + PostgreSQL backend.
// =========================================================

const STORAGE_PREFS_KEY = 'smartpark.preferences.v1';
const VEHICLE_TYPES = ['Car', 'Bike', 'Truck'];

function defaultState() {
  const slots = [];
  for (let i = 1; i <= 25; i++) {
    slots.push({ slotNumber: i, vehicle: null, inTime: null });
  }
  return {
    slots,
    history: [],
    settings: {
      rate: 60,
      totalSlots: 25,
      theme: 'dark',
      notifications: true,
      motion: true,
    },
    reports: {
      totalVehicles: 0,
      totalSessions: 0,
      revenue: 0,
      avgDuration: 0,
      byType: { Car: 0, Bike: 0, Truck: 0 },
      occupancyRate: 0,
      revenueByDay: [],
    },
    connection: {
      status: 'connecting', // 'connected' | 'offline' | 'connecting'
      latency: 0,
      lastSync: null,
      error: null,
    },
    loading: false,
  };
}

function loadLocalPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (e) {
    return {};
  }
}

function saveLocalPrefs(settings) {
  try {
    localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(settings));
  } catch (e) {
    // Ignore storage quota errors
  }
}

const store = {
  state: defaultState(),
  listeners: [],

  subscribe(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  },

  emit() {
    this.listeners.forEach((fn) => {
      try {
        fn(this.state);
      } catch (err) {
        console.error('State subscriber error:', err);
      }
    });
  },

  set(partial) {
    this.state = { ...this.state, ...partial };
    this.emit();
  },
};

// Apply cached preferences on first tick
const initialPrefs = loadLocalPrefs();
if (initialPrefs.theme) store.state.settings.theme = initialPrefs.theme;
if (initialPrefs.motion !== undefined) store.state.settings.motion = initialPrefs.motion;

// ---------- Derived Helpers ----------

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
  if (!plate) return null;
  const norm = plate.trim().toLowerCase();
  return store.state.slots.find(
    (s) => s.vehicle && s.vehicle.plate.trim().toLowerCase() === norm
  );
}

function computeHours(inTime, outTime) {
  if (inTime === outTime) {
    return 1; // Minimum 1-hour charge
  }
  let hours = outTime - inTime;
  if (hours < 0) {
    hours = 24 - (inTime - outTime);
  }
  return Math.max(1, hours);
}

function computeFee(hours, rate = store.state.settings.rate) {
  return Math.max(1, hours) * (rate || 20);
}

function isSameDay(ts, ref = new Date()) {
  if (!ts) return false;
  const d = new Date(Number(ts));
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

// ---------- Client-side Validations ----------

function validatePark({ type, plate, owner, inTime }) {
  const errors = {};

  if (!VEHICLE_TYPES.includes(type)) {
    errors.type = 'Invalid vehicle type!';
  }
  if (!plate || !plate.trim()) {
    errors.plate = 'Plate number is required.';
  } else if (plate.trim().length > 20) {
    errors.plate = 'Plate number is too long.';
  }
  if (!owner || !owner.trim()) {
    errors.owner = 'Owner name is required.';
  } else if (owner.trim().length > 80) {
    errors.owner = 'Owner name is too long.';
  }
  if (inTime !== '' && inTime !== null && inTime !== undefined) {
    const num = Number(inTime);
    if (isNaN(num) || num < 0 || num > 23 || !Number.isInteger(num)) {
      errors.inTime = 'Please enter a valid time between 0 and 23.';
    }
  }
  if (!errors.plate && findPlate(plate)) {
    errors.plate = 'Vehicle with this plate number is already parked.';
  }

  return errors;
}

// ---------- Server Synchronization ----------

async function syncFromServer(showLoader = false) {
  const api = window.SP.api;
  if (!api) return;

  if (showLoader) store.set({ loading: true });

  try {
    const [healthRes, slotsRes, activityRes, settingsRes, reportsRes] = await Promise.all([
      api.health().catch((e) => ({ database: 'disconnected', latency: 0, error: e.message })),
      api.getSlots().catch(() => ({ slots: store.state.slots })),
      api.getActivity({ pageSize: 100 }).catch(() => ({ rows: store.state.history })),
      api.getSettings().catch(() => ({ settings: store.state.settings })),
      api.getReports('all').catch(() => ({ reports: store.state.reports })),
    ]);

    const isConnected = healthRes.database === 'connected';

    store.state.slots = slotsRes.slots || store.state.slots;
    store.state.history = activityRes.rows || store.state.history;
    store.state.settings = settingsRes.settings || store.state.settings;
    store.state.reports = reportsRes.reports || reportsRes || store.state.reports;
    store.state.connection = {
      status: isConnected ? 'connected' : 'offline',
      latency: healthRes.latency || 0,
      lastSync: new Date(),
      error: isConnected ? null : (healthRes.error || 'Database unavailable'),
    };
    store.state.loading = false;

    saveLocalPrefs(store.state.settings);
    store.emit();
    return true;
  } catch (err) {
    store.state.connection = {
      status: 'offline',
      latency: 0,
      lastSync: new Date(),
      error: err.message,
    };
    store.state.loading = false;
    store.emit();
    return false;
  }
}

// ---------- Asynchronous Actions ----------

/**
 * Parks a vehicle via the backend API with live automatic time.
 * Returns { ok, slot, errors, message }
 */
async function parkVehicle({ type, plate, owner, inTime }) {
  const clientErrors = validatePark({ type, plate, owner, inTime });
  if (Object.keys(clientErrors).length > 0) {
    return { ok: false, errors: clientErrors, message: Object.values(clientErrors)[0] };
  }

  const assignedInTime = (inTime === '' || inTime === null || inTime === undefined)
    ? new Date().getHours()
    : Number(inTime);

  const api = window.SP.api;
  const payload = {
    type,
    plate: plate.trim(),
    owner: owner.trim(),
    inTime: assignedInTime,
  };

  try {
    const res = await api.parkVehicle(payload);
    await syncFromServer();
    return {
      ok: true,
      slot: {
        slotNumber: res.slot,
        vehicle: { type: payload.type, plate: payload.plate, owner: payload.owner },
        inTime: payload.inTime,
      },
      message: res.message || 'Vehicle parked successfully',
    };
  } catch (err) {
    return {
      ok: false,
      errors: err.details || { general: err.message },
      message: err.message || 'Failed to park vehicle',
    };
  }
}

/**
 * Removes a vehicle via the backend API with live automatic time.
 * Returns { ok, receipt, error }
 */
async function removeVehicle({ slotNumber, outTime }) {
  const n = Number(slotNumber);
  const assignedOutTime = (outTime === '' || outTime === null || outTime === undefined)
    ? new Date().getHours()
    : Number(outTime);

  if (!Number.isInteger(n) || n < 1) {
    return { ok: false, error: 'Invalid slot number!' };
  }

  if (isNaN(assignedOutTime) || assignedOutTime < 0 || assignedOutTime > 23 || !Number.isInteger(assignedOutTime)) {
    return { ok: false, error: 'Please enter a valid time between 0 and 23.' };
  }

  const api = window.SP.api;
  try {
    const res = await api.removeVehicle({ slotNumber: n, outTime: assignedOutTime });
    await syncFromServer();
    return { ok: true, receipt: res.receipt };
  } catch (err) {
    return { ok: false, error: err.message || 'Failed to remove vehicle.' };
  }
}

/**
 * Updates application settings via the backend API.
 */
async function updateSettings(partial) {
  const api = window.SP.api;
  try {
    const res = await api.updateSettings(partial);
    store.state.settings = res.settings;
    saveLocalPrefs(res.settings);
    await syncFromServer();
    return { ok: true, settings: res.settings };
  } catch (err) {
    return { ok: false, error: err.message || 'Failed to update settings.' };
  }
}

/**
 * Resets all parking and session data on the backend.
 */
async function clearAllData() {
  const api = window.SP.api;
  try {
    await api.resetData();
    await syncFromServer();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'Failed to reset data.' };
  }
}

/**
 * Imports full dataset into the backend.
 */
async function importJSON(text) {
  let parsed;
  try {
    parsed = typeof text === 'string' ? JSON.parse(text) : text;
  } catch (e) {
    return { ok: false, error: 'Could not read that file. Make sure it is valid JSON.' };
  }

  if (!parsed || (!parsed.slots && !parsed.history && !parsed.settings)) {
    return { ok: false, error: 'That file does not look like a SmartPark export.' };
  }

  const api = window.SP.api;
  try {
    await api.importData(parsed);
    await syncFromServer();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'Failed to import data.' };
  }
}

function exportJSON() {
  return JSON.stringify({
    slots: store.state.slots,
    history: store.state.history,
    settings: store.state.settings,
    exportedAt: new Date().toISOString(),
  }, null, 2);
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
      new Date(Number(h.ts) || Date.now()).toISOString(),
    ]);
  });
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

window.SP = window.SP || {};
window.SP.state = {
  store,
  getOccupiedSlots,
  getAvailableSlots,
  getOccupancyRate,
  findPlate,
  computeHours,
  computeFee,
  isSameDay,
  validatePark,
  syncFromServer,
  parkVehicle,
  removeVehicle,
  updateSettings,
  clearAllData,
  exportJSON,
  exportCSV,
  importJSON,
};

})();
