'use strict';

(() => {
  const supportHost = 'https://remoto-soporte-production.up.railway.app';
  const mountPoint = document.getElementById('systeminternational-remote-support-widget');
  if (!mountPoint) return;

  window.RemoteSupportApiBase = supportHost;

  const fallback = (message) => {
    mountPoint.replaceChildren();
    const text = document.createElement('p');
    text.textContent = message;
    text.style.margin = '0';
    text.style.color = '#475569';
    mountPoint.append(text);
  };

  const initialize = async () => {
    try {
      if (!window.RemoteSupport?.CobrowseHost) throw new Error('SDK de soporte no disponible');
      const panel = document.createElement('div');
      panel.className = 'remote-support-inline';
      panel.style.marginTop = '10px';
      mountPoint.replaceChildren(panel);
      const host = new window.RemoteSupport.CobrowseHost({
        surface: document.body,
        container: panel,
        source: 'systeminternational-web',
        fullAccess: true,
        supportHost
      });
      if (typeof host.request !== 'function') throw new Error('No se pudo iniciar soporte remoto');
    } catch (error) {
      console.error('Remote support embed fallback:', error.message);
      fallback('El soporte remoto no está disponible en este momento.');
    }
  };

  initialize();
})();
