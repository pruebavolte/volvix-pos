'use strict';

(() => {
  const supportHost = 'https://remoto-soporte-production.up.railway.app';
  const mountPoint = document.getElementById('systeminternational-remote-support-widget');
  if (!mountPoint) return;

  window.RemoteSupportApiBase = supportHost;

  const loadStyle = (path) => new Promise((resolve, reject) => {
    const href = `${supportHost}${path}`;
    if ([...document.querySelectorAll('link')].some((node) => node.href === href)) return resolve();
    const node = document.createElement('link');
    node.rel = 'stylesheet';
    node.href = href;
    node.onload = resolve;
    node.onerror = () => reject(new Error(`No se pudo cargar ${path}`));
    document.head.append(node);
  });

  const loadScript = (path) => new Promise((resolve, reject) => {
    const src = `${supportHost}${path}`;
    if ([...document.scripts].some((node) => node.src === src)) return resolve();
    const node = document.createElement('script');
    node.src = src;
    node.onload = resolve;
    node.onerror = () => reject(new Error(`No se pudo cargar ${path}`));
    document.head.append(node);
  });

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
      await loadStyle('/cobrowse.css');
      await loadScript('/shared.js');
      await loadScript('/vendor/rrweb/rrweb.min.js');
      await loadScript('/cobrowse-common.js');
      await loadScript('/cobrowse-host.js');
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
