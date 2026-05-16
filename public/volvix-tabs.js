/**
 * volvix-tabs.js — ADR-003 ejecutado
 * Unifica los 6 sistemas de tabs distintos en una sola función.
 *
 * Sistemas actuales mantienen su API legacy (aliases):
 *   showInvTab(tab, btn)        -> VolvixTabs.activate('inv', tab, btn)
 *   showPromoTab(tab, btn)      -> VolvixTabs.activate('promo', tab, btn)
 *   provTab(tab, btn)           -> VolvixTabs.activate('prov', tab, btn)
 *   showCfg(tab, btn)           -> VolvixTabs.activate('cfg', tab, btn)
 *   ingApp.switchTab(tab, btn)  -> VolvixTabs.activate('ing', tab, btn)
 *   mktApp.filtrarPlat(p, btn)  -> VolvixTabs.activate('mkt', p, btn)
 *
 * Bonus: persiste el tab activo por grupo en sessionStorage para que
 * al re-navegar entre pantallas se conserve la pestaña abierta.
 */
(function () {
  'use strict';
  if (window.VolvixTabs) return; // idempotente

  function _saveActive(group, tab) {
    try { sessionStorage.setItem('vlx:tab:' + group, tab); } catch (_) {}
  }
  function _loadActive(group) {
    try { return sessionStorage.getItem('vlx:tab:' + group); } catch (_) { return null; }
  }

  window.VolvixTabs = {
    activate: function (group, tab, btn) {
      // 1. Marcar el botón clicked como activo, desactivar sus hermanos
      if (btn && btn.parentNode) {
        var siblings = btn.parentNode.querySelectorAll('.config-tab, .tab, .nav-tab, .mkt-plat-tab, .ing-tab, [data-tab-btn]');
        siblings.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      }
      // 2. Mostrar el pane correspondiente, ocultar los demás del mismo grupo
      var paneSelector = '[data-tab-group="' + group + '"]';
      document.querySelectorAll(paneSelector).forEach(function (pane) {
        var matches = pane.dataset.tab === tab;
        pane.classList.toggle('active', matches);
        pane.classList.toggle('hidden', !matches);
        // backward compat con display:none inline
        if (pane.style.display === 'none' || pane.style.display === '') {
          pane.style.display = matches ? '' : 'none';
        }
      });
      // 3. Persistir
      _saveActive(group, tab);
      // 4. Disparar evento custom para módulos que necesitan reaccionar
      try {
        document.dispatchEvent(new CustomEvent('volvix:tab-changed', { detail: { group: group, tab: tab } }));
      } catch (_) {}
    },
    getActive: function (group) {
      return _loadActive(group);
    },
    // Restaura el tab activo persistido al recargar la pantalla
    restoreOnLoad: function (group, defaultTab) {
      var saved = _loadActive(group) || defaultTab;
      if (saved) {
        // Buscar el botón por data-tab + grupo y activarlo programáticamente
        var btnSel = '[data-tab-group-btn="' + group + '"][data-tab="' + saved + '"]';
        var btn = document.querySelector(btnSel);
        this.activate(group, saved, btn);
      }
    }
  };

  console.log('[VolvixTabs] ready (ADR-003)');
})();
