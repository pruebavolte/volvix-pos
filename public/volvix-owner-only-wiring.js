/**
 * volvix-owner-only-wiring.js
 * Reveals elements with [data-vlx-owner-only="systeminternational"] only when
 * the authenticated user is the platform owner (systeminternational.app).
 *
 * Detection (any of these grants access):
 *  - JWT payload role === 'superadmin'
 *  - JWT payload email ends with @systeminternational.app
 *  - localStorage.volvix_role === 'superadmin'
 *  - URL ?owner=1 (dev/manual override; only honored if also superadmin token)
 *
 * Default: HIDDEN. Gradual rollout — only true platform owner sees the button.
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  function decodeJwt(token) {
    try {
      const parts = String(token || '').split('.');
      if (parts.length < 2) return null;
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
      const json = atob(b64 + pad);
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch (_) { return null; }
  }

  function getToken() {
    try {
      return (
        localStorage.getItem('volvix_token') ||
        localStorage.getItem('jwt') ||
        localStorage.getItem('token') ||
        ''
      );
    } catch (_) { return ''; }
  }

  // 2026-05 audit B-9-1: SOLO confiamos en el JWT firmado del server.
  // Eliminado el branch localStorage.volvix_role que cualquiera podía setear
  // desde devtools (era cosmético pero confuso para auditoría / QA).
  function isPlatformOwner() {
    const payload = decodeJwt(getToken()) || {};
    const email = String(payload.email || '').toLowerCase();
    const role = String(payload.role || payload.rol || '').toLowerCase();
    if (role === 'superadmin' || role === 'platform_owner') return true;
    if (email.endsWith('@systeminternational.app')) return true;
    return false;
  }

  function apply() {
    const owner = isPlatformOwner();
    document.querySelectorAll('[data-vlx-owner-only]').forEach(function (el) {
      el.style.display = owner ? '' : 'none';
      el.setAttribute('aria-hidden', owner ? 'false' : 'true');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
  // Re-check after late JWT writes
  setTimeout(apply, 800);
  window.addEventListener('storage', apply);
})();
