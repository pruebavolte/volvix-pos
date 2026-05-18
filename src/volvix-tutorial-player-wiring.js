/**
 * Volvix Tutorial Player — wiring global
 * ---------------------------------------
 * Inyecta una API global window.VolvixTutorial que abre cualquier tutorial
 * en un modal overlay sin tener que navegar a otra página.
 *
 * Uso:
 *   window.VolvixTutorial.play('01-primera-venta');
 *   window.VolvixTutorial.close();
 *   window.VolvixTutorial.list();   // -> array con metadata
 *
 * También auto-cablea cualquier elemento con:
 *   <button data-volvix-tutorial="01-primera-venta">Ver tutorial</button>
 *   <a   data-volvix-tutorial="03-cierre-z">Cómo cerrar Z</a>
 *
 * Configurable:
 *   window.VolvixTutorial.config({ baseUrl: '/tutorials/' });
 *
 * Self-contained: no requiere dependencias externas.
 */
(function () {
  "use strict";

  if (typeof window === "undefined") return;
  if (window.VolvixTutorial && window.VolvixTutorial.__loaded) return;

  const STATE = {
    baseUrl: "/tutorials/",
    overlay: null,
    iframe: null,
    closeBtn: null,
    onCloseCallback: null,
    keyHandler: null,
    catalog: [
      { id: "01-primera-venta",   title: "Tu primera venta",          giro: "general",     lvl: "principiante" },
      { id: "02-crear-producto",  title: "Crear un producto",         giro: "general",     lvl: "principiante" },
      { id: "03-cierre-z",        title: "Cierre Z",                  giro: "general",     lvl: "intermedio" },
      { id: "04-modo-offline",    title: "Modo offline",              giro: "general",     lvl: "intermedio" },
      { id: "05-cliente-credito", title: "Cliente a crédito",         giro: "tienda",      lvl: "intermedio" },
      { id: "06-mis-modulos",     title: "Activar módulos",           giro: "general",     lvl: "principiante" },
      { id: "07-etiqueta-disenar",title: "Diseñar etiqueta",          giro: "tienda",      lvl: "avanzado" },
      { id: "08-devolucion",      title: "Devolución",                giro: "general",     lvl: "intermedio" },
      { id: "09-promocion",       title: "Crear promoción",           giro: "cafeteria",   lvl: "avanzado" },
      { id: "10-registro-3min",   title: "Registro en 3 minutos",     giro: "general",     lvl: "principiante" }
    ]
  };

  function injectStyles() {
    if (document.getElementById("volvix-tutorial-styles")) return;
    const style = document.createElement("style");
    style.id = "volvix-tutorial-styles";
    style.textContent = `
      .volvix-tut-overlay{
        position:fixed;inset:0;background:rgba(15,23,42,.85);
        display:none;align-items:center;justify-content:center;
        z-index:2147483640;backdrop-filter:blur(4px);
        animation:volvix-tut-fade .2s ease;
        font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
      }
      .volvix-tut-overlay.open{display:flex}
      .volvix-tut-modal{
        background:#1e293b;border-radius:14px;width:min(820px,95vw);
        height:min(680px,95vh);position:relative;display:flex;flex-direction:column;
        box-shadow:0 20px 60px rgba(0,0,0,.5);overflow:hidden;
      }
      .volvix-tut-header{
        display:flex;justify-content:space-between;align-items:center;
        padding:12px 18px;background:#0f172a;border-bottom:1px solid #334155;
        color:#e2e8f0;
      }
      .volvix-tut-header h3{margin:0;font-size:.95rem;font-weight:500}
      .volvix-tut-close{
        background:#ef4444;color:#fff;border:none;width:32px;height:32px;
        border-radius:50%;cursor:pointer;font-size:1rem;
      }
      .volvix-tut-close:hover{background:#dc2626}
      .volvix-tut-iframe{flex:1;border:0;width:100%;background:#0f172a}
      @keyframes volvix-tut-fade{from{opacity:0}to{opacity:1}}
      @media (max-width:600px){
        .volvix-tut-modal{width:100vw;height:100vh;border-radius:0}
      }
    `;
    document.head.appendChild(style);
  }

  function buildOverlay() {
    if (STATE.overlay) return;
    injectStyles();
    const overlay = document.createElement("div");
    overlay.className = "volvix-tut-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Tutorial Volvix");
    overlay.innerHTML = `
      <div class="volvix-tut-modal">
        <div class="volvix-tut-header">
          <h3 id="volvix-tut-title">Tutorial Volvix</h3>
          <button class="volvix-tut-close" aria-label="Cerrar tutorial" type="button">✕</button>
        </div>
        <iframe class="volvix-tut-iframe" title="Tutorial" loading="lazy"></iframe>
      </div>`;
    document.body.appendChild(overlay);
    STATE.overlay = overlay;
    STATE.iframe = overlay.querySelector(".volvix-tut-iframe");
    STATE.closeBtn = overlay.querySelector(".volvix-tut-close");
    STATE.titleEl = overlay.querySelector("#volvix-tut-title");

    STATE.closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
  }

  function play(id, opts) {
    if (!id) {
      console.warn("[VolvixTutorial] play() requiere un id de tutorial");
      return false;
    }
    buildOverlay();
    const meta = STATE.catalog.find((t) => t.id === id);
    const url = STATE.baseUrl.replace(/\/?$/, "/") + id + ".html";
    STATE.iframe.src = url;
    STATE.titleEl.textContent = meta ? `Tutorial — ${meta.title}` : "Tutorial Volvix";
    STATE.overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    STATE.onCloseCallback = (opts && typeof opts.onClose === "function") ? opts.onClose : null;

    STATE.keyHandler = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", STATE.keyHandler);
    STATE.closeBtn.focus();
    return true;
  }

  function close() {
    if (!STATE.overlay) return;
    STATE.overlay.classList.remove("open");
    STATE.iframe.src = "about:blank";
    document.body.style.overflow = "";
    if (STATE.keyHandler) {
      document.removeEventListener("keydown", STATE.keyHandler);
      STATE.keyHandler = null;
    }
    if (STATE.onCloseCallback) {
      try { STATE.onCloseCallback(); } catch (_) {}
      STATE.onCloseCallback = null;
    }
  }

  function list() {
    return STATE.catalog.slice();
  }

  function config(opts) {
    if (opts && typeof opts.baseUrl === "string") {
      STATE.baseUrl = opts.baseUrl;
    }
    if (opts && Array.isArray(opts.catalog)) {
      STATE.catalog = opts.catalog.slice();
    }
    return Object.assign({}, STATE, { overlay: undefined, iframe: undefined, closeBtn: undefined });
  }

  function autoWire() {
    document.addEventListener("click", (e) => {
      const target = e.target.closest("[data-volvix-tutorial]");
      if (!target) return;
      const id = target.getAttribute("data-volvix-tutorial");
      if (!id) return;
      e.preventDefault();
      play(id);
    });
  }

  window.VolvixTutorial = {
    __loaded: true,
    __version: "1.0.0",
    play: play,
    close: close,
    list: list,
    config: config
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoWire);
  } else {
    autoWire();
  }
})();
