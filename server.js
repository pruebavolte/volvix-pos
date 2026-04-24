require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zhvwmzkcqngcaqpdxtwr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const PORT = parseInt(process.env.PORT || '3000');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function bodyJSON(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(e); } });
  });
}

// ─── HTTP SERVER ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const { method, url } = req;
  const parsed = new URL(url, `http://localhost:${PORT}`);
  const pathname = parsed.pathname;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
    res.end(); return;
  }

  // ── API routes ──
  if (pathname.startsWith('/api/')) {
    try {
      await handleAPI(req, res, method, pathname, parsed);
    } catch (err) {
      console.error('API error:', err);
      json(res, 500, { error: err.message });
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
    return json(res, 200, { ok: true, ts: Date.now() });
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
      const { data, error } = await supabase.from('volvix_tenants').insert(body).select().single();
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
      const { data, error } = await supabase.from('volvix_tenants').update(body).eq('id', id).select().single();
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
      const { data, error } = await supabase.from('volvix_features').upsert(body).select().single();
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
      const { data, error } = await supabase.from('volvix_tickets').insert(body).select().single();
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
      const { data, error } = await supabase.from('volvix_licencias').insert(body).select().single();
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
      const { data, error } = await supabase.from('volvix_productos').insert(body).select().single();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 201, data);
    }
  }

  // /api/ventas
  if (pathname === '/api/ventas') {
    if (method === 'GET') {
      const tenant_id = parsed.searchParams.get('tenant_id');
      const limit = parseInt(parsed.searchParams.get('limit') || '100');
      let q = supabase.from('volvix_ventas').select('*').order('created_at', { ascending: false }).limit(limit);
      if (tenant_id) q = q.eq('tenant_id', tenant_id);
      const { data, error } = await q;
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, data);
    }
    if (method === 'POST') {
      const body = await bodyJSON(req);
      const { data, error } = await supabase.from('volvix_ventas').insert(body).select().single();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 201, data);
    }
  }

  // /api/ai/activate — AI engine: activate features based on business analysis
  if (pathname === '/api/ai/activate' && method === 'POST') {
    const body = await bodyJSON(req);
    const resultado = await aiActivateFeatures(body);
    return json(res, 200, resultado);
  }

  // /api/ai/suggest — AI suggest features for a business type
  if (pathname === '/api/ai/suggest' && method === 'GET') {
    const tipo = parsed.searchParams.get('tipo') || 'retail';
    const sugerencias = getFeaturesSuggestions(tipo);
    return json(res, 200, sugerencias);
  }

  // /api/stats — dashboard stats
  if (pathname === '/api/stats' && method === 'GET') {
    const tenant_id = parsed.searchParams.get('tenant_id');
    const stats = await getStats(tenant_id);
    return json(res, 200, stats);
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
  if (!tenant_id) return { error: 'tenant_id requerido' };
  const tipo = (tipo_negocio || 'retail').toLowerCase();
  const features = FEATURE_MAP[tipo] || FEATURE_MAP.retail;

  const activaciones = features.map(f => ({
    tenant_id,
    feature: f,
    activo: true,
    activado_por: 'ai_engine',
    datos_uso: datos_uso || {},
  }));

  const { data, error } = await supabase.from('volvix_features').upsert(activaciones).select();
  if (error) return { error: error.message };

  await supabase.from('volvix_tenants').update({
    tipo_negocio: tipo,
    features_activos: features,
    ai_ultimo_analisis: new Date().toISOString(),
  }).eq('id', tenant_id);

  return { ok: true, features_activados: features, total: features.length };
}

function getFeaturesSuggestions(tipo) {
  const tipo_lower = tipo.toLowerCase();
  const features = FEATURE_MAP[tipo_lower] || FEATURE_MAP.retail;
  const todos = Object.values(FEATURE_MAP).flat();
  return {
    tipo,
    recomendados: features,
    opcionales: [...new Set(todos.filter(f => !features.includes(f)))].slice(0, 6),
  };
}

async function getStats(tenant_id) {
  const filters = tenant_id ? { eq: ['tenant_id', tenant_id] } : {};
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
    try {
      const { default: open } = require('open');
      open(`http://localhost:${port}`).catch(() => {});
    } catch (_) {}
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Puerto ${port} ocupado, probando ${port + 1}...`);
      server.removeAllListeners('error');
      tryListen(port + 1);
    } else {
      console.error('Error servidor:', err);
    }
  });
}

tryListen(PORT);
