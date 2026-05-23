// Script global para ocultar railway.app y mantener negocio.international
(function() {
  const metaDomain = document.querySelector('meta[name="canonical-domain"]');
  const DOMAIN_TARGET = metaDomain ? metaDomain.getAttribute('content') : 'negocio.international';
  const RAILWAY_DOMAIN = 'volvix-pos-production.up.railway.app';

  // sessionStorage para evitar loops infinitos
  const redirectKey = 'railway-redirect-attempted';
  const redirectAttempted = sessionStorage.getItem(redirectKey);

  // Si estamos en railway pero no en negocio, intenta redirect (solo una vez por sesión)
  if (window.location.hostname === RAILWAY_DOMAIN && !redirectAttempted) {
    sessionStorage.setItem(redirectKey, 'true');
    // Intenta redirect después de un pequeño delay
    setTimeout(() => {
      const newUrl = `https://${DOMAIN_TARGET}${window.location.pathname}${window.location.search}${window.location.hash}`;
      // Usa replace para no dejar historial
      window.location.replace(newUrl);
    }, 100);
  }

  // Interceptar clicks en links internos para mantener dominio
  document.addEventListener('click', function(e) {
    const link = e.target.tagName === 'A' ? e.target : e.target.closest('a');
    if (link) {
      const href = link.getAttribute('href');
      if (href && href.startsWith('/')) {
        e.preventDefault();
        const targetUrl = `${window.location.origin}${href}`;
        window.location.href = targetUrl;
      }
    }
  }, true);

  // Reescribir fetch requests
  if (window.fetch) {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const url = args[0];
      if (url && typeof url === 'string' && url.includes(RAILWAY_DOMAIN)) {
        args[0] = url.replace(RAILWAY_DOMAIN, window.location.hostname);
      }
      return originalFetch.apply(this, args);
    };
  }

  // Reescribir XMLHttpRequest
  if (window.XMLHttpRequest) {
    const originalOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url) {
      if (typeof url === 'string' && url.includes(RAILWAY_DOMAIN)) {
        url = url.replace(RAILWAY_DOMAIN, window.location.hostname);
      }
      return originalOpen.apply(this, arguments);
    };
  }

  // Registrar Service Worker para interceptación profunda
  if ('serviceWorker' in navigator && window.location.hostname === RAILWAY_DOMAIN) {
    navigator.serviceWorker.register('./sw-railway-hide.js', { scope: '/' }).catch(err => {
      console.warn('[hide-railway] SW registration failed:', err.message);
    });
  }
})();
