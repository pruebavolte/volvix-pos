require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { z } = require('zod');

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zhvwmzkcqngcaqpdxtwr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const PORT = parseInt(process.env.PORT || '3000');
const SENTRY_DSN = process.env.SENTRY_DSN || '';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── SENTRY (opcional — activa si existe SENTRY_DSN) ──────────────────────────
let Sentry = null;
if (SENTRY_DSN) {
  try {
    Sentry = require('@sentry/node');
    Sentry.init({ dsn: SENTRY_DSN, tracesSampleRate: 0.1 });
    console.log('[Sentry] Inicializado');
  } catch (_) { /* @sentry/node no instalado, ignorar */ }
}

function captureError(err, ctx = {}) {
  console.error('[Error]', ctx, err);
  if (Sentry) Sentry.captureException(err, { extra: ctx });
}

// ─── RATE LIMITER (100 req / 60s por IP) ──────────────────────────────────────
const rateBuckets = new Map();
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || '100');
const RATE_WINDOW = 60_000; // 60 segundos

function checkRateLimit(ip) {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start > RATE_WINDOW) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(ip, bucket);
  }
  bucket.count++;
  return bucket.count <= RATE_LIMIT;
}

// Limpiar buckets cada 5 min
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW;
  for (const [ip, b] of rateBuckets) {
    if (b.start < cutoff) rateBuckets.delete(ip);
  }
}, 5 * 60_000);

// ─── ZOD SCHEMAS ──────────────────────────────────────────────────────────────
const schemas = {
  tenant: z.object({
    nombre:       z.string().min(1).max(120),
    tipo_negocio: z.string().optional(),
    email:        z.string().email().optional(),
    telefono:     z.string().optional(),
    plan:         z.enum(['free', 'basic', 'pro', 'enterprise']).optional(),
  }),
  producto: z.object({
    tenant_id:  z.string().uuid(),
    nombre:     z.string().min(1).max(200),
    precio:     z.number().nonnegative(),
    stock:      z.number().int().nonnegative().optional(),
    categoria:  z.string().optional(),
    codigo:     z.string().optional(),
  }),
  venta: z.object({
    tenant_id:       z.string().uuid(),
    total:           z.number().nonnegative(),
    metodo_pago:     z.enum(['efectivo', 'tarjeta', 'transferencia', 'otro']).optional(),
    items:           z.array(z.any()).optional(),
    cajero_id:       z.string().optional(),
    notas:           z.string().optional(),
  }),
  ticket: z.object({
    tenant_id:   z.string().uuid(),
    asunto:      z.string().min(1).max(200),
    descripcion: z.string().optional(),
    prioridad:   z.enum(['baja', 'media', 'alta', 'critica']).optional(),
    categoria:   z.string().optional(),
  }),
  feature: z.object({
    tenant_id:  z.string().uuid(),
    feature:    z.string().min(1),
    activo:     z.boolean().optional(),
    datos_uso:  z.record(z.any()).optional(),
  }),
  licencia: z.object({
    tenant_id:   z.string().uuid(),
    plan:        z.string().min(1),
    vigencia:    z.string().optional(),
    activo:      z.boolean().optional(),
  }),
  aiActivate: z.object({
    tenant_id:     z.string().uuid(),
    tipo_negocio:  z.string().optional(),
    datos_uso:     z.record(z.any()).optional(),
  }),
};

function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    return { ok: false, errors };
  }
  return { ok: true, data: result.data };
}

// ─── MIME TYPES ────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ─── JSON HELPERS ──────────────────────────────────────────────────────────────
function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

function bodyJSON(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 1e6) reject(new Error('Payload too large')); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(e); } });
  });
}

function getIP(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

// ─── HTTP SERVER ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const { method, url } = req;
  const parsed = new URL(url, `http://localhost:${PORT}`);
  const pathname = parsed.pathname;
  const ip = getIP(req);

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-Key',
    });
    res.end(); return;
  }

  // ── Rate limiting solo en /api/ ──
  if (pathname.startsWith('/api/') && !checkRateLimit(ip)) {
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'Retry-After': '60',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ error: 'Rate limit exceeded. Max 100 req/min.' }));
    return;
  }

  // ── API routes ──
  if (pathname.startsWith('/api/')) {
    try {
      await handleAPI(req, res, method, pathname, parsed);
    } catch (err) {
      captureError(err, { method, pathname, ip });
      json(res, 500, { error: 'Internal server error' });
    }
    return;
  }

  // ── Static files ──
  let filePath;
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(__dirname, 'public', 'index.html');
  } else {
    filePath = path.join(__dirname, 'public', pathname.replace(/^\//, ''));
  }
  serveFile(res, filePath);
});

