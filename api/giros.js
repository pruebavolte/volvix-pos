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

  // 4) FUZZY via synonyms map — 'tacos' → taqueria, 'comida' → restaurante, etc.
  if (!hit) {
    for (const [slug, info] of Object.entries(GIRO_SYNONYMS || {})) {
      const synonyms = (info.synonyms || []).map(normalize);
      const sells = (info.sells || []).map(normalize);
      const allMatches = synonyms.concat(sells);
      if (allMatches.some(s => s === q || s.includes(q) || q.includes(s))) {
        hit = giros.find(g => g.slug === slug.replace(/_/g, '-'));
        if (!hit) {
          // Synthesize from synonyms map even if no landing file exists
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

// ---------- AI generation (2026-05 refactor: HTML legacy → JSON estructurado) ----------
// Acepta (apiKey, systemPrompt, userPrompt). Devuelve string contenido del LLM.
function callOpenAI(apiKey, systemPrompt, userPrompt, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: opts.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: opts.max_tokens || 2500,
      temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.4,
      // Forzar JSON cuando sea posible (gpt-4o family lo soporta)
      response_format: opts.response_format || undefined,
    });
    const reqOpts = {
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
    const r = https.request(reqOpts, (resp) => {
      let data = '';
      resp.on('data', (c) => data += c);
      resp.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (resp.statusCode >= 400) return reject(new Error('OpenAI ' + resp.statusCode + ': ' + data));
          const content = parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
          resolve(content || '');
        } catch (e) { reject(e); }
      });
    });
    r.on('error', reject);
    r.setTimeout(opts.timeout_ms || 20000, () => { r.destroy(new Error('OpenAI timeout')); });
    r.write(body);
    r.end();
  });
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

  if (!Array.isArray(json.funcionalidades_unicas) || json.funcionalidades_unicas.length !== 3) {
    return { ok:false, error:'funcs_must_be_3' };
  }
  for (const f of json.funcionalidades_unicas) {
    if (typeof f !== 'string' || f.length < 20) return { ok:false, error:'func_too_short', detail:f };
    if (FORBIDDEN_FUNCS_RE.test(f)) return { ok:false, error:'func_too_generic', detail:f };
  }

  if (!Array.isArray(json.productos_detectados) || json.productos_detectados.length !== 6) {
    return { ok:false, error:'prods_must_be_6' };
  }
  for (const p of json.productos_detectados) {
    if (!p || typeof p !== 'object') return { ok:false, error:'prod_invalid' };
    if (typeof p.name !== 'string' || p.name.length < 3) return { ok:false, error:'prod_name_invalid', detail:p };
  }

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
    '    "cliente": "string",\n' +
    '    "producto": "string",\n' +
    '    "venta": "string"\n' +
    '  },\n' +
    '  "funcionalidades_unicas": [\n' +
    '    "string · 1 oración con verbo de acción",\n' +
    '    "string · ...",\n' +
    '    "string · ..."\n' +
    '  ],\n' +
    '  "productos_detectados": [\n' +
    '    {\n' +
    '      "name": "string · max 60 chars",\n' +
    '      "category": "string · max 30 chars",\n' +
    '      "estimated_price": number,\n' +
    '      "metadata": {\n' +
    '        "unit": "pieza|kg|g|ml|l|servicio (opcional)",\n' +
    '        "expires_in_days": number_o_null,\n' +
    '        "variant": "sabor o variante si aplica",\n' +
    '        "extra": {}\n' +
    '      }\n' +
    '    }\n' +
    '  ],\n' +
    '  "modulos_a_activar": ["string", "..."],\n' +
    '  "modulos_a_desactivar": ["string", "..."],\n' +
    '  "campos_no_disponibles": ["string", "..."],\n' +
    '  "synonyms": ["string", "..."]\n' +
    '}\n\n' +
    'Recuerda: 3 funcionalidades únicas, 6 productos, sin frases genéricas.' + hint
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
    const rows = productos.map(function (p) {
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
          source: 'ai_generated'
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

  const slug = slugify(name);
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();

  // 1) Cache check: ¿ya hay landing estática?
  const giros = scanLandings();
  const existingLanding = giros.find((g) => g.slug === slug);
  if (existingLanding) {
    return send(ctx, res, 200, {
      cached: true, source: 'landing_html', slug,
      landing: existingLanding.landing,
    });
  }

  // 2) Cache check: ¿ya está en BD verticals?
  if (ctx && typeof ctx.supabaseRequest === 'function') {
    try {
      const cached = await ctx.supabaseRequest('GET',
        '/verticals?code=eq.' + encodeURIComponent(slug) + '&select=code,name,description,icon,color,modules,settings&limit=1');
      if (Array.isArray(cached) && cached.length > 0) {
        const v = cached[0];
        const tmpls = await ctx.supabaseRequest('GET',
          '/vertical_templates?vertical=eq.' + encodeURIComponent(slug) +
          '&select=name,price,metadata&order=created_at.asc&limit=6').catch(() => []);
        return send(ctx, res, 200, {
          cached: true, source: 'verticals_db', slug,
          payload: {
            nombre_comercial: v.name,
            slug: v.code,
            descripcion: v.description,
            terminologia: (v.settings && v.settings.terminologia) || {},
            funcionalidades_unicas: (v.settings && v.settings.funcionalidades_unicas) || [],
            productos_detectados: (Array.isArray(tmpls) ? tmpls : []).map(t => ({
              name: t.name,
              category: (t.metadata && t.metadata.category) || '',
              estimated_price: Number(t.price) || 0,
              metadata: t.metadata || {}
            })),
            modulos_a_activar: v.modules || [],
            modulos_a_desactivar: (v.settings && v.settings.modulos_a_desactivar) || [],
            campos_no_disponibles: (v.settings && v.settings.campos_no_disponibles) || [],
            synonyms: (v.settings && v.settings.synonyms) || []
          },
          landing: '/landing_dynamic.html?giro=' + encodeURIComponent(slug),
        });
      }
    } catch (_) { /* fall through to LLM */ }
  }

  // 3) No cache y no API key → fallback suave (sin "no tenemos")
  if (!apiKey) {
    return send(ctx, res, 200, {
      cached: false,
      source: 'no_api_key',
      slug,
      fallback: '/landing_dynamic.html?giro=' + encodeURIComponent(slug),
      message: 'AI key not configured; client may use generic template.',
    });
  }

  // 4) LLM call con validación + 1 retry
  const userPrompt = buildUserPrompt(name);
  let raw, parsed, validation;
  try {
    raw = await callOpenAI(apiKey, GIRO_SYSTEM_PROMPT, userPrompt, {
      max_tokens: 2500,
      temperature: 0.4,
      timeout_ms: 18000,
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
      raw = await callOpenAI(apiKey, GIRO_SYSTEM_PROMPT, retryPrompt, {
        max_tokens: 2500,
        temperature: 0.3,
        timeout_ms: 18000,
        response_format: { type: 'json_object' }
      });
      parsed = extractJson(raw);
      validation = parsed ? validateGiroResponse(parsed) : { ok: false, error: 'json_unparseable_retry' };
    }
  } catch (e) {
    return err(ctx, res, 502, 'AI_ERROR', 'AI generation failed', {
      detail: ctx && ctx.IS_PROD ? undefined : String(e.message)
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
    landing: '/landing_dynamic.html?giro=' + encodeURIComponent(slug),
  });
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
// 2026-05 audit B-16: searchGiros NO estaba exportado pero api/index.js:11114
// lo invocaba como giros.searchGiros() → siempre undefined → fallback de
// sinónimos roto, todo iba directo a la IA (más caro y lento).
module.exports.searchGiros = searchGiros;
