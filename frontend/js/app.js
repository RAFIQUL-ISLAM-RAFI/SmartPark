(() => {
// =========================================================
// SmartPark — App entry: routing, events, modals
// =========================================================
const { store, parkVehicle, removeVehicle, updateSettings, clearAllData, exportJSON, exportCSV, importJSON, computeHours, computeFee } = window.SP.state;
const { toast } = window.SP.toast;
const { renderAll, renderLot, renderVehiclesTable, renderActivityTable, renderReports, renderSettingsForm, renderParkPreview, flashSlot } = window.SP.render;
const { VEHICLE_ICONS, fmtTime, fmtFee, escapeHtml, debounce } = window.SP.utils;

// ---------------------------------------------------------
// Local UI state (not persisted — filters/search per view)
// ---------------------------------------------------------
const filters = {
  slots: { filter: 'all', search: '' },
  vehicles: { filter: 'all', search: '' },
  activity: { filter: 'all', search: '', sort: 'newest' },
  reportRange: 'all',
};

let activeView = 'dashboard';

// ---------------------------------------------------------
// Theme / motion
// ---------------------------------------------------------
function applyTheme() {
  document.documentElement.setAttribute('data-theme', store.state.settings.theme);
  const iconPath = store.state.settings.theme === 'dark'
    ? '<path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.4 5.4 0 0 1-7.54-7.54A9 9 0 0 0 12 3z"/>'
    : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  const svg = document.getElementById('themeIcon');
  svg.setAttribute('fill', store.state.settings.theme === 'dark' ? 'currentColor' : 'none');
  svg.setAttribute('stroke', store.state.settings.theme === 'dark' ? 'none' : 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.innerHTML = iconPath;
}

function applyMotion() {
  document.documentElement.dataset.reducedMotion = store.state.settings.motion ? 'false' : 'true';
}

// ---------------------------------------------------------
// Routing
// ---------------------------------------------------------
function goTo(route) {
  activeView = route;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('is-active', v.dataset.view === route));
  document.querySelectorAll('[data-route]').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.route === route));
  closeSidebar();
  renderCurrentView();
  document.getElementById('main-content').scrollTo?.({ top: 0, behavior: 'instant' });
  window.scrollTo(0, 0);
}

function renderCurrentView() {
  renderAll(activeView, filters);
}

// ---------------------------------------------------------
// Sidebar (mobile)
// ---------------------------------------------------------
function openSidebar() {
  document.getElementById('sidebar').classList.add('is-open');
  document.getElementById('sidebarScrim').classList.add('is-open');
  document.getElementById('menuBtn').setAttribute('aria-expanded', 'true');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('is-open');
  document.getElementById('sidebarScrim').classList.remove('is-open');
  document.getElementById('menuBtn').setAttribute('aria-expanded', 'false');
}

// ---------------------------------------------------------
// Generic modal helpers
// ---------------------------------------------------------
let lastFocused = null;

function openModal(overlayId) {
  lastFocused = document.activeElement;
  const overlay = document.getElementById(overlayId);
  overlay.classList.add('is-open');
  const closeBtn = overlay.querySelector('.modal-close');
  (closeBtn || overlay.querySelector('button'))?.focus();
  document.addEventListener('keydown', escCloseHandler);
}

function closeModal(overlayId) {
  const overlay = document.getElementById(overlayId);
  overlay.classList.remove('is-open');
  document.removeEventListener('keydown', escCloseHandler);
  lastFocused?.focus?.();
}

function escCloseHandler(e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.is-open').forEach((o) => closeModal(o.id));
  }
}

function wireOverlayDismiss(overlayId) {
  const overlay = document.getElementById(overlayId);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlayId);
  });
}

