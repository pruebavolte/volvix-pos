// Script global para ocultar railway.app y mantener negocio.international
(function() {
  const DOMAIN_TARGET = 'negocio.international';
  const RAILWAY_DOMAIN = 'volvix-pos-production.up.railway.app';
  const REDIRECT_COOKIE = 'negocio_redirect_done';

  // Si estamos en railway.app pero queremos mostrar negocio.international
  // Usar cookie para evitar redirect infinito
  if (window.location.hostname === RAILWAY_DOMAIN && !document.cookie.includes(REDIRECT_COOKIE)) {
    const newUrl = `https://${DOMAIN_TARGET}${window.location.pathname}${window.location.search}${window.location.hash}`;
    document.cookie = `${REDIRECT_COOKIE}=1; max-age=300`; // 5 min
    window.location.href = newUrl;
  }

  // Interceptar clicks en links para mantener dominio
  document.addEventListener('click', function(e) {
    const link = e.target.tagName === 'A' ? e.target : e.target.closest('a');
    if (link) {
      const href = link.getAttribute('href');
      if (href && href.startsWith('/')) {
        e.preventDefault();
        const targetUrl = `${window.location.origin}${href}`;
        window.location.href = targetUrl;
        return;
      }
    }
  }, true);

  // Reescribir origen en fetch requests si es necesario
  if (window.fetch) {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      if (args[0] && typeof args[0] === 'string' && args[0].includes(RAILWAY_DOMAIN)) {
        args[0] = args[0].replace(RAILWAY_DOMAIN, window.location.hostname);
      }
      return originalFetch.apply(this, args);
    };
  }
})();
