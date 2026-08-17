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
        `<div class="mini-slot ${s.vehicle ? 'is-occupied' : ''}" title="Slot ${s.slotNumber}${s.vehicle ? ' — ' + s.vehicle.plate : ' — empty'}">${s.slotNumber}</div>`
    )
    .join('');

  // recent activity
  const feed = document.getElementById('dashActivityFeed');
  const recent = state.history.slice(0, 8);
  if (!recent.length) {
    feed.innerHTML = '';
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
    ? `Slot ${h.slotNumber} · IN ${fmtTime(h.inTime)}`
    : `Slot ${h.slotNumber} · ${h.hours}h · ${fmtFee(h.fee)}`;
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
  emptyState.hidden = visible.length !== 0 || (!q && filter === 'all');
  if (visible.length === 0 && (q || filter !== 'all')) {
    emptyState.hidden = false;
    emptyState.textContent = 'No vehicles found.';
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
             role="listitem" tabindex="${occupied ? '0' : '-1'}"
             aria-label="Slot ${slot.slotNumber}, ${occupied ? 'occupied by ' + slot.vehicle.type + ' ' + slot.vehicle.plate : 'empty'}">
          <span class="slot-num">${String(slot.slotNumber).padStart(2, '0')}</span>
          <span class="slot-icon">${icon}</span>
          <span class="slot-status">${occupied ? 'Occupied' : 'Empty'}</span>
          ${occupied ? `<span class="slot-plate">${escapeHtml(slot.vehicle.plate)}</span>` : ''}
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
// Park view
// ---------------------------------------------------------
function renderParkPreview() {
  const available = getAvailableSlots();
  const next = available[0];
  document.getElementById('nextSlotNumber').textContent = next ? String(next.slotNumber).padStart(2, '0') : '—';
  document.getElementById('nextSlotVisual').querySelector('.next-slot-caption').textContent = next
    ? 'Slot ready for assignment'
    : 'Facility is full';
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
    emptyState.textContent = state.slots.some((s) => s.vehicle) ? 'No vehicles found.' : 'Your parking area is clear.';
    return;
  }
  emptyState.hidden = true;

  const now = new Date();
  const currentHour = now.getHours();

  tbody.innerHTML = rows
    .map((slot) => {
      const hours = computeHours(slot.inTime, currentHour);
      const fee = computeFee(hours);
      return `
        <tr>
          <td class="mono">#${String(slot.slotNumber).padStart(2, '0')}</td>
          <td><span class="badge badge--${slot.vehicle.type}">${slot.vehicle.type}</span></td>
          <td class="mono">${escapeHtml(slot.vehicle.plate)}</td>
          <td>${escapeHtml(slot.vehicle.owner)}</td>
          <td class="mono">${fmtTime(slot.inTime)}</td>
          <td>${hours}h (so far)</td>
          <td class="mono">${fmtFee(fee)}</td>
          <td><button class="row-action-btn" data-remove-slot="${slot.slotNumber}" type="button">Remove</button></td>
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
    emptyState.textContent = state.history.length ? 'No vehicles found.' : 'No parking activity yet.';
    return;
  }
  emptyState.hidden = true;

  tbody.innerHTML = rows
    .map(
      (h) => `
        <tr>
          <td><span class="badge badge--${h.event}">${h.event === 'park' ? 'Parked' : 'Removed'}</span></td>
          <td class="mono">#${String(h.slotNumber).padStart(2, '0')}</td>
          <td><span class="badge badge--${h.type}">${h.type}</span></td>
          <td class="mono">${escapeHtml(h.plate)}</td>
          <td>${escapeHtml(h.owner)}</td>
          <td class="mono">${fmtTime(h.inTime)}</td>
          <td class="mono">${h.outTime === null ? '—' : fmtTime(h.outTime)}</td>
          <td>${h.hours === null ? '—' : h.hours + 'h'}</td>
          <td class="mono">${h.fee === null ? '—' : fmtFee(h.fee)}</td>
          <td class="mono">${fmtDateTime(h.ts)}</td>
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
    ? Math.round((removals.reduce((s, h) => s + h.hours, 0) / removals.length) * 10) / 10
    : 0;

  animateCounter(document.querySelector('[data-counter="repTotalVehicles"]'), totalVehicles);
  animateCounter(document.querySelector('[data-counter="repTotalSessions"]'), totalSessions);
  animateCounter(document.querySelector('[data-counter="repRevenue"]'), revenue);
  animateCounter(document.querySelector('[data-counter="repAvgDuration"]'), avgDuration, {
    formatter: (n) => (Math.round(n * 10) / 10).toFixed(1),
  });

  // distribution donut (by parked vehicles in range)
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

  // occupancy gauge (current, always live regardless of range)
  drawGauge(document.getElementById('chartOccupancy'), getOccupancyRate());

  // revenue by day (last 7 buckets within range, or last 7 overall if 'all'/'today')
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
// Full re-render (used after any state change while a view is active)
// ---------------------------------------------------------
function renderAll(activeView, filters) {
  renderDashboard();
  if (activeView === 'slots') renderLot(filters.slots);
  if (activeView === 'park') renderParkPreview();
  if (activeView === 'vehicles') renderVehiclesTable(filters.vehicles);
  if (activeView === 'activity') renderActivityTable(filters.activity);
  if (activeView === 'reports') renderReports(filters.reportRange);
  if (activeView === 'settings') renderSettingsForm();
  // park preview stats are cheap, keep fresh always for the quick-park header
  renderParkPreview();
}

window.SP = window.SP || {};
window.SP.render = { renderDashboard, renderLot, flashSlot, renderParkPreview, renderVehiclesTable, renderActivityTable, renderReports, renderSettingsForm, renderAll };

})();
