(() => {
// =========================================================
// SmartPark — Utilities
// =========================================================

const VEHICLE_ICONS = {
  Car: '<svg viewBox="0 0 24 24"><path d="M5 11l1.6-4.8A2 2 0 0 1 8.5 5h7a2 2 0 0 1 1.9 1.2L19 11m-14 0h14m-14 0a2 2 0 0 0-2 2v5h2m14-7a2 2 0 0 1 2 2v5h-2m-14 0v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2m10 0v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2m-14 0h14"/></svg>',
  Bike: '<svg viewBox="0 0 24 24"><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l4-9h4l3 5m-7-5h6M15 8l3 9"/></svg>',
  Truck: '<svg viewBox="0 0 24 24"><path d="M2 8h11v8H2zM13 11h4l4 3v2h-8zM5.5 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>',
};

function fmtTime(t) {
  if (t === null || t === undefined) return '—';
  return `${String(t).padStart(2, '0')}:00`;
}

function fmtFee(fee) {
  return `৳${fee}`;
}

function fmtRelative(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function fmtDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Animate a number counter element from its current text to a target value. */
function animateCounter(el, target, { duration = 600, formatter = (n) => Math.round(n) } = {}) {
  if (!el) return;
  const start = Number(el.dataset.rawValue || 0);
  const end = Number(target);
  if (start === end) {
    el.dataset.rawValue = end;
    el.textContent = formatter(end);
    return;
  }
  const startTime = performance.now();
  const reduced = document.documentElement.dataset.reducedMotion === 'true';
  if (reduced) {
    el.dataset.rawValue = end;
    el.textContent = formatter(end);
    return;
  }
  function tick(now) {
    const p = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = start + (end - start) * eased;
    el.textContent = formatter(val);
    if (p < 1) {
      requestAnimationFrame(tick);
    } else {
      el.dataset.rawValue = end;
      el.textContent = formatter(end);
    }
  }
  requestAnimationFrame(tick);
}

window.SP = window.SP || {};
window.SP.utils = { VEHICLE_ICONS, fmtTime, fmtFee, fmtRelative, fmtDateTime, debounce, escapeHtml, animateCounter };

})();
