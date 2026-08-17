(() => {
// =========================================================
// SmartPark — App entry: routing, async events, modals
// =========================================================
const {
  store,
  syncFromServer,
  parkVehicle,
  removeVehicle,
  updateSettings,
  clearAllData,
  exportJSON,
  exportCSV,
  importJSON,
  computeHours,
  computeFee,
} = window.SP.state;

const { toast } = window.SP.toast;
const {
  renderAll,
  renderLot,
  renderVehiclesTable,
  renderActivityTable,
  renderReports,
  renderSettingsForm,
  renderParkPreview,
  flashSlot,
  generateTicketQR,
} = window.SP.render;

const { VEHICLE_ICONS, fmtTime, fmtFee, escapeHtml, debounce } = window.SP.utils;

// ---------------------------------------------------------
// Local UI state
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
  if (svg) {
    svg.setAttribute('fill', store.state.settings.theme === 'dark' ? 'currentColor' : 'none');
    svg.setAttribute('stroke', store.state.settings.theme === 'dark' ? 'none' : 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.innerHTML = iconPath;
  }
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
  document.getElementById('main-content')?.scrollTo?.({ top: 0, behavior: 'instant' });
  window.scrollTo(0, 0);
}

function renderCurrentView() {
  renderAll(activeView, filters);
}

// ---------------------------------------------------------
// Sidebar (mobile)
// ---------------------------------------------------------
function openSidebar() {
  document.getElementById('sidebar')?.classList.add('is-open');
  document.getElementById('sidebarScrim')?.classList.add('is-open');
  document.getElementById('menuBtn')?.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('is-open');
  document.getElementById('sidebarScrim')?.classList.remove('is-open');
  document.getElementById('menuBtn')?.setAttribute('aria-expanded', 'false');
}

// ---------------------------------------------------------
// Generic Modal Helpers
// ---------------------------------------------------------
let lastFocused = null;

function openModal(overlayId) {
  lastFocused = document.activeElement;
  const overlay = document.getElementById(overlayId);
  if (!overlay) return;
  overlay.classList.add('is-open');
  const closeBtn = overlay.querySelector('.modal-close');
  (closeBtn || overlay.querySelector('button'))?.focus();
  document.addEventListener('keydown', escCloseHandler);
}

function closeModal(overlayId) {
  const overlay = document.getElementById(overlayId);
  if (!overlay) return;
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
  if (!overlay) return;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlayId);
  });
}

