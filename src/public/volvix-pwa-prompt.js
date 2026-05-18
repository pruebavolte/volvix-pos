/* ============================================================
   VOLVIX · PWA Install Prompt
   ============================================================
   - Detecta Android/Chrome (beforeinstallprompt) → botón nativo
   - Detecta iOS Safari → instrucciones manuales (Compartir → Añadir)
   - Detecta si ya está instalada (display-mode: standalone) → no muestra
   - Recuerda dismissal en localStorage por 7 días
   - Registra el SW y maneja updates (skipWaiting)

   Uso:
     <script src="/volvix-pwa-prompt.js" defer></script>
============================================================ */
(function () {
  'use strict';

  const LS_KEY      = 'volvix.pwa.dismissedAt';
  const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
  let deferredPrompt = null;

  // ── 1. Registrar Service Worker ─────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(reg => {
          console.log('[Volvix PWA] SW registrado');
          // Auto-update: si hay nuevo SW esperando, activarlo
          reg.addEventListener('updatefound', () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', () => {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                // Hay versión nueva — activar
                nw.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          });
        })
        .catch(err => console.warn('[Volvix PWA] SW error:', err));

      // Refrescar la pestaña cuando el SW activo cambie
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        // Sólo recargar si no estamos en pleno cobro (heurística simple)
        if (!document.body.classList.contains('volvix-cobrando')) {
          window.location.reload();
        }
      });

      // Escuchar broadcasts del SW
      navigator.serviceWorker.addEventListener('message', (ev) => {
        const { type, remaining, endpoint } = ev.data || {};
        if (type === 'OFFLINE_QUEUED') {
          toast('Operación guardada offline · se enviará al volver la red');
        } else if (type === 'OFFLINE_QUEUE_DRAINED' && remaining === 0) {
          toast('Sincronización completa');
        } else if (type === 'OFFLINE_FLUSHED') {
          console.log('[Volvix PWA] flushed', endpoint);
        }
      });
    });
  }

  // ── 2. Detectar plataforma ──────────────────────────────────
  const ua          = navigator.userAgent || '';
  const isIOS       = /iPhone|iPad|iPod/i.test(ua) && !window.MSStream;
  const isAndroid   = /Android/i.test(ua);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                    || window.navigator.standalone === true;

  function dismissed() {
    const t = parseInt(localStorage.getItem(LS_KEY) || '0', 10);
    return t && (Date.now() - t < COOLDOWN_MS);
  }
  function markDismissed() { localStorage.setItem(LS_KEY, Date.now().toString()); }

  // ── 3. Capturar beforeinstallprompt (Android/Chrome/Edge) ──
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!isStandalone && !dismissed()) showPrompt('android');
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hidePrompt();
    toast('Volvix POS instalado correctamente');
  });

  // ── 4. iOS: mostrar instrucciones tras 4s ──────────────────
  if (isIOS && !isStandalone && !dismissed()) {
    setTimeout(() => showPrompt('ios'), 4000);
  }

  // ── 5. UI ───────────────────────────────────────────────────
  function showPrompt(kind) {
    if (document.getElementById('volvix-pwa-banner')) return;

    const wrap = document.createElement('div');
    wrap.id = 'volvix-pwa-banner';
    wrap.innerHTML = `
      <style>
        #volvix-pwa-banner {
          position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%);
          z-index: 99999;
          width: min(420px, calc(100vw - 24px));
          background: #0F0F0F; color: #FAFAF9;
          border: 1px solid rgba(251,191,36,0.35);
          border-radius: 16px;
          box-shadow: 0 12px 40px rgba(0,0,0,.5);
          padding: 14px 16px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          animation: vpwaIn .25s ease-out;
        }
        @keyframes vpwaIn { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
        #volvix-pwa-banner .row { display: flex; align-items: center; gap: 12px; }
        #volvix-pwa-banner .ico { font-size: 28px; }
        #volvix-pwa-banner h4 { margin: 0; font-size: 14px; font-weight: 700; }
        #volvix-pwa-banner p  { margin: 2px 0 0; font-size: 12px; color: #A8A29E; line-height: 1.4; }
        #volvix-pwa-banner .btns { display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end; }
        #volvix-pwa-banner button {
          font-family: inherit;
          padding: 8px 14px;
          border-radius: 9px;
          border: none;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        #volvix-pwa-banner .install { background: #FBBF24; color: #000; }
        #volvix-pwa-banner .later   { background: transparent; color: #A8A29E; border: 1px solid rgba(255,255,255,.12); }
        #volvix-pwa-banner .ios-tip { font-size: 12px; color: #FBBF24; margin-top: 8px; }
      </style>
      <div class="row">
        <div class="ico">📲</div>
        <div style="flex:1">
          <h4>Instalar Volvix POS</h4>
          <p>Acceso rápido, pantalla completa y funciona sin conexión.</p>
        </div>
      </div>
      ${kind === 'ios' ? `
        <div class="ios-tip">
          Toca <b>Compartir</b> ⬆️ y luego <b>“Añadir a pantalla de inicio”</b>.
        </div>` : ''}
      <div class="btns">
        <button class="later" type="button" data-act="later">Ahora no</button>
        ${kind !== 'ios' ? `<button class="install" type="button" data-act="install">Instalar</button>` : ''}
      </div>
    `;
    document.body.appendChild(wrap);

    wrap.addEventListener('click', async (ev) => {
      const act = ev.target?.getAttribute?.('data-act');
      if (act === 'later') { markDismissed(); hidePrompt(); }
      if (act === 'install' && deferredPrompt) {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice && choice.outcome !== 'accepted') markDismissed();
        deferredPrompt = null;
        hidePrompt();
      }
    });
  }

  function hidePrompt() {
    const el = document.getElementById('volvix-pwa-banner');
    if (el) el.remove();
  }

  // ── 6. Toast helper ─────────────────────────────────────────
  function toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: #0F0F0F; color: #FAFAF9;
      border: 1px solid rgba(251,191,36,.4);
      padding: 10px 16px; border-radius: 10px;
      font: 600 13px/1.2 -apple-system, 'Segoe UI', sans-serif;
      z-index: 99999; box-shadow: 0 8px 24px rgba(0,0,0,.5);
      animation: vpwaIn .25s ease-out;
    `;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  // ── 7. API pública (para botón manual desde la app) ────────
  window.VolvixPWA = {
    canInstall:   () => !!deferredPrompt,
    isInstalled:  () => isStandalone,
    promptInstall: async () => {
      if (!deferredPrompt) {
        if (isIOS) showPrompt('ios');
        return { outcome: 'unavailable' };
      }
      deferredPrompt.prompt();
      const r = await deferredPrompt.userChoice;
      deferredPrompt = null;
      return r;
    },
    flushQueue: () => {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'FLUSH_QUEUE' });
      }
    },
    getQueue: () => new Promise((res) => {
      if (!navigator.serviceWorker?.controller) return res([]);
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => res(e.data?.items || []);
      navigator.serviceWorker.controller.postMessage({ type: 'GET_QUEUE' }, [ch.port2]);
    }),
  };
})();