// ─── API HANDLER ───────────────────────────────────────────────────────────────
async function handleAPI(req, res, method, pathname, parsed) {
  // /api/health
  if (pathname === '/api/health') {
    return json(res, 200, { ok: true, ts: Date.now(), version: '2.0.0' });
  }

  // /api/tenants
  if (pathname === '/api/tenants') {
    if (method === 'GET') {
      const { data, error } = await supabase.from('volvix_tenants').select('*').order('created_at', { ascending: false });
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, data);
    }
    if (method === 'POST') {
      const body = await bodyJSON(req);
      const v = validate(schemas.tenant, body);
      if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });
      const { data, error } = await supabase.from('volvix_tenants').insert(v.data).select().single();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 201, data);
    }
  }

  if (pathname.match(/^\/api\/tenants\/[^/]+$/)) {
    const id = pathname.split('/')[3];
    if (method === 'GET') {
      const { data, error } = await supabase.from('volvix_tenants').select('*').eq('id', id).single();
      if (error) return json(res, 404, { error: error.message });
      return json(res, 200, data);
    }
    if (method === 'PUT') {
      const body = await bodyJSON(req);
      const v = validate(schemas.tenant.partial(), body);
      if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });
      const { data, error } = await supabase.from('volvix_tenants').update(v.data).eq('id', id).select().single();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, data);
    }
    if (method === 'DELETE') {
      const { error } = await supabase.from('volvix_tenants').delete().eq('id', id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { ok: true });
    }
  }

  // /api/features
  if (pathname === '/api/features') {
    if (method === 'GET') {
      const tenant_id = parsed.searchParams.get('tenant_id');
      let q = supabase.from('volvix_features').select('*');
      if (tenant_id) q = q.eq('tenant_id', tenant_id);
      const { data, error } = await q;
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, data);
    }
    if (method === 'POST') {
      const body = await bodyJSON(req);
      const v = validate(schemas.feature, body);
      if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });
      const { data, error } = await supabase.from('volvix_features').upsert(v.data).select().single();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, data);
    }
  }

  // /api/tickets
  if (pathname === '/api/tickets') {
    if (method === 'GET') {
      const tenant_id = parsed.searchParams.get('tenant_id');
      let q = supabase.from('volvix_tickets').select('*').order('created_at', { ascending: false });
      if (tenant_id) q = q.eq('tenant_id', tenant_id);
      const { data, error } = await q;
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, data);
    }
    if (method === 'POST') {
      const body = await bodyJSON(req);
      const v = validate(schemas.ticket, body);
      if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });
      const { data, error } = await supabase.from('volvix_tickets').insert(v.data).select().single();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 201, data);
    }
  }

  // /api/licencias
  if (pathname === '/api/licencias') {
    if (method === 'GET') {
      const tenant_id = parsed.searchParams.get('tenant_id');
      let q = supabase.from('volvix_licencias').select('*');
      if (tenant_id) q = q.eq('tenant_id', tenant_id);
      const { data, error } = await q;
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, data);
    }
    if (method === 'POST') {
      const body = await bodyJSON(req);
      const v = validate(schemas.licencia, body);
      if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });
      const { data, error } = await supabase.from('volvix_licencias').insert(v.data).select().single();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 201, data);
    }
  }

  // /api/productos
  if (pathname === '/api/productos') {
    if (method === 'GET') {
      const tenant_id = parsed.searchParams.get('tenant_id');
      let q = supabase.from('volvix_productos').select('*').order('nombre');
      if (tenant_id) q = q.eq('tenant_id', tenant_id);
      const { data, error } = await q;
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, data);
    }
    if (method === 'POST') {
      const body = await bodyJSON(req);
      const v = validate(schemas.producto, body);
      if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });
      const { data, error } = await supabase.from('volvix_productos').insert(v.data).select().single();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 201, data);
    }
  }

  if (pathname.match(/^\/api\/productos\/[^/]+$/) && method === 'PUT') {
    const id = pathname.split('/')[3];
    const body = await bodyJSON(req);
    const v = validate(schemas.producto.partial(), body);
    if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });
    const { data, error } = await supabase.from('volvix_productos').update(v.data).eq('id', id).select().single();
    if (error) return json(res, 400, { error: error.message });
    return json(res, 200, data);
  }

  // /api/ventas
  if (pathname === '/api/ventas') {
    if (method === 'GET') {
      const tenant_id = parsed.searchParams.get('tenant_id');
      const limit = Math.min(parseInt(parsed.searchParams.get('limit') || '100'), 500);
      let q = supabase.from('volvix_ventas').select('*').order('created_at', { ascending: false }).limit(limit);
      if (tenant_id) q = q.eq('tenant_id', tenant_id);
      const { data, error } = await q;
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, data);
    }
    if (method === 'POST') {
      const body = await bodyJSON(req);
      const v = validate(schemas.venta, body);
      if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });
      const { data, error } = await supabase.from('volvix_ventas').insert(v.data).select().single();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 201, data);
    }
  }

  // /api/ai/activate
  if (pathname === '/api/ai/activate' && method === 'POST') {
    const body = await bodyJSON(req);
    const v = validate(schemas.aiActivate, body);
    if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });
    const resultado = await aiActivateFeatures(v.data);
    return json(res, 200, resultado);
  }

  // /api/ai/suggest
  if (pathname === '/api/ai/suggest' && method === 'GET') {
    const tipo = parsed.searchParams.get('tipo') || 'retail';
    return json(res, 200, getFeaturesSuggestions(tipo));
  }

  // /api/stats
  if (pathname === '/api/stats' && method === 'GET') {
    const tenant_id = parsed.searchParams.get('tenant_id');
    return json(res, 200, await getStats(tenant_id));
  }

  json(res, 404, { error: 'Endpoint not found' });
}

