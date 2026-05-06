'use strict';

/**
 * api/giros.js
 * Volvix POS - Customer journey entry point: giros (business types) discovery.
 *
 * Exported: async function handleGiros(req, res, parsedUrl, ctx)
 *
 * Routes:
 *   GET  /api/giros                     -> list all giros (scanned from landing-*.html on disk)
 *   GET  /api/giros/search?q=X          -> fuzzy match against existing giros { exists, slug, name, landing }
 *   GET  /api/giros/autocomplete?q=X    -> top-N giros con sinónimos (DB → fallback hardcoded)
 *   POST /api/giros/generate            -> AI-generate a personalized landing (or stub if no OPENAI_API_KEY)
 *   GET  /api/giros/:slug/exists        -> { exists: true|false, slug }
 *
 * ctx: { supabaseRequest, sendJson, getAuthUser, IS_PROD }
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ---------- helpers ----------
function send(ctx, res, status, body) {
  // ctx.sendJson is an alias for sendJSON(res, data, status=200) — argument order: (res, data, status)
  if (ctx && typeof ctx.sendJson === 'function') return ctx.sendJson(res, body, status);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function err(ctx, res, status, code, message, extra) {
  return send(ctx, res, status, Object.assign({ error: message, code }, extra || {}));
}

async function readJson(req) {
  return await new Promise((resolve, reject) => {
    let data = '';
    let total = 0;
    const limit = 32 * 1024;
    req.on('data', (c) => {
      total += c.length;
      if (total > limit) { req.destroy(); return reject(new Error('Body too large')); }
      data += c;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// Regex robusto independiente del encoding del archivo fuente
// Strips Unicode combining marks U+0300 a U+036F
const ACCENT_REGEX = new RegExp('[\\u0300-\\u036f]', 'g');

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(ACCENT_REGEX, '') // strip accents (combining marks)
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim();
}

// ---------- giros catalog (filesystem-scanned) ----------
let _cache = null;
let _cacheAt = 0;
const CACHE_MS = 60 * 1000;

function scanLandings() {
  const now = Date.now();
  if (_cache && (now - _cacheAt) < CACHE_MS) return _cache;

  const roots = [
    path.join(__dirname, '..'),
    path.join(__dirname, '..', 'public'),
    process.cwd(),
    path.join(process.cwd(), 'public'),
    '/var/task',
    '/var/task/public',
  ];

  const slugs = new Set();
  for (const root of roots) {
    try {
      if (!fs.existsSync(root)) continue;
      const entries = fs.readdirSync(root);
      for (const e of entries) {
        const m = /^landing-([a-z0-9-]+)\.html$/i.exec(e);
        if (m) slugs.add(m[1].toLowerCase());
      }
    } catch (_) {}
  }

  const giros = Array.from(slugs).sort().map((slug) => ({
    slug,
    name: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    landing: `/landing-${slug}.html`,
  }));

  _cache = giros;
  _cacheAt = now;
  return giros;
}

// ---------- handlers ----------
async function listGiros(ctx, req, res) {
  const giros = scanLandings();
  return send(ctx, res, 200, { count: giros.length, giros });
}

async function searchGiros(ctx, req, res, parsedUrl) {
  const q = normalize((parsedUrl && parsedUrl.query && parsedUrl.query.q) || '');
  if (!q) return send(ctx, res, 200, { exists: false, query: '' });

  const giros = scanLandings();
  const qSlug = slugify(q);

  // 2026-05 BUG-FIX: distinguir queries genéricas de marca-específicas.
  // "café" → cafetería ✓ (1 token, genérico). "Café Lizingh" → NEW giro ✓ (brand).
  // Heurística: query con >1 token de contenido (post stop-words) = marca-específica.
  const STOP_WORDS = new Set(['de','del','la','el','los','las','y','o','un','una','con','para','por','en','al','a']);
  const qTokens = q.split(/\s+/).filter(t => t.length >= 2 && !STOP_WORDS.has(t));
  const isMultiWord = qTokens.length > 1;

  // 1) exact slug — siempre permitido (re-buscar un giro brand ya generado lo encuentra)
  let hit = giros.find((g) => g.slug === qSlug);

  // 2) substring slug — SOLO single-word + word-boundary. Si q es multi-word brand
  //    o si el match es solo un substring espurio, NO matchear genérico.
  //    Evita "ferreteria-don-juan" → ferretería y "pantimedias-x" → panaderia.
  if (!hit && !isMultiWord) {
    hit = giros.find((g) => {
      // Match solo si q es prefix EXACTO o suffix EXACTO del slug, o viceversa
      // (no cualquier substring). Asi "pantimedias" no matcheara con "panaderia"
      // que comparte prefijo "pan" pero son cosas diferentes.
      return g.slug === qSlug ||
             (qSlug.length >= 4 && g.slug.startsWith(qSlug + '-')) ||
             (g.slug.length >= 4 && qSlug.startsWith(g.slug + '-'));
    });
  }

  // 3) name token match — SOLO single-word + match exacto/prefix.
  if (!hit && !isMultiWord) {
    hit = giros.find((g) => {
      const gName = normalize(g.name);
      return gName === q || (q.length >= 4 && gName.startsWith(q));
    });
  }

  // 4) FUZZY via synonyms map — multi-word exige TODOS los tokens cubiertos.
  // 2026-05 BUG-FIX (pantimedias→panaderia): single-word ya NO usa q.includes(s)
  // porque "pantimedias".includes("pan") era true. Ahora solo s===q (exacto) o
  // s.startsWith(q) cuando q es lo bastante distintivo (>=3 chars, evita
  // "ca" matchear "café"). q.includes(s) eliminado completamente.
  if (!hit) {
    for (const [slug, info] of Object.entries(GIRO_SYNONYMS || {})) {
      const synonyms = (info.synonyms || []).map(normalize);
      const sells = (info.sells || []).map(normalize);
      const allMatches = synonyms.concat(sells);
      let matched = false;
      if (isMultiWord) {
        // STRICT: cada token del query debe aparecer en al menos un synonym/sells.
        const corpusTokens = new Set(allMatches.flatMap(s => s.split(/\s+/)));
        matched = qTokens.every(t => corpusTokens.has(t));
      } else {
        // SINGLE-WORD: solo exacto o "synonym empieza con query".
        // q debe tener >=3 chars para evitar prefix-matches espurios.
        matched = allMatches.some(s => {
          if (!s) return false;
          if (s === q) return true;
          if (q.length >= 3 && s.startsWith(q)) return true;
          // Casos plurales/singulares: q es synonym + 1 char (s/es).
          // "tacos"->q, "taco"->s: q.startsWith(s) AND |q|-|s|<=2
          if (s.length >= 3 && q.startsWith(s) && q.length - s.length <= 2 &&
              /^[se]+$/i.test(q.slice(s.length))) {
            return true;
          }
          return false;
        });
      }
      if (matched) {
        hit = giros.find(g => g.slug === slug.replace(/_/g, '-'));
        if (!hit) {
          hit = {
            slug: slug.replace(/_/g, '-'),
            name: info.name,
            landing: '/landing-' + slug.replace(/_/g, '-') + '.html',
          };
        }
        break;
      }
    }
  }

  if (hit) {
    return send(ctx, res, 200, {
      exists: true,
      slug: hit.slug,
      name: hit.name,
      landing: hit.landing,
      query: q,
    });
  }
  return send(ctx, res, 200, { exists: false, query: q });
}

// ---------- autocomplete (synonyms-aware) ----------
// Map de sinónimos hardcoded para fallback cuando giros_synonyms está vacía o no existe.
const GIRO_SYNONYMS = {
  'restaurante': { name:'Restaurante', synonyms:['comida','food','restaurant','restaurantes','venta de comida','comer','cena','almuerzo','desayuno','cocina','menu','platillos'], sells:['comida','platillos','bebidas'] },
  'taqueria': { name:'Taquería', synonyms:['taco','tacos','taquero','taqueros','taquería','pastor','suadero'], sells:['tacos','quesadillas'] },
  'pizzeria': { name:'Pizzería', synonyms:['pizza','pizzas','pizzeria','italiana','italiano'], sells:['pizza','calzone','pasta'] },
  'cafeteria': { name:'Cafetería', synonyms:['cafe','cafetería','expresso','espresso','cappuccino','mocha','latte','café'], sells:['café','postres','sandwiches'] },
  'panaderia': { name:'Panadería', synonyms:['pan','panes','panadero','bolillos','conchas','pastel','bakery'], sells:['pan','bolillos','conchas'] },
  'pasteleria': { name:'Pastelería', synonyms:['pasteles','cakes','reposteria','postres','repostería'], sells:['pasteles','tartas'] },
  'heladeria': { name:'Heladería', synonyms:['helados','paletas','nieves','ice cream','helado'], sells:['helados','paletas'] },
  'tortilleria': { name:'Tortillería', synonyms:['tortillas','tortilleria','tortilladora'], sells:['tortillas'] },
  'barberia': { name:'Barbería', synonyms:['barbería','barber','corte cabello hombre','barba','rasurar'], sells:['cortes','rasurado'] },
  'estetica': { name:'Estética', synonyms:['salón','estilista','peluquería','corte de cabello','salon','peluqueria','beauty'], sells:['cortes','tintes'] },
  'spa': { name:'Spa', synonyms:['masajes','relajación','sauna','jacuzzi'], sells:['masajes','tratamientos'] },
  'nails': { name:'Salón de Uñas', synonyms:['uñas','manicure','pedicure','nail','acrilico'], sells:['manicure','pedicure'] },
  'tatuajes': { name:'Estudio de Tatuajes', synonyms:['tattoo','tatuajes','piercing','tatuador'], sells:['tatuajes'] },
  'farmacia': { name:'Farmacia', synonyms:['medicinas','medicamentos','pharmacy','drug store','farmacéutica'], sells:['medicamentos','vitaminas'] },
  'clinica_dental': { name:'Clínica Dental', synonyms:['dentista','dental','muelas','dentadura','ortodoncia'], sells:['consultas','limpiezas'] },
  'veterinaria': { name:'Veterinaria', synonyms:['veterinario','vet','mascotas','perros','gatos','animales'], sells:['consultas','vacunas'] },
  'optica': { name:'Óptica', synonyms:['lentes','anteojos','optometría','optometra','vista'], sells:['lentes','armazones'] },
  'abarrotes': { name:'Abarrotes', synonyms:['tienda','tendajón','tendajon','misceláneo','abarrote','tiendita','minisuper','miscelanea'], sells:['refrescos','botanas','despensa'] },
  'minisuper': { name:'Minisúper', synonyms:['minisuper','minisúper','mini super','convenience','oxxo'], sells:['despensa','refrescos'] },
  'papeleria': { name:'Papelería', synonyms:['papel','cuadernos','utiles','escolares','copy','impresiones','papelería'], sells:['cuadernos','plumas','copias'] },
  'fruteria': { name:'Frutería', synonyms:['fruta','verduras','frutas','verdura','frutería'], sells:['frutas','verduras'] },
  'carniceria': { name:'Carnicería', synonyms:['carne','res','cerdo','pollo','carnicería','carnicero'], sells:['carne','res','pollo'] },
  'polleria': { name:'Pollería', synonyms:['pollo','pollos','pollería','rosticeria','rostizado'], sells:['pollo'] },
  'taller_mecanico': { name:'Taller Mecánico', synonyms:['mecanico','mecánico','taller','autos','carros','reparación','vehiculos'], sells:['servicios','refacciones'] },
  'lavado_autos': { name:'Lavado de Autos', synonyms:['lavado','autolavado','car wash','encerado','detallado'], sells:['lavados','encerados'] },
  'servicio_celulares': { name:'Servicio de Celulares', synonyms:['celulares','reparacion celulares','accesorios','telefonos','reparacion movil','iphone','android'], sells:['fundas','reparaciones'] },
  'colegio': { name:'Colegio', synonyms:['escuela','primaria','secundaria','prepa','preparatoria','kinder','colegio'], sells:['inscripciones','colegiaturas'] },
  'gimnasio': { name:'Gimnasio', synonyms:['gym','gimnasio','fitness','crossfit','pesas','ejercicio','workout'], sells:['membresías','clases'] },
  'escuela_idiomas': { name:'Escuela de Idiomas', synonyms:['ingles','inglés','frances','francés','idiomas','language'], sells:['cursos'] },
  'renta_autos': { name:'Renta de Autos', synonyms:['rent a car','renta autos','renta vehiculos','car rental'], sells:['rentas'] },
  'renta_salones': { name:'Renta de Salones', synonyms:['salon eventos','salón eventos','fiestas','bodas','renta salon'], sells:['salones'] },
  'foto_estudio': { name:'Estudio Fotográfico', synonyms:['fotografia','fotografía','foto','photo','sesiones'], sells:['sesiones','impresiones'] },
  'ferreteria': { name:'Ferretería', synonyms:['ferretería','herramientas','tornillos','clavos','pinturas','plomeria','plomería'], sells:['herramientas','tornillería'] },
  'gasolinera': { name:'Gasolinera', synonyms:['gasolina','combustible','gas','diesel','pemex'], sells:['gasolina','diésel'] },
  'funeraria': { name:'Funeraria', synonyms:['funerales','servicios funerarios','velación','panteón'], sells:['ataúdes','servicios'] },
  'purificadora': { name:'Purificadora de Agua', synonyms:['agua','purificada','garrafones','agua potable'], sells:['agua','garrafones'] },
  'lavanderia': { name:'Lavandería', synonyms:['lavanderia','tintoreria','tintorería','lavado de ropa','planchado'], sells:['lavado','planchado'] },
  'floreria': { name:'Florería', synonyms:['flores','florería','arreglos florales','ramos','bouquet'], sells:['arreglos','ramos'] },
  'joyeria': { name:'Joyería', synonyms:['joyas','oro','plata','anillos','joyería','collares'], sells:['joyas'] },
  'zapateria': { name:'Zapatería', synonyms:['zapatos','calzado','zapatería','tenis','sandalias'], sells:['zapatos','tenis'] },
  'ropa': { name:'Tienda de Ropa', synonyms:['ropa','clothing','boutique','vestidos','pantalones','camisas'], sells:['ropa','accesorios'] },
  'libreria': { name:'Librería', synonyms:['libros','librería','book','revistas','editorial'], sells:['libros','revistas'] },
  'muebleria': { name:'Mueblería', synonyms:['muebles','mueblería','sillones','camas','mesas','recámaras'], sells:['muebles','colchones'] },
  'hotel': { name:'Hotel', synonyms:['hospedaje','hotel','motel','posada','hostal'], sells:['habitaciones'] },
  'cantina': { name:'Cantina/Bar', synonyms:['bar','cantina','cervezas','cerveza','tragos','antros','cocteles'], sells:['cervezas','licores'] },
  'disco': { name:'Antro/Discoteca', synonyms:['antro','disco','club','nightclub','baile','dj'], sells:['cover','bebidas'] },
  'foodtruck': { name:'Food Truck', synonyms:['food truck','foodtruck','hamburguesas','hot dogs','hotdogs','dogos','comida rapida'], sells:['hamburguesas','hot dogs'] },
  'sushi': { name:'Sushi', synonyms:['sushi','rolls','japonés','japonesa','nigiri','sashimi'], sells:['rolls','sashimi'] },
  'parking': { name:'Estacionamiento', synonyms:['parking','estacionamiento','pension','pensión'], sells:['horas'] },
  'hotel_mascotas': { name:'Hotel de Mascotas', synonyms:['guarderia mascotas','pet hotel','daycare perros','hotel perros'], sells:['estancias','baños'] },
  'cremeria': { name:'Cremería', synonyms:['quesos','cremas','lácteos','lacteos','cremería'], sells:['quesos','crema'] },
  'vinateria': { name:'Vinatería', synonyms:['vinos','licores','tequila','mezcal','whisky','vinatería'], sells:['vinos','licores'] },
  'cine': { name:'Cine', synonyms:['cine','pelicula','películas','cinema','funciones'], sells:['boletos'] },
  'bowling': { name:'Boliche', synonyms:['boliche','bowling','bolos'], sells:['rentas'] },
  'karaoke': { name:'Karaoke', synonyms:['karaoke','canto','bar karaoke'], sells:['rentas','bebidas'] },
  'cafe_internet': { name:'Café Internet', synonyms:['cyber','internet','impresiones','cibercafe'], sells:['horas','impresiones'] },
  'renta_equipo': { name:'Renta de Equipo', synonyms:['renta','equipo','rental','herramientas renta'], sells:['rentas'] },
  'paqueteria': { name:'Paquetería', synonyms:['envios','envíos','paqueteria','paquetería','dhl','fedex','estafeta'], sells:['envíos'] },
  'fotografia': { name:'Fotografía', synonyms:['fotos','fotógrafo','sesion','sesión','eventos foto'], sells:['sesiones'] },
  'mecanica_motos': { name:'Mecánica de Motos', synonyms:['motos','motocicletas','taller motos','mecanica motos'], sells:['servicios'] },
  'inmobiliaria': { name:'Inmobiliaria', synonyms:['inmobiliaria','bienes raices','casas','departamentos','rentas inmuebles'], sells:['rentas','ventas'] },
  'notaria': { name:'Notaría', synonyms:['notaria','notarial','escrituras','poderes','notario'], sells:['servicios notariales'] },
  'dulceria': { name:'Dulcería', synonyms:['dulces','candy','golosinas','chocolates','dulcería'], sells:['dulces','chocolates'] },
  'tabaqueria': { name:'Tabaquería', synonyms:['cigarros','tabaco','cigarrillos','vapeador','tabaquería'], sells:['cigarros','tabaco'] },
  'otro': { name:'Otro', synonyms:['otro','other','varios'], sells:['varios'] }
};

function scoreLocal(query, slug, entry) {
  const q = normalize(query);
  if (!q) return 0;
  let score = 0;
  if (slug === q) score += 100;
  if (slug.indexOf(q) === 0) score += 50;
  if (normalize(entry.name) === q) score += 90;
  if (normalize(entry.name).indexOf(q) !== -1) score += 30;
  for (const syn of (entry.synonyms || [])) {
    const ns = normalize(syn);
    if (ns === q) score += 80;
    else if (ns.indexOf(q) === 0) score += 40;
    else if (ns.indexOf(q) !== -1) score += 20;
    else if (q.indexOf(ns) !== -1 && ns.length >= 3) score += 25;
  }
  for (const w of (entry.sells || [])) {
    const nw = normalize(w);
    if (nw === q) score += 60;
    else if (nw.indexOf(q) !== -1) score += 15;
  }
  return score;
}

// 2026-05: enriquecido para que el dropdown autocomplete del marketplace
// pueda mostrar what_they_sell + synonyms y saber si la landing existe en disk.
function localAutocomplete(query, limit) {
  const landingsOnDisk = scanLandings();
  const out = [];
  for (const slug of Object.keys(GIRO_SYNONYMS)) {
    const entry = GIRO_SYNONYMS[slug];
    const s = scoreLocal(query, slug, entry);
    if (s > 0) {
      const slugDash = slug.replace(/_/g, '-');
      const landing = landingsOnDisk.find((l) => l.slug === slugDash);
      out.push({
        slug: slugDash,
        name: entry.name,
        what_they_sell: Array.isArray(entry.sells) ? entry.sells : [],
        synonyms: Array.isArray(entry.synonyms) ? entry.synonyms : [],
        exists: !!landing,
        landing: landing ? landing.landing : null,
        score: s,
        source: 'local'
      });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

async function autocompleteGiros(ctx, req, res, parsedUrl) {
  const q = normalize((parsedUrl && parsedUrl.query && parsedUrl.query.q) || '');
  const limit = Math.min(parseInt((parsedUrl && parsedUrl.query && parsedUrl.query.limit) || '5', 10) || 5, 20);
  if (!q) return send(ctx, res, 200, { query: '', results: [] });

  // 1) Try DB-backed lookup
  if (ctx && typeof ctx.supabaseRequest === 'function') {
    try {
      const enc = encodeURIComponent(q);
      const orQ = [
        'giro_slug.eq.' + enc,
        'name.ilike.*' + enc + '*',
        'synonyms.cs.{' + q.replace(/"/g, '') + '}',
        'what_they_sell.cs.{' + q.replace(/"/g, '') + '}'
      ].join(',');
      const path = '/giros_synonyms?or=(' + orQ + ')&select=giro_slug,name,synonyms,what_they_sell&limit=' + limit;
      const rows = await ctx.supabaseRequest('GET', path);
      if (Array.isArray(rows) && rows.length > 0) {
        // 2026-05: enriquecer con what_they_sell, synonyms, exists, landing y score real
        const landingsOnDisk = scanLandings();
        const results = rows.map((r) => {
          const slug = r.giro_slug || '';
          const slugDash = slug.replace(/_/g, '-');
          const landing = landingsOnDisk.find((l) => l.slug === slugDash);
          const synonyms = Array.isArray(r.synonyms) ? r.synonyms : [];
          const sells    = Array.isArray(r.what_they_sell) ? r.what_they_sell : [];

          // Score por relevancia (mismo modelo que scoreLocal pero con DB row)
          let score = 0;
          if (slug === q || slugDash === q) score += 100;
          if (slug.indexOf(q) === 0)        score += 50;
          if (normalize(r.name || '') === q) score += 90;
          if (normalize(r.name || '').indexOf(q) !== -1) score += 30;
          for (const syn of synonyms) {
            const ns = normalize(syn);
            if (ns === q) score += 80;
            else if (ns.indexOf(q) === 0) score += 40;
            else if (ns.indexOf(q) !== -1) score += 20;
          }
          for (const w of sells) {
            const nw = normalize(w);
            if (nw === q) score += 60;
            else if (nw.indexOf(q) !== -1) score += 15;
          }

          return {
            slug: slugDash,
            name: r.name,
            what_they_sell: sells,
            synonyms: synonyms,
            exists: !!landing,
            landing: landing ? landing.landing : null,
            score: score || 1,
            source: 'db'
          };
        });
        results.sort((a, b) => b.score - a.score);
        return send(ctx, res, 200, { query: q, results });
      }
    } catch (_) { /* fall through to local */ }
  }

  // 2) Fallback hardcoded
  const results = localAutocomplete(q, limit);
  return send(ctx, res, 200, { query: q, results });
}

