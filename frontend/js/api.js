// =========================================================
// SmartPark — thin fetch wrapper around the backend REST API
// =========================================================
(function () {
  'use strict';

  const BASE = '/api';

  async function request(path, options = {}) {
    let res;
    try {
      res = await fetch(BASE + path, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
    } catch (networkErr) {
      const err = new Error('Could not reach the server. Check your connection and try again.');
      err.code = 'NETWORK_ERROR';
      throw err;
    }

    let data = null;
    try {
      data = await res.json();
    } catch (parseErr) {
      // no/invalid JSON body
    }

    if (!res.ok || !data || data.success === false) {
      const message = (data && data.message) || `Request failed (${res.status})`;
      const err = new Error(message);
      err.code = (data && data.code) || 'REQUEST_FAILED';
      err.details = data && data.details;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const qs = (params = {}) => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const s = new URLSearchParams(clean).toString();
    return s ? `?${s}` : '';
  };

  const api = {
    health: () => request('/health'),

    getDashboard: () => request('/dashboard'),

    getSlots: () => request('/slots'),

    getVehicles: (params) => request('/vehicles' + qs(params)),

    parkVehicle: (payload) => request('/vehicles/park', { method: 'POST', body: JSON.stringify(payload) }),

    removeVehicle: (payload) => request('/vehicles/remove', { method: 'POST', body: JSON.stringify(payload) }),

    getActivity: (params) => request('/activity' + qs(params)),

    getReports: (range) => request('/reports' + qs({ range })),

    getSettings: () => request('/settings'),

    updateSettings: (payload) => request('/settings', { method: 'PUT', body: JSON.stringify(payload) }),

    exportJsonUrl: () => BASE + '/export/json',
    exportCsvUrl: () => BASE + '/export/csv',

    resetData: () => request('/admin/reset', { method: 'POST' }),
    importData: (payload) => request('/admin/import', { method: 'POST', body: JSON.stringify(payload) }),
  };

  window.SP = window.SP || {};
  window.SP.api = api;
})();
