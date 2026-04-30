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
    // R28 fix: validar también JWT volvix_token (key que usa login.html)
    // junto con el legacy volvixSession. Cualquiera de las dos válida cuenta.
    try {
      const jwt = localStorage.getItem('volvix_token') || localStorage.getItem('volvixAuthToken');
      if (jwt) {
        hadAnySession = true;
        const parts = jwt.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (payload.exp && payload.exp * 1000 > Date.now()) {
            isValid = true;
          }
        }
      }
    } catch (e) {
      console.warn('[auth-gate] JWT parse fail:', e);
    }
    if (!isValid) {
      // Fallback legacy adicional
      let session = null;
      try {
        const stored = localStorage.getItem('volvixSession');
        if (stored) session = JSON.parse(stored);
      } catch (e) {
        console.warn('[auth-gate] Error parsing session:', e);
      }
      if (session) hadAnySession = true;
      if (session && session.user_id && session.expires_at > Date.now()) isValid = true;
    }
  }

  if (!isValid) {
    // Sesión no válida - redirigir a login
    const redirectUrl = encodeURIComponent(window.location.pathname + window.location.search);
    const expired = hadAnySession ? 1 : 0;
    window.location.replace(`/login.html?expired=${expired}&redirect=${redirectUrl}`);
  }
})();
