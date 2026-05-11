/**
 * volvix-mobile-fixes.js
 * Runtime patches para UX móvil + onboarding "de 1 por 1" (2026-05-11).
 *
 * Capas:
 *   A) Mobile UX (sidebar backdrop, touch fallback, retry wizard, click delay)
 *   B) Onboarding guiado:
 *      1) Si CATALOG está vacío al boot → mostrar inventario + abrir wizard
 *      2) Banner rojo en Ventas "no tienes productos — click aquí" → abre wizard
 *      3) 5ta card en wizard step1: "Capturar 1 por 1" → cierra wizard,
 *         va a Ventas, foca el scan input con borde rojo parpadeante +
 *         tooltip "solo escribe el nombre o escanea el código"
 *      4) Cuando se abre el modal de Nuevo producto en modo guiado,
 *         inyecta banner rojo "solo pon tu precio y da 2 Enter…"
 */
(function () {
  'use strict';

  if (window.__volvixMobileFixesLoaded) return;
  window.__volvixMobileFixesLoaded = true;

  const isMobile = () => window.matchMedia('(max-width: 880px)').matches;
  const isTouch = () => window.matchMedia('(hover: none), (pointer: coarse)').matches;

  // ==================================================================
  // A) MOBILE UX
  // ==================================================================

  function patchSidebar() {
    const sb = document.getElementById('pos-sidebar-right');
    if (!sb) return;
    const sync = () => {
      const open = sb.classList.contains('open');
      document.body.classList.toggle('vlx-sb-open', open && isMobile());
    };
    new MutationObserver(sync).observe(sb, { attributes: true, attributeFilter: ['class'] });
    sync();
    document.addEventListener('click', (e) => {
      if (!isMobile()) return;
      if (!sb.classList.contains('open')) return;
      const toggle = document.querySelector('.pos-sidebar-toggle');
      if (sb.contains(e.target)) return;
      if (toggle && toggle.contains(e.target)) return;
      sb.classList.remove('open');
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sb.classList.contains('open')) sb.classList.remove('open');
    });
    window.addEventListener('resize', () => {
      if (!isMobile()) document.body.classList.remove('vlx-sb-open');
    });
  }

  function patchImportButton() {
    const btn = document.getElementById('btn-import-prod');
    if (!btn || btn.__vlxMobilePatched) return;
    btn.__vlxMobilePatched = true;
    const open = () => openWizardSafe();
    btn.addEventListener('touchend', (e) => {
      if (!isTouch()) return;
      e.preventDefault();
      open();
    }, { passive: false });
  }

  function patchTouchFeedback() {
    if (!isTouch()) return;
    const sel = 'button, a, .btn, [role="button"], .tab, .menu-btn, .tb-btn, .action-btn';
    document.addEventListener('touchstart', (e) => {
      const el = e.target.closest(sel);
      if (el) el.classList.add('vlx-touched');
    }, { passive: true });
    const clear = () => document.querySelectorAll('.vlx-touched').forEach(el => el.classList.remove('vlx-touched'));
    document.addEventListener('touchend', clear, { passive: true });
    document.addEventListener('touchcancel', clear, { passive: true });
  }

  // ==================================================================
  // B) ONBOARDING GUIADO
  // ==================================================================

  // Helper: abrir wizard con retry si VolvixImport todavía no cargó
  function openWizardSafe(attempts) {
    attempts = attempts || 0;
    if (window.VolvixImport && typeof window.VolvixImport.openWizard === 'function') {
      try { window.VolvixImport.openWizard(); } catch (e) { console.warn('[mob-fix] openWizard:', e); }
      setTimeout(() => {
        const modal = document.getElementById('volvix-import-modal');
        if (modal) {
          modal.style.setProperty('display', 'flex', 'important');
          modal.style.setProperty('visibility', 'visible', 'important');
          modal.style.setProperty('opacity', '1', 'important');
          modal.style.setProperty('z-index', '99996', 'important');
          // Marcar como dismissed cuando el usuario cierre el wizard
          const closeBtn = modal.querySelector('.volvix-imp-close, [data-close], .close');
          if (closeBtn && !closeBtn.__vlxDismissWired) {
            closeBtn.__vlxDismissWired = true;
            closeBtn.addEventListener('click', () => {
              localStorage.setItem('volvix_wizard_dismissed', 'true');
            });
          }
          // Escape también marca dismissed
          modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') localStorage.setItem('volvix_wizard_dismissed', 'true');
          });
        }
      }, 120);
      return true;
    }
    if (attempts < 20) {
      setTimeout(() => openWizardSafe(attempts + 1), 250);
    }
    return false;
  }

  // ── B-1) Auto-abrir wizard al boot si CATALOG está vacío ──────────
  // 2026-05-11: NO auto-abrir si:
  //   (a) hay productos en CATALOG (cualquier cantidad >0)
  //   (b) hay productos visibles en el DOM (tabla de inventario rendereada)
  //   (c) ya hay otro modal abierto (modal-product-form, etc.)
  //   (d) el usuario ya descartó el wizard antes (localStorage flag)
  function isAnyModalOpen() {
    const sel = '#modal-product-form, .modal.open, [role="dialog"]:not([hidden])';
    return Array.from(document.querySelectorAll(sel)).some(m => {
      const s = getComputedStyle(m);
      return s.display !== 'none' && s.visibility !== 'hidden' && m.offsetParent !== null;
    });
  }
  function hasInventoryProducts() {
    // Catalog en memoria
    if (window.CATALOG && Array.isArray(window.CATALOG) && window.CATALOG.length > 0) return true;
    // Filas en la tabla de inventario (renderizadas desde DB)
    const rows = document.querySelectorAll('#inv-table tbody tr, #screen-inventario tbody tr');
    if (rows.length > 0) return true;
    // Stat de "TOTAL PRODUCTOS" en el dashboard de inventario
    const totalEl = document.querySelector('[data-stat="total-products"], #inv-total-products');
    if (totalEl && parseInt(totalEl.textContent || '0', 10) > 0) return true;
    return false;
  }
  // 2026-05-11: consulta la BD del tenant para saber si hay productos.
  // Imprescindible porque CATALOG local puede estar vacío aunque haya 284 productos en DB.
  async function tenantHasProductsInDB() {
    try {
      const r = await fetch('/api/productos?select=id&limit=1', { credentials: 'include' });
      if (!r.ok) return false;
      const j = await r.json();
      const items = (j && (j.items || j.data)) || [];
      return items.length > 0;
    } catch (_) { return false; }
  }

  function autoOpenIfEmpty() {
    // Si el usuario ya descartó el wizard en esta sesión, NO re-abrir
    if (localStorage.getItem('volvix_wizard_dismissed') === 'true') return;

    setTimeout(async () => {
      if (hasInventoryProducts()) return;     // ya tiene productos local → no molestar
      if (await tenantHasProductsInDB()) return; // ya tiene productos en BD → no molestar
      if (isAnyModalOpen()) return;            // otro modal abierto → no superponer
      try {
        if (typeof window.showScreen === 'function') window.showScreen('inventario');
      } catch (_) {}
      openWizardSafe();

      // Watcher: si el catalog se puebla DESPUÉS de abrir el wizard
      // (data load tardó más de 5.2s), cerrar el wizard automáticamente
      // porque ya no hace sentido mostrarlo.
      let _watcherTicks = 0;
      const _watcher = setInterval(() => {
        _watcherTicks++;
        if (hasInventoryProducts()) {
          const wiz = document.getElementById('volvix-import-modal');
          if (wiz) {
            wiz.remove();
            localStorage.setItem('volvix_wizard_dismissed', 'true');
            console.log('[mob-fix] wizard auto-closed: catalog populated after open');
          }
          clearInterval(_watcher);
        }
        if (_watcherTicks > 30) clearInterval(_watcher); // máximo 30s de watch
      }, 1000);
    }, 5200);
  }

  // ── B-2) Banner rojo "No tienes productos" en pantalla Ventas ─────
  function mountEmptyBanner() {
    const screen = document.getElementById('screen-pos');
    if (!screen) return;
    if (document.getElementById('vlx-empty-products-banner')) return;
    const banner = document.createElement('button');
    banner.id = 'vlx-empty-products-banner';
    banner.type = 'button';
    banner.setAttribute('data-feature', 'pos.empty_state_banner');
    banner.setAttribute('aria-label', 'No tienes productos — click para agregar');
    banner.innerHTML = '⚠️ <strong>No tienes productos</strong> · Agrega productos — <u>click aquí</u>';
    banner.addEventListener('click', () => openWizardSafe());
    // Insertar después del .pos-banner si existe; si no, al inicio del .pos-main-area
    const area = screen.querySelector('.pos-main-area') || screen;
    const posBanner = area.querySelector('.pos-banner');
    if (posBanner && posBanner.parentNode) {
      posBanner.parentNode.insertBefore(banner, posBanner.nextSibling);
    } else {
      area.insertBefore(banner, area.firstChild);
    }
    // Mostrar/ocultar según presencia REAL de productos (no solo CATALOG)
    function syncEmptyBanner() {
      // 2026-05-11: usar hasInventoryProducts() que también chequea DOM/DB
      // El banner reportaba "no tienes productos" aunque el inventario mostraba 284
      const hasProducts = (typeof hasInventoryProducts === 'function')
        ? hasInventoryProducts()
        : !!(window.CATALOG && Array.isArray(window.CATALOG) && window.CATALOG.length > 0);
      if (!hasProducts) {
        banner.style.setProperty('display', 'flex', 'important');
        banner.style.setProperty('visibility', 'visible', 'important');
        banner.classList.remove('vlx-feature-hidden', 'tv-hidden');
      } else {
        banner.style.setProperty('display', 'none', 'important');
      }
    }
    syncEmptyBanner();
    // Re-evaluar cuando se cargan productos
    document.addEventListener('volvix:products-loaded', syncEmptyBanner);
    document.addEventListener('volvix:inventory-loaded', syncEmptyBanner);
    // Polling de respaldo más agresivo (cada 1s primero 30s, luego cada 5s)
    let _bannerTicks = 0;
    const intv = setInterval(() => {
      syncEmptyBanner();
      _bannerTicks++;
      if (_bannerTicks > 30) clearInterval(intv); // 30s de polling rápido
    }, 1000);
    // Polling más lento de respaldo (5 min)
    const intvSlow = setInterval(syncEmptyBanner, 5000);
    setTimeout(() => clearInterval(intvSlow), 5 * 60 * 1000);
  }

  // ── B-3) 5ta card "Capturar 1 por 1" en wizard step 1 ─────────────
  function injectOneByOneCard() {
    // Observar cuando aparece el modal del wizard
    const obs = new MutationObserver(() => {
      const grid = document.querySelector('.volvix-imp-2cards');
      if (!grid) return;
      if (grid.querySelector('#volvix-opt-onebyone')) return;
      const card = document.createElement('div');
      card.className = 'volvix-imp-card-opt vlx-card-onebyone';
      card.id = 'volvix-opt-onebyone';
      card.setAttribute('tabindex', '0');
      card.innerHTML = `
        <div class="volvix-imp-card-ico">⌨️</div>
        <div class="volvix-imp-card-t">De 1 por 1</div>
        <div class="volvix-imp-card-d">Agrega productos uno a uno conforme los vendas</div>
        <div class="volvix-imp-formats">Modo guiado · cursor automático · super fácil</div>
      `;
      card.addEventListener('click', startOneByOneMode);
      // Activar también con Enter/Space para teclado
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startOneByOneMode(); }
      });
      grid.appendChild(card);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // ── B-3b) Iniciar modo guiado: cerrar wizard, ir a Ventas, focar input ─
  function startOneByOneMode() {
    // Cerrar wizard
    const modal = document.getElementById('volvix-import-modal');
    if (modal) modal.remove();
    // Ir a pantalla Ventas
    try {
      if (typeof window.showScreen === 'function') window.showScreen('pos');
    } catch (_) {}
    // Marcar modo guiado para que el modal de producto sepa mostrar el aviso
    window.__vlxOneByOneMode = true;
    // Inyectar tooltip arriba del input + clase "modo guiado" en el input
    setTimeout(() => {
      const input = document.getElementById('barcode-input');
      if (!input) return;
      // Crear/mostrar tooltip arriba del input
      let tip = document.getElementById('vlx-onebyone-tip');
      if (!tip) {
        tip = document.createElement('div');
        tip.id = 'vlx-onebyone-tip';
        tip.setAttribute('data-feature', 'pos.onebyone_tip');
        tip.innerHTML = '💡 <strong>Solo escribe el nombre</strong> de un producto o <strong>escanea el código de barras</strong>';
        // Insertar antes de la fila del input (pos-code-bar)
        const codeBar = input.closest('.pos-code-bar') || input.parentElement;
        if (codeBar && codeBar.parentNode) {
          codeBar.parentNode.insertBefore(tip, codeBar);
        }
      }
      // El wiring de feature-flags puede inyectar display:none !important.
      // Usamos setProperty con 'important' para vencer ese override.
      tip.style.setProperty('display', 'flex', 'important');
      tip.style.setProperty('visibility', 'visible', 'important');
      tip.style.setProperty('opacity', '1', 'important');
      tip.removeAttribute('aria-hidden');
      tip.classList.remove('vlx-feature-hidden', 'tv-hidden');
      // Re-forzar varias veces (250ms x 8) por si algún observer lo re-oculta
      let tries = 0;
      const reForce = setInterval(() => {
        tip.style.setProperty('display', 'flex', 'important');
        tip.style.setProperty('visibility', 'visible', 'important');
        tip.classList.remove('vlx-feature-hidden', 'tv-hidden');
        if (++tries > 8) clearInterval(reForce);
      }, 250);
      // Aplicar clase parpadeante al input
      input.classList.add('vlx-blink-red');
      input.focus({ preventScroll: false });
      input.select();
      // Scroll para que sea visible en móvil
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
  }

  // ── B-4) Banner rojo en modal de "Nuevo producto" ─────────────────
  function patchProductFormModal() {
    const obs = new MutationObserver(() => {
      const m = document.getElementById('modal-product-form');
      if (!m) return;
      if (m.__vlxBannerInjected) return;
      const card = m.querySelector('div'); // primer div interior
      if (!card) return;
      const banner = document.createElement('div');
      banner.id = 'vlx-product-form-banner';
      banner.setAttribute('data-feature', 'pos.product_form_tip');
      banner.innerHTML = '🟥 <strong>Tip rápido:</strong> Solo pon tu <strong>precio</strong> y da <strong>2 Enter</strong>… o llena lo que quieras y guarda. <strong>Así de fácil 🎉</strong>';
      // Insertar como primer hijo del cuerpo del modal (después del header)
      const header = card.querySelector('h2');
      if (header && header.parentNode) {
        header.parentNode.parentNode.insertBefore(banner, header.parentNode.nextSibling);
      } else {
        card.insertBefore(banner, card.firstChild);
      }
      // Vencer el feature-flag wiring que oculta elementos no autorizados
      banner.style.setProperty('display', 'flex', 'important');
      banner.style.setProperty('visibility', 'visible', 'important');
      banner.style.setProperty('opacity', '1', 'important');
      let _bannerTries = 0;
      const _bannerInt = setInterval(() => {
        banner.style.setProperty('display', 'flex', 'important');
        banner.style.setProperty('visibility', 'visible', 'important');
        banner.classList.remove('vlx-feature-hidden', 'tv-hidden');
        if (++_bannerTries > 8) clearInterval(_bannerInt);
      }, 250);
      m.__vlxBannerInjected = true;
      // Forzar foco en input "precio" si estamos en modo 1-por-1 (cursor donde le importa)
      if (window.__vlxOneByOneMode) {
        setTimeout(() => {
          const priceInput = document.getElementById('pf-price');
          if (priceInput) { priceInput.focus(); priceInput.select(); }
        }, 200);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // ── B-5) Cleanup del modo 1-por-1 cuando el usuario sale de la pantalla ─
  function cleanupOneByOneOnScreenLeave() {
    // Si window.showScreen es llamado a algo distinto de 'pos', limpiar
    if (typeof window.showScreen !== 'function') return;
    const orig = window.showScreen;
    window.showScreen = function (name) {
      if (window.__vlxOneByOneMode && name && name !== 'pos') {
        window.__vlxOneByOneMode = false;
        const tip = document.getElementById('vlx-onebyone-tip');
        if (tip) tip.style.display = 'none';
        const input = document.getElementById('barcode-input');
        if (input) input.classList.remove('vlx-blink-red');
      }
      return orig.apply(this, arguments);
    };
  }

  // ==================================================================
  // BOOT
  // ==================================================================
  function boot() {
    patchSidebar();
    patchImportButton();
    patchTouchFeedback();
    mountEmptyBanner();
    injectOneByOneCard();
    patchProductFormModal();
    autoOpenIfEmpty();
    // showScreen puede no existir todavía al boot; hookear cuando exista
    let tries = 0;
    const intv = setInterval(() => {
      if (typeof window.showScreen === 'function') {
        cleanupOneByOneOnScreenLeave();
        clearInterval(intv);
      } else if (++tries > 40) {
        clearInterval(intv);
      }
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Re-bind si el botón Importar aparece después
  const obs = new MutationObserver(() => {
    const btn = document.getElementById('btn-import-prod');
    if (btn && !btn.__vlxMobilePatched) patchImportButton();
    if (!document.getElementById('vlx-empty-products-banner') && document.getElementById('screen-pos')) {
      mountEmptyBanner();
    }
  });
  obs.observe(document.body || document.documentElement, { childList: true, subtree: true });

  // ── D) Anti-superposición: si abre modal-product-form, cerrar wizard ─
  // 2026-05-11: reportado que ambos modales se superponen cuando el wizard
  // auto-abre y simultáneamente el usuario escanea un producto.
  const antiOverlapObs = new MutationObserver(() => {
    const pf = document.getElementById('modal-product-form');
    const pfVisible = pf && getComputedStyle(pf).display !== 'none' && getComputedStyle(pf).visibility !== 'hidden';
    if (pfVisible) {
      const wiz = document.getElementById('volvix-import-modal');
      if (wiz) {
        wiz.remove(); // cerrar wizard cuando aparece modal de producto
        localStorage.setItem('volvix_wizard_dismissed', 'true');
      }
    }
  });
  antiOverlapObs.observe(document.body || document.documentElement, { childList: true, subtree: true });

  // ==================================================================
  // C) PARCHES PARA PIN LOCK Y TOURS (desactivados por defecto)
  // ==================================================================

  function lsGet(k, def) {
    try { const v = localStorage.getItem(k); return v !== null ? v : def; } catch(e) { return def; }
  }

  // ── C-1) PIN: interceptar idle timer cuando está desactivado ─────
  function patchPinAPI() {
    // Esperar a que PinAPI cargue (volvix-pin-wiring.js es defer)
    if (!window.PinAPI) return false;
    if (window.PinAPI.__vlxPatched) return true;
    window.PinAPI.__vlxPatched = true;

    const origLock = window.PinAPI.lock;
    window.PinAPI.lock = function (...args) {
      if (lsGet('volvix_pin_enabled', 'false') !== 'true') {
        console.log('[mob-fix] PIN lock skipped (disabled by config)');
        return;
      }
      return origLock.apply(this, args);
    };
    console.log('[mob-fix] PinAPI.lock patched (off by default)');
    return true;
  }

  // ── C-2) Tours: interceptar maybeAutoStart cuando está desactivado ─
  function patchTours() {
    if (!window.VolvixOnboardingTour) return false;
    if (window.VolvixOnboardingTour.__vlxPatched) return true;
    window.VolvixOnboardingTour.__vlxPatched = true;

    const origStart = window.VolvixOnboardingTour.start;
    window.VolvixOnboardingTour.start = function (...args) {
      if (lsGet('volvix_tours_enabled', 'false') !== 'true') {
        console.log('[mob-fix] Tour.start skipped (disabled by config)');
        return;
      }
      return origStart.apply(this, args);
    };
    console.log('[mob-fix] VolvixOnboardingTour.start patched (off by default)');
    return true;
  }

  // Polling hasta que los módulos carguen (son defer)
  let _patchTries = 0;
  const _patchIntv = setInterval(() => {
    const pinDone  = patchPinAPI();
    const tourDone = patchTours();
    if ((pinDone && tourDone) || ++_patchTries > 60) clearInterval(_patchIntv);
  }, 300);

})();
