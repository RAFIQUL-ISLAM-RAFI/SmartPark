(() => {
// =========================================================
// SmartPark — Rendering
// =========================================================
const { store, getOccupiedSlots, getAvailableSlots, getOccupancyRate, isSameDay, computeHours, computeFee } = window.SP.state;
const { VEHICLE_ICONS, fmtTime, fmtFee, fmtRelative, fmtDateTime, escapeHtml, animateCounter } = window.SP.utils;
const { drawDonut, drawGauge, drawBars } = window.SP.charts;

const RING_CIRC_SIDEBAR = 2 * Math.PI * 15.5;
const RING_CIRC_HERO = 2 * Math.PI * 52;

function setRing(el, circumference, pct) {
  if (!el) return;
  const offset = circumference - (Math.max(0, Math.min(100, pct)) / 100) * circumference;
  el.style.strokeDasharray = String(circumference);
  el.style.strokeDashoffset = String(offset);
}

// ---------------------------------------------------------
// Connection Health Status
// ---------------------------------------------------------
function renderConnectionStatus() {
  const conn = store.state.connection;
  const el = document.getElementById('connectionPill');
  if (!el) return;

  if (conn.status === 'connected') {
    el.className = 'conn-pill conn-pill--online';
    el.innerHTML = `<span class="conn-dot"></span><span>PostgreSQL Connected</span><span class="conn-lat">${conn.latency}ms</span>`;
    el.title = `Connected to PostgreSQL database · API Latency: ${conn.latency}ms`;
  } else if (conn.status === 'connecting') {
    el.className = 'conn-pill conn-pill--connecting';
    el.innerHTML = `<span class="conn-dot"></span><span>Connecting DB...</span>`;
    el.title = 'Connecting to backend database...';
  } else {
    el.className = 'conn-pill conn-pill--offline';
    el.innerHTML = `<span class="conn-dot"></span><span>Database Offline</span>`;
    el.title = `PostgreSQL not connected. Make sure PostgreSQL is running and DATABASE_URL is set in .env`;
  }
}

// ---------------------------------------------------------
// SVG QR Code Ticket Generator
// ---------------------------------------------------------
function generateTicketQR(ticketData) {
  const hash = String(ticketData).split('').reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 1000000007, 42);
  const size = 21;
  let rects = '';

  const isFinder = (r, c) => {
    if (r < 7 && c < 7) return true;
    if (r < 7 && c >= size - 7) return true;
    if (r >= size - 7 && c < 7) return true;
    return false;
  };

  const isFinderFilled = (r, c) => {
    const checkPattern = (pr, pc) => {
      if (pr === 0 || pr === 6 || pc === 0 || pc === 6) return true;
      if (pr >= 2 && pr <= 4 && pc >= 2 && pc <= 4) return true;
      return false;
    };
    if (r < 7 && c < 7) return checkPattern(r, c);
    if (r < 7 && c >= size - 7) return checkPattern(r, c - (size - 7));
    if (r >= size - 7 && c < 7) return checkPattern(r - (size - 7), c);
    return false;
  };

  let pseudoRandom = hash;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let filled = false;
      if (isFinder(r, c)) {
        filled = isFinderFilled(r, c);
      } else {
        pseudoRandom = (pseudoRandom * 16807) % 2147483647;
        filled = (pseudoRandom % 3) === 0 || (r + c) % 3 === 0;
      }
      if (filled) {
        rects += `<rect x="${c * 6}" y="${r * 6}" width="6" height="6" fill="currentColor"/>`;
      }
    }
  }
  return `<svg viewBox="0 0 126 126" width="126" height="126" class="ticket-qr-svg" role="img" aria-label="QR Code">${rects}</svg>`;
}

