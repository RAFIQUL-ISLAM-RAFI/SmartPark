(() => {
// =========================================================
// SmartPark — Toast notifications
// =========================================================
const ICONS = {
  success: '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>',
  error: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v.01M12 11v5"/></svg>',
};

let stackEl = null;

function ensureStack() {
  if (!stackEl) stackEl = document.getElementById('toastStack');
  return stackEl;
}

function toast({ type = 'info', title, message, duration = 4200 }) {
  if (!window.SP.state.store.state.settings.notifications) return;

  const stack = ensureStack();
  if (!stack) return;

  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <span class="toast-icon">${ICONS[type] || ICONS.info}</span>
    <span class="toast-text">
      <strong>${title}</strong>
      ${message ? `<p>${message}</p>` : ''}
    </span>
    <button class="toast-close" type="button" aria-label="Dismiss notification">
      <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
  `;

  const remove = () => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 180);
  };

  el.querySelector('.toast-close').addEventListener('click', remove);
  const timer = setTimeout(remove, duration);
  el.addEventListener('mouseenter', () => clearTimeout(timer));

  stack.appendChild(el);
}

window.SP = window.SP || {};
window.SP.toast = { toast };

})();
