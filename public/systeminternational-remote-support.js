'use strict';

(() => {
  const supportHost = 'https://remoto-soporte-production.up.railway.app';

  function initialize() {
    const modal = document.getElementById('systeminternational-remote-support-modal');
    const mount = document.getElementById('systeminternational-remote-support-widget');
    const close = document.getElementById('systeminternational-remote-support-close');
    if (!modal || !mount || !close) return;

    let loaded = false;
    const closeModal = () => { modal.hidden = true; };
    const openModal = () => {
      modal.hidden = false;
      close.focus();
      if (loaded) return;
      loaded = true;
      const script = document.createElement('script');
      script.src = `${supportHost}/remote-support-embed.js?v=0.6.3`;
      script.dataset.supportHost = supportHost;
      script.dataset.container = '#systeminternational-remote-support-widget';
      script.dataset.source = 'systeminternational-web';
      script.dataset.fullAccess = 'true';
      script.dataset.buttonId = 'systeminternational-remote-support-widget';
      script.onerror = () => {
        mount.textContent = 'El soporte remoto no está disponible en este momento.';
        loaded = false;
      };
      document.head.appendChild(script);
    };

    document.querySelectorAll('[data-remote-support-trigger]').forEach((button) => {
      button.addEventListener('click', openModal);
    });
    close.addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });
    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeModal();
    });
    window.openSystemInternationalRemoteSupport = openModal;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