// ---------------------------------------------------------
// Slot Detail Modal
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
        <h3 id="slotModalTitle">${escapeHtml(slot.vehicle.type)} · Bay #${String(slot.slotNumber).padStart(2, '0')}</h3>
        <p class="mono">${escapeHtml(slot.vehicle.plate)}</p>
      </div>
    </div>
    <div class="detail-grid">
      <div class="detail-field"><span>Owner Name</span><strong>${escapeHtml(slot.vehicle.owner)}</strong></div>
      <div class="detail-field"><span>Status</span><strong style="color:var(--coral)">Occupied</strong></div>
      <div class="detail-field"><span>Check-In Time</span><strong class="mono">${fmtTime(slot.inTime)}</strong></div>
      <div class="detail-field"><span>Duration so far</span><strong>${hours}h</strong></div>
      <div class="detail-field full"><span>Estimated Fee (if checked out now)</span><strong style="color:var(--accent);font-size:20px;">${fmtFee(fee)}</strong></div>
    </div>
    <div class="detail-actions" style="display:flex;gap:10px;margin-top:16px;">
      <button class="btn btn-primary btn-block" id="modalTicketBtn" type="button">
        View Ticket (QR)
      </button>
      <button class="btn btn-danger btn-block" id="modalRemoveBtn" type="button">
        Check Out
      </button>
    </div>
  `;

  document.getElementById('modalTicketBtn').addEventListener('click', () => {
    closeModal('slotModalOverlay');
    setTimeout(() => openTicketModal({
      slotNumber: slot.slotNumber,
      type: slot.vehicle.type,
      plate: slot.vehicle.plate,
      owner: slot.vehicle.owner,
      inTime: slot.inTime,
    }), 180);
  });

  document.getElementById('modalRemoveBtn').addEventListener('click', () => {
    closeModal('slotModalOverlay');
    setTimeout(() => openRemoveModal(slot.slotNumber), 180);
  });

  openModal('slotModalOverlay');
}

// ---------------------------------------------------------
// Parking Ticket Modal (with QR Code & Print)
// ---------------------------------------------------------
function openTicketModal(ticket) {
  const qrSvg = generateTicketQR(`${ticket.plate}|${ticket.slotNumber}|${ticket.inTime}`);
  const ticketId = `TKT-${String(ticket.slotNumber).padStart(3, '0')}-${Date.now().toString(36).toUpperCase()}`;

  document.getElementById('ticketModalBody').innerHTML = `
    <div class="ticket-card printable-ticket">
      <div class="ticket-brand">
        <span class="brand-name">SmartPark</span>
        <span class="ticket-badge">PARKING TICKET</span>
      </div>
      <div class="ticket-qr-container">
        ${qrSvg}
      </div>
      <p class="ticket-id mono">${ticketId}</p>
      <div class="ticket-lines">
        <div class="ticket-line"><span>Assigned Bay</span><strong class="mono">Bay #${String(ticket.slotNumber).padStart(2, '0')}</strong></div>
        <div class="ticket-line"><span>License Plate</span><strong class="mono">${escapeHtml(ticket.plate)}</strong></div>
        <div class="ticket-line"><span>Owner</span><span>${escapeHtml(ticket.owner)}</span></div>
        <div class="ticket-line"><span>Vehicle Type</span><span>${escapeHtml(ticket.type)}</span></div>
        <div class="ticket-line"><span>Check-In Time</span><strong class="mono">${fmtTime(ticket.inTime)}</strong></div>
        <div class="ticket-line"><span>Standard Rate</span><span>${fmtFee(store.state.settings.rate)}/hour</span></div>
      </div>
      <div class="ticket-footer">
        <p>Please keep this digital ticket handy for checkout verification.</p>
      </div>
    </div>
    <div class="modal-actions-row" style="display:flex;gap:10px;margin-top:16px;">
      <button class="btn btn-secondary btn-block" id="printTicketBtn" type="button">
        Print Ticket
      </button>
      <button class="btn btn-primary btn-block" id="ticketDoneBtn" type="button">
        Done
      </button>
    </div>
  `;

  document.getElementById('printTicketBtn').addEventListener('click', () => window.print());
  document.getElementById('ticketDoneBtn').addEventListener('click', () => closeModal('ticketModalOverlay'));
  openModal('ticketModalOverlay');
}

// ---------------------------------------------------------
// Remove Vehicle Modal
// ---------------------------------------------------------
function openRemoveModal(slotNumber) {
  const slot = store.state.slots.find((s) => s.slotNumber === slotNumber);
  if (!slot || !slot.vehicle) {
    toast({ type: 'error', title: 'Bay is already empty!' });
    return;
  }

  const currentHour = new Date().getHours();

  document.getElementById('removeModalBody').innerHTML = `
    <div class="detail-header">
      <span class="detail-icon" style="background:var(--coral-soft);color:var(--coral)">${VEHICLE_ICONS[slot.vehicle.type]}</span>
      <div>
        <h3 id="removeModalTitle">Check Out · Bay #${String(slot.slotNumber).padStart(2, '0')}</h3>
        <p>${escapeHtml(slot.vehicle.plate)} · ${escapeHtml(slot.vehicle.owner)}</p>
      </div>
    </div>
    <form id="removeForm" novalidate>
      <div class="form-row">
        <label for="outTime">Check-Out Time <span class="hint">(Auto-fills current time)</span></label>
        <input type="number" id="outTime" min="0" max="23" value="${currentHour}" placeholder="Auto (${currentHour}:00)" autofocus>
        <span class="field-error" id="err-outTime"></span>
      </div>
      <div class="form-row" style="margin-top:8px;font-size:13px;color:var(--text-muted);">
        <span>Check-in was at <strong>${fmtTime(slot.inTime)}</strong> · Current Rate: <strong>${fmtFee(store.state.settings.rate)}/hr</strong></span>
      </div>
      <button class="btn btn-danger btn-lg btn-block" id="submitRemoveBtn" type="submit" style="margin-top:16px;">
        Confirm Check Out & Pay
      </button>
    </form>
  `;

  const form = document.getElementById('removeForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const outTimeInput = document.getElementById('outTime');
    const submitBtn = document.getElementById('submitRemoveBtn');
    const outVal = outTimeInput.value;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';

    const result = await removeVehicle({ slotNumber, outTime: outVal });

    if (!result.ok) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm & Calculate Fee';
      outTimeInput.classList.add('is-invalid');
      document.getElementById('err-outTime').textContent = result.error;
      toast({ type: 'error', title: 'Check out failed', message: result.error });
      return;
    }

    closeModal('removeModalOverlay');
    setTimeout(() => openReceipt(result.receipt), 180);
    flashSlot(slotNumber, 'remove');
    toast({
      type: 'success',
      title: 'Vehicle checked out',
      message: `Bay #${slotNumber} is now free and ready.`,
    });
  });

  openModal('removeModalOverlay');
}