async function existsGiro(ctx, req, res, slug) {
  const giros = scanLandings();
  const norm = slugify(slug);
  const hit = giros.find((g) => g.slug === norm);
  return send(ctx, res, 200, {
    exists: !!hit,
    slug: norm,
    landing: hit ? hit.landing : null,
  });
}

// ---------- AI generation (2026-05 refactor: HTML legacy → JSON estructurado) ----------
// Selección de provider:
//   1) Vercel AI Gateway (preferido) — usa AI_GATEWAY_API_KEY + AI_GATEWAY_BASE/MODEL
//   2) OpenAI directo (fallback) — usa OPENAI_API_KEY
// Devuelve string contenido del LLM.
function getAIConfig() {
  const gw = (process.env.AI_GATEWAY_API_KEY || '').trim();
  const oa = (process.env.OPENAI_API_KEY || '').trim();
  if (gw) {
    return {
      provider: 'gateway',
      apiKey: gw,
      base: (process.env.AI_GATEWAY_BASE || 'https://ai-gateway.vercel.sh/v1').trim(),
      model: (process.env.AI_GATEWAY_MODEL || 'openai/gpt-4o-mini').trim(),
    };
  }
  if (oa) {
    return {
      provider: 'openai',
      apiKey: oa,
      base: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
    };
  }
  return null;
}

