/**
 * AUTH-GATE · Validación de sesión para páginas protegidas
 * Debe incluirse en el <head> ANTES de cualquier otro script
 * <script src="/auth-gate.js"></script>
 */

(function() {
  'use strict';

  // Páginas que NO requieren autenticación
  const PUBLIC_PAGES = [
    '/index.html',
    '/login.html',
    '/landing_dynamic.html',
    '/marketplace.html',
    '/salvadorex_web_v25.html',
  ];

  const pathname = window.location.pathname;

  // Verificar si la página actual es pública
  const isPublic = PUBLIC_PAGES.some(p => pathname === p || pathname.endsWith(p));
  if (isPublic) return;

  // Validar sesión vía JWT helper (preferido) con fallback a chequeo legacy
  let isValid = false;
  let hadAnySession = false;

  if (window.Volvix && window.Volvix.auth && typeof window.Volvix.auth.isLoggedIn === 'function') {
    hadAnySession = !!window.Volvix.auth.getToken();
    isValid = window.Volvix.auth.isLoggedIn();
  } else {
    // Fallback legacy (auth-helper.js no cargado todavía)
    let session = null;
    try {
      const stored = localStorage.getItem('volvixSession');
      if (stored) session = JSON.parse(stored);
    } catch (e) {
      console.warn('[auth-gate] Error parsing session:', e);
    }
    hadAnySession = !!session;
    isValid = !!(session && session.user_id && session.expires_at > Date.now());
  }

  if (!isValid) {
    // Sesión no válida - redirigir a login
    const redirectUrl = encodeURIComponent(window.location.pathname + window.location.search);
    const expired = hadAnySession ? 1 : 0;
    window.location.replace(`/login.html?expired=${expired}&redirect=${redirectUrl}`);
  }
})();