// ---------------------------------------------------------
// Dashboard
// ---------------------------------------------------------
function renderDashboard() {
  const state = store.state;
  const occupied = getOccupiedSlots();
  const available = getAvailableSlots();
  const pct = getOccupancyRate();

  setRing(document.getElementById('sidebarRing'), RING_CIRC_SIDEBAR, pct);
  setRing(document.getElementById('heroRing'), RING_CIRC_HERO, pct);
  document.getElementById('sidebarOccPct').textContent = pct + '%';
  document.getElementById('heroOccPct').textContent = pct + '%';
  document.getElementById('heroAvailable').textContent = available.length;
  document.getElementById('heroOccupied').textContent = occupied.length;

  const todaysHistory = state.history.filter((h) => isSameDay(h.ts));
  const todaysRevenue = todaysHistory
    .filter((h) => h.event === 'remove')
    .reduce((sum, h) => sum + (h.fee || 0), 0);
  const totalVehiclesToday = todaysHistory.filter((h) => h.event === 'park').length;

  const counters = {
    totalSlots: state.slots.length,
    occupiedSlots: occupied.length,
    availableSlots: available.length,
    totalVehiclesToday,
    todaysRevenue,
    occRate: pct,
  };
  Object.entries(counters).forEach(([key, val]) => {
    const el = document.querySelector(`[data-counter="${key}"]`);
    animateCounter(el, val);
  });

  // mini lot preview
  const miniLot = document.getElementById('miniLot');
  miniLot.innerHTML = state.slots
    .map(
      (s) =>
        `<div class="mini-slot ${s.vehicle ? 'is-occupied' : ''}" title="Slot ${s.slotNumber}${s.vehicle ? ' — ' + escapeHtml(s.vehicle.plate) : ' — empty'}">${s.slotNumber}</div>`
    )
    .join('');

  // recent activity
  const feed = document.getElementById('dashActivityFeed');
  const recent = state.history.slice(0, 8);
  if (!recent.length) {
    feed.innerHTML = '<li class="activity-empty"><p>No recent activity recorded.</p></li>';
  } else {
    feed.innerHTML = recent
      .map((h) => activityItemHTML(h))
      .join('');
  }
}

function activityItemHTML(h) {
  const isParked = h.event === 'park';
  const verb = isParked ? 'parked' : 'removed';
  const detail = isParked
    ? `Slot #${String(h.slotNumber).padStart(2, '0')} · IN ${fmtTime(h.inTime)}`
    : `Slot #${String(h.slotNumber).padStart(2, '0')} · ${h.hours || 1}h · ${fmtFee(h.fee || 0)}`;
  return `
    <li class="activity-item">
      <span class="activity-dot activity-dot--${h.event}"></span>
      <span class="activity-text">
        <strong>${escapeHtml(h.type)} ${escapeHtml(h.plate)} ${verb}</strong>
        <p>${escapeHtml(h.owner)} · ${detail}</p>
      </span>
      <span class="activity-time">${fmtRelative(h.ts)}</span>
    </li>`;
}