function callLLM(cfg, systemPrompt, userPrompt, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const payload = {
      model: opts.model || cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: opts.max_tokens || 2500,
      temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.4,
    };
    // response_format solo si explícitamente lo pasan Y provider no es gateway
    // (Vercel AI Gateway no siempre soporta response_format y responde 400)
    if (opts.response_format && cfg.provider !== 'gateway') {
      payload.response_format = opts.response_format;
    }
    const body = JSON.stringify(payload);
    const baseUrl = new URL(cfg.base + '/chat/completions');
    const reqOpts = {
      hostname: baseUrl.hostname,
      port: baseUrl.port || 443,
      path: baseUrl.pathname,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + cfg.apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const r = https.request(reqOpts, (resp) => {
      let data = '';
      resp.on('data', (c) => data += c);
      resp.on('end', () => {
        if (resp.statusCode >= 400) {
          // Loguear a Vercel runtime logs para debug post-mortem
          try { console.warn('[giros LLM ' + cfg.provider + ' ' + resp.statusCode + ']', data.slice(0, 500)); } catch(_){}
          return reject(new Error('LLM(' + cfg.provider + ') HTTP ' + resp.statusCode + ': ' + data.slice(0, 300)));
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
          resolve(content || '');
        } catch (e) {
          try { console.warn('[giros LLM ' + cfg.provider + ' parse]', e.message, data.slice(0, 300)); } catch(_){}
          reject(new Error('LLM parse error: ' + e.message));
        }
      });
    });
    r.on('error', (e) => {
      try { console.warn('[giros LLM ' + cfg.provider + ' net]', e.message); } catch(_){}
      reject(e);
    });
    r.setTimeout(opts.timeout_ms || 20000, () => { r.destroy(new Error('LLM timeout')); });
    r.write(body);
    r.end();
  });
}

// Alias retrocompatible (por si alguien llama callOpenAI desde otro lado)
function callOpenAI(apiKey, systemPrompt, userPrompt, opts) {
  return callLLM({
    provider: 'openai',
    apiKey: apiKey,
    base: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  }, systemPrompt, userPrompt, opts);
}

// Lista cerrada de modulos validos. Si el LLM devuelve algo fuera de aqui, falla validacion.
const MODULOS_VALIDOS = new Set([
  'pos','comandera','kds','mesas','kitchen','inventario','granel',
  'recetas','modificadores','lealtad','membresias','delivery','whatsapp',
  'reportes','corte','facturacion','comisiones','agenda','citas','pedidos',
  'credito','abonos','productos_por_gramaje','caducidad','tallas_colores',
  'multinivel','autoservicio','qr_pago'
]);

const CAMPOS_VALIDOS = new Set([
  'gramaje','caducidad','sabor_variante','talla_color',
  'comision_multinivel','receta','fecha_servicio','duracion_servicio'
]);

