/* =============================================================
 * volvix-button-flags.js  (R45)
 * -------------------------------------------------------------
 * Auto-injectado en POS/Inventario/etc. Lee la lista de botones
 * deshabilitados por el super-admin para el tenant del usuario
 * autenticado y los desactiva visualmente.
 *
 * Botones se identifican con:  data-vlx-button="F12_cobrar"
 *
 * Endpoint:  GET /api/tenant/buttons/active
 * Response:  { ok:true, disabled:["F12_cobrar",...], reasons:{...} }
 * ============================================================= */
(function () {
  'use strict';

  // No-op si ya cargó
  if (window.__VLX_BUTTON_FLAGS_LOADED__) return;
  window.__VLX_BUTTON_FLAGS_LOADED__ = true;

  // ── Inyectar CSS de bloqueo ────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById('vlx-button-flags-css')) return;
    var s = document.createElement('style');
    s.id = 'vlx-button-flags-css';
    s.textContent = [
      '[data-vlx-button-disabled="true"]{',
      '  pointer-events:none;opacity:.4;filter:grayscale(1);position:relative;',
      '  cursor:not-allowed!important;',
      '}',
      '[data-vlx-button-disabled="true"]::after{',
      '  content:"\\1F512 Bloqueado";',
      '  position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);',
      '  background:rgba(0,0,0,.78);color:#fff;padding:4px 8px;border-radius:4px;',
      '  font-size:11px;font-weight:600;pointer-events:none;white-space:nowrap;z-index:10;',
      '}',
      '[data-vlx-button-disabled="true"][title]:hover::after{',
      '  content:"\\1F512 " attr(data-vlx-disabled-reason);',
      '}',
    ].join('\n');
    document.head.appendChild(s);
  }

  function getToken() {
    try {
      return localStorage.getItem('volvix_token') ||
             localStorage.getItem('volvixAuthToken') || '';
    } catch (_) { return ''; }
  }

  // ── Aplicar lista de deshabilitados al DOM ────────────────────────────────
  function applyDisabled(disabled, reasons) {
    if (!Array.isArray(disabled)) return;
    var disabledSet = {};
    disabled.forEach(function (b) { disabledSet[b] = true; });

    // Pasada 1: marcar
    var all = document.querySelectorAll('[data-vlx-button]');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var id = el.getAttribute('data-vlx-button');
      if (disabledSet[id]) {
        el.setAttribute('data-vlx-button-disabled', 'true');
        if (reasons && reasons[id]) {
          el.setAttribute('data-vlx-disabled-reason', reasons[id]);
          el.setAttribute('title', '🔒 ' + reasons[id]);
        } else {
          el.setAttribute('data-vlx-disabled-reason', 'Bloqueado por administrador');
        }
        // Bloquear también vía el atributo nativo (defense-in-depth)
        try {
          if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') el.disabled = true;
        } catch (_) {}
      } else {
        // Re-habilitar si fue removido del bloqueo
        if (el.getAttribute('data-vlx-button-disabled') === 'true') {
          el.removeAttribute('data-vlx-button-disabled');
          el.removeAttribute('data-vlx-disabled-reason');
          el.removeAttribute('title');
          try {
            if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') el.disabled = false;
          } catch (_) {}
        }
      }
    }
    window.__VLX_BUTTON_FLAGS_DISABLED__ = disabled;
  }

  // ── Fetch desde backend ───────────────────────────────────────────────────
  function fetchFlags() {
    var tok = getToken();
    if (!tok) return Promise.resolve(null);
    return fetch('/api/tenant/buttons/active', {
      headers: { 'Authorization': 'Bearer ' + tok },
      credentials: 'include',
    }).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    }).catch(function () { return null; });
  }

  function refresh() {
    return fetchFlags().then(function (j) {
      if (!j || !j.ok) return;
      applyDisabled(j.disabled || [], j.reasons || {});
    });
  }

  // ── MutationObserver: re-aplicar cuando se inyecten botones tarde ─────────
  function observeDom() {
    if (!window.MutationObserver) return;
    var pending = false;
    var obs = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      // Re-aplicar lista cacheada (no refetch)
      requestAnimationFrame(function () {
        pending = false;
        var disabled = window.__VLX_BUTTON_FLAGS_DISABLED__ || [];
        if (disabled.length) {
          // Aplicar sólo a nuevos elementos sin marcar
          var disabledSet = {};
          disabled.forEach(function (b) { disabledSet[b] = true; });
          var all = document.querySelectorAll('[data-vlx-button]:not([data-vlx-button-disabled])');
          for (var i = 0; i < all.length; i++) {
            var el = all[i];
            var id = el.getAttribute('data-vlx-button');
            if (disabledSet[id]) {
              el.setAttribute('data-vlx-button-disabled', 'true');
              try { if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') el.disabled = true; } catch (_) {}
            }
          }
        }
      });
    });
    try { obs.observe(document.body, { childList: true, subtree: true }); } catch (_) {}
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  function boot() {
    injectCss();
    refresh().then(observeDom);
    // Polling suave cada 60s para que cambios del super-admin propaguen sin reload
    setInterval(refresh, 60 * 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // API pública (para volvix-launcher u otros)
  window.VolvixButtonFlags = {
    refresh: refresh,
    applyDisabled: applyDisabled,
    getDisabled: function () { return (window.__VLX_BUTTON_FLAGS_DISABLED__ || []).slice(); },
  };
})();