// ---------------------------------------------------------
// Receipt Modal (Printable)
// ---------------------------------------------------------
function openReceipt(receipt) {
  const receiptNo = `RCP-${String(receipt.slotNumber).padStart(2, '0')}-${Date.now().toString(36).toUpperCase()}`;

  document.getElementById('receiptModalBody').innerHTML = `
    <div class="receipt-card printable-receipt">
      <div class="receipt-head">
        <div class="receipt-check"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
        <h3 id="receiptTitle">Payment Receipt</h3>
        <p class="receipt-id mono">${receiptNo}</p>
      </div>
      <div class="receipt-lines">
        <div class="receipt-line"><span>Assigned Bay</span><strong class="mono">Bay #${String(receipt.slotNumber).padStart(2, '0')}</strong></div>
        <div class="receipt-line"><span>Vehicle Type</span><span>${escapeHtml(receipt.type)}</span></div>
        <div class="receipt-line"><span>Plate Number</span><strong class="mono">${escapeHtml(receipt.plate)}</strong></div>
        <div class="receipt-line"><span>Owner</span><span>${escapeHtml(receipt.owner)}</span></div>
        <div class="receipt-line"><span>Check-In</span><span class="mono">${fmtTime(receipt.inTime)}</span></div>
        <div class="receipt-line"><span>Check-Out</span><span class="mono">${fmtTime(receipt.outTime)}</span></div>
        <div class="receipt-line"><span>Total Billed Duration</span><strong>${receipt.hours} hour${receipt.hours === 1 ? '' : 's'}</strong></div>
      </div>
      <div class="receipt-total">
        <span>Total Paid</span>
        <strong class="text-accent">${fmtFee(receipt.fee)}</strong>
      </div>
    </div>
    <div class="modal-actions-row" style="display:flex;gap:10px;margin-top:16px;">
      <button class="btn btn-secondary btn-block" id="printReceiptBtn" type="button">
        Print Receipt
      </button>
      <button class="btn btn-primary btn-block" id="receiptDoneBtn" type="button">
        Done
      </button>
    </div>
  `;

  document.getElementById('printReceiptBtn').addEventListener('click', () => window.print());
  document.getElementById('receiptDoneBtn').addEventListener('click', () => closeModal('receiptModalOverlay'));
  openModal('receiptModalOverlay');
}