// Anti-genérico: estas palabras NO pueden aparecer como funcionalidades únicas.
const FORBIDDEN_FUNCS_RE = /\b(ventas?|inventarios?|clientes?|reportes?|cobros?|punto de venta|POS|facturaci[oó]n|corte de caja)\b/i;

function validateGiroResponse(json) {
  if (!json || typeof json !== 'object') return { ok: false, error: 'not_object' };
  const required = ['nombre_comercial','slug','descripcion','terminologia',
                    'funcionalidades_unicas','productos_detectados',
                    'modulos_a_activar','modulos_a_desactivar'];
  for (const k of required) {
    if (!(k in json)) return { ok: false, error: 'missing_field', detail: k };
  }
  if (typeof json.nombre_comercial !== 'string' || json.nombre_comercial.length < 3) return { ok:false, error:'nombre_invalid' };
  if (typeof json.slug !== 'string' || !/^[a-z0-9-]+$/.test(json.slug)) return { ok:false, error:'slug_invalid' };
  if (typeof json.descripcion !== 'string' || json.descripcion.length < 10) return { ok:false, error:'descripcion_short' };
  if (!json.terminologia || typeof json.terminologia !== 'object') return { ok:false, error:'term_invalid' };

  // 2026-05: validación relajada — soportamos legacy (3 funcs, 6 prods) y nuevo (6 pains, 9 prods, 3 robos)
  if (!Array.isArray(json.funcionalidades_unicas) || json.funcionalidades_unicas.length < 3) {
    return { ok:false, error:'funcs_min_3' };
  }
  for (const f of json.funcionalidades_unicas) {
    if (typeof f !== 'string' || f.length < 20) return { ok:false, error:'func_too_short', detail:f };
    if (FORBIDDEN_FUNCS_RE.test(f)) return { ok:false, error:'func_too_generic', detail:f };
  }

  if (!Array.isArray(json.productos_detectados) || json.productos_detectados.length < 6) {
    return { ok:false, error:'prods_min_6' };
  }
  let prodsMissingKeywords = 0;
  for (const p of json.productos_detectados) {
    if (!p || typeof p !== 'object') return { ok:false, error:'prod_invalid' };
    if (typeof p.name !== 'string' || p.name.length < 3) return { ok:false, error:'prod_name_invalid', detail:p };
    // Track missing search_keywords_en (warn-level, not block)
    if (typeof p.search_keywords_en !== 'string' || p.search_keywords_en.length < 2) {
      prodsMissingKeywords++;
    }
  }
  // Si MÁS de 3 productos vienen sin search_keywords_en, rechazar para retry
  if (prodsMissingKeywords > 3) {
    return { ok:false, error:'too_many_missing_keywords_en', detail: `${prodsMissingKeywords}/9 sin keywords_en` };
  }

  // dolores_especificos y formas_robo opcionales (si vienen, validar shape)
  if (json.dolores_especificos && !Array.isArray(json.dolores_especificos)) return { ok:false, error:'dolores_array' };
  if (json.formas_robo && !Array.isArray(json.formas_robo)) return { ok:false, error:'robos_array' };

  if (!Array.isArray(json.modulos_a_activar)) return { ok:false, error:'modulos_act_array' };
  for (const m of json.modulos_a_activar) {
    if (!MODULOS_VALIDOS.has(m)) return { ok:false, error:'modulo_desconocido', detail:m };
  }
  if (!Array.isArray(json.modulos_a_desactivar)) return { ok:false, error:'modulos_des_array' };
  for (const m of json.modulos_a_desactivar) {
    if (!MODULOS_VALIDOS.has(m)) return { ok:false, error:'modulo_desconocido', detail:m };
  }

  // campos_no_disponibles y synonyms son opcionales (con validación si vienen)
  if (json.campos_no_disponibles && Array.isArray(json.campos_no_disponibles)) {
    for (const c of json.campos_no_disponibles) {
      if (!CAMPOS_VALIDOS.has(c)) return { ok:false, error:'campo_desconocido', detail:c };
    }
  }
  if (json.synonyms && !Array.isArray(json.synonyms)) return { ok:false, error:'synonyms_array' };

  return { ok: true };
}

const GIRO_SYSTEM_PROMPT =
'Eres un experto en diseño de sistemas POS especializados para negocios MX.\n' +
'Tu tarea: dado el nombre de un giro de negocio, devolver UN OBJETO JSON\n' +
'estricto que describa cómo se debe configurar el POS para ese giro.\n\n' +
'REGLAS DE ORO:\n' +
'1. Las "funcionalidades_unicas" deben ser EXCLUSIVAS del giro. PROHIBIDO usar:\n' +
'   "ventas", "inventario", "clientes", "reportes", "punto de venta", "POS",\n' +
'   "cobros", "facturación", "corte de caja". Esos son básicos universales.\n' +
'   Si no se te ocurren funciones únicas, piensa: ¿qué problema operativo\n' +
'   resuelve este giro que NO tiene una farmacia? Eso es lo único.\n\n' +
'2. Los "productos_detectados" deben ser productos REALES y RECONOCIBLES\n' +
'   del giro (marcas y nombres específicos cuando sea apropiado, ej.\n' +
'   "Fórmula 1" para Herbalife, "Sky Vodka" para bar). Si la marca no es\n' +
'   conocida en MX, usa nombres genéricos pero SIEMPRE específicos del giro\n' +
'   (ej. "Pastor por kilo" para taquería, no "carne genérica"). Mínimo 6,\n' +
'   máximo 6.\n\n' +
'3. La "terminologia" debe sustituir las palabras genéricas (cliente,\n' +
'   producto, venta) por las palabras que el dueño REALMENTE usa en su día\n' +
'   a día. Si en ese giro se dice "cliente", devuelve "Cliente" — no\n' +
'   inventes.\n\n' +
'4. "modulos_a_activar" / "modulos_a_desactivar" sólo de esta lista\n' +
'   cerrada (no inventes módulos): pos, comandera, kds, mesas, kitchen,\n' +
'   inventario, granel, recetas, modificadores, lealtad, membresias,\n' +
'   delivery, whatsapp, reportes, corte, facturacion, comisiones, agenda,\n' +
'   citas, pedidos, credito, abonos, productos_por_gramaje, caducidad,\n' +
'   tallas_colores, multinivel, autoservicio, qr_pago.\n\n' +
'5. "campos_no_disponibles" lista los campos que necesitarías en el\n' +
'   formulario de producto pero NO existen hoy. Lista cerrada: gramaje,\n' +
'   caducidad, sabor_variante, talla_color, comision_multinivel, receta,\n' +
'   fecha_servicio, duracion_servicio.\n\n' +
'OUTPUT: SOLO el JSON, sin markdown, sin explicación, sin texto antes o\n' +
'después. Debe parsear con JSON.parse() directo.';

