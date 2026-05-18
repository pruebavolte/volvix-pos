/* ============================================================
   VOLVIX · Brand Router v2 — con generación on-demand
   ----------------------------------------------------------------
   Flujo:
   1. Usuario escribe "vendo nieves"
   2. Router intercepta searchGiro/quickSearch
   3. Si el giro tiene marca hardcoded (comandero, navaja, etc.) →
      redirige directo a esa URL.
   4. Si NO hay marca → POST /api/giros/generate
      - Si el servidor responde cached:true → redirige a la URL inmediato
      - Si responde pending → muestra UI de progreso + polling
      - Cuando status=done → redirige a la URL
   ============================================================ */
(function(){
  'use strict';

  // ---- Brand catalog hardcoded (las que tú ya hiciste a mano) ----
  // Estos tienen prioridad sobre la generación AI: son los 5 hero brands
  var VLX_BRANDS = {
    'restaurante':     { brand:'Comandero',  url:'comandero.html'   },
    'taqueria':        { brand:'Comandero',  url:'comandero.html'   },
    'pizzeria':        { brand:'Comandero',  url:'comandero.html'   },
    'barberia':        { brand:'Navaja',     url:'navaja.html'      },
    'estetica':        { brand:'Navaja',     url:'navaja.html'      },
    'farmacia':        { brand:'Receta',     url:'receta.html'      },
    'abarrotes':       { brand:'Tendito',    url:'tendito.html'     },
    'fruteria':        { brand:'Tendito',    url:'tendito.html'     },
    'minisuper':       { brand:'Tendito',    url:'tendito.html'     },
    'zapateria':       { brand:'Pareo',      url:'pareo.html'       },
    'boutique':        { brand:'Pareo',      url:'pareo.html'       },
  };

  // Aliases comunes
  var VLX_ALIASES = {
    'barberia':'barberia', 'barber':'barberia',
    'estetica':'estetica',
    'farmacia':'farmacia', 'botica':'farmacia',
    'restaurante':'restaurante', 'restaurant':'restaurante',
    'taqueria':'taqueria', 'tacos':'taqueria',
    'pizza':'pizzeria', 'pizzeria':'pizzeria',
    'abarrotes':'abarrotes', 'tienda':'abarrotes', 'tiendita':'abarrotes',
    'frutas':'fruteria', 'fruteria':'fruteria',
    'zapateria':'zapateria', 'zapatos':'zapateria', 'calzado':'zapateria',
  };

  // ---- API endpoint (configurable) -----------------------------
  var API_BASE = window.VLX_API_BASE || '';
  var API_GENERATE = API_BASE + '/api/giros/generate';
  var API_STATUS   = API_BASE + '/api/giros/status/';

  // ---- Normalizador ---------------------------------------------
  function norm(s){
    return (s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function slugify(s){
    return norm(s).replace(/\s+/g, '-');
  }

  // ---- Resolver: texto → brand hardcoded -----------------------
  function resolveHardcoded(query){
    if (!query) return null;
    var n = norm(query);
    if (VLX_ALIASES[n] && VLX_BRANDS[VLX_ALIASES[n]]) return VLX_BRANDS[VLX_ALIASES[n]];
    if (VLX_BRANDS[n]) return VLX_BRANDS[n];
    var bestMatch=null, bestLen=0;
    for (var alias in VLX_ALIASES) {
      if (!VLX_ALIASES.hasOwnProperty(alias)) continue;
      if (n.indexOf(alias) !== -1 && alias.length > bestLen) {
        var key = VLX_ALIASES[alias];
        if (VLX_BRANDS[key]) { bestMatch = VLX_BRANDS[key]; bestLen = alias.length; }
      }
    }
    return bestMatch;
  }

  function saveContext(q, brand){
    try {
      sessionStorage.setItem('volvix_last_search', JSON.stringify({
        query: q, giro: q, business_name: q,
        brand: brand && brand.brand || null,
        brand_url: brand && brand.url || null,
        ts: Date.now(),
      }));
    } catch (_) {}
  }

  // ============================================================
  // GENERATION UI — overlay con progreso
  // ============================================================
  function showGenerationUI(giro){
    var overlay = document.createElement('div');
    overlay.id = 'vlx-gen-overlay';
    overlay.innerHTML = '\
      <style>\
        #vlx-gen-overlay{position:fixed;inset:0;z-index:9999;\
          background:rgba(8,7,6,.92);backdrop-filter:blur(8px);\
          display:flex;align-items:center;justify-content:center;\
          font-family:system-ui,-apple-system,sans-serif;color:#F5F0E4;\
          animation:vlxGenIn .4s cubic-bezier(.34,1.36,.64,1)}\
        @keyframes vlxGenIn{from{opacity:0}to{opacity:1}}\
        .vlx-gen-card{max-width:520px;padding:48px 40px;text-align:center}\
        .vlx-gen-title{font-size:32px;font-weight:500;letter-spacing:-.02em;margin-bottom:14px;line-height:1.15}\
        .vlx-gen-title em{color:#C9A24C;font-style:italic}\
        .vlx-gen-sub{font-size:15px;color:rgba(245,240,228,.7);margin-bottom:36px;line-height:1.55}\
        .vlx-gen-progress{display:flex;flex-direction:column;gap:14px;margin-bottom:32px}\
        .vlx-gen-step{display:flex;align-items:center;gap:14px;text-align:left;\
          font-size:14px;color:rgba(245,240,228,.4);transition:color .3s ease}\
        .vlx-gen-step.active{color:#F5F0E4}\
        .vlx-gen-step.done{color:#86EFAC}\
        .vlx-gen-step-ico{width:24px;height:24px;border-radius:50%;\
          border:2px solid currentColor;display:grid;place-items:center;\
          font-size:13px;font-weight:600;flex-shrink:0;transition:all .3s ease}\
        .vlx-gen-step.active .vlx-gen-step-ico{\
          border-color:#C9A24C;color:#C9A24C;\
          animation:vlxGenSpin 1s linear infinite}\
        .vlx-gen-step.done .vlx-gen-step-ico{background:#86EFAC;color:#0A0908;border-color:#86EFAC}\
        @keyframes vlxGenSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}\
        .vlx-gen-bar{height:3px;background:rgba(245,240,228,.1);border-radius:2px;overflow:hidden;margin-bottom:24px}\
        .vlx-gen-bar-fill{height:100%;background:linear-gradient(90deg,#C9A24C,#FCD34D);width:5%;transition:width .8s ease}\
        .vlx-gen-meta{font-family:monospace;font-size:11px;color:rgba(245,240,228,.4);\
          text-transform:uppercase;letter-spacing:.18em}\
      </style>\
      <div class="vlx-gen-card">\
        <div class="vlx-gen-title">Diseñando tu sistema<br>para <em>'+escapeHtml(giro)+'</em></div>\
        <div class="vlx-gen-sub">Identificamos tu giro, generamos la identidad visual, buscamos imágenes específicas y armamos las funciones que necesitas. Aproximadamente 10-15 segundos.</div>\
        <div class="vlx-gen-bar"><div class="vlx-gen-bar-fill" id="vlx-gen-fill"></div></div>\
        <div class="vlx-gen-progress">\
          <div class="vlx-gen-step" data-step="0"><div class="vlx-gen-step-ico">1</div>Identificando tu giro de negocio</div>\
          <div class="vlx-gen-step" data-step="1"><div class="vlx-gen-step-ico">2</div>Diseñando paleta + tipografía + nombre</div>\
          <div class="vlx-gen-step" data-step="2"><div class="vlx-gen-step-ico">3</div>Buscando imágenes específicas de tu giro</div>\
          <div class="vlx-gen-step" data-step="3"><div class="vlx-gen-step-ico">4</div>Generando funciones y demos del sistema</div>\
          <div class="vlx-gen-step" data-step="4"><div class="vlx-gen-step-ico">5</div>Listo, abriendo tu landing</div>\
        </div>\
        <div class="vlx-gen-meta">Volvix Systems · Generado al vuelo</div>\
      </div>';
    document.body.appendChild(overlay);

    // Animar steps progresivamente (visual feedback)
    var steps = overlay.querySelectorAll('.vlx-gen-step');
    var fill = overlay.querySelector('#vlx-gen-fill');
    var i = 0;
    function advanceStep(){
      if (i >= steps.length) return;
      if (i > 0) steps[i-1].classList.remove('active');
      if (i > 0) steps[i-1].classList.add('done');
      steps[i].classList.add('active');
      fill.style.width = ((i + 1) / steps.length * 100) + '%';
      i++;
    }
    advanceStep(); // step 1
    setTimeout(advanceStep, 2500);  // step 2
    setTimeout(advanceStep, 5500);  // step 3
    setTimeout(advanceStep, 9000);  // step 4

    return {
      finish: function(){
        steps.forEach(function(s){ s.classList.remove('active'); s.classList.add('done'); });
        fill.style.width = '100%';
      },
      remove: function(){
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity .4s ease';
        setTimeout(function(){ overlay.remove(); }, 400);
      },
    };
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  // ============================================================
  // GENERATE: POST + poll until done
  // ============================================================
  function generateLanding(giro, ui){
    return fetch(API_GENERATE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ giro: giro }),
    })
    .then(function(r){ return r.json(); })
    .then(function(data){
      if (data.cached || data.status === 'done') {
        ui.finish();
        setTimeout(function(){
          window.location.href = data.url;
        }, 600);
        return;
      }
      // Status pending → poll
      return pollUntilDone(data.slug, data.url, ui);
    })
    .catch(function(err){
      console.error('[brand-router] generation failed:', err);
      ui.remove();
      alert('Error al generar tu landing. Intenta de nuevo.');
    });
  }

  function pollUntilDone(slug, url, ui){
    var attempts = 0;
    var MAX = 30;  // 30 × 1.2s = 36s timeout
    return new Promise(function(resolve){
      function check(){
        if (attempts++ >= MAX) {
          ui.remove();
          alert('La generación está tomando más de lo esperado. Recarga la página en un minuto.');
          return resolve();
        }
        fetch(API_STATUS + slug)
          .then(function(r){ return r.json(); })
          .then(function(data){
            if (data.status === 'done') {
              ui.finish();
              setTimeout(function(){ window.location.href = url; }, 600);
              return resolve();
            }
            if (data.status === 'error') {
              ui.remove();
              alert('Hubo un error generando tu landing. Intenta con otra descripción del giro.');
              return resolve();
            }
            setTimeout(check, 1200);
          })
          .catch(function(){ setTimeout(check, 1500); });
      }
      check();
    });
  }

  // ============================================================
  // OVERRIDE quickSearch + searchGiro
  // ============================================================
  function installOverrides(){
    var prevQuick = window.quickSearch;
    window.quickSearch = function(text){
      var brand = resolveHardcoded(text);
      if (brand && brand.url) {
        saveContext(text, brand);
        window.location.href = brand.url;
        return;
      }
      // No hardcoded → generar
      saveContext(text, null);
      var ui = showGenerationUI(text);
      generateLanding(text, ui);
    };

    var prevSearch = window.searchGiro;
    window.searchGiro = function(){
      var inp = document.getElementById('giro-input');
      var q = inp ? (inp.value || '').trim() : '';
      if (!q) return prevSearch && prevSearch();
      var brand = resolveHardcoded(q);
      if (brand && brand.url) {
        saveContext(q, brand);
        window.location.href = brand.url;
        return;
      }
      saveContext(q, null);
      var ui = showGenerationUI(q);
      generateLanding(q, ui);
    };
  }

  // ============================================================
  // Rewrite landing links (popular grid de tu sistema actual)
  // ============================================================
  function rewriteLinks(root){
    if (!root || !root.querySelectorAll) return;
    var links = root.querySelectorAll('a[href*="landing_dynamic.html?giro="], a[href*="/landing-"], a[href^="landing-"]');
    links.forEach(function(a){
      if (a.dataset.vlxRouted) return;
      var href = a.getAttribute('href') || '';
      var key = null;
      var m1 = href.match(/[?&]giro=([^&#]+)/);
      var m2 = href.match(/\/?landing-([^?#.]+)/);
      if (m1) key = decodeURIComponent(m1[1]);
      else if (m2) key = decodeURIComponent(m2[1]);
      if (!key) return;
      key = norm(key).replace(/\s+/g, '_');
      var brand = VLX_BRANDS[key] || resolveHardcoded(key);
      if (brand && brand.url) {
        a.dataset.vlxRouted = '1';
        a.dataset.vlxOriginal = href;
        a.setAttribute('href', brand.url);
      } else {
        // Si no hay hardcoded, redirigir el click para que dispare la generación
        a.dataset.vlxRouted = '1';
        a.addEventListener('click', function(e){
          e.preventDefault();
          window.quickSearch(key);
        });
      }
    });
  }

  function init(){
    installOverrides();
    rewriteLinks(document);
    if (window.MutationObserver) {
      var mo = new MutationObserver(function(muts){
        muts.forEach(function(m){
          m.addedNodes.forEach(function(n){
            if (n.nodeType === 1) rewriteLinks(n);
          });
        });
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.vlxBrandRouter = {
    brands: VLX_BRANDS, aliases: VLX_ALIASES,
    resolve: resolveHardcoded, generate: generateLanding,
    norm: norm, slugify: slugify,
  };
})();