// ---------------------------------------------------------
// Slot detail modal
// ---------------------------------------------------------
function openSlotDetail(slotNumber) {
  const slot = store.state.slots.find((s) => s.slotNumber === slotNumber);
  if (!slot || !slot.vehicle) return;

  const now = new Date().getHours();
  const hours = computeHours(slot.inTime, now);
  const fee = computeFee(hours);

  document.getElementById('slotModalBody').innerHTML = `
    <div class="detail-header">
      <span class="detail-icon type-${slot.vehicle.type}" style="background:var(--surface-2);color:var(--${slot.vehicle.type === 'Car' ? 'blue' : slot.vehicle.type === 'Bike' ? 'pink' : 'violet'})">${VEHICLE_ICONS[slot.vehicle.type]}</span>
      <div>
        <h3 id="slotModalTitle">${escapeHtml(slot.vehicle.type)} · Slot ${String(slot.slotNumber).padStart(2, '0')}</h3>
        <p>${escapeHtml(slot.vehicle.plate)}</p>
      </div>
    </div>
    <div class="detail-grid">
      <div class="detail-field"><span>Owner Name</span><strong>${escapeHtml(slot.vehicle.owner)}</strong></div>
      <div class="detail-field"><span>Status</span><strong style="color:var(--coral)">Occupied</strong></div>
      <div class="detail-field"><span>IN Time</span><strong>${fmtTime(slot.inTime)}</strong></div>
      <div class="detail-field"><span>Duration so far</span><strong>${hours}h</strong></div>
      <div class="detail-field full"><span>Estimated Fee (if removed now)</span><strong style="color:var(--accent);font-size:20px;">${fmtFee(fee)}</strong></div>
    </div>
    <button class="btn btn-danger btn-block" id="modalRemoveBtn" type="button">
      Remove Vehicle
    </button>
  `;
  document.getElementById('modalRemoveBtn').addEventListener('click', () => {
    closeModal('slotModalOverlay');
    setTimeout(() => openRemoveModal(slot.slotNumber), 180);
  });
  openModal('slotModalOverlay');
}

// ---------------------------------------------------------
// Remove-vehicle modal
// ---------------------------------------------------------
function openRemoveModal(slotNumber) {
  const slot = store.state.slots.find((s) => s.slotNumber === slotNumber);
  if (!slot || !slot.vehicle) {
    toast({ type: 'error', title: 'Slot is already empty!' });
    return;
  }

  document.getElementById('removeModalBody').innerHTML = `
    <div class="detail-header">
      <span class="detail-icon" style="background:var(--coral-soft);color:var(--coral)">${VEHICLE_ICONS[slot.vehicle.type]}</span>
      <div>
        <h3 id="removeModalTitle">Remove from Slot ${String(slot.slotNumber).padStart(2, '0')}</h3>
        <p>${escapeHtml(slot.vehicle.plate)} · ${escapeHtml(slot.vehicle.owner)}</p>
      </div>
    </div>
    <form id="removeForm" novalidate>
      <div class="form-row">
        <label for="outTime">OUT Time <span class="hint">(0–23)</span></label>
        <input type="number" id="outTime" min="0" max="23" placeholder="e.g. 17" autofocus>
        <span class="field-error" id="err-outTime"></span>
      </div>
      <button class="btn btn-danger btn-lg btn-block" type="submit">Confirm Removal</button>
    </form>
  `;

  document.getElementById('removeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const outTimeInput = document.getElementById('outTime');
    const result = removeVehicle({ slotNumber, outTime: outTimeInput.value });

    if (!result.ok) {
      outTimeInput.classList.add('is-invalid');
      document.getElementById('err-outTime').textContent = result.error;
      toast({ type: 'error', title: 'Could not remove vehicle', message: result.error });
      return;
    }

    closeModal('removeModalOverlay');
    setTimeout(() => openReceipt(result.receipt), 180);
    flashSlot(slotNumber, 'remove');
    toast({
      type: 'success',
      title: 'Vehicle removed',
      message: `Slot ${slotNumber} is now available.`,
    });
  });

  openModal('removeModalOverlay');
}