// ---------------------------------------------------------
// Parking slot map
// ---------------------------------------------------------
function renderLot({ filter = 'all', search = '' } = {}) {
  const state = store.state;
  const q = search.trim().toLowerCase();
  const lot = document.getElementById('parkingLot');
  const emptyState = document.getElementById('slotsEmptyState');

  const matches = (slot) => {
    if (filter === 'empty' && slot.vehicle) return false;
    if (filter === 'occupied' && !slot.vehicle) return false;
    if (['Car', 'Bike', 'Truck'].includes(filter) && (!slot.vehicle || slot.vehicle.type !== filter)) return false;
    if (q) {
      const hay = slot.vehicle
        ? `${slot.vehicle.plate} ${slot.vehicle.owner} ${slot.slotNumber}`.toLowerCase()
        : `${slot.slotNumber}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  const visible = state.slots.filter(matches);
  if (visible.length === 0 && (q || filter !== 'all')) {
    emptyState.hidden = false;
    emptyState.textContent = 'No matching parking bays found.';
  } else {
    emptyState.hidden = true;
  }

  lot.innerHTML = state.slots
    .map((slot) => {
      const show = matches(slot);
      const occupied = !!slot.vehicle;
      const typeClass = occupied ? `type-${slot.vehicle.type}` : '';
      const icon = occupied ? VEHICLE_ICONS[slot.vehicle.type] : dashIcon();
      const style = show ? '' : 'style="display:none;"';
      return `
        <div class="slot ${occupied ? 'is-occupied' : 'is-empty'} ${typeClass}"
             data-slot="${slot.slotNumber}" ${style}
             role="listitem" tabindex="0"
             aria-label="Slot ${slot.slotNumber}, ${occupied ? 'occupied by ' + slot.vehicle.type + ' ' + slot.vehicle.plate : 'empty'}">
          <span class="slot-num">#${String(slot.slotNumber).padStart(2, '0')}</span>
          <span class="slot-icon">${icon}</span>
          <span class="slot-status">${occupied ? 'Occupied' : 'Empty'}</span>
          ${occupied ? `<span class="slot-plate">${escapeHtml(slot.vehicle.plate)}</span>` : '<span class="slot-plate slot-plate--avail">Available</span>'}
        </div>`;
    })
    .join('');
}

function dashIcon() {
  return '<svg viewBox="0 0 24 24"><path d="M8 12h8" stroke-dasharray="3 3"/></svg>';
}

function flashSlot(slotNumber, kind) {
  const el = document.querySelector(`.slot[data-slot="${slotNumber}"]`);
  if (!el) return;
  el.classList.add(kind === 'park' ? 'just-parked' : 'just-removed');
  setTimeout(() => el.classList.remove('just-parked', 'just-removed'), 700);
}

// ---------------------------------------------------------
// Park view preview
// ---------------------------------------------------------
function renderParkPreview() {
  const available = getAvailableSlots();
  const next = available[0];
  document.getElementById('nextSlotNumber').textContent = next ? `#${String(next.slotNumber).padStart(2, '0')}` : '—';
  document.getElementById('nextSlotVisual').querySelector('.next-slot-caption').textContent = next
    ? 'Next auto-assigned bay'
    : 'Parking facility is currently full';
  document.getElementById('qsAvailable').textContent = available.length;
  document.getElementById('qsOccupied').textContent = getOccupiedSlots().length;
}

// ---------------------------------------------------------
// Vehicles table
// ---------------------------------------------------------
function renderVehiclesTable({ filter = 'all', search = '' } = {}) {
  const state = store.state;
  const q = search.trim().toLowerCase();
  const rows = getOccupiedSlots().filter((slot) => {
    if (filter !== 'all' && slot.vehicle.type !== filter) return false;
    if (q) {
      const hay = `${slot.vehicle.plate} ${slot.vehicle.owner} ${slot.slotNumber}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const tbody = document.getElementById('vehicleTableBody');
  const emptyState = document.getElementById('vehiclesEmptyState');

  if (!rows.length) {
    tbody.innerHTML = '';
    emptyState.hidden = false;
    emptyState.textContent = state.slots.some((s) => s.vehicle) ? 'No vehicles matching search filter.' : 'Your parking facility has no active vehicles.';
    return;
  }
  emptyState.hidden = true;

  const currentHour = new Date().getHours();

  tbody.innerHTML = rows
    .map((slot) => {
      const hours = computeHours(slot.inTime, currentHour);
      const fee = computeFee(hours);
      return `
        <tr>
          <td class="mono font-bold">#${String(slot.slotNumber).padStart(2, '0')}</td>
          <td><span class="badge badge--${slot.vehicle.type}">${slot.vehicle.type}</span></td>
          <td class="mono font-bold">${escapeHtml(slot.vehicle.plate)}</td>
          <td>${escapeHtml(slot.vehicle.owner)}</td>
          <td class="mono">${fmtTime(slot.inTime)}</td>
          <td>${hours}h so far</td>
          <td class="mono font-bold text-accent">${fmtFee(fee)}</td>
          <td>
            <button class="row-action-btn" data-remove-slot="${slot.slotNumber}" type="button">
              Check Out
            </button>
          </td>
        </tr>`;
    })
    .join('');
}

// ---------------------------------------------------------
// Activity table
// ---------------------------------------------------------
function renderActivityTable({ filter = 'all', search = '', sort = 'newest' } = {}) {
  const state = store.state;
  const q = search.trim().toLowerCase();

  let rows = state.history.filter((h) => {
    if (filter !== 'all' && h.event !== filter) return false;
    if (q) {
      const hay = `${h.plate} ${h.owner} ${h.slotNumber}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  rows = rows.slice().sort((a, b) => (sort === 'newest' ? b.ts - a.ts : a.ts - b.ts));

  const tbody = document.getElementById('activityTableBody');
  const emptyState = document.getElementById('activityEmptyState');

  if (!rows.length) {
    tbody.innerHTML = '';
    emptyState.hidden = false;
    emptyState.textContent = state.history.length ? 'No activity matching your search filter.' : 'No parking activity logged yet.';
    return;
  }
  emptyState.hidden = true;

  tbody.innerHTML = rows
    .map(
      (h) => `
        <tr>
          <td><span class="badge badge--${h.event}">${h.event === 'park' ? 'Parked' : 'Checked Out'}</span></td>
          <td class="mono font-bold">#${String(h.slotNumber).padStart(2, '0')}</td>
          <td><span class="badge badge--${h.type}">${h.type}</span></td>
          <td class="mono font-bold">${escapeHtml(h.plate)}</td>
          <td>${escapeHtml(h.owner)}</td>
          <td class="mono">${fmtTime(h.inTime)}</td>
          <td class="mono">${h.outTime === null ? '—' : fmtTime(h.outTime)}</td>
          <td>${h.hours === null ? '—' : h.hours + 'h'}</td>
          <td class="mono font-bold">${h.fee === null ? '—' : fmtFee(h.fee)}</td>
          <td class="mono text-muted">${fmtDateTime(h.ts)}</td>
        </tr>`
    )
    .join('');
}

// ---------------------------------------------------------
// Reports
// ---------------------------------------------------------
function withinRange(ts, range) {
  if (range === 'all') return true;
  const now = Date.now();
  if (range === 'today') return isSameDay(ts);
  const days = Number(range);
  return now - ts <= days * 86400000;
}

function renderReports(range = 'all') {
  const state = store.state;
  const history = state.history.filter((h) => withinRange(h.ts, range));
  const removals = history.filter((h) => h.event === 'remove');
  const parks = history.filter((h) => h.event === 'park');

  const totalVehicles = parks.length;
  const totalSessions = removals.length;
  const revenue = removals.reduce((s, h) => s + (h.fee || 0), 0);
  const avgDuration = removals.length
    ? Math.round((removals.reduce((s, h) => s + (h.hours || 1), 0) / removals.length) * 10) / 10
    : 0;

  animateCounter(document.querySelector('[data-counter="repTotalVehicles"]'), totalVehicles);
  animateCounter(document.querySelector('[data-counter="repTotalSessions"]'), totalSessions);
  animateCounter(document.querySelector('[data-counter="repRevenue"]'), revenue);
  animateCounter(document.querySelector('[data-counter="repAvgDuration"]'), avgDuration, {
    formatter: (n) => (Math.round(n * 10) / 10).toFixed(1),
  });

  // distribution donut
  const byType = { Car: 0, Bike: 0, Truck: 0 };
  parks.forEach((h) => { byType[h.type] = (byType[h.type] || 0) + 1; });
  const cssVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  drawDonut(document.getElementById('chartDistribution'), [
    { label: 'Car', value: byType.Car, color: cssVar('--blue') },
    { label: 'Bike', value: byType.Bike, color: cssVar('--pink') },
    { label: 'Truck', value: byType.Truck, color: cssVar('--violet') },
  ]);
  const legend = document.getElementById('distributionLegend');
  legend.innerHTML = ['Car', 'Bike', 'Truck']
    .map((t) => `<span class="chart-legend-item"><i style="background:${cssVar(t === 'Car' ? '--blue' : t === 'Bike' ? '--pink' : '--violet')}"></i>${t} (${byType[t]})</span>`)
    .join('');

  // occupancy gauge
  drawGauge(document.getElementById('chartOccupancy'), getOccupancyRate());

  // revenue by day
  const days = [];
  const bucketCount = 7;
  for (let i = bucketCount - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  const points = days.map((d) => {
    const label = d.toLocaleDateString(undefined, { weekday: 'short' });
    const value = state.history
      .filter((h) => h.event === 'remove' && isSameDay(h.ts, d))
      .reduce((s, h) => s + (h.fee || 0), 0);
    return { label, value };
  });
  drawBars(document.getElementById('chartRevenue'), points);
}

// ---------------------------------------------------------
// Settings
// ---------------------------------------------------------
function renderSettingsForm() {
  const s = store.state.settings;
  document.getElementById('settingRate').value = s.rate;
  document.getElementById('settingSlots').value = s.totalSlots;
  document.querySelectorAll('#themeSegmented .seg-opt').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.theme === s.theme);
  });
  const notifSwitch = document.getElementById('notifToggle');
  notifSwitch.classList.toggle('is-on', s.notifications);
  notifSwitch.setAttribute('aria-checked', String(s.notifications));
  const motionSwitch = document.getElementById('motionToggle');
  motionSwitch.classList.toggle('is-on', s.motion);
  motionSwitch.setAttribute('aria-checked', String(s.motion));
}

// ---------------------------------------------------------
// Full re-render
// ---------------------------------------------------------
function renderAll(activeView, filters) {
  renderConnectionStatus();
  renderDashboard();
  if (activeView === 'slots') renderLot(filters.slots);
  if (activeView === 'park') renderParkPreview();
  if (activeView === 'vehicles') renderVehiclesTable(filters.vehicles);
  if (activeView === 'activity') renderActivityTable(filters.activity);
  if (activeView === 'reports') renderReports(filters.reportRange);
  if (activeView === 'settings') renderSettingsForm();
  renderParkPreview();
}

window.SP = window.SP || {};
window.SP.render = {
  renderConnectionStatus,
  generateTicketQR,
  renderDashboard,
  renderLot,
  flashSlot,
  renderParkPreview,
  renderVehiclesTable,
  renderActivityTable,
  renderReports,
  renderSettingsForm,
  renderAll,
};

})();
