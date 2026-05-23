// Script global para ocultar railway.app y mantener negocio.international
(function() {
  const DOMAIN_TARGET = 'negocio.international';
  const RAILWAY_DOMAIN = 'volvix-pos-production.up.railway.app';

  // Si estamos en railway.app pero queremos mostrar negocio.international
  if (window.location.hostname === RAILWAY_DOMAIN) {
    const newUrl = `https://${DOMAIN_TARGET}${window.location.pathname}${window.location.search}${window.location.hash}`;
    // Usar history.replaceState para no agregar al historial
    window.history.replaceState({}, document.title, newUrl);
  }

  // Interceptar clicks en links
  document.addEventListener('click', function(e) {
    if (e.target.tagName === 'A' || e.target.closest('a')) {
      const link = e.target.tagName === 'A' ? e.target : e.target.closest('a');
      const href = link.getAttribute('href');

      if (href && (href.startsWith('/') || href.startsWith('http'))) {
        e.preventDefault();
        const targetUrl = href.startsWith('http') ? href : window.location.origin + href;
        window.location.href = targetUrl.replace(RAILWAY_DOMAIN, DOMAIN_TARGET);
      }
    }
  }, true);

  // Reescribir origin en fetch requests
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    if (args[0] && typeof args[0] === 'string') {
      args[0] = args[0].replace(RAILWAY_DOMAIN, DOMAIN_TARGET);
    }
    return originalFetch.apply(this, args);
  };
})();