function openReceipt(receipt) {
  document.getElementById('receiptModalBody').innerHTML = `
    <div class="receipt-head">
      <div class="receipt-check"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
      <h3 id="receiptTitle">Payment Complete</h3>
      <p>Slot ${String(receipt.slotNumber).padStart(2, '0')} is now available</p>
    </div>
    <div class="receipt-lines">
      <div class="receipt-line"><span>Vehicle Type</span><span>${escapeHtml(receipt.type)}</span></div>
      <div class="receipt-line"><span>Plate Number</span><span>${escapeHtml(receipt.plate)}</span></div>
      <div class="receipt-line"><span>Owner</span><span>${escapeHtml(receipt.owner)}</span></div>
      <div class="receipt-line"><span>IN Time</span><span>${fmtTime(receipt.inTime)}</span></div>
      <div class="receipt-line"><span>OUT Time</span><span>${fmtTime(receipt.outTime)}</span></div>
      <div class="receipt-line"><span>Total Hours</span><span>${receipt.hours}h</span></div>
    </div>
    <div class="receipt-total">
      <span>Total Fee</span>
      <strong>${fmtFee(receipt.fee)}</strong>
    </div>
    <button class="btn btn-primary btn-lg btn-block" id="receiptDoneBtn" type="button">Done</button>
  `;
  document.getElementById('receiptDoneBtn').addEventListener('click', () => closeModal('receiptModalOverlay'));
  openModal('receiptModalOverlay');
}

// ---------------------------------------------------------
// Confirm modal (generic)
// ---------------------------------------------------------
function openConfirm({ title, message, confirmLabel = 'Confirm', onConfirm }) {
  document.getElementById('confirmModalBody').innerHTML = `
    <div class="confirm-icon"><svg viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.3 3.9L2.5 17a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg></div>
    <h3 id="confirmTitle">${title}</h3>
    <p>${message}</p>
    <div class="confirm-actions">
      <button class="btn btn-secondary" id="confirmCancelBtn" type="button">Cancel</button>
      <button class="btn btn-danger" id="confirmOkBtn" type="button">${confirmLabel}</button>
    </div>
  `;
  document.getElementById('confirmCancelBtn').addEventListener('click', () => closeModal('confirmModalOverlay'));
  document.getElementById('confirmOkBtn').addEventListener('click', () => {
    closeModal('confirmModalOverlay');
    onConfirm();
  });
  openModal('confirmModalOverlay');
}

// ---------------------------------------------------------
// Park form
// ---------------------------------------------------------
function setupParkForm() {
  const typeSelect = document.getElementById('typeSelect');
  const typeHidden = document.getElementById('vehicleType');

  typeSelect.querySelectorAll('.type-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      typeSelect.querySelectorAll('.type-opt').forEach((b) => {
        b.classList.remove('is-active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-checked', 'true');
      typeHidden.value = btn.dataset.type;
    });
  });

  const form = document.getElementById('parkForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    ['plateNumber', 'ownerName', 'inTime'].forEach((id) => {
      document.getElementById(id).classList.remove('is-invalid');
      document.getElementById('err-' + id).textContent = '';
    });

    const payload = {
      type: typeHidden.value,
      plate: document.getElementById('plateNumber').value,
      owner: document.getElementById('ownerName').value,
      inTime: document.getElementById('inTime').value,
    };

    const result = parkVehicle(payload);

    if (!result.ok) {
      const { errors } = result;
      if (errors.general) {
        toast({ type: 'error', title: 'Parking full', message: errors.general });
        return;
      }
      const map = { plate: 'plateNumber', owner: 'ownerName', inTime: 'inTime' };
      let toasted = false;
      Object.entries(errors).forEach(([key, msg]) => {
        const fieldId = map[key];
        if (fieldId) {
          document.getElementById(fieldId).classList.add('is-invalid');
          document.getElementById('err-' + fieldId).textContent = msg;
        } else if (!toasted) {
          toast({ type: 'error', title: 'Invalid vehicle type!', message: msg });
          toasted = true;
        }
      });
      return;
    }

    toast({
      type: 'success',
      title: `Vehicle parked at slot ${result.slot.slotNumber}`,
      message: `${payload.type} · ${payload.plate}`,
    });
    form.reset();
    typeSelect.querySelectorAll('.type-opt').forEach((b) => b.classList.remove('is-active'));
    typeSelect.querySelector('[data-type="Car"]').classList.add('is-active');
    typeHidden.value = 'Car';
    flashSlot(result.slot.slotNumber, 'park');
    renderCurrentView();
  });
}