// ---------------------------------------------------------
// Confirm Modal
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
// Park Form Setup
// ---------------------------------------------------------
function setupParkForm() {
  const typeSelect = document.getElementById('typeSelect');
  const typeHidden = document.getElementById('vehicleType');

  typeSelect?.querySelectorAll('.type-opt').forEach((btn) => {
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
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    ['plateNumber', 'ownerName', 'inTime'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('is-invalid');
      const errEl = document.getElementById('err-' + id);
      if (errEl) errEl.textContent = '';
    });

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Allocating Bay...';
    }

    const payload = {
      type: typeHidden.value || 'Car',
      plate: document.getElementById('plateNumber').value,
      owner: document.getElementById('ownerName').value,
      inTime: document.getElementById('inTime').value,
    };

    const result = await parkVehicle(payload);

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Park Vehicle & Assign Slot';
    }

    if (!result.ok) {
      const { errors, message } = result;
      if (errors.general) {
        toast({ type: 'error', title: 'Parking full', message: errors.general });
        return;
      }
      const map = { plate: 'plateNumber', owner: 'ownerName', inTime: 'inTime' };
      let toasted = false;
      Object.entries(errors).forEach(([key, msg]) => {
        const fieldId = map[key];
        if (fieldId && document.getElementById(fieldId)) {
          document.getElementById(fieldId).classList.add('is-invalid');
          document.getElementById('err-' + fieldId).textContent = msg;
        } else if (!toasted) {
          toast({ type: 'error', title: 'Validation error', message: msg });
          toasted = true;
        }
      });
      if (!toasted && message) {
        toast({ type: 'error', title: 'Check-in failed', message });
      }
      return;
    }

    toast({
      type: 'success',
      title: `Vehicle Parked in Bay #${result.slot.slotNumber}`,
      message: `${payload.type} · ${payload.plate}`,
    });

    form.reset();
    typeSelect.querySelectorAll('.type-opt').forEach((b) => b.classList.remove('is-active'));
    typeSelect.querySelector('[data-type="Car"]')?.classList.add('is-active');
    typeHidden.value = 'Car';

    // Auto-populate current hour as default for the next check-in
    const inTimeInput = document.getElementById('inTime');
    if (inTimeInput) inTimeInput.value = new Date().getHours();

    flashSlot(result.slot.slotNumber, 'park');
    renderCurrentView();

    // Show digital QR ticket
    setTimeout(() => {
      openTicketModal({
        slotNumber: result.slot.slotNumber,
        type: payload.type,
        plate: payload.plate,
        owner: payload.owner,
        inTime: payload.inTime,
      });
    }, 200);
  });
}

// ---------------------------------------------------------
// Filter Chips & Search
// ---------------------------------------------------------
function setupChips(groupId, onChange) {
  const group = document.getElementById(groupId);
  if (!group) return;
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
  if (!input) return;
  input.addEventListener('input', debounce((e) => onChange(e.target.value), 150));
}

