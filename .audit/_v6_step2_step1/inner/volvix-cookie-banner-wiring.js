/* =====================================================================
 * Volvix Cookie Consent Banner — LFPDPPP / GDPR compliant
 * R12b FIX-LEGAL-4
 * ---------------------------------------------------------------------
 *  - Banner aparece SOLO en primera visita (no almacenado en localStorage)
 *  - 3 acciones: Aceptar todo / Solo esenciales / Configurar
 *  - "Configurar" abre modal con checkboxes por categoría
 *  - Decisión persistida en localStorage.volvix_cookies_consent
 *  - Auto-skip si la página actual es legal-info (aviso, T&C, cookies, gdpr)
 * ===================================================================== */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__VOLVIX_COOKIE_BANNER_LOADED) return;
  window.__VOLVIX_COOKIE_BANNER_LOADED = true;

  var STORAGE_KEY = 'volvix_cookies_consent';
  var Z = 99999;

  // ── Helpers ─────────────────────────────────────────────────────────
  function readConsent() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (e) { return null; }
  }

  function writeConsent(obj) {
    try {
      var payload = {
        essential: true, // siempre true
        functional: !!obj.functional,
        analytics: !!obj.analytics,
        marketing: !!obj.marketing,
        ts: Date.now(),
        v: 1
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      // Disparar evento global para listeners (analytics opt-in, etc.)
      try {
        window.dispatchEvent(new CustomEvent('volvix:cookie-consent', { detail: payload }));
      } catch (e) {}
      return payload;
    } catch (e) { return null; }
  }

  function removeNode(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // ── Banner ──────────────────────────────────────────────────────────
  function showBanner() {
    if (document.getElementById('volvix-cookie-banner')) return;

    var banner = document.createElement('div');
    banner.id = 'volvix-cookie-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Aviso de cookies');
    banner.style.cssText = [
      'position:fixed', 'bottom:0', 'left:0', 'right:0',
      'background:#1a1a1a', 'color:#fff', 'padding:16px 20px',
      'z-index:' + Z,
      'display:flex', 'flex-wrap:wrap', 'align-items:center',
      'gap:12px', 'box-shadow:0 -2px 12px rgba(0,0,0,0.4)',
      'font-family:system-ui,Segoe UI,Roboto,sans-serif',
      'border-top:1px solid #333'
    ].join(';');

    banner.innerHTML =
      '<span style="flex:1;min-width:240px;font-size:14px;line-height:1.5;">' +
        '<span aria-hidden="true">🍪</span> ' +
        'Usamos cookies para que Volvix funcione. Las esenciales son necesarias; las funcionales y analíticas son opcionales. ' +
        '<a href="/cookies-policy.html" style="color:#60a5fa;text-decoration:underline;">Más información</a>.' +
      '</span>' +
      '<button type="button" id="vcb-accept-all" style="background:#10b981;color:#fff;border:0;padding:9px 16px;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">Aceptar todas</button>' +
      '<button type="button" id="vcb-essential" style="background:#6b7280;color:#fff;border:0;padding:9px 16px;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">Solo esenciales</button>' +
      '<button type="button" id="vcb-settings" style="background:transparent;color:#fff;border:1px solid #888;padding:9px 16px;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">Configurar</button>';

    document.body.appendChild(banner);

    document.getElementById('vcb-accept-all').addEventListener('click', function () {
      window.volvixCookies.acceptAll();
    });
    document.getElementById('vcb-essential').addEventListener('click', function () {
      window.volvixCookies.essentialOnly();
    });
    document.getElementById('vcb-settings').addEventListener('click', function () {
      window.volvixCookies.openSettings();
    });
  }

  // ── Modal de configuración ─────────────────────────────────────────
  function showSettings() {
    if (document.getElementById('volvix-cookie-modal')) return;
    var current = readConsent() || { functional: false, analytics: false, marketing: false };

    var overlay = document.createElement('div');
    overlay.id = 'volvix-cookie-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Configuración de cookies');
    overlay.style.cssText = [
      'position:fixed', 'inset:0',
      'background:rgba(0,0,0,0.7)',
      'z-index:' + (Z + 1),
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:16px',
      'font-family:system-ui,Segoe UI,Roboto,sans-serif'
    ].join(';');

    var box = document.createElement('div');
    box.style.cssText = [
      'background:#141a2b', 'color:#e8ecf4',
      'border:1px solid #1f2740', 'border-radius:12px',
      'padding:24px', 'max-width:520px', 'width:100%',
      'max-height:90vh', 'overflow-y:auto',
      'box-shadow:0 20px 60px rgba(0,0,0,0.6)'
    ].join(';');

    box.innerHTML =
      '<h2 style="margin:0 0 12px;font-size:18px;color:#5cc8ff;">Configurar cookies</h2>' +
      '<p style="margin:0 0 16px;color:#cfd6e4;font-size:13px;line-height:1.5;">' +
        'Selecciona qué categorías de cookies deseas permitir. Las cookies esenciales no se pueden desactivar porque son necesarias para que Volvix funcione.' +
      '</p>' +

      categoryRow('essential', 'Esenciales', 'Sesión, autenticación, seguridad. Indispensables.', true, true) +
      categoryRow('functional', 'Funcionales', 'Recuerdan tu idioma, tema y preferencias.', !!current.functional, false) +
      categoryRow('analytics', 'Analíticas', 'Estadísticas anónimas para mejorar el producto (Plausible).', !!current.analytics, false) +
      categoryRow('marketing', 'Marketing', 'No usadas por defecto. Solo si activamos publicidad/remarketing.', !!current.marketing, false) +

      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap;">' +
        '<button type="button" id="vcm-cancel" style="background:transparent;color:#fff;border:1px solid #888;padding:9px 16px;border-radius:6px;cursor:pointer;font-size:14px;">Cancelar</button>' +
        '<button type="button" id="vcm-save" style="background:#5cc8ff;color:#08111f;border:0;padding:9px 16px;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">Guardar preferencias</button>' +
      '</div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    document.getElementById('vcm-cancel').addEventListener('click', function () {
      removeNode(overlay);
    });
    document.getElementById('vcm-save').addEventListener('click', function () {
      var f = document.getElementById('vcm-cb-functional');
      var a = document.getElementById('vcm-cb-analytics');
      var m = document.getElementById('vcm-cb-marketing');
      writeConsent({
        functional: f && f.checked,
        analytics: a && a.checked,
        marketing: m && m.checked
      });
      removeNode(overlay);
      removeNode(document.getElementById('volvix-cookie-banner'));
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) removeNode(overlay);
    });
  }

  function categoryRow(id, title, desc, checked, locked) {
    var disabledAttr = locked ? 'disabled' : '';
    var lockNote = locked ? ' <span style="font-size:11px;color:#8a93a6;">(siempre activas)</span>' : '';
    return (
      '<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid #1f2740;">' +
        '<input type="checkbox" id="vcm-cb-' + id + '" ' + (checked ? 'checked' : '') + ' ' + disabledAttr +
          ' style="margin-top:4px;width:18px;height:18px;cursor:' + (locked ? 'not-allowed' : 'pointer') + ';">' +
        '<label for="vcm-cb-' + id + '" style="flex:1;cursor:' + (locked ? 'not-allowed' : 'pointer') + ';">' +
          '<div style="font-size:14px;font-weight:600;color:#e8ecf4;">' + title + lockNote + '</div>' +
          '<div style="font-size:12px;color:#8a93a6;margin-top:2px;line-height:1.4;">' + desc + '</div>' +
        '</label>' +
      '</div>'
    );
  }

  // ── API pública ─────────────────────────────────────────────────────
  window.volvixCookies = {
    getConsent: readConsent,
    hasDecided: function () { return readConsent() !== null; },
    acceptAll: function () {
      writeConsent({ functional: true, analytics: true, marketing: true });
      removeNode(document.getElementById('volvix-cookie-banner'));
      removeNode(document.getElementById('volvix-cookie-modal'));
    },
    essentialOnly: function () {
      writeConsent({ functional: false, analytics: false, marketing: false });
      removeNode(document.getElementById('volvix-cookie-banner'));
      removeNode(document.getElementById('volvix-cookie-modal'));
    },
    openSettings: function () { showSettings(); },
    reset: function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      removeNode(document.getElementById('volvix-cookie-banner'));
      showBanner();
    }
  };

  // ── Boot ────────────────────────────────────────────────────────────
  // 2026-05-06: el banner ya no aparece globalmente (era intrusivo en POS,
  // marketplace, login). Ahora SOLO se muestra cuando el usuario esta en una
  // pagina/seccion donde tiene sentido revisar privacidad:
  //   - paginas legales (cookies-policy, aviso-privacidad, terminos)
  //   - en /salvadorex-pos.html cuando navega a la seccion "Mi Perfil" o
  //     "Cliente: <perfil>" (hash #perfil o screen-perfil activo).
  // Para forzar el banner manualmente: window.volvixCookies.reset() o
  // window.volvixCookies.openSettings().
  function shouldShowOnThisPage() {
    try {
      var p = (location.pathname || '').toLowerCase();
      var h = (location.hash || '').toLowerCase();
      // 1) Paginas legales: siempre mostrar (es el contexto correcto)
      if (p.indexOf('cookies-policy') !== -1 ||
          p.indexOf('aviso-privacidad') !== -1 ||
          p.indexOf('terminos-condiciones') !== -1) {
        return true;
      }
      // 2) En /salvadorex-pos.html: solo cuando el user esta en perfil/cliente
      if (p.indexOf('salvadorex-pos') !== -1) {
        if (h.indexOf('perfil') !== -1 || h.indexOf('cliente') !== -1) return true;
        // Detectar via DOM: si la seccion #screen-perfil o #screen-clientes esta visible
        try {
          var perfilOpen = document.querySelector('#screen-perfil:not(.hidden)');
          var clientesOpen = document.querySelector('#screen-clientes:not(.hidden)');
          if (perfilOpen || clientesOpen) return true;
        } catch (_) {}
        return false;
      }
      // 3) Resto de paginas (POS, login, marketplace, registro): NO mostrar.
      return false;
    } catch (_) { return false; }
  }

  function boot() {
    if (readConsent()) return; // ya decidió, no molestar
    if (!shouldShowOnThisPage()) {
      // Re-verificar cuando el usuario navegue a perfil/clientes dentro del POS
      try {
        window.addEventListener('hashchange', function () {
          if (!readConsent() && shouldShowOnThisPage()) showBanner();
        });
        // Listener para clicks en menu del POS que abren perfil/clientes
        document.addEventListener('click', function (ev) {
          setTimeout(function () {
            if (!readConsent() && shouldShowOnThisPage()) showBanner();
          }, 50);
        }, true);
      } catch (_) {}
      return;
    }
    showBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
