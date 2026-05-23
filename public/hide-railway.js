// Script global para ocultar railway.app y mantener negocio.international
(function() {
  // Leer dominio correcto del meta tag
  const metaDomain = document.querySelector('meta[name="canonical-domain"]');
  const DOMAIN_TARGET = metaDomain ? metaDomain.getAttribute('content') : 'negocio.international';
  const RAILWAY_DOMAIN = 'volvix-pos-production.up.railway.app';
  const REDIRECT_COOKIE = `${DOMAIN_TARGET}_redirect_done`;

  // Si estamos en railway.app pero queremos mostrar el dominio target
  // Usar cookie para evitar redirect infinito
  if (window.location.hostname === RAILWAY_DOMAIN && !document.cookie.includes(REDIRECT_COOKIE)) {
    const newUrl = `https://${DOMAIN_TARGET}${window.location.pathname}${window.location.search}${window.location.hash}`;
    document.cookie = `${REDIRECT_COOKIE}=1; max-age=300; path=/`; // 5 min
    window.location.href = newUrl;
  }

  // Interceptar clicks en links para mantener dominio correcto
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

  // Reescribir origen en fetch requests
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
