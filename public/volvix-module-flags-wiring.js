/**
 * volvix-module-flags-wiring.js
 *
 * Carga GET /api/tenant/active-modules y aplica el estado de cada módulo /
 * botón sobre el DOM:
 *
 *   state='enabled'  → no hace nada (visible y funcional)
 *   state='hidden'   → REMUEVE el elemento del DOM (cambia el layout, no
 *                      queda hueco visible). Usar cuando el cliente NO
 *                      contrató ese módulo.
 *   state='locked'   → deja el elemento visible pero con overlay candado
 *                      al click muestra modal con lock_message custom.
 *                      Usar para "Próximamente", "Suscríbete", etc.
 *
 * Convenciones de marcado en el HTML del POS:
 *
 *   <section data-module="whatsapp">…</section>
 *   <button data-button="ventas.refund">Devolución</button>
 *   <a data-button="reportes.export-csv">Exportar CSV</a>
 *
 * El admin (superadmin) toggle estos flags via:
 *   POST /api/admin/tenants/:id/modules { modules: { whatsapp: { state, lock_message }}}
 *   POST /api/admin/tenants/:id/buttons { buttons: { 'ventas.refund': { state, lock_message }}}
 *
 * Para acceso "modo simple" (señor de 80 años): admin oculta TODO menos
 * `quickpos`, el usuario solo ve el QuickPOS — caja registradora.
 */