function buildUserPrompt(giroInput, extraHint) {
  const hint = extraHint ? ('\n\nNOTA: ' + extraHint) : '';
  return (
    'Giro de negocio: "' + giroInput + '"\n\n' +
    'Devuelve el JSON con esta forma EXACTA (sin campos extra, sin omitir):\n\n' +
    '{\n' +
    '  "nombre_comercial": "string · 1-3 palabras pegado tipo HerbalifePro",\n' +
    '  "slug": "string · lowercase-con-guiones, sin acentos",\n' +
    '  "descripcion": "string · 1 oración, max 140 chars",\n' +
    '  "terminologia": {\n' +
    '    "cliente": "string · cómo le dice el dueño",\n' +
    '    "producto": "string · cómo le dice el dueño",\n' +
    '    "venta": "string · cómo le dice el dueño"\n' +
    '  },\n' +
    '  "dolores_especificos": [\n' +
    '    { "titulo": "string · 4-8 palabras, terminología del giro", "descripcion": "string · 1 oración max 100 chars con la palabra exacta del giro" },\n' +
    '    "... 6 objetos en total ..."\n' +
    '  ],\n' +
    '  "funcionalidades_unicas": [\n' +
    '    "string · 1 oración con verbo de acción",\n' +
    '    "...",\n' +
    '    "..."\n' +
    '  ],\n' +
    '  "productos_detectados": [\n' +
    '    {\n' +
    '      "name": "string · max 60 chars · producto REAL del giro con marca si aplica",\n' +
    '      "category": "string · max 30 chars",\n' +
    '      "estimated_price": number,\n' +
    '      "search_keywords_en": "string · 2-4 PALABRAS EN INGLÉS para buscar foto del producto. INCLUIR la MARCA si está en el nombre (Lavazza, Silk, Torani, Yamaha, Fender, etc.) seguida del tipo de producto. Ej: \\"Yamaha acoustic guitar\\" para Yamaha F310, \\"Lavazza espresso coffee\\" para Café Lavazza, \\"Silk almond milk\\" para Leche de Almendras Silk, \\"Torani vanilla syrup bottle\\" para Sirope Torani. SIEMPRE en inglés.",\n' +
    '      "metadata": {\n' +
    '        "unit": "pieza|kg|g|ml|l|servicio (opcional)",\n' +
    '        "expires_in_days": number_o_null,\n' +
    '        "variant": "sabor o variante si aplica"\n' +
    '      }\n' +
    '    },\n' +
    '    "... 9 productos en total ..."\n' +
    '  ],\n' +
    '  "formas_robo": [\n' +
    '    { "titulo": "string · 4-8 palabras", "descripcion": "string · 1 oración max 120 chars: cómo el empleado o cliente roba en este giro SIN que el dueño se dé cuenta" },\n' +
    '    "... 3 objetos en total ..."\n' +
    '  ],\n' +
    '  "modulos_a_activar": ["string", "..."],\n' +
    '  "modulos_a_desactivar": ["string", "..."],\n' +
    '  "campos_no_disponibles": ["string", "..."],\n' +
    '  "synonyms": ["string", "..."]\n' +
    '}\n\n' +
    'OBLIGATORIO:\n' +
    '- 6 dolores específicos (con terminología del giro, no genéricos)\n' +
    '- 9 productos reales del giro\n' +
    '- CADA PRODUCTO DEBE INCLUIR el campo "search_keywords_en" con 2-4\n' +
    '  palabras EN INGLÉS para buscar foto del producto.\n' +
    '  REGLA CLAVE: si el nombre tiene MARCA, INCLUIRLA en el query.\n' +
    '  Si no tiene marca, usar términos genéricos. Ejemplos:\n' +
    '    "Yamaha F310 acústica" → "Yamaha acoustic guitar"\n' +
    '    "Bajo Fender" → "Fender bass guitar"\n' +
    '    "Cuerdas D\\u0027Addario" → "D\\u0027Addario guitar strings"\n' +
    '    "Pedal Boss DS-1" → "Boss DS-1 distortion pedal"\n' +
    '    "Café Espresso Lavazza" → "Lavazza espresso coffee bag"\n' +
    '    "Leche de Almendras Silk" → "Silk almond milk carton"\n' +
    '    "Sirope de Vainilla Torani" → "Torani vanilla syrup bottle"\n' +
    '    "Cacao en Polvo Hershey\\u0027s" → "Hershey cocoa powder"\n' +
    '    "Sostén Victoria\\u0027s Secret" → "Victoria Secret push up bra"\n' +
    '    "Concha de chocolate" → "concha pan dulce mexican"\n' +
    '    "Tacos al pastor" → "tacos al pastor mexican"\n' +
    '    "Aceite Castrol 5W30" → "Castrol 5W30 motor oil"\n' +
    '  NUNCA dejes search_keywords_en vacío. SIEMPRE en inglés.\n' +
    '- 3 formas de robo silencioso específicas (cómo se roba en ESE giro, no genérico)\n' +
    '- 3+ funcionalidades únicas (no usar palabras prohibidas)\n' +
    'Sin markdown, sin texto antes/después.' + hint
  );
}

// Limpia respuesta del LLM si viene con ```json ... ``` u otros adornos.
function extractJson(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  // Si viene con fence ```json ... ```
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i.exec(s);
  if (fence) s = fence[1].trim();
  // Buscar primer { y último }
  const first = s.indexOf('{');
  const last  = s.lastIndexOf('}');
  if (first < 0 || last < 0 || last < first) return null;
  s = s.substring(first, last + 1);
  try { return JSON.parse(s); } catch (_) { return null; }
}

// 2026-05: scraping multi-engine de imágenes de producto.
// Estrategia del usuario: usar buscadores web (Google/Bing/DuckDuckGo),
// extraer URL de primera imagen del HTML, guardar el LINK (no descargar).
// Sin API key, sin tokens de IA, sin storage cost.
//
// Cadena de fallbacks: DuckDuckGo → Google → Bing
// (DuckDuckGo es el más permisivo desde datacenter IPs)

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms || 5000);
  try {
    const r = await fetch(url, { ...(opts || {}), signal: ctrl.signal });
    clearTimeout(timer);
    return r;
  } catch (_) { clearTimeout(timer); return null; }
}

// DuckDuckGo Image Search (2-step: vqd token, then JSON results)
async function tryDuckDuckGoImage(query) {
  try {
    const r1 = await fetchWithTimeout(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iar=images&iax=images&ia=images`,
      { headers: { 'User-Agent': UA, 'Accept': 'text/html' } }, 4000);
    if (!r1 || !r1.ok) return null;
    const html = await r1.text();
    const vqdMatch = html.match(/vqd=['"]([^'"]+)['"]/) || html.match(/vqd=([0-9-]+)/);
    if (!vqdMatch) return null;
    const vqd = vqdMatch[1];
    const r2 = await fetchWithTimeout(`https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(vqd)}&p=1`,
      { headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': 'https://duckduckgo.com/' } }, 4000);
    if (!r2 || !r2.ok) return null;
    const j = await r2.json().catch(() => null);
    if (j && Array.isArray(j.results) && j.results.length) {
      const first = j.results.find(x => x && x.image && /^https?:\/\//.test(x.image));
      if (first) return first.image;
    }
    return null;
  } catch (_) { return null; }
}

// Google Images search (modern HTML embeds image URLs)
async function tryGoogleImage(query) {
  try {
    const r = await fetchWithTimeout(`https://www.google.com/search?q=${encodeURIComponent(query)}&udm=2&hl=es&gl=mx`,
      { headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'es-MX,es;q=0.9' } }, 5000);
    if (!r || !r.ok) return null;
    const html = await r.text();
    // Modern Google: arrays like ["https://example.com/img.jpg",WIDTH,HEIGHT]
    const m1 = html.match(/\["(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)",\d+,\d+\]/i);
    if (m1 && m1[1] && !/\bgstatic\.com|google\.com\/(?:images|logos)|encrypted-tbn/.test(m1[1])) return m1[1];
    // Fallback: imgurl= in href
    const m2 = html.match(/imgurl=(https?:\/\/[^&"]+\.(?:jpg|jpeg|png|webp)[^&"]*)/i);
    if (m2 && m2[1]) return decodeURIComponent(m2[1]);
    return null;
  } catch (_) { return null; }
}

// Bing Images
async function tryBingImage(query) {
  try {
    const r = await fetchWithTimeout(`https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1`,
      { headers: { 'User-Agent': UA, 'Accept': 'text/html' } }, 4000);
    if (!r || !r.ok) return null;
    const html = await r.text();
    const m = html.match(/"murl":"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
    if (m && m[1]) return m[1].replace(/\\u002f/g, '/').replace(/\\\//g, '/');
    return null;
  } catch (_) { return null; }
}

// 2026-05: Pexels API (imágenes profesionales catalogo).
// Funciona desde Vercel datacenter (no como Google/Bing).
// Free tier: 200 req/hora, 20.000 req/mes.
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || 'ltdq1hrsI4wNg453oKLxXhZPG1Mwpze8Y0E0MXA6eouKjhF3cqTHHMgk';

async function tryPexelsImage(query) {
  if (!query || !PEXELS_API_KEY) return null;
  try {
    const url = 'https://api.pexels.com/v1/search?per_page=3&orientation=square&query=' + encodeURIComponent(query);
    const r = await fetchWithTimeout(url, {
      headers: { 'Authorization': PEXELS_API_KEY, 'Accept': 'application/json' }
    }, 6000);
    if (!r || !r.ok) return null;
    const j = await r.json();
    const photos = (j && j.photos) || [];
    if (!photos.length) return null;
    // Iterate photos, validate each candidate URL (SSRF defense)
    for (const photo of photos) {
      if (!photo || !photo.src) continue;
      const candidates = [photo.src.large, photo.src.medium, photo.src.original, photo.src.large2x];
      for (const u of candidates) {
        if (isValidImageUrl(u)) return u;
      }
    }
    return null;
  } catch (_) { return null; }
}

// 2026-05: Google Custom Search JSON API (imágenes brand-specific reales).
// Free tier: 100 queries/día. searchType=image devuelve imágenes directas (link).
// REQUIERE billing vinculado al proyecto GCP — usuario eligió saltar (decisión "C").
// Función inerte hasta que el usuario agregue GOOGLE_CSE_API_KEY a Vercel env vars.
// Sin env var explícita, retorna null en <1ms (NO consume el timeout de 6s en 403).
const GOOGLE_CSE_API_KEY = process.env.GOOGLE_CSE_API_KEY || null;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID || '07ec88647a95540d0';

async function tryGoogleCustomSearch(query) {
  // Gate estricto en env var: sin billing/credencial, no malgastamos 6s por query.
  if (!query || !GOOGLE_CSE_API_KEY || !GOOGLE_CSE_ID) return null;
  try {
    const params = new URLSearchParams({
      key: GOOGLE_CSE_API_KEY,
      cx: GOOGLE_CSE_ID,
      q: query,
      searchType: 'image',
      num: '3',
      safe: 'off',
      imgSize: 'medium'
    });
    const url = 'https://www.googleapis.com/customsearch/v1?' + params.toString();
    const r = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } }, 6000);
    if (!r || !r.ok) return null;
    const j = await r.json();
    const items = (j && j.items) || [];
    if (!items.length) return null;
    // Pick first valid https:// image (no fallback to raw items[0].link to avoid SSRF)
    for (const item of items) {
      const link = item && item.link;
      if (isValidImageUrl(link)) return link;
    }
    return null;
  } catch (_) { return null; }
}

