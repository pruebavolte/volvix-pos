// Script global para ocultar railway.app y mantener negocio.international
(function() {
  const metaDomain = document.querySelector('meta[name="canonical-domain"]');
  const DOMAIN_TARGET = metaDomain ? metaDomain.getAttribute('content') : 'negocio.international';
  const RAILWAY_DOMAIN = 'volvix-pos-production.up.railway.app';
  const REDIRECT_COOKIE = `${DOMAIN_TARGET}_redirect_done`;

  // Inmediatamente al cargar, si no estamos en el dominio correcto, redirigir
  if (window.location.hostname === RAILWAY_DOMAIN && !document.cookie.includes(REDIRECT_COOKIE)) {
    const newUrl = `https://${DOMAIN_TARGET}${window.location.pathname}${window.location.search}${window.location.hash}`;
    document.cookie = `${REDIRECT_COOKIE}=1; max-age=600; path=/`;
    window.location.href = newUrl;
  }

  // Interceptar clicks en links internos
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
})();
