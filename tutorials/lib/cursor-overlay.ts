// =========================================================================
// tutorials/lib/cursor-overlay.ts
// Overlay HTML+CSS+JS que se inyecta en cada page para:
//   - Cursor SVG rojo siempre visible (sigue mouse)
//   - Halo translucido rojo alrededor del cursor
//   - Pulso radial al hacer click (80px -> 200px en 500ms)
//   - Caja roja punteada alrededor del elemento clickeado (1.2s)
//   - Zoom suave (scale 1.15) cuando se solicita
//
// Se inyecta UNA sola vez por page via page.addInitScript en recorder.ts.
// =========================================================================

export const CURSOR_OVERLAY_SCRIPT = `
(function () {
  if (window.__volvixTutOverlay) return;
  window.__volvixTutOverlay = true;

  // ---------- estilo global ----------
  const style = document.createElement('style');
  style.textContent = \`
    @keyframes vlxClickPulse {
      0%   { width: 30px; height: 30px; opacity: .85; }
      100% { width: 200px; height: 200px; opacity: 0; }
    }
    @keyframes vlxRingFade {
      0%, 70% { opacity: 1; }
      100%    { opacity: 0; }
    }
    @keyframes vlxZoomIn {
      0%   { transform: scale(1); }
      100% { transform: scale(1.15); }
    }
    @keyframes vlxZoomOut {
      0%   { transform: scale(1.15); }
      100% { transform: scale(1); }
    }
    .__vlx-cursor {
      position: fixed; z-index: 2147483647; pointer-events: none;
      width: 28px; height: 28px;
      transform: translate(-3px, -3px);
      filter: drop-shadow(0 0 12px rgba(220,38,38,0.85)) drop-shadow(0 2px 4px rgba(0,0,0,.4));
      transition: top .08s linear, left .08s linear;
      will-change: top, left;
    }
    .__vlx-pulse {
      position: fixed; z-index: 2147483646; pointer-events: none;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(220,38,38,0.55) 0%, rgba(220,38,38,0) 70%);
      transform: translate(-50%, -50%);
      animation: vlxClickPulse 500ms cubic-bezier(.2,.7,.3,1) forwards;
    }
    .__vlx-ring {
      position: fixed; z-index: 2147483645; pointer-events: none;
      border: 3px dashed #dc2626;
      border-radius: 8px;
      box-shadow: 0 0 0 3px rgba(220,38,38,0.18), 0 0 24px rgba(220,38,38,0.35);
      animation: vlxRingFade 1.2s ease-out forwards;
    }
    .__vlx-zoom-host {
      transform-origin: center center !important;
      will-change: transform;
    }
    .__vlx-screen {
      position: fixed; inset: 0; z-index: 2147483640;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #312e81 100%);
      color: #fff; display: flex; align-items: center; justify-content: center;
      flex-direction: column; gap: 10px; text-align: center;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      animation: vlxScreenFade .5s ease-in;
    }
    @keyframes vlxScreenFade {
      from { opacity: 0; transform: scale(0.96); }
      to   { opacity: 1; transform: scale(1); }
    }
    .__vlx-screen h1 { font-size: 42px; font-weight: 900; letter-spacing: -1px; margin: 0; }
    .__vlx-screen p  { font-size: 20px; opacity: .85; margin: 0; max-width: 80%; line-height: 1.4; }
    .__vlx-caption {
      position: fixed; left: 50%; bottom: 56px; transform: translateX(-50%);
      background: rgba(0,0,0,0.85); color: #fff;
      padding: 14px 22px; border-radius: 12px;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      font-size: 18px; font-weight: 600;
      max-width: 80%; text-align: center; line-height: 1.4;
      box-shadow: 0 6px 24px rgba(0,0,0,.5);
      z-index: 2147483641; pointer-events: none;
      backdrop-filter: blur(8px);
    }
  \`;
  document.head.appendChild(style);

  // ---------- cursor SVG rojo ----------
  const cursor = document.createElement('div');
  cursor.className = '__vlx-cursor';
  cursor.innerHTML = \`<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
    <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.36z"
          fill="#dc2626" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>\`;
  cursor.style.top = '50%';
  cursor.style.left = '50%';
  document.body.appendChild(cursor);
  window.__vlxCursor = cursor;

  // Funciones expuestas para que Playwright las invoque via page.evaluate
  window.__vlxMoveCursor = function (x, y) {
    cursor.style.left = x + 'px';
    cursor.style.top = y + 'px';
  };

  window.__vlxClickPulse = function (x, y) {
    const el = document.createElement('div');
    el.className = '__vlx-pulse';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(function () { try { el.remove(); } catch(_){} }, 600);
  };

  window.__vlxRingAt = function (x, y, w, h) {
    const el = document.createElement('div');
    el.className = '__vlx-ring';
    el.style.left = (x - 6) + 'px';
    el.style.top  = (y - 6) + 'px';
    el.style.width  = (w + 12) + 'px';
    el.style.height = (h + 12) + 'px';
    document.body.appendChild(el);
    setTimeout(function () { try { el.remove(); } catch(_){} }, 1300);
  };

  window.__vlxZoomEl = function (selector, enable) {
    const el = document.querySelector(selector);
    if (!el) return;
    if (enable) {
      el.classList.add('__vlx-zoom-host');
      el.style.transition = 'transform 1s cubic-bezier(.4,0,.2,1)';
      el.style.transform = 'scale(1.15)';
    } else {
      el.style.transition = 'transform .6s cubic-bezier(.4,0,.2,1)';
      el.style.transform = 'scale(1)';
      setTimeout(function () { try { el.classList.remove('__vlx-zoom-host'); el.style.transition=''; el.style.transform=''; } catch(_){} }, 700);
    }
  };

  window.__vlxShowScreen = function (title, subtitle) {
    const el = document.createElement('div');
    el.className = '__vlx-screen';
    el.id = '__vlx-screen-active';
    el.innerHTML = '<h1>' + title + '</h1>' + (subtitle ? '<p>' + subtitle + '</p>' : '');
    document.body.appendChild(el);
  };
  window.__vlxHideScreen = function () {
    const el = document.getElementById('__vlx-screen-active');
    if (el) el.remove();
  };

  window.__vlxShowCaption = function (text) {
    let el = document.getElementById('__vlx-caption-active');
    if (!el) {
      el = document.createElement('div');
      el.className = '__vlx-caption';
      el.id = '__vlx-caption-active';
      document.body.appendChild(el);
    }
    el.textContent = text;
  };
  window.__vlxHideCaption = function () {
    const el = document.getElementById('__vlx-caption-active');
    if (el) el.remove();
  };

  // Eco visual del mouse real (por si el browser dispara mousemove)
  document.addEventListener('mousemove', function (ev) {
    cursor.style.left = ev.clientX + 'px';
    cursor.style.top  = ev.clientY + 'px';
  }, { passive: true });
})();
`;
