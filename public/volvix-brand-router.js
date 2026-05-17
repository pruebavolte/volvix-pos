/* ============================================================
   VOLVIX · Brand Router
   ----------------------------------------------------------------
   Intercepta quickSearch(), searchGiro() y links dinámicos del
   marketplace para mandar al usuario a la landing de la MARCA
   específica de su giro (Comandero, Navaja, Pareo, etc.) en lugar
   de la landing genérica.

   Cómo funciona:
   - Mapeo giro_key → { brand, url }
   - Override de window.quickSearch + window.searchGiro
   - MutationObserver rewrite de links a landing_dynamic.html y
     /landing-{slug}.html cuando el JS los renderiza.

   Para agregar una marca nueva: edita VLX_BRANDS y VLX_ALIASES.
   ============================================================ */
(function(){
  'use strict';

  // ---- Brand catalog (giro key → brand) ----------------------
  // El "key" debe coincidir con giros-catalog.js (GIROS_V2[].key)
  var VLX_BRANDS = {
    // ALIMENTOS
    'restaurante':     { brand: 'Comandero',  url: 'comandero.html'   },
    'taqueria':        { brand: 'Comandero',  url: 'comandero.html'   },
    'pizzeria':        { brand: 'Comandero',  url: 'comandero.html'   },
    'cafeteria':       { brand: 'Espuma',     url: 'espuma.html'      },
    'panaderia':       { brand: 'Espuma',     url: 'espuma.html'      },
    'fonda':           { brand: 'Comandero',  url: 'comandero.html'   },
    // BELLEZA
    'barberia':        { brand: 'Navaja',     url: 'navaja.html'      },
    'estetica':        { brand: 'Navaja',     url: 'navaja.html'      },
    'salon':           { brand: 'Navaja',     url: 'navaja.html'      },
    'spa':             { brand: 'Navaja',     url: 'navaja.html'      },
    // SALUD
    'farmacia':        { brand: 'Receta',     url: 'receta.html'      },
    'veterinaria':     { brand: 'Pata',       url: 'pata.html'        },
    'clinica_dental':  { brand: 'Receta',     url: 'receta.html'      },
    'clinica':         { brand: 'Receta',     url: 'receta.html'      },
    // RETAIL
    'abarrotes':       { brand: 'Tendito',    url: 'tendito.html'     },
    'fruteria':        { brand: 'Tendito',    url: 'tendito.html'     },
    'minisuper':       { brand: 'Tendito',    url: 'tendito.html'     },
    'tortilleria':     { brand: 'Tendito',    url: 'tendito.html'     },
    'carniceria':      { brand: 'Tendito',    url: 'tendito.html'     },
    'zapateria':       { brand: 'Pareo',      url: 'pareo.html'       },
    'boutique':        { brand: 'Pareo',      url: 'pareo.html'       },
    'papeleria':       { brand: 'Bloque',     url: 'bloque.html'      },
    'floreria':        { brand: 'Pétalo',     url: 'petalo.html'      },
    // SERVICIOS
    'taller_mecanico': { brand: 'Refacciona', url: 'refacciona.html'  },
    'lavanderia':      { brand: 'Burbuja',    url: 'burbuja.html'     },
    'carwash':         { brand: 'Burbuja',    url: 'burbuja.html'     },
    'gimnasio':        { brand: 'Repe',       url: 'repe.html'        },
    // EDUCACION
    'colegio':         { brand: 'Bloque',     url: 'bloque.html'      },
    'escuela':         { brand: 'Bloque',     url: 'bloque.html'      },
  };

  // ---- Aliases (lo que el usuario escribe) → key -------------
  var VLX_ALIASES = {
    'barberia':         'barberia',
    'barber':           'barberia',
    'cafeteria':        'cafeteria',
    'cafe':             'cafeteria',
    'coffee':           'cafeteria',
    'estetica':         'estetica',
    'salon de belleza': 'salon',
    'salon':            'salon',
    'spa':              'spa',
    'farmacia':         'farmacia',
    'botica':           'farmacia',
    'restaurante':      'restaurante',
    'restaurant':       'restaurante',
    'taqueria':         'taqueria',
    'tacos':            'taqueria',
    'pizza':            'pizzeria',
    'pizzeria':         'pizzeria',
    'fonda':            'fonda',
    'cocina economica': 'fonda',
    'abarrotes':        'abarrotes',
    'tienda':           'abarrotes',
    'tiendita':         'abarrotes',
    'miscelaneo':       'abarrotes',
    'frutas':           'fruteria',
    'fruteria':         'fruteria',
    'verduras':         'fruteria',
    'taller mecanico':  'taller_mecanico',
    'taller':           'taller_mecanico',
    'mecanico':         'taller_mecanico',
    'gimnasio':         'gimnasio',
    'gym':              'gimnasio',
    'colegio':          'colegio',
    'escuela':          'escuela',
    'zapateria':        'zapateria',
    'zapatos':          'zapateria',
    'calzado':          'zapateria',
    'tenis':            'zapateria',
    'floreria':         'floreria',
    'flores':           'floreria',
    'arreglos':         'floreria',
    'veterinaria':      'veterinaria',
    'veterinario':      'veterinaria',
    'vet':              'veterinaria',
    'mascotas':         'veterinaria',
    'panaderia':        'panaderia',
    'pan':              'panaderia',
    'lavanderia':       'lavanderia',
    'tintoreria':       'lavanderia',
    'carwash':          'carwash',
    'lavado de autos':  'carwash',
    'lavado autos':     'carwash',
    'tortilleria':      'tortilleria',
    'tortillas':        'tortilleria',
    'papeleria':        'papeleria',
    'papeles':          'papeleria',
    'utiles':           'papeleria',
    'boutique':         'boutique',
    'ropa':             'boutique',
    'minisuper':        'minisuper',
    'super':            'minisuper',
    'carniceria':       'carniceria',
    'carnes':           'carniceria',
    'clinica':          'clinica',
    'dental':           'clinica_dental',
    'dentista':         'clinica_dental',
  };

  // ---- Normalizador ------------------------------------------
  function norm(s){
    return (s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ---- Resolver: texto → brand info --------------------------
  function resolve(query){
    if (!query) return null;
    var n = norm(query);
    if (!n) return null;

    // 1. Exact match en alias
    if (VLX_ALIASES[n] && VLX_BRANDS[VLX_ALIASES[n]]) {
      return VLX_BRANDS[VLX_ALIASES[n]];
    }
    // 2. Match directo en BRANDS keys
    if (VLX_BRANDS[n]) return VLX_BRANDS[n];
    // 3. Partial match: any alias contained in the query
    var bestMatch = null, bestLen = 0;
    for (var alias in VLX_ALIASES) {
      if (!VLX_ALIASES.hasOwnProperty(alias)) continue;
      if (n.indexOf(alias) !== -1 && alias.length > bestLen) {
        var key = VLX_ALIASES[alias];
        if (VLX_BRANDS[key]) {
          bestMatch = VLX_BRANDS[key];
          bestLen = alias.length;
        }
      }
    }
    return bestMatch;
  }

  // Expose globally so otros scripts pueden usarlo
  window.vlxBrandRouter = {
    brands: VLX_BRANDS,
    aliases: VLX_ALIASES,
    resolve: resolve,
    norm: norm,
  };

  // ---- Save search context for downstream pages --------------
  function saveContext(q, brand){
    try {
      sessionStorage.setItem('volvix_last_search', JSON.stringify({
        query: q,
        giro: q,
        business_name: q,
        brand: brand && brand.brand || null,
        brand_url: brand && brand.url || null,
        ts: Date.now(),
      }));
    } catch (_) {}
  }

  // ---- Override quickSearch + searchGiro ---------------------
  function installOverrides(){
    var prevQuick = window.quickSearch;
    window.quickSearch = function(text){
      var brand = resolve(text);
      if (brand && brand.url) {
        saveContext(text, brand);
        window.location.href = brand.url;
        return;
      }
      // Fallback: comportamiento original
      if (typeof prevQuick === 'function') return prevQuick(text);
      // Si no había, al menos copiar al input
      var inp = document.getElementById('giro-input');
      if (inp) { inp.value = text; if (typeof window.searchGiro === 'function') window.searchGiro(); }
    };

    var prevSearch = window.searchGiro;
    window.searchGiro = function(){
      var inp = document.getElementById('giro-input');
      var q = inp ? (inp.value || '').trim() : '';
      if (q) {
        var brand = resolve(q);
        if (brand && brand.url) {
          saveContext(q, brand);
          window.location.href = brand.url;
          return;
        }
      }
      if (typeof prevSearch === 'function') return prevSearch();
    };
  }

  // ---- Rewrite landing links cuando se rendericen -----------
  function rewriteLinks(root){
    if (!root || !root.querySelectorAll) return;
    var links = root.querySelectorAll(
      'a[href*="landing_dynamic.html?giro="], a[href*="/landing-"], a[href^="landing-"]'
    );
    links.forEach(function(a){
      if (a.dataset.vlxRouted) return;
      var href = a.getAttribute('href') || '';
      var key = null;
      var m1 = href.match(/[?&]giro=([^&#]+)/);
      var m2 = href.match(/\/?landing-([^?#.]+)/);
      if (m1) key = decodeURIComponent(m1[1]);
      else if (m2) key = decodeURIComponent(m2[1]);
      if (!key) return;
      // Normalize the key (some come with hyphens or accents)
      key = norm(key).replace(/\s+/g, '_');
      var brand = VLX_BRANDS[key] || resolve(key);
      if (brand && brand.url) {
        a.dataset.vlxRouted = '1';
        a.dataset.vlxOriginal = href;
        a.setAttribute('href', brand.url);
      }
    });
  }

  function init(){
    installOverrides();
    rewriteLinks(document);

    // Watch para cuando el JS renderiza giros dinámicamente
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
})();
