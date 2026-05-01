/* ============================================================
   VOLVIX · Sync Status Widget — UI REMOVED (cleanup)
   ============================================================
   .vlx-sync-widget floating element eliminated.
   Online/offline detection logic preserved via volvix.sync events.
============================================================ */
(function () {
  'use strict';

  function init() {
    if (!window.volvix || !window.volvix.sync) {
      setTimeout(init, 100);
      return;
    }

    // Sync event listeners preserved for backend logic — no UI rendered
    function onSyncChange() {
      // Hook point: other modules can subscribe to window.volvix.sync events directly
    }

    window.volvix.sync.on('connection:change', onSyncChange);
    window.volvix.sync.on('queue:added', onSyncChange);
    window.volvix.sync.on('sync:start', onSyncChange);
    window.volvix.sync.on('sync:end', onSyncChange);
    window.volvix.sync.on('op:synced', onSyncChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