// 2026-05: SSRF + scheme defense. ALL external image URLs MUST pass through
// this allowlist before being stored in DB or returned to clients.
// Blocks: javascript:, data:, file:, http:// (non-TLS), private/local IPs,
// AWS metadata endpoint, link-local addresses, malformed URLs.
function isValidImageUrl(u) {
  if (!u || typeof u !== 'string') return false;
  if (u.length > 2048) return false;
  let parsed;
  try { parsed = new URL(u); } catch (_) { return false; }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  // Block private/loopback/link-local IPs
  if (host === 'localhost' || host === '0.0.0.0') return false;
  if (/^127\./.test(host)) return false;
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false; // AWS metadata
  if (/^::1$|^fc00:|^fe80:/i.test(host)) return false; // IPv6 loopback/private
  // Must be jpeg/jpg/png/webp (allow query string after extension)
  if (!/\.(jpe?g|png|webp)(\?|#|$)/i.test(parsed.pathname + (parsed.search || ''))) return false;
  return true;
}

// 2026-05: User-Agents — separados por servicio para evitar leak cruzado.
// OFF requiere identificación de bot (con email contacto) para no banear.
// Wikipedia recomienda User-Agent pero sin email de contacto público.
const OFF_USER_AGENT = 'Volvix-POS/1.0 (+https://systeminternational.app; bot@systeminternational.app)';
const WIKI_USER_AGENT = 'Volvix-POS/1.0 (+https://systeminternational.app)';

// 2026-05: Open Food Facts API (productos de comida/bebida con marcas).
async function tryOpenFoodFacts(query) {
  if (!query) return null;
  try {
    const url = 'https://world.openfoodfacts.org/cgi/search.pl?search_terms=' +
      encodeURIComponent(query) + '&search_simple=1&action=process&json=1&page_size=5';
    const r = await fetchWithTimeout(url, {
      headers: { 'User-Agent': OFF_USER_AGENT, 'Accept': 'application/json' }
    }, 6000);
    if (!r || !r.ok) return null;
    const j = await r.json().catch(() => null);
    const products = (j && j.products) || [];
    if (!products.length) return null;
    for (const p of products) {
      const candidates = [p.image_front_url, p.image_url, p.image_small_url, p.image_thumb_url];
      for (const img of candidates) {
        if (isValidImageUrl(img)) return img;
      }
    }
    return null;
  } catch (_) { return null; }
}

// 2026-05: Wikipedia REST API.
// BAD_TITLE filter: descarta hits a artículos de arte/anatomía/medicina.
// "history of" eliminado (false-negative en marcas: "History of Coca-Cola" es
//  el artículo más rico para Coca-Cola). Usamos solo señales claras de no-producto.
const WIKIPEDIA_BAD_TITLE = /\b(buttocks|nude|nudity|anatomy|anatomical|cadaver|fine[- ]art|painting|sculpture|fresco|archaeology|archaeological|disease|syndrome|disorder|symptom|surgery|surgical|species|genus|genome|phylogeny)\b/i;
const WIKIPEDIA_BAD_FILE = /\b(buttocks|nude|nudity|anatom|cadaver|painting|sculpture|fresco|fine[-_ ]art|surgical|disease|skeleton|skull)\b/i;
const WIKI_GLOBAL_TIMEOUT_MS = 10000;

async function tryWikipediaImage(query) {
  if (!query) return null;
  // Wrap entire chain in a single global timeout (S2 fix)
  return Promise.race([
    _wikipediaInner(query),
    new Promise(resolve => setTimeout(() => resolve(null), WIKI_GLOBAL_TIMEOUT_MS))
  ]);
}

async function _wikipediaInner(query) {
  try {
    const searchUrl = 'https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srsearch=' +
      encodeURIComponent(query) + '&srlimit=5';
    const sr = await fetchWithTimeout(searchUrl, {
      headers: { 'User-Agent': WIKI_USER_AGENT, 'Accept': 'application/json' }
    }, 4000);
    if (!sr || !sr.ok) return null;
    const sj = await sr.json().catch(() => null);
    const hits = sj && sj.query && sj.query.search;
    if (!hits || !hits.length) return null;
    for (const hit of hits.slice(0, 5)) {
      const title = hit.title;
      if (!title) continue;
      if (WIKIPEDIA_BAD_TITLE.test(title)) continue;
      const imgUrl = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages&piprop=original|thumbnail&pithumbsize=600&titles=' +
        encodeURIComponent(title);
      const ir = await fetchWithTimeout(imgUrl, {
        headers: { 'User-Agent': WIKI_USER_AGENT, 'Accept': 'application/json' }
      }, 3000);
      if (!ir || !ir.ok) continue;
      const ij = await ir.json().catch(() => null);
      const pages = ij && ij.query && ij.query.pages;
      if (!pages) continue;
      for (const pid of Object.keys(pages)) {
        const page = pages[pid];
        const orig = page.original && page.original.source;
        const thumb = page.thumbnail && page.thumbnail.source;
        const url = orig || thumb;
        if (!isValidImageUrl(url)) continue;
        if (WIKIPEDIA_BAD_FILE.test(url)) continue;
        return url;
      }
    }
    return null;
  } catch (_) { return null; }
}

// Cadena de PERFECCIÓN máxima posible (con telemetría):
async function searchProductImageMulti(query) {
  if (!query || typeof query !== 'string') return null;
  const sources = [
    ['google_cse', tryGoogleCustomSearch],
    ['off',        tryOpenFoodFacts],
    ['pexels',     tryPexelsImage],
    ['wikipedia',  tryWikipediaImage],
    ['ddg',        tryDuckDuckGoImage],
    ['google_scrape', tryGoogleImage],
    ['bing',       tryBingImage],
  ];
  for (const [name, fn] of sources) {
    try {
      const url = await fn(query);
      if (url && isValidImageUrl(url)) {
        try { console.log('[img-search] hit', name, JSON.stringify(query).slice(0, 80)); } catch (_) {}
        return url;
      }
    } catch (e) {
      try { console.log('[img-search] err', name, String(e && e.message || e).slice(0, 80)); } catch (_) {}
    }
  }
  try { console.log('[img-search] miss-all', JSON.stringify(query).slice(0, 80)); } catch (_) {}
  return null;
}

// Wrapper sync para construir placeholder cuando los buscadores fallan.
// Genera placeholder colorido con nombre del producto.
function buildPlaceholderUrl(name) {
  if (!name) return null;
  const hash = Math.abs(String(name).split('').reduce((a,c) => ((a<<5)-a+c.charCodeAt(0))|0, 0));
  const hue = hash % 360;
  // HSL → hex aprox
  const h = hue / 60;
  const c = 0.65;
  const x = c * (1 - Math.abs(h % 2 - 1));
  let r=0, g=0, b=0;
  if (h<1)      { r=c;g=x;b=0; }
  else if (h<2) { r=x;g=c;b=0; }
  else if (h<3) { r=0;g=c;b=x; }
  else if (h<4) { r=0;g=x;b=c; }
  else if (h<5) { r=x;g=0;b=c; }
  else          { r=c;g=0;b=x; }
  const m = 0.175;
  const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  const bg = toHex(r) + toHex(g) + toHex(b);
  const text = String(name).slice(0, 40)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['"]/g, '').replace(/\s+/g, '+');
  return `https://placehold.co/600x600/${bg}/ffffff/png?text=${text}&font=lato`;
}

// Async: intenta multi-engine, fallback a placeholder.
async function findProductImageAsync(name, category) {
  if (!name) return null;
  const query = category ? `${name} ${category}` : String(name);
  const url = await searchProductImageMulti(query);
  return url || buildPlaceholderUrl(name);
}

// Sync wrapper para retro-compatibilidad: devuelve placeholder de inmediato.
// Las URLs reales se hidratan via /api/giros/resync-images (async).
function findProductImageBing(name, category) {
  return buildPlaceholderUrl(name);
}
// Wrapper async para mantener compatibilidad con código que usa await
async function findProductImageBingAsync(name, category) {
  return findProductImageBing(name, category);
}

// 2026-05: persistencia transaccional best-effort en verticals + vertical_templates.
// NO escribimos a giros_synonyms (sinónimos quedan en verticals.settings.synonyms).
async function persistGeneratedGiro(ctx, slug, payload, originalQuery) {
  if (!ctx || typeof ctx.supabaseRequest !== 'function') return { ok: false, reason: 'no_supabase_ctx' };

  // 1) Upsert verticals (UNIQUE en code → resolution=merge-duplicates)
  const verticalRow = {
    code: slug,
    name: payload.nombre_comercial,
    description: payload.descripcion || null,
    icon: '✨',
    color: '#EA580C',
    modules: Array.isArray(payload.modulos_a_activar) ? payload.modulos_a_activar : [],
    settings: {
      terminologia: payload.terminologia || {},
      funcionalidades_unicas: payload.funcionalidades_unicas || [],
      dolores_especificos: payload.dolores_especificos || [],
      formas_robo: payload.formas_robo || [],
      modulos_a_desactivar: payload.modulos_a_desactivar || [],
      campos_no_disponibles: payload.campos_no_disponibles || [],
      synonyms: Array.isArray(payload.synonyms) ? payload.synonyms : [],
      generated_by_ai: true,
      generated_at: new Date().toISOString(),
      source_query: originalQuery
    },
    active: true
  };

  let verticalOk = false;
  try {
    // supabaseRequest helper acepta objeto o array; para upsert lo wrapeamos en array
    // y pasamos resolution=merge-duplicates si el helper lo soporta via tercer param.
    await ctx.supabaseRequest('POST', '/verticals?on_conflict=code', [verticalRow], {
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    });
    verticalOk = true;
  } catch (e) {
    // Si el helper no acepta headers extra, intentar fallback: DELETE + INSERT
    try {
      await ctx.supabaseRequest('DELETE', '/verticals?code=eq.' + encodeURIComponent(slug));
    } catch (_) { /* puede no existir, ok */ }
    try {
      await ctx.supabaseRequest('POST', '/verticals', verticalRow);
      verticalOk = true;
    } catch (e2) { /* abortamos cache pero seguimos retornando JSON */ }
  }

  // 2) DELETE + INSERT batch en vertical_templates (limpia productos de regeneraciones)
  let templatesInserted = 0;
  if (verticalOk) {
    try {
      await ctx.supabaseRequest('DELETE', '/vertical_templates?vertical=eq.' + encodeURIComponent(slug));
    } catch (_) { /* puede no existir, ok */ }

    const productos = Array.isArray(payload.productos_detectados) ? payload.productos_detectados : [];
    // 2026-05: enriquecer cada producto con image_url real via Pexels API.
    // Server-side, paralelo, timeout 6s. Solo se ejecuta 1 vez por giro al persistir.
    // Si Pexels falla, fallback a placeholder colorido.
    const productosConImg = await Promise.all(productos.map(async (p) => {
      if (p && (p.image_url || (p.metadata && p.metadata.image_url))) return p;
      if (!p || !p.name) return p;
      // Preferir search_keywords_en (LLM ya generó en inglés). Si no, name+category.
      const query = p.search_keywords_en || `${p.name} ${p.category || ''}`.trim();
      const realUrl = await searchProductImageMulti(query).catch(() => null);
      const imgUrl = realUrl || buildPlaceholderUrl(p.name);
      return { ...p, image_url: imgUrl };
    }));
    const rows = productosConImg.map(function (p) {
      const md = (p && p.metadata && typeof p.metadata === 'object') ? p.metadata : {};
      return {
        vertical: slug,
        name: String(p.name || '').slice(0, 160),
        sku: null,
        price: Number(p.estimated_price || 0) || 0,
        stock: 0,
        barcode: null,
        metadata: {
          category: String(p.category || '').slice(0, 60),
          unit: md.unit || null,
          expires_in_days: typeof md.expires_in_days === 'number' ? md.expires_in_days : null,
          variant: md.variant || null,
          extra: md.extra || {},
          source: 'ai_generated',
          image_url: p.image_url || md.image_url || null,
          search_keywords_en: String(p.search_keywords_en || '').slice(0, 100) || null
        }
      };
    });

    // Insertar en batch (Supabase REST acepta array para POST)
    if (rows.length) {
      try {
        await ctx.supabaseRequest('POST', '/vertical_templates', rows);
        templatesInserted = rows.length;
      } catch (e) {
        // Fallback row-by-row si el batch falla
        for (const r of rows) {
          try {
            await ctx.supabaseRequest('POST', '/vertical_templates', r);
            templatesInserted++;
          } catch (_) { /* skip individual */ }
        }
      }
    }
  }

  return { ok: verticalOk, vertical: verticalOk, templates: templatesInserted };
}

async function generateGiro(ctx, req, res) {
  let body;
  try { body = await readJson(req); }
  catch (e) { return err(ctx, res, 400, 'BAD_BODY', 'Invalid JSON'); }

  const name = String((body && body.name) || '').trim();
  if (!name) return err(ctx, res, 400, 'MISSING_NAME', 'name is required');

  // 2026-05: force=true → bypass de TODOS los caches (landing estática + BD).
  // Va directo al LLM con el texto EXACTO del usuario.
  // Caso de uso: usuario clickeó "No es lo que busco" porque "café orgánico"
  // se mapeó a "cafe" genérico — quiere giro específico para "café orgánico".
  const force = !!(body && body.force);

  const slug = slugify(name);
  const aiCfg = getAIConfig();

  // 1) Cache check: ¿ya hay landing estática? (saltado si force=true)
  if (!force) {
    const giros = scanLandings();
    const existingLanding = giros.find((g) => g.slug === slug);
    if (existingLanding) {
      return send(ctx, res, 200, {
        cached: true, source: 'landing_html', slug,
        landing: existingLanding.landing,
      });
    }
  }

  // 2) Cache check: ¿ya está en BD verticals? (saltado si force=true)
  if (!force && ctx && typeof ctx.supabaseRequest === 'function') {
    try {
      const cached = await ctx.supabaseRequest('GET',
        '/verticals?code=eq.' + encodeURIComponent(slug) + '&select=code,name,description,icon,color,modules,settings&limit=1');
      if (Array.isArray(cached) && cached.length > 0) {
        const v = cached[0];
        const tmpls = await ctx.supabaseRequest('GET',
          '/vertical_templates?vertical=eq.' + encodeURIComponent(slug) +
          '&select=name,price,metadata&order=created_at.asc&limit=9').catch(() => []);
        const settings = v.settings || {};
        // 2026-05: si BD tiene dolores_especificos+formas_robo (cache nuevo), usar.
        // Si no (cache viejo legacy), invalidar cache y forzar re-LLM.
        const hasNewFields = Array.isArray(settings.dolores_especificos) && settings.dolores_especificos.length >= 6
                          && Array.isArray(settings.formas_robo) && settings.formas_robo.length >= 3
                          && Array.isArray(tmpls) && tmpls.length >= 9;
        if (hasNewFields) {
          return send(ctx, res, 200, {
            cached: true, source: 'verticals_db', slug,
            payload: {
              nombre_comercial: v.name,
              slug: v.code,
              descripcion: v.description,
              terminologia: settings.terminologia || {},
              funcionalidades_unicas: settings.funcionalidades_unicas || [],
              dolores_especificos: settings.dolores_especificos || [],
              formas_robo: settings.formas_robo || [],
              productos_detectados: tmpls.map(t => ({
                name: t.name,
                category: (t.metadata && t.metadata.category) || '',
                estimated_price: Number(t.price) || 0,
                image_url: (t.metadata && (t.metadata.image_url || t.metadata.image)) || null,
                metadata: t.metadata || {}
              })),
              modulos_a_activar: v.modules || [],
              modulos_a_desactivar: settings.modulos_a_desactivar || [],
              campos_no_disponibles: settings.campos_no_disponibles || [],
              synonyms: settings.synonyms || []
            },
            landing: '/landing-' + encodeURIComponent(slug) + '.html',
          });
        }
        // cache viejo: cae al LLM para regenerar con nuevo formato
      }
    } catch (_) { /* fall through to LLM */ }
  }

  // 3) No cache y no API key → fallback suave (sin "no tenemos")
  if (!aiCfg) {
    return send(ctx, res, 200, {
      cached: false,
      source: 'no_api_key',
      slug,
      fallback: '/landing-' + encodeURIComponent(slug) + '.html',
      message: 'AI provider not configured; client may use generic template.',
    });
  }

  // 4) LLM call con validación + 1 retry
  const userPrompt = buildUserPrompt(name);
  let raw, parsed, validation;
  try {
    raw = await callLLM(aiCfg, GIRO_SYSTEM_PROMPT, userPrompt, {
      max_tokens: 4000,
      temperature: 0.4,
      timeout_ms: 45000,
      response_format: { type: 'json_object' }
    });
    parsed = extractJson(raw);
    validation = parsed ? validateGiroResponse(parsed) : { ok: false, error: 'json_unparseable' };

    // Retry si validación falla
    if (!validation.ok) {
      const hint = 'Tu respuesta anterior tuvo este error: "' + validation.error +
                   (validation.detail ? ' (detalle: ' + JSON.stringify(validation.detail).slice(0, 80) + ')' : '') +
                   '". Vuelve a generar respetando ESTA regla específica. SOLO el JSON.';
      const retryPrompt = buildUserPrompt(name, hint);
      raw = await callLLM(aiCfg, GIRO_SYSTEM_PROMPT, retryPrompt, {
        max_tokens: 4000,
        temperature: 0.3,
        timeout_ms: 45000,
        response_format: { type: 'json_object' }
      });
      parsed = extractJson(raw);
      validation = parsed ? validateGiroResponse(parsed) : { ok: false, error: 'json_unparseable_retry' };
    }
  } catch (e) {
    return err(ctx, res, 502, 'AI_ERROR', 'AI generation failed', {
      provider: aiCfg.provider,
      detail: ctx && ctx.IS_PROD ? undefined : String(e.message).slice(0, 400)
    });
  }

  if (!validation.ok) {
    return err(ctx, res, 502, 'AI_INVALID', 'AI returned invalid response', {
      validation_error: validation.error,
      detail: ctx && ctx.IS_PROD ? undefined : (validation.detail || null)
    });
  }

  // Forzar slug servidor-side (no confiar en el del LLM si no coincide)
  parsed.slug = slug;

  // 5) Persistir best-effort (no aborta el response si falla)
  let persistResult = { ok: false };
  try {
    persistResult = await persistGeneratedGiro(ctx, slug, parsed, name);
  } catch (e) { /* swallow, devolvemos el JSON igual */ }

  return send(ctx, res, 200, {
    cached: false,
    source: 'llm_fresh',
    slug,
    payload: parsed,
    persisted: persistResult,
    landing: '/landing-' + encodeURIComponent(slug) + '.html',
  });
}

// 2026-05: re-sincronizar imágenes de productos de un giro existente.
// Busca productos en vertical_templates donde metadata.image_url sea null,
// los pasa por findProductImageBing, y actualiza la BD. Útil para giros
// generados antes de que existiera la búsqueda de imágenes.
async function resyncImages(ctx, req, res) {
  let body;
  try { body = await readJson(req); }
  catch (e) { return err(ctx, res, 400, 'BAD_BODY', 'Invalid JSON'); }
  const slug = String((body && body.slug) || '').trim().toLowerCase();
  if (!slug) return err(ctx, res, 400, 'MISSING_SLUG', 'slug is required');
  if (!ctx || typeof ctx.supabaseRequest !== 'function') {
    return err(ctx, res, 503, 'NO_DB', 'BD no disponible');
  }
  try {
    const tmpls = await ctx.supabaseRequest('GET',
      '/vertical_templates?vertical=eq.' + encodeURIComponent(slug) +
      '&select=name,metadata&order=created_at.asc&limit=20');
    if (!Array.isArray(tmpls) || !tmpls.length) {
      return send(ctx, res, 404, { error: 'no_products', slug });
    }
    let updated = 0, failed = 0, skipped = 0, fromSearch = 0, fromPlaceholder = 0;
    const force = !!(body && body.force);
    for (const t of tmpls) {
      const md = t.metadata || {};
      if (md.image_url && !force) { skipped++; continue; }
      // 2026-05: priorizar search_keywords_en del LLM (incluye marca cuando aplica).
      // Fallback a name+category solo si no hay keywords. Esto sube acierto en
      // queries brand-specific tipo "Lavazza espresso coffee" vs "Café Espresso Lavazza Café".
      const kw = String(md.search_keywords_en || '').trim();
      const query = kw.length >= 2 ? kw : ((md.category) ? `${t.name} ${md.category}` : t.name);
      const realUrl = await searchProductImageMulti(query).catch(() => null);
      const url = realUrl || buildPlaceholderUrl(t.name);
      if (realUrl) fromSearch++; else fromPlaceholder++;
      if (url) {
        try {
          await ctx.supabaseRequest('PATCH',
            '/vertical_templates?vertical=eq.' + encodeURIComponent(slug) +
            '&name=eq.' + encodeURIComponent(t.name),
            { metadata: { ...md, image_url: url, image_source: realUrl ? 'search' : 'placeholder' } });
          updated++;
        } catch (_) { failed++; }
      } else { failed++; }
    }
    return send(ctx, res, 200, { slug, total: tmpls.length, updated, failed, skipped, fromSearch, fromPlaceholder });
  } catch (e) {
    return err(ctx, res, 500, 'RESYNC_ERROR', String(e && e.message || e).slice(0, 200));
  }
}

// 2026-05: persistir image_url descubierta por el navegador del cliente
// (que tiene IP residencial y SÍ puede scrapear DuckDuckGo/Google).
// El cliente envía { slug, name, image_url } y guardamos en metadata.
async function saveProductImage(ctx, req, res) {
  let body;
  try { body = await readJson(req); }
  catch (e) { return err(ctx, res, 400, 'BAD_BODY', 'Invalid JSON'); }
  const slug = String((body && body.slug) || '').trim().toLowerCase();
  const name = String((body && body.name) || '').trim();
  const imageUrl = String((body && body.image_url) || '').trim();
  if (!slug || !name || !imageUrl) return err(ctx, res, 400, 'MISSING_FIELDS', 'slug, name, image_url required');
  if (!/^https?:\/\//i.test(imageUrl) || imageUrl.length > 2000) return err(ctx, res, 400, 'BAD_URL', 'Invalid URL');
  if (!ctx || typeof ctx.supabaseRequest !== 'function') return err(ctx, res, 503, 'NO_DB', 'BD no disponible');
  try {
    // Solo persistir si la URL actual es placeholder o falta
    const rows = await ctx.supabaseRequest('GET',
      '/vertical_templates?vertical=eq.' + encodeURIComponent(slug) +
      '&name=eq.' + encodeURIComponent(name) + '&select=metadata&limit=1');
    if (!Array.isArray(rows) || !rows.length) return send(ctx, res, 404, { error: 'product_not_found' });
    const md = rows[0].metadata || {};
    // Si ya tiene URL real (no placeholder), no sobrescribir
    if (md.image_url && md.image_source === 'search') return send(ctx, res, 200, { skipped: 'already_has_real' });
    await ctx.supabaseRequest('PATCH',
      '/vertical_templates?vertical=eq.' + encodeURIComponent(slug) +
      '&name=eq.' + encodeURIComponent(name),
      { metadata: { ...md, image_url: imageUrl, image_source: 'search', image_origin: 'client_scraped' } });
    return send(ctx, res, 200, { ok: true, slug, name });
  } catch (e) {
    return err(ctx, res, 500, 'SAVE_ERROR', String(e && e.message || e).slice(0, 200));
  }
}

// ---------- dispatcher ----------
function matchExistsPath(pathname) {
  const m = /^\/api\/giros\/([a-z0-9-]+)\/exists$/i.exec(pathname);
  return m ? m[1] : null;
}

module.exports = async function handleGiros(req, res, parsedUrl, ctx) {
  ctx = ctx || {};
  const method = (req.method || 'GET').toUpperCase();
  const pathname = (parsedUrl && parsedUrl.pathname) || (req.url || '').split('?')[0] || '';

  if (!pathname.startsWith('/api/giros')) return false;

  try {
    if (method === 'GET'  && pathname === '/api/giros')               { await listGiros(ctx, req, res); return true; }
    if (method === 'GET'  && pathname === '/api/giros/search')        { await searchGiros(ctx, req, res, parsedUrl); return true; }
    if (method === 'GET'  && pathname === '/api/giros/autocomplete')  { await autocompleteGiros(ctx, req, res, parsedUrl); return true; }
    if (method === 'POST' && pathname === '/api/giros/generate')      { await generateGiro(ctx, req, res); return true; }
    if (method === 'POST' && pathname === '/api/giros/resync-images')  { await resyncImages(ctx, req, res); return true; }
    if (method === 'POST' && pathname === '/api/giros/save-image')     { await saveProductImage(ctx, req, res); return true; }

    const slug = matchExistsPath(pathname);
    if (slug && method === 'GET') { await existsGiro(ctx, req, res, slug); return true; }

    // path was under /api/giros but no match -> 404 (own this prefix)
    err(ctx, res, 404, 'NOT_FOUND', 'No giros route matches ' + method + ' ' + pathname);
    return true;
  } catch (e) {
    err(ctx, res, 500, 'INTERNAL_ERROR', 'Internal error', { detail: ctx && ctx.IS_PROD ? undefined : String(e.message) });
    return true;
  }
};

module.exports.scanLandings = scanLandings;
module.exports.slugify = slugify;
module.exports.GIRO_SYNONYMS = GIRO_SYNONYMS;
module.exports.localAutocomplete = localAutocomplete;
// 2026-05 audit B-16: searchGiros NO estaba exportado pero api/index.js:11114
// lo invocaba como giros.searchGiros() → siempre undefined → fallback de
// sinónimos roto, todo iba directo a la IA (más caro y lento).
module.exports.searchGiros = searchGiros;
