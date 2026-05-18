/* =============================================================
 * volvix-square-wiring.js — R18 Square POS integration UI
 * Inyecta boton "Importar de Square" en owner panel y maneja
 * sync + status visualization.
 * ============================================================= */
(function () {
  'use strict';

  const API_BASE = window.VOLVIX_API_BASE || '';
  const SEL_OWNER_PANEL =
    '#owner-integrations, .owner-panel .integrations, [data-owner-integrations]';

  function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    const tok = localStorage.getItem('volvix_jwt') || localStorage.getItem('jwt');
    if (tok) h['Authorization'] = 'Bearer ' + tok;
    const apiKey = localStorage.getItem('volvix_api_key');
    if (apiKey) h['X-API-Key'] = apiKey;
    return h;
  }

  async function fetchStatus() {
    try {
      const r = await fetch(API_BASE + '/api/integrations/square/status', {
        headers: authHeaders()
      });
      return await r.json();
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async function runSync(btn, statusEl) {
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Sincronizando...';
    statusEl.textContent = '';
    try {
      const r = await fetch(API_BASE + '/api/integrations/square/sync', {
        method: 'POST',
        headers: authHeaders(),
        body: '{}'
      });
      const data = await r.json();
      if (r.status === 503) {
        statusEl.style.color = '#c62828';
        statusEl.textContent =
          'Square no configurado. Falta SQUARE_ACCESS_TOKEN en el servidor.';
      } else if (data.ok) {
        statusEl.style.color = '#2e7d32';
        statusEl.textContent =
          'OK: ' + data.synced + ' productos sincronizados (' +
          (data.failed || 0) + ' fallos / ' + data.total + ' totales) en ' +
          data.ms + 'ms';
      } else {
        statusEl.style.color = '#c62828';
        statusEl.textContent = 'Error: ' + (data.error || 'desconocido');
      }
    } catch (e) {
      statusEl.style.color = '#c62828';
      statusEl.textContent = 'Error de red: ' + e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  function buildWidget() {
    const wrap = document.createElement('div');
    wrap.className = 'volvix-square-widget';
    wrap.style.cssText =
      'border:1px solid #ddd;border-radius:8px;padding:14px;margin:12px 0;' +
      'background:#fafafa;font-family:system-ui,sans-serif;';
    wrap.innerHTML =
      '<h4 style="margin:0 0 8px 0;display:flex;align-items:center;gap:8px;">' +
        '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#888;" data-square-dot></span>' +
        'Square POS' +
      '</h4>' +
      '<div data-square-info style="font-size:13px;color:#555;margin-bottom:8px;">Cargando estado...</div>' +
      '<button type="button" data-square-sync ' +
        'style="background:#006aff;color:#fff;border:0;padding:8px 14px;' +
        'border-radius:6px;cursor:pointer;font-weight:600;">' +
        'Importar de Square' +
      '</button>' +
      '<div data-square-status style="margin-top:8px;font-size:13px;"></div>';
    return wrap;
  }

  async function renderStatus(widget) {
    const dot = widget.querySelector('[data-square-dot]');
    const info = widget.querySelector('[data-square-info]');
    const data = await fetchStatus();
    if (data.connected) {
      dot.style.background = '#2e7d32';
      const last = data.last_sync
        ? ' Ultima sync: ' + new Date(data.last_sync.ts).toLocaleString() +
          ' (' + data.last_sync.items_synced + ' items, ' + data.last_sync.status + ')'
        : ' Sin sync previo.';
      info.textContent =
        'Conectado. Locations: ' + data.locations + '.' + last;
    } else {
      dot.style.background = '#c62828';
      info.textContent = 'No conectado: ' + (data.reason || data.error || 'desconocido');
    }
  }

  function mount() {
    const target = document.querySelector(SEL_OWNER_PANEL);
    if (!target) return false;
    if (target.querySelector('.volvix-square-widget')) return true;
    const widget = buildWidget();
    target.appendChild(widget);
    const btn = widget.querySelector('[data-square-sync]');
    const statusEl = widget.querySelector('[data-square-status]');
    btn.addEventListener('click', () => runSync(btn, statusEl).then(() => renderStatus(widget)));
    renderStatus(widget);
    return true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (!mount()) {
        const obs = new MutationObserver(() => { if (mount()) obs.disconnect(); });
        obs.observe(document.body, { childList: true, subtree: true });
      }
    });
  } else {
    if (!mount()) {
      const obs = new MutationObserver(() => { if (mount()) obs.disconnect(); });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }

  window.VolvixSquare = { fetchStatus, runSync, mount };
})();