// ---------------------------------------------------------
// Settings View
// ---------------------------------------------------------
function setupSettings() {
  document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
    const rate = Number(document.getElementById('settingRate').value);
    const totalSlots = Number(document.getElementById('settingSlots').value);
    if (!rate || rate < 1) {
      toast({ type: 'error', title: 'Invalid rate', message: 'Enter a parking rate of at least 1.' });
      return;
    }
    if (!totalSlots || totalSlots < 1 || totalSlots > 200) {
      toast({ type: 'error', title: 'Invalid slot count', message: 'Enter total bays between 1 and 200.' });
      return;
    }

    const saveBtn = document.getElementById('saveSettingsBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const result = await updateSettings({ rate, totalSlots });
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';

    if (result.ok) {
      toast({ type: 'success', title: 'Settings saved', message: 'Preferences updated on database.' });
      renderCurrentView();
    } else {
      toast({ type: 'error', title: 'Failed to update settings', message: result.error });
    }
  });

  document.getElementById('themeSegmented')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.seg-opt');
    if (!btn) return;
    await updateSettings({ theme: btn.dataset.theme });
    applyTheme();
    renderSettingsForm();
    renderCurrentView();
  });

  document.getElementById('notifToggle')?.addEventListener('click', async (e) => {
    const on = !store.state.settings.notifications;
    await updateSettings({ notifications: on });
    e.currentTarget.classList.toggle('is-on', on);
    e.currentTarget.setAttribute('aria-checked', String(on));
    if (on) toast({ type: 'info', title: 'Notifications enabled' });
  });

  document.getElementById('motionToggle')?.addEventListener('click', async (e) => {
    const on = !store.state.settings.motion;
    await updateSettings({ motion: on });
    applyMotion();
    e.currentTarget.classList.toggle('is-on', on);
    e.currentTarget.setAttribute('aria-checked', String(on));
  });

  document.getElementById('exportJsonBtn')?.addEventListener('click', () => {
    downloadFile('smartpark-data.json', exportJSON(), 'application/json');
    toast({ type: 'success', title: 'Export ready', message: 'smartpark-data.json downloaded.' });
  });

  document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
    downloadFile('smartpark-history.csv', exportCSV(), 'text/csv');
    toast({ type: 'success', title: 'Export ready', message: 'smartpark-history.csv downloaded.' });
  });

  document.getElementById('importFile')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const result = await importJSON(reader.result);
      if (result.ok) {
        toast({ type: 'success', title: 'Data restored', message: 'Database successfully imported.' });
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

  document.getElementById('clearDataBtn')?.addEventListener('click', () => {
    openConfirm({
      title: 'Reset entire facility data?',
      message: 'This clears all active parking sessions and history from PostgreSQL. Settings are preserved.',
      confirmLabel: 'Clear Database',
      onConfirm: async () => {
        const res = await clearAllData();
        if (res.ok) {
          toast({ type: 'success', title: 'Database cleared', message: 'All bays are now available.' });
          renderCurrentView();
        } else {
          toast({ type: 'error', title: 'Clear failed', message: res.error });
        }
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
// Global Search (topbar)
// ---------------------------------------------------------
function setupGlobalSearch() {
  const input = document.getElementById('globalSearch');
  if (!input) return;

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
      const vInput = document.getElementById('vehicleSearch');
      if (vInput) vInput.value = q;
      const sInput = document.getElementById('slotSearch');
      if (sInput) sInput.value = q;
    }, 200)
  );
}

// ---------------------------------------------------------
// Initialization
// ---------------------------------------------------------
async function init() {
  applyTheme();
  applyMotion();

  // Set default in-time input to current hour
  const inTimeInput = document.getElementById('inTime');
  if (inTimeInput && !inTimeInput.value) {
    inTimeInput.value = new Date().getHours();
  }

  // Routing
  document.querySelectorAll('[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => goTo(btn.dataset.route));
  });

  // Sidebar
  document.getElementById('menuBtn')?.addEventListener('click', openSidebar);
  document.getElementById('sidebarScrim')?.addEventListener('click', closeSidebar);

  // Topbar quick theme toggle
  document.getElementById('themeToggle')?.addEventListener('click', async () => {
    const next = store.state.settings.theme === 'dark' ? 'light' : 'dark';
    await updateSettings({ theme: next });
    applyTheme();
    renderSettingsForm();
  });

  // Modal dismiss wiring
  [
    'slotModalOverlay',
    'removeModalOverlay',
    'receiptModalOverlay',
    'ticketModalOverlay',
    'confirmModalOverlay',
  ].forEach(wireOverlayDismiss);

  document.getElementById('slotModalClose')?.addEventListener('click', () => closeModal('slotModalOverlay'));
  document.getElementById('removeModalClose')?.addEventListener('click', () => closeModal('removeModalOverlay'));
  document.getElementById('receiptModalClose')?.addEventListener('click', () => closeModal('receiptModalOverlay'));
  document.getElementById('ticketModalClose')?.addEventListener('click', () => closeModal('ticketModalOverlay'));

  // Parking bay clicks
  document.getElementById('parkingLot')?.addEventListener('click', (e) => {
    const el = e.target.closest('.slot.is-occupied');
    if (!el) return;
    openSlotDetail(Number(el.dataset.slot));
  });

  document.getElementById('parkingLot')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('.slot.is-occupied');
    if (!el) return;
    e.preventDefault();
    openSlotDetail(Number(el.dataset.slot));
  });

  // Vehicles table remove buttons
  document.getElementById('vehicleTableBody')?.addEventListener('click', (e) => {
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

  document.getElementById('activitySort')?.addEventListener('change', (e) => {
    filters.activity.sort = e.target.value;
    renderActivityTable(filters.activity);
  });

  document.getElementById('reportRange')?.addEventListener('change', (e) => {
    filters.reportRange = e.target.value;
    renderReports(filters.reportRange);
  });

  setupSettings();
  setupGlobalSearch();

  // Subscribe to store mutations
  store.subscribe(() => {
    renderCurrentView();
  });

  // Initial sync from backend
  await syncFromServer(true);
  goTo('dashboard');

  // Background sync every 15s
  setInterval(() => {
    syncFromServer(false);
  }, 15000);

  // Resize listener
  window.addEventListener(
    'resize',
    debounce(() => {
      if (activeView === 'reports') renderReports(filters.reportRange);
    }, 200)
  );
}

document.addEventListener('DOMContentLoaded', init);

})();