// ---------------------------------------------------------
// Filter chips / search inputs
// ---------------------------------------------------------
function setupChips(groupId, onChange) {
  const group = document.getElementById(groupId);
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    group.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'));
    btn.classList.add('is-active');
    onChange(btn.dataset.filter);
  });
}

function setupSearch(inputId, onChange) {
  const input = document.getElementById(inputId);
  input.addEventListener('input', debounce((e) => onChange(e.target.value), 150));
}

// ---------------------------------------------------------
// Settings
// ---------------------------------------------------------
function setupSettings() {
  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    const rate = Number(document.getElementById('settingRate').value);
    const totalSlots = Number(document.getElementById('settingSlots').value);
    if (!rate || rate < 1) {
      toast({ type: 'error', title: 'Invalid rate', message: 'Enter a parking rate of at least 1.' });
      return;
    }
    if (!totalSlots || totalSlots < 1) {
      toast({ type: 'error', title: 'Invalid slot count', message: 'Enter at least 1 total slot.' });
      return;
    }
    updateSettings({ rate, totalSlots });
    toast({ type: 'success', title: 'Settings saved', message: 'Your facility preferences were updated.' });
    renderCurrentView();
  });

  document.getElementById('themeSegmented').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-opt');
    if (!btn) return;
    updateSettings({ theme: btn.dataset.theme });
    applyTheme();
    renderSettingsForm();
    renderCurrentView();
  });

  document.getElementById('notifToggle').addEventListener('click', (e) => {
    const on = !store.state.settings.notifications;
    updateSettings({ notifications: on });
    e.currentTarget.classList.toggle('is-on', on);
    e.currentTarget.setAttribute('aria-checked', String(on));
    if (on) toast({ type: 'info', title: 'Notifications enabled' });
  });

  document.getElementById('motionToggle').addEventListener('click', (e) => {
    const on = !store.state.settings.motion;
    updateSettings({ motion: on });
    applyMotion();
    e.currentTarget.classList.toggle('is-on', on);
    e.currentTarget.setAttribute('aria-checked', String(on));
  });

  document.getElementById('exportJsonBtn').addEventListener('click', () => {
    downloadFile('smartpark-data.json', exportJSON(), 'application/json');
    toast({ type: 'success', title: 'Export ready', message: 'smartpark-data.json downloaded.' });
  });

  document.getElementById('exportCsvBtn').addEventListener('click', () => {
    downloadFile('smartpark-history.csv', exportCSV(), 'text/csv');
    toast({ type: 'success', title: 'Export ready', message: 'smartpark-history.csv downloaded.' });
  });

  document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importJSON(reader.result);
      if (result.ok) {
        toast({ type: 'success', title: 'Data imported', message: 'Your facility data has been restored.' });
        applyTheme();
        applyMotion();
        renderCurrentView();
      } else {
        toast({ type: 'error', title: 'Import failed', message: result.error });
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  document.getElementById('clearDataBtn').addEventListener('click', () => {
    openConfirm({
      title: 'Clear all data?',
      message: 'This removes every parked vehicle and the full activity history. This can\u2019t be undone.',
      confirmLabel: 'Clear Everything',
      onConfirm: () => {
        clearAllData();
        toast({ type: 'success', title: 'Data cleared', message: 'Your parking area is clear.' });
        renderCurrentView();
      },
    });
  });
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------
// Global search (topbar)
// ---------------------------------------------------------
function setupGlobalSearch() {
  const input = document.getElementById('globalSearch');
  input.addEventListener(
    'input',
    debounce((e) => {
      const q = e.target.value;
      if (!q) return;
      filters.vehicles.search = q;
      filters.slots.search = q;
      if (activeView !== 'vehicles' && activeView !== 'slots') {
        goTo('vehicles');
      } else {
        renderCurrentView();
      }
      document.getElementById('vehicleSearch').value = q;
      document.getElementById('slotSearch').value = q;
    }, 200)
  );
}

// ---------------------------------------------------------
// Init
// ---------------------------------------------------------
function init() {
  applyTheme();
  applyMotion();

  // Routing
  document.querySelectorAll('[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => goTo(btn.dataset.route));
  });

  // Sidebar / mobile menu
  document.getElementById('menuBtn').addEventListener('click', openSidebar);
  document.getElementById('sidebarScrim').addEventListener('click', closeSidebar);

  // Theme toggle (topbar quick toggle)
  document.getElementById('themeToggle').addEventListener('click', () => {
    const next = store.state.settings.theme === 'dark' ? 'light' : 'dark';
    updateSettings({ theme: next });
    applyTheme();
    renderSettingsForm();
  });

  // Modal dismiss wiring
  ['slotModalOverlay', 'removeModalOverlay', 'receiptModalOverlay', 'confirmModalOverlay'].forEach(wireOverlayDismiss);
  document.getElementById('slotModalClose').addEventListener('click', () => closeModal('slotModalOverlay'));
  document.getElementById('removeModalClose').addEventListener('click', () => closeModal('removeModalOverlay'));
  document.getElementById('receiptModalClose').addEventListener('click', () => closeModal('receiptModalOverlay'));

  // Parking lot click delegation
  document.getElementById('parkingLot').addEventListener('click', (e) => {
    const el = e.target.closest('.slot.is-occupied');
    if (!el) return;
    openSlotDetail(Number(el.dataset.slot));
  });
  document.getElementById('parkingLot').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('.slot.is-occupied');
    if (!el) return;
    e.preventDefault();
    openSlotDetail(Number(el.dataset.slot));
  });

  // Vehicles table row remove buttons
  document.getElementById('vehicleTableBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-slot]');
    if (!btn) return;
    openRemoveModal(Number(btn.dataset.removeSlot));
  });

  // Forms & filters
  setupParkForm();
  setupChips('slotFilterChips', (val) => { filters.slots.filter = val; renderLot(filters.slots); });
  setupSearch('slotSearch', (val) => { filters.slots.search = val; renderLot(filters.slots); });

  setupChips('vehicleFilterChips', (val) => { filters.vehicles.filter = val; renderVehiclesTable(filters.vehicles); });
  setupSearch('vehicleSearch', (val) => { filters.vehicles.search = val; renderVehiclesTable(filters.vehicles); });

  setupChips('activityFilterChips', (val) => { filters.activity.filter = val; renderActivityTable(filters.activity); });
  setupSearch('activitySearch', (val) => { filters.activity.search = val; renderActivityTable(filters.activity); });
  document.getElementById('activitySort').addEventListener('change', (e) => {
    filters.activity.sort = e.target.value;
    renderActivityTable(filters.activity);
  });

  document.getElementById('reportRange').addEventListener('change', (e) => {
    filters.reportRange = e.target.value;
    renderReports(filters.reportRange);
  });

  setupSettings();
  setupGlobalSearch();

  // React to any state mutation (from any source) while viewing a data-bound screen
  store.subscribe(() => {
    renderCurrentView();
  });

  goTo('dashboard');

  // periodic refresh so "duration so far" / live fee keeps ticking
  setInterval(() => {
    if (activeView === 'vehicles') renderVehiclesTable(filters.vehicles);
    if (activeView === 'reports') renderReports(filters.reportRange);
  }, 60000);

  window.addEventListener(
    'resize',
    debounce(() => {
      if (activeView === 'reports') renderReports(filters.reportRange);
    }, 200)
  );
}

document.addEventListener('DOMContentLoaded', init);

})();
