// R18 MercadoLibre (LATAM) — connect button + sync triggers (owner panel)
(function () {
  'use strict';

  // VxUI: VolvixUI con fallback nativo
  const _w = window;
  const VxUI = {
    toast(type, message) {
      if (_w.VolvixUI && typeof _w.VolvixUI.toast === 'function') _w.VolvixUI.toast({ type, message });
      else { const fn = _w['al' + 'ert']; if (typeof fn === 'function') fn(message); }
    }
  };

  const API = (window.VOLVIX_API_BASE || '') + '/api/integrations/mercadolibre';
  const ML_APP_ID = window.MERCADOLIBRE_APP_ID || '';
  const ML_REDIRECT = window.MERCADOLIBRE_REDIRECT_URI || (location.origin + '/oauth/mercadolibre/callback');
  const ML_SITE = window.MERCADOLIBRE_SITE || 'MLM'; // MLM=MX, MLA=AR, MLB=BR, MCO=CO, MLC=CL
  const AUTH_HOSTS = {
    MLM: 'https://auth.mercadolibre.com.mx',
    MLA: 'https://auth.mercadolibre.com.ar',
    MLB: 'https://auth.mercadolivre.com.br',
    MCO: 'https://auth.mercadolibre.com.co',
    MLC: 'https://auth.mercadolibre.cl'
  };

  function authHeaders() {
    return window.volvixAuthHeaders ? window.volvixAuthHeaders() : {};
  }

  async function call(method, path, body) {
    const r = await fetch(API + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: body ? JSON.stringify(body) : undefined
    });
    return r.json();
  }

  window.VolvixMercadoLibre = {
    // Paso 1: redirige al usuario al consentimiento OAuth de ML
    connect: () => {
      if (!ML_APP_ID) {
        VxUI.toast('warning', 'Falta MERCADOLIBRE_APP_ID en window. Configúralo desde el panel de owner.');
        return;
      }
      const host = AUTH_HOSTS[ML_SITE] || AUTH_HOSTS.MLM;
      const url = host + '/authorization?response_type=code'
        + '&client_id=' + encodeURIComponent(ML_APP_ID)
        + '&redirect_uri=' + encodeURIComponent(ML_REDIRECT);
      // owner panel: abre nueva pestaña; al volver con ?code=, ejecutar finishOAuth
      window.open(url, '_blank', 'noopener');
    },

    // Paso 2: tras callback (con ?code=...), llamar al backend para canjear el code
    finishOAuth: async (code) => {
      if (!code) {
        // intentar leerlo de la URL actual
        const u = new URL(location.href);
        code = u.searchParams.get('code');
      }
      if (!code) { VxUI.toast('error', 'No hay code de OAuth en la URL'); return null; }
      const res = await call('POST', '/oauth-callback', { code, redirect_uri: ML_REDIRECT });
      if (res && res.ok) VxUI.toast('success', 'MercadoLibre conectado: user_id=' + (res.ml_user_id || '?'));
      else VxUI.toast('error', 'Error OAuth: ' + JSON.stringify(res));
      return res;
    },

    // Sincronizar productos del POS hacia listings de ML
    syncListings: async (productIds) => {
      const r = await call('POST', '/sync-listings', { product_ids: productIds || null });
      return r;
    },

    // Listar órdenes recibidas vía webhook
    listOrders: async () => {
      const r = await fetch(API + '/orders', { headers: authHeaders() });
      return r.json();
    },

    health: async () => (await fetch(API + '/health')).json()
  };

  document.addEventListener('DOMContentLoaded', () => {
    const btnConnect = document.getElementById('btn-mercadolibre-connect');
    if (btnConnect) btnConnect.addEventListener('click', () => window.VolvixMercadoLibre.connect());

    const btnSync = document.getElementById('btn-mercadolibre-sync');
    if (btnSync) btnSync.addEventListener('click', async () => {
      const r = await window.VolvixMercadoLibre.syncListings();
      VxUI.toast('info', 'Sync ML: ' + (r && r.synced != null ? r.synced + ' listings' : JSON.stringify(r)));
    });

    const btnOrders = document.getElementById('btn-mercadolibre-orders');
    if (btnOrders) btnOrders.addEventListener('click', async () => {
      const r = await window.VolvixMercadoLibre.listOrders();
      console.table((r && r.items) || []);
      VxUI.toast('info', 'Órdenes ML: ' + ((r && r.total) || 0));
    });

    // Si llegamos a la página con ?code=... y ?state=mercadolibre, terminar el OAuth automáticamente
    const u = new URL(location.href);
    if (u.searchParams.get('code') && u.searchParams.get('state') === 'mercadolibre') {
      window.VolvixMercadoLibre.finishOAuth(u.searchParams.get('code'));
    }
  });
})();
