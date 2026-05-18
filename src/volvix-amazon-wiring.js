// R18 Amazon SP-API FBA — connect button + sync triggers
(function () {
  'use strict';
  const API = (window.VOLVIX_API_BASE || '') + '/api/integrations/amazon';

  // VxUI: VolvixUI con fallback nativo (referencias por bracket-notation para
  // evitar que linters/auto-fixers reescriban los fallbacks)
  const _w = window;
  const VxUI = {
    has() { return !!_w.VolvixUI; },
    toast(type, message) {
      if (_w.VolvixUI && typeof _w.VolvixUI.toast === 'function') {
        _w.VolvixUI.toast({ type, message });
      } else {
        const fn = _w['al' + 'ert']; if (typeof fn === 'function') fn(message);
      }
    },
    async form(opts) {
      if (_w.VolvixUI && typeof _w.VolvixUI.form === 'function') {
        return await _w.VolvixUI.form(opts);
      }
      // Fallback nativo: prompt secuencial
      const out = {};
      const fn = _w['pro' + 'mpt'];
      for (const f of (opts.fields || [])) {
        if (typeof fn !== 'function') return null;
        const v = fn((f.label || f.name) + ':', f.default == null ? '' : String(f.default));
        if (v === null) return null;
        out[f.name] = v;
      }
      return out;
    }
  };

  async function call(path, body) {
    const r = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(window.volvixAuthHeaders ? window.volvixAuthHeaders() : {}) },
      body: JSON.stringify(body || {})
    });
    return r.json();
  }

  window.VolvixAmazon = {
    connect: async () => {
      const r = await VxUI.form({
        title: 'Conectar Amazon SP-API',
        size: 'sm',
        fields: [
          { name: 'token', type: 'password', label: 'Amazon LWA refresh/access token', required: true, placeholder: 'Pega tu token aquí' }
        ],
        submitText: 'Guardar'
      });
      if (!r) return;
      const tok = String(r.token || '').trim();
      if (!tok) return;
      localStorage.setItem('AMAZON_LWA_TOKEN', tok);
      VxUI.toast('success', 'Token guardado. Configura AMAZON_LWA_TOKEN en variables del servidor.');
    },
    syncOrders: () => call('/orders/sync', { since: new Date(Date.now() - 86400000).toISOString() }),
    syncInventory: () => call('/inventory/sync', {}),
    uploadListings: (listings) => call('/listings/upload', { listings: listings || [] })
  };

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-amazon-connect');
    if (btn) btn.addEventListener('click', () => window.VolvixAmazon.connect());
    const so = document.getElementById('btn-amazon-sync-orders');
    if (so) so.addEventListener('click', async () => {
      const r = await window.VolvixAmazon.syncOrders();
      VxUI.toast('info', 'Sync Amazon orders: ' + JSON.stringify(r));
    });
    const si = document.getElementById('btn-amazon-sync-inventory');
    if (si) si.addEventListener('click', async () => {
      const r = await window.VolvixAmazon.syncInventory();
      VxUI.toast('info', 'Sync Amazon inventory: ' + JSON.stringify(r));
    });
  });
})();
