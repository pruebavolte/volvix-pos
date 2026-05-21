/**
 * volvix-presence.js · V13.26
 *
 * Heartbeat de presencia en vivo. Cada cliente que incluya este script
 * envía POST /api/presence/ping cada 30 segundos con un session_id único
 * persistido en sessionStorage. El panel cuenta sesiones únicas con
 * last_seen >= NOW()-90s para mostrar "Visitantes ahora".
 *
 * Auto-inicia al cargar. No requiere config. Limpia al cerrar la pestaña.
 *
 * Opcional: window.VOLVIX_PRESENCE.setGiro('restaurante') para reportar
 * qué giro está viendo el usuario (lo agrega al ping).
 *
 * Privacidad: el session_id es random, NO identifica al usuario. IP se
 * almacena hasheada server-side. sessionStorage se borra al cerrar pestaña.
 */
(function () {
  'use strict';

  // Skip en iframes/preview/admin para no inflar el contador
  try {
    if (window.top !== window.self) return; // dentro de iframe
    if (location.pathname.indexOf('/paneldecontrol') === 0) return;
    if (location.pathname.indexOf('/volvix-admin') === 0) return;
    if (location.search.indexOf('preview=1') >= 0) return;
  } catch (_) {}

  var PING_MS = 30 * 1000;
  var ENDPOINT = '/api/presence/ping';
  var SID_KEY = 'vlx_presence_sid';
  var state = { giro: '' };

  function genSid() {
    var rand = Math.random().toString(36).slice(2, 12);
    var time = Date.now().toString(36);
    return 'v-' + rand + '-' + time;
  }

  function getSid() {
    var sid = '';
    try { sid = sessionStorage.getItem(SID_KEY) || ''; } catch (_) {}
    if (!sid) {
      sid = genSid();
      try { sessionStorage.setItem(SID_KEY, sid); } catch (_) {}
    }
    return sid;
  }

  function detectGiro() {
    if (state.giro) return state.giro;
    // 1) URL ?giro=X
    try {
      var u = new URL(location.href);
      var g = u.searchParams.get('giro');
      if (g) return g;
    } catch (_) {}
    // 2) Filename landing-X.html
    try {
      var m = location.pathname.match(/\/landing-([a-z0-9_-]+)\.html/i);
      if (m) return m[1];
    } catch (_) {}
    return '';
  }

  function ping() {
    try {
      var body = JSON.stringify({
        session_id: getSid(),
        page: location.pathname,
        giro: detectGiro(),
      });
      // keepalive: true permite que el navegador complete la request aunque
      // el usuario navegue/cierre la pestaña
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
      }).catch(function () {});
    } catch (_) {}
  }

  // API pública mínima
  window.VOLVIX_PRESENCE = {
    setGiro: function (g) { state.giro = String(g || '').slice(0, 100); ping(); },
    ping: ping,
    getSid: getSid,
  };

  // Primer ping inmediato, luego cada PING_MS
  ping();
  var iv = setInterval(ping, PING_MS);

  // Cuando la pestaña vuelve a visible (Page Visibility API), ping inmediato
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') ping();
  });

  // Cleanup al cerrar pestaña (intento best-effort)
  window.addEventListener('beforeunload', function () {
    try { clearInterval(iv); } catch (_) {}
  });
})();
