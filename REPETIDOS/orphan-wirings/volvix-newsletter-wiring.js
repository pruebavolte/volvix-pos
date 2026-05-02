/**
 * volvix-newsletter-wiring.js
 * Auto-injecta el footer "Suscríbete a nuestro newsletter" en páginas
 * públicas (landings, marketplace, hub-landing). Anti-spam con honeypot.
 *
 * Uso: <script src="/volvix-newsletter-wiring.js" defer></script>
 *
 * Páginas excluidas (auth, panel, herramientas internas) por nombre.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.__volvixNewsletterMounted) return;

  var path = (location.pathname || '').toLowerCase();
  // Excluir páginas internas
  var excluded = [
    '/login', '/registro', '/dashboard',
    '/internal/', '/volvix-admin', '/volvix-owner',
    '/volvix-pwa-final', '/mis-modulos',
    '/volvix-customer-portal', '/volvix-vendor-portal',
    '/volvix-kiosk', '/volvix-kds',
    '/volvix-emergency-mode', '/volvix-grand-tour',
    '/volvix-onboarding'
  ];
  for (var i = 0; i < excluded.length; i++) {
    if (path.indexOf(excluded[i]) === 0 || path.indexOf(excluded[i]) === path.length - excluded[i].length) {
      // do nothing
    }
  }
  for (var j = 0; j < excluded.length; j++) {
    if (path.indexOf(excluded[j]) !== -1) return;
  }
  // Solo en páginas públicas: landings, marketplace, blog, hub, index
  var isPublic = (
    path === '/' || path === '/index.html' ||
    path.indexOf('/landing') !== -1 ||
    path.indexOf('/blog') !== -1 ||
    path.indexOf('marketplace') !== -1 ||
    path.indexOf('hub-landing') !== -1 ||
    path.indexOf('volvix-shop') !== -1 ||
    path.indexOf('volvix-sitemap') !== -1
  );
  if (!isPublic) return;

  window.__volvixNewsletterMounted = true;

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'style') n.setAttribute('style', attrs[k]);
      else if (k === 'className') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    if (html != null) n.innerHTML = html;
    return n;
  }

  function build() {
    if (document.getElementById('volvix-newsletter-footer')) return;
    var wrap = el('section', {
      id: 'volvix-newsletter-footer',
      role: 'region',
      'aria-label': 'Suscripción al newsletter',
      style: [
        'background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%)',
        'color:#fff',
        'padding:48px 16px',
        'margin-top:48px',
        'text-align:center',
        'font-family:system-ui,-apple-system,Segoe UI,sans-serif'
      ].join(';')
    });
    wrap.innerHTML =
      '<div style="max-width:640px;margin:0 auto">' +
      '<h2 style="margin:0 0 8px;font-size:28px;font-weight:700">Suscríbete a nuestro newsletter</h2>' +
      '<p style="margin:0 0 24px;opacity:.85;font-size:16px">' +
      'Tips de POS, marketing para tu negocio, novedades del producto. Sin spam.' +
      '</p>' +
      '<form id="volvix-nl-form" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center" novalidate>' +
        '<input type="text" name="name" placeholder="Tu nombre (opcional)" autocomplete="name" ' +
          'style="flex:1;min-width:160px;padding:12px 14px;border:none;border-radius:8px;font-size:15px">' +
        '<input type="email" name="email" required placeholder="tu@email.com" autocomplete="email" ' +
          'style="flex:2;min-width:200px;padding:12px 14px;border:none;border-radius:8px;font-size:15px">' +
        // Honeypot oculto
        '<input type="text" name="website" tabindex="-1" autocomplete="off" ' +
          'style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" aria-hidden="true">' +
        '<button type="submit" ' +
          'style="background:#3b82f6;color:#fff;border:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">' +
          'Suscribirme</button>' +
      '</form>' +
      '<div id="volvix-nl-msg" style="margin-top:16px;font-size:14px;min-height:20px"></div>' +
      '<p style="margin:24px 0 0;opacity:.6;font-size:12px">' +
      'Al suscribirte aceptas recibir correos. Puedes cancelar tu suscripción en cualquier momento.' +
      '</p>' +
      '</div>';
    document.body.appendChild(wrap);

    var form = document.getElementById('volvix-nl-form');
    var msg  = document.getElementById('volvix-nl-msg');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      msg.textContent = 'Enviando...';
      msg.style.color = '#cbd5e1';
      var fd = new FormData(form);
      var payload = {
        email:   String(fd.get('email') || '').trim(),
        name:    String(fd.get('name') || '').trim() || null,
        website: String(fd.get('website') || ''), // honeypot
        source:  'web:' + (location.pathname || '/'),
      };
      try {
        // Mejor giro_interest si la página es una landing
        var m = (location.pathname || '').match(/landing-([a-z0-9_-]+)/i);
        if (m) payload.giro_interest = m[1];
      } catch (_) {}
      fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (j) {
          if (j && j.ok) {
            msg.style.color = '#86efac';
            msg.textContent = j.already_subscribed
              ? 'Ya estabas suscrito, gracias.'
              : 'Listo, te enviamos un correo de confirmación.';
            try { form.reset(); } catch (_) {}
          } else {
            msg.style.color = '#fca5a5';
            msg.textContent = (j && j.error === 'rate_limited')
              ? 'Espera un momento antes de volver a intentarlo.'
              : (j && j.error === 'invalid_email')
                ? 'Email inválido.'
                : 'No pudimos completar tu suscripción.';
          }
        }).catch(function () {
          msg.style.color = '#fca5a5';
          msg.textContent = 'Error de red, intenta de nuevo.';
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
