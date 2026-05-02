/**
 * AUTH-GATE · Validación de sesión para páginas protegidas
 * Debe incluirse en el <head> ANTES de cualquier otro script
 * <script src="/auth-gate.js"></script>
 */

(function() {
  'use strict';

  // Páginas que NO requieren autenticación (públicas, navegables sin login).
  // El usuario debe poder ver landings, marketplace, legales, blog, autofactura
  // y la home antes de decidir registrarse.
  const PUBLIC_PAGES_EXACT = [
    '/',
    '/index.html',
    '/login.html',
    '/registro.html',
    '/marketplace.html',
    '/blog.html',
    '/landing_dynamic.html',
    '/cookies-policy.html',
    '/aviso-privacidad.html',
    '/terminos-condiciones.html',
    '/autofactura.html',
    '/404.html',
    '/INDICE-TUTORIALES.html',
    '/TUTORIAL-REGISTRO-USUARIOS.html',
    '/docs.html',
    '/api-docs.html',
    '/status-page.html',
    '/volvix-grand-tour.html',
    '/volvix-hub-landing.html',
    '/volvix-customer-portal.html',
    '/volvix-customer-portal-v2.html',
    '/salvadorex_web_v25.html'
  ];
  // Patrones públicos (cualquier landing-* y landing_*)
  const PUBLIC_PATTERNS = [
    /^\/landing-[a-z0-9_-]+\.html$/i,
    /^\/landing_[a-z0-9_-]+\.html$/i,
    /^\/ai\.html$/i
  ];

  function isPublicPage(pathname) {
    pathname = pathname || window.location.pathname || '/';
    if (PUBLIC_PAGES_EXACT.some(p => pathname === p || pathname.endsWith(p))) return true;
    if (PUBLIC_PATTERNS.some(re => re.test(pathname))) return true;
    return false;
  }
  // Exponer helper global para que otros wirings (auth-helper, volvix-api,
  // volvix-modules-wiring, volvix-sync, volvix-pos-payments-integration) puedan
  // consultar si NO deben forzar redirect al login al recibir un 401 desde
  // una página pública.
  try { window.__vlxIsPublicPage = isPublicPage; } catch (_) {}

  const pathname = window.location.pathname;
  if (isPublicPage(pathname)) return;

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