// ─── AI ENGINE ─────────────────────────────────────────────────────────────────
const FEATURE_MAP = {
  retail:    ['pos', 'inventario', 'proveedores', 'descuentos', 'codigo_barras', 'facturacion'],
  salud:     ['citas', 'expediente', 'recetas', 'historial', 'recordatorios', 'telemedicina'],
  belleza:   ['citas', 'servicios', 'fidelidad', 'galeria', 'whatsapp', 'pagos_online'],
  alimentos: ['menu', 'pedidos', 'delivery', 'mesas', 'cocina_display', 'propinas'],
  rentas:    ['contratos', 'pagos', 'mantenimiento', 'calendario', 'inquilinos', 'reportes'],
  servicios: ['ordenes', 'tecnicos', 'garantias', 'diagnostico', 'refacciones', 'cobros'],
  gym:       ['membresias', 'asistencia', 'clases', 'locker', 'pagos', 'rutinas'],
  educacion: ['alumnos', 'calificaciones', 'pagos', 'horarios', 'comunicados', 'tareas'],
};

async function aiActivateFeatures({ tenant_id, tipo_negocio, datos_uso }) {
  const tipo = (tipo_negocio || 'retail').toLowerCase();
  const features = FEATURE_MAP[tipo] || FEATURE_MAP.retail;
  const activaciones = features.map(f => ({
    tenant_id, feature: f, activo: true, activado_por: 'ai_engine', datos_uso: datos_uso || {},
  }));
  const { data, error } = await supabase.from('volvix_features').upsert(activaciones).select();
  if (error) return { error: error.message };
  await supabase.from('volvix_tenants').update({
    tipo_negocio: tipo, features_activos: features, ai_ultimo_analisis: new Date().toISOString(),
  }).eq('id', tenant_id);
  return { ok: true, features_activados: features, total: features.length };
}

function getFeaturesSuggestions(tipo) {
  const features = FEATURE_MAP[tipo.toLowerCase()] || FEATURE_MAP.retail;
  const todos = Object.values(FEATURE_MAP).flat();
  return {
    tipo,
    recomendados: features,
    opcionales: [...new Set(todos.filter(f => !features.includes(f)))].slice(0, 6),
  };
}

async function getStats(tenant_id) {
  const runQ = async (table) => {
    let q = supabase.from(table).select('*', { count: 'exact', head: true });
    if (tenant_id) q = q.eq('tenant_id', tenant_id);
    const { count } = await q;
    return count || 0;
  };
  const [tenants, ventas, productos, tickets] = await Promise.all([
    tenant_id ? Promise.resolve(1) : runQ('volvix_tenants'),
    runQ('volvix_ventas'),
    runQ('volvix_productos'),
    runQ('volvix_tickets'),
  ]);
  return { tenants, ventas, productos, tickets, ts: Date.now() };
}

// ─── START ─────────────────────────────────────────────────────────────────────
function tryListen(port) {
  server.listen(port, () => {
    console.log(`✓ Volvix POS corriendo en http://localhost:${port}`);
    try { require('open')(`http://localhost:${port}`).catch(() => {}); } catch (_) {}
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Puerto ${port} ocupado, probando ${port + 1}...`);
      server.removeAllListeners('error');
      tryListen(port + 1);
    } else { captureError(err, { context: 'server_start' }); }
  });
}

tryListen(PORT);
