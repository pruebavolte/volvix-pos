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

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
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

  // 1) exact slug
  let hit = giros.find((g) => g.slug === qSlug);
  // 2) substring
  if (!hit) hit = giros.find((g) => g.slug.includes(qSlug) || qSlug.includes(g.slug));
  // 3) name token match
  if (!hit) hit = giros.find((g) => normalize(g.name).includes(q) || q.includes(normalize(g.name)));

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

function localAutocomplete(query, limit) {
  const out = [];
  for (const slug of Object.keys(GIRO_SYNONYMS)) {
    const entry = GIRO_SYNONYMS[slug];
    const s = scoreLocal(query, slug, entry);
    if (s > 0) out.push({ slug, name: entry.name, score: s, source: 'local' });
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
        const results = rows.map((r) => ({
          slug: r.giro_slug,
          name: r.name,
          score: r.giro_slug === q ? 100 : 50,
          source: 'db'
        }));
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

// ---------- AI generation ----------
function callOpenAI(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an expert landing-page copywriter for SaaS POS verticals in Spanish (Mexico). Output ONLY valid HTML body content (no <html>, <head>, <body> wrappers).' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 1500,
      temperature: 0.7,
    });
    const opts = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) return reject(new Error('OpenAI ' + res.statusCode + ': ' + data));
          const content = parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
          resolve(content || '');
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(new Error('OpenAI timeout')); });
    req.write(body);
    req.end();
  });
}

async function generateGiro(ctx, req, res) {
  let body;
  try { body = await readJson(req); }
  catch (e) { return err(ctx, res, 400, 'BAD_BODY', 'Invalid JSON'); }

  const name = String((body && body.name) || '').trim();
  const description = String((body && body.description) || '').trim();
  if (!name) return err(ctx, res, 400, 'MISSING_NAME', 'name is required');

  const slug = slugify(name);
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();

  // existing already?
  const giros = scanLandings();
  const existing = giros.find((g) => g.slug === slug);
  if (existing) {
    return send(ctx, res, 200, { exists: true, slug, landing: existing.landing, generated: false });
  }

  if (!apiKey) {
    return send(ctx, res, 200, {
      todo: true,
      slug,
      message: 'AI giro generator pending API key (set OPENAI_API_KEY)',
      fallback: '/landing_dynamic.html?giro=' + encodeURIComponent(slug),
    });
  }

  // optional: persist a pending request to supabase if available
  try {
    if (ctx && typeof ctx.supabaseRequest === 'function') {
      await ctx.supabaseRequest('POST', '/giros_generated', {
        slug, name, description, status: 'generating', created_at: new Date().toISOString(),
      }).catch(() => {});
    }
  } catch (_) {}

  const prompt = [
    'Crea el contenido HTML (sin <html>, <head>, <body>) de una landing personalizada para un sistema POS.',
    'Giro de negocio: "' + name + '".',
    description ? ('Descripcion adicional: ' + description) : '',
    'Incluye: hero con titulo y subtitulo, 4 modulos del sistema con iconos emoji, 3 testimonios ficticios realistas, CTA final.',
    'Tono: profesional, cercano, en espanol mexicano. NO incluyas estilos inline ni <script>.',
  ].filter(Boolean).join('\n');

  try {
    const html = await callOpenAI(apiKey, prompt);
    return send(ctx, res, 200, {
      generated: true,
      slug,
      name,
      html,
      landing: '/landing_dynamic.html?giro=' + encodeURIComponent(slug),
    });
  } catch (e) {
    return err(ctx, res, 502, 'AI_ERROR', 'AI generation failed', { detail: ctx && ctx.IS_PROD ? undefined : String(e.message) });
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