(function () {
  'use strict';
  if (window.__vlxModuleFlagsLoaded) return;
  window.__vlxModuleFlagsLoaded = true;

  // No aplicar en login / registro (no hay JWT)
  try {
    var path = (location.pathname || '').toLowerCase();
    if (/^\/(login|registro|index|404|cookies|aviso|terminos|gdpr)/.test(path)) return;
    if (path === '/' || path === '') return;
    if (path.startsWith('/landing-')) return;
    if (path.startsWith('/marketplace.html')) return;
    if (path.startsWith('/blog')) return;
  } catch (_) {}

  function getToken() {
    try {
      return localStorage.getItem('volvix_token') ||
             localStorage.getItem('volvixAuthToken') ||
             localStorage.getItem('jwt') || '';
    } catch (_) { return ''; }
  }

  function fetchFlags() {
    var token = getToken();
    if (!token) return Promise.resolve(null);
    return fetch('/api/tenant/active-modules', {
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' },
      credentials: 'include'
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  function injectStyles() {
    if (document.getElementById('vlx-module-flags-css')) return;
    var s = document.createElement('style');
    s.id = 'vlx-module-flags-css';
    s.textContent = [
      '/* state=hidden — el elemento se removió, no necesita CSS */',
      '/* state=locked — overlay candado + cursor not-allowed */',
      '[data-vlx-locked="true"] {',
      '  position: relative !important;',
      '  pointer-events: none !important;',
      '  user-select: none !important;',
      '}',
      '[data-vlx-locked="true"]::before {',
      '  content: "";',
      '  position: absolute;',
      '  inset: 0;',
      '  background: rgba(255,255,255,0.55);',
      '  z-index: 10;',
      '  border-radius: inherit;',
      '  pointer-events: auto;',
      '  cursor: not-allowed;',
      '}',
      '[data-vlx-locked="true"]::after {',
      '  content: "🔒";',
      '  position: absolute;',
      '  top: 50%; left: 50%;',
      '  transform: translate(-50%, -50%);',
      '  font-size: 22px;',
      '  z-index: 11;',
      '  background: #FFFFFF;',
      '  padding: 6px 10px;',
      '  border-radius: 999px;',
      '  border: 1px solid #E5E5EA;',
      '  pointer-events: none;',
      '}',
      '/* Wrapper clickeable invisible para abrir el modal de unlock */',
      '[data-vlx-lock-trigger="true"] {',
      '  cursor: pointer !important;',
      '  pointer-events: auto !important;',
      '}',
      '/* Modal Próximamente / Suscríbete */',
      '#vlx-lock-modal {',
      '  position: fixed; inset: 0;',
      '  background: rgba(0,0,0,0.55);',
      '  display: flex; align-items: center; justify-content: center;',
      '  z-index: 2147483646;',
      '  font-family: Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;',
      '  -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);',
      '}',
      '#vlx-lock-modal .vlx-lm-card {',
      '  background: #FFFFFF; color: #0B0B0F;',
      '  border-radius: 16px;',
      '  padding: 32px 28px;',
      '  width: 420px; max-width: 92vw;',
      '  box-shadow: 0 24px 48px -12px rgba(17,17,17,0.25);',
      '  text-align: center;',
      '}',
      '#vlx-lock-modal .vlx-lm-icon { font-size: 44px; margin-bottom: 8px; }',
      '#vlx-lock-modal h3 { margin: 0 0 12px; font-size: 22px; font-weight: 600; letter-spacing: -0.025em; }',
      '#vlx-lock-modal p { margin: 0 0 24px; color: #6B7280; line-height: 1.55; font-size: 14px; }',
      '#vlx-lock-modal button {',
      '  background: #0B0B0F; color: #FFFFFF;',
      '  border: none; border-radius: 8px;',
      '  padding: 12px 20px; font-size: 14px; font-weight: 500;',
      '  cursor: pointer; min-width: 120px; min-height: 44px;',
      '}',
      '#vlx-lock-modal .vlx-lm-close {',
      '  position: absolute; top: 16px; right: 16px;',
      '  background: transparent; color: #9CA3AF;',
      '  font-size: 22px; padding: 4px 10px; min-width: auto; min-height: auto;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function showLockModal(label, message) {
    var existing = document.getElementById('vlx-lock-modal');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'vlx-lock-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML =
      '<div class="vlx-lm-card" role="document">' +
        '<button class="vlx-lm-close" aria-label="Cerrar">&times;</button>' +
        '<div class="vlx-lm-icon">🔒</div>' +
        '<h3>' + (label ? escapeHtml(label) : 'Función no disponible') + '</h3>' +
        '<p>' + (message ? escapeHtml(message) : 'Esta función no está incluida en tu plan actual. Habla con tu administrador para activarla.') + '</p>' +
        '<button data-vlx-lm-action="contact">Hablar con ventas</button>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.classList.contains('vlx-lm-close')) modal.remove();
    });
    var contactBtn = modal.querySelector('[data-vlx-lm-action="contact"]');
    if (contactBtn) contactBtn.addEventListener('click', function () {
      window.location.href = '/soporte.html?reason=upgrade_request';
    });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  function applyFlags(flags) {
    if (!flags || !flags.ok) return;
    injectStyles();

    // Si flags.defaults_open === true Y flags.modules está vacío,
    // significa que NO hay restricciones — el tenant ve todo. No tocamos nada.
    var hasModuleFlags = flags.modules && Object.keys(flags.modules).length > 0;
    var hasButtonFlags = flags.buttons && Object.keys(flags.buttons).length > 0;
    if (!hasModuleFlags && !hasButtonFlags && flags.defaults_open) return;

    // Aplicar a módulos. 2026-05-06: el POS (salvadorex-pos.html) ya tiene
    // data-menu="X" en sus menu-btn. Lo reconocemos como key de modulo tambien
    // para evitar editar HTML. Tambien data-feature="module.X" (ya presente).
    var modSelectors = '[data-module],[data-menu],[data-feature^="module."]';
    document.querySelectorAll(modSelectors).forEach(function (el) {
      var key = el.getAttribute('data-module') ||
                el.getAttribute('data-menu') ||
                (el.getAttribute('data-feature') || '').replace(/^module\./, '');
      if (!key) return;
      var f = flags.modules && flags.modules[key];
      // Si no hay flag para este módulo, defecto = enabled
      if (!f) return;
      if (f.state === 'hidden') {
        el.remove();
      } else if (f.state === 'locked') {
        applyLocked(el, key, f.lock_message);
      }
    });

    // Aplicar a botones: <* data-button="X">
    document.querySelectorAll('[data-button]').forEach(function (el) {
      var key = el.getAttribute('data-button');
      var f = flags.buttons && flags.buttons[key];
      if (!f) return;
      if (f.state === 'hidden') {
        el.remove();
      } else if (f.state === 'locked') {
        applyLocked(el, key, f.lock_message);
      }
    });
  }

  function applyLocked(el, key, msg) {
    el.setAttribute('data-vlx-locked', 'true');
    // Wrapper trigger invisible encima que captura el click
    var trigger = document.createElement('div');
    trigger.setAttribute('data-vlx-lock-trigger', 'true');
    trigger.style.cssText = 'position:absolute;inset:0;z-index:12';
    trigger.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      var label = el.getAttribute('aria-label') || el.textContent.trim().slice(0, 60) || key;
      showLockModal(label, msg);
    });
    el.appendChild(trigger);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      fetchFlags().then(applyFlags);
    });
  } else {
    fetchFlags().then(applyFlags);
  }

  // Re-aplicar cuando aparezcan elementos nuevos (SPA / dynamic rendering)
  try {
    var mo = new MutationObserver(function () {
      // Debounce: aplica máximo cada 1s
      if (window.__vlxFlagsApplyTimer) clearTimeout(window.__vlxFlagsApplyTimer);
      window.__vlxFlagsApplyTimer = setTimeout(function () {
        if (window.__vlxFlagsCache) applyFlags(window.__vlxFlagsCache);
      }, 1000);
    });
    fetchFlags().then(function (flags) {
      window.__vlxFlagsCache = flags;
      applyFlags(flags);
      mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
    });
  } catch (_) {}
})();
