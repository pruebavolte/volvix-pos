/**
 * VOLVIX · API Serverless conectada a Supabase
 * Base de datos: PostgreSQL gestionado por Supabase
 * Persistencia REAL entre todos los dispositivos del mundo
 */

const fs = require('fs');
const path = require('path');
const url = require('url');
const https = require('https');

// =============================================================
// CONFIG SUPABASE
// =============================================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zhvwmzkcqngcaqpdxtwr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpodndtemtjcW5nY2FxcGR4dHdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDE2NzAxOCwiZXhwIjoyMDc5NzQzMDE4fQ.rvPkcyE7Cu1BzAhM_GdZjmqXvQe67gIpPaI7tLESD-Q';

const TENANTS = {
  '11111111-1111-1111-1111-111111111111': { id: 'TNT001', name: 'Abarrotes Don Chucho', plan: 'pro' },
  '22222222-2222-2222-2222-222222222222': { id: 'TNT002', name: 'Restaurante Los Compadres', plan: 'enterprise' },
  '33333333-3333-3333-3333-333333333333': { id: 'TNT003', name: 'BarberShop Ruiz', plan: 'pro' },
};

// =============================================================
// SUPABASE REST API CLIENT
// =============================================================
function supabaseRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const fullUrl = SUPABASE_URL + '/rest/v1' + path;
    const u = new URL(fullUrl);

    const opts = {
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: method,
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      }
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          if (res.statusCode >= 400) {
            reject(new Error(`Supabase ${res.statusCode}: ${data}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error('Parse error: ' + e.message + ' Data: ' + data));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// =============================================================
// UTILIDADES
// =============================================================
async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

// =============================================================
// ARCHIVOS ESTÁTICOS
// =============================================================
function findFile(filename) {
  const possibleRoots = [
    path.join(__dirname, '..'),
    path.join(process.cwd()),
    '/var/task',
  ];
  for (const root of possibleRoots) {
    const fullPath = path.join(root, filename);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}

function serveStaticFile(res, pathname) {
  if (pathname === '/' || pathname === '') pathname = '/login.html';
  const filePath = findFile(pathname);

  if (!filePath) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<h1>404 - Archivo no encontrado</h1><p>${pathname}</p><p><a href="/login.html">Login</a></p>`);
    return;
  }

  try {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js':   'application/javascript; charset=utf-8',
      '.css':  'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png':  'image/png', '.jpg':  'image/jpeg', '.svg':  'image/svg+xml',
      '.ico':  'image/x-icon', '.woff': 'font/woff', '.woff2':'font/woff2',
    };
    const mime = mimeTypes[ext] || 'application/octet-stream';
    res.statusCode = 200;
    res.setHeader('Content-Type', mime);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(fs.readFileSync(filePath));
  } catch (err) {
    res.statusCode = 500;
    res.end(`<h1>500</h1><p>${err.message}</p>`);
  }
}

// =============================================================
// HELPER: Decodificar notes JSON
// =============================================================
function parseNotes(notesStr) {
  try { return JSON.parse(notesStr || '{}'); }
  catch { return {}; }
}

// =============================================================
// API HANDLERS - TODAS USAN SUPABASE
// =============================================================
const handlers = {
  // ============ AUTH (REAL en Supabase) ============
  'POST /api/login': async (req, res) => {
    try {
      const body = await readBody(req);
      const { email, password } = body;

      if (!email || !password) {
        return sendJSON(res, { error: 'Email y contraseña requeridos' }, 400);
      }

      // Buscar usuario en Supabase
      const users = await supabaseRequest('GET',
        `/pos_users?email=eq.${encodeURIComponent(email)}&select=id,email,password_hash,role,plan,full_name,company_id,notes,is_active`);

      if (!users || users.length === 0) {
        return sendJSON(res, { error: 'Credenciales inválidas' }, 401);
      }

      const user = users[0];

      // Verificar password (texto plano para Volvix)
      if (user.password_hash !== password) {
        return sendJSON(res, { error: 'Credenciales inválidas' }, 401);
      }

      if (!user.is_active) {
        return sendJSON(res, { error: 'Usuario inactivo' }, 403);
      }

      // Decodificar notes (donde está el rol Volvix real)
      const notes = parseNotes(user.notes);
      const volvixRole = notes.volvix_role || (user.role === 'ADMIN' ? 'superadmin' : 'cajero');
      const tenantId = notes.tenant_id || 'TNT001';
      const tenantName = notes.tenant_name || 'Mi Negocio';

      // Actualizar last_login
      supabaseRequest('PATCH', `/pos_users?id=eq.${user.id}`, {
        last_login_at: new Date().toISOString()
      }).catch(() => {});

      // Log evento de login
      supabaseRequest('POST', '/pos_login_events', {
        pos_user_id: user.id,
        platform: 'web',
        ip: 'serverless'
      }).catch(() => {});

      sendJSON(res, {
        ok: true,
        session: {
          user_id: user.id,
          email: user.email,
          role: volvixRole,
          tenant_id: tenantId,
          tenant_name: tenantName,
          full_name: user.full_name,
          company_id: user.company_id,
          expires_at: Date.now() + (3600 * 1000),
          plan: user.plan,
        }
      });
    } catch (err) {
      sendJSON(res, { error: 'Error: ' + err.message }, 500);
    }
  },

  'GET /api/health': async (req, res) => {
    try {
      // Verificar conexión a Supabase
      const test = await supabaseRequest('GET', '/pos_users?limit=1&select=id');
      sendJSON(res, {
        ok: true,
        time: Date.now(),
        version: '7.0.0',
        database: 'Supabase',
        supabase_connected: true,
        users_table_accessible: Array.isArray(test)
      });
    } catch (err) {
      sendJSON(res, {
        ok: true,
        time: Date.now(),
        version: '7.0.0',
        database: 'Supabase',
        supabase_connected: false,
        error: err.message
      });
    }
  },

  // ============ TENANTS (Companies) ============
  'GET /api/tenants': async (req, res) => {
    try {
      const companies = await supabaseRequest('GET',
        '/pos_companies?id=in.(11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222,33333333-3333-3333-3333-333333333333)&select=*');
      sendJSON(res, companies || []);
    } catch (err) {
      sendJSON(res, { error: err.message }, 500);
    }
  },

  // ============ PRODUCTOS (REAL en Supabase) ============
  'GET /api/products': async (req, res) => {
    try {
      const parsed = url.parse(req.url, true);
      const tenantId = parsed.query.tenant_id;

      // Para tenant específico, buscar el owner
      let posUserId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'; // default admin
      if (tenantId === 'TNT002') posUserId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';

      const products = await supabaseRequest('GET',
        `/pos_products?pos_user_id=eq.${posUserId}&select=*&order=name.asc`);

      sendJSON(res, (products || []).map(p => ({
        id: p.id,
        code: p.code,
        name: p.name,
        category: p.category,
        price: parseFloat(p.price),
        cost: parseFloat(p.cost),
        stock: p.stock,
        icon: p.icon,
        tenant_id: tenantId || 'TNT001',
      })));
    } catch (err) {
      sendJSON(res, { error: err.message }, 500);
    }
  },

  'POST /api/products': async (req, res) => {
    try {
      const body = await readBody(req);
      const result = await supabaseRequest('POST', '/pos_products', {
        pos_user_id: body.pos_user_id || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
        code: body.code,
        name: body.name,
        category: body.category || 'general',
        cost: body.cost || 0,
        price: body.price,
        stock: body.stock || 0,
        icon: body.icon || '📦'
      });
      sendJSON(res, result[0] || result);
    } catch (err) {
      sendJSON(res, { error: err.message }, 500);
    }
  },

  // ============ VENTAS (REAL en Supabase) ============
  'GET /api/sales': async (req, res) => {
    try {
      const parsed = url.parse(req.url, true);
      const userId = parsed.query.user_id;
      let qs = '?select=*&order=created_at.desc&limit=100';
      if (userId) qs = `?pos_user_id=eq.${userId}&select=*&order=created_at.desc&limit=100`;

      const sales = await supabaseRequest('GET', '/pos_sales' + qs);
      sendJSON(res, sales || []);
    } catch (err) {
      sendJSON(res, { error: err.message }, 500);
    }
  },

  'POST /api/sales': async (req, res) => {
    try {
      const body = await readBody(req);
      const result = await supabaseRequest('POST', '/pos_sales', {
        pos_user_id: body.user_id || body.pos_user_id || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
        total: body.total,
        payment_method: body.payment_method || 'efectivo',
        items: body.items || []
      });
      sendJSON(res, result[0] || result);
    } catch (err) {
      sendJSON(res, { error: err.message }, 500);
    }
  },

  // ============ CUSTOMERS ============
  'GET /api/customers': async (req, res) => {
    try {
      const parsed = url.parse(req.url, true);
      const tenantId = parsed.query.tenant_id;
      const customers = await supabaseRequest('GET',
        `/customers?select=*&order=created_at.desc&limit=100`);
      sendJSON(res, customers || []);
    } catch (err) {
      sendJSON(res, { error: err.message }, 500);
    }
  },

  'POST /api/customers': async (req, res) => {
    try {
      const body = await readBody(req);
      // Tabla customers tiene su propio schema
      const result = await supabaseRequest('POST', '/customers', body);
      sendJSON(res, result[0] || result);
    } catch (err) {
      sendJSON(res, { error: err.message }, 500);
    }
  },

  // ============ FEATURES (datos en memoria) ============
  'GET /api/features': async (req, res) => {
    sendJSON(res, []);
  },

  // ============ TICKETS ============
  'GET /api/tickets': async (req, res) => {
    sendJSON(res, []);
  },

  'POST /api/tickets': async (req, res) => {
    const body = await readBody(req);
    sendJSON(res, { id: 'TKT-' + Date.now(), ...body });
  },

  // ============ SYNC ============
  'POST /api/sync': async (req, res) => {
    const body = await readBody(req);

    // Procesar items en cola
    const results = [];
    if (Array.isArray(body.items)) {
      for (const item of body.items) {
        try {
          if (item.type === 'sale' && item.data) {
            const r = await supabaseRequest('POST', '/pos_sales', {
              pos_user_id: item.data.user_id || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
              total: item.data.total,
              payment_method: item.data.payment_method || 'efectivo',
              items: item.data.items || []
            });
            results.push({ type: 'sale', success: true, id: r[0]?.id });
          } else {
            results.push({ type: item.type, success: false, error: 'Tipo no soportado' });
          }
        } catch (err) {
          results.push({ type: item.type, success: false, error: err.message });
        }
      }
    }

    sendJSON(res, { ok: true, synced: Date.now(), results });
  },

  // ============ DEBUG ============
  'GET /api/debug': async (req, res) => {
    try {
      const users = await supabaseRequest('GET', '/pos_users?email=in.(admin@volvix.test,owner@volvix.test,cajero@volvix.test)&select=email,role,is_active');
      const products = await supabaseRequest('GET', '/pos_products?pos_user_id=eq.aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1&select=code,name,price&limit=10');
      sendJSON(res, {
        ok: true,
        supabase_url: SUPABASE_URL,
        users_count: users?.length || 0,
        users: users || [],
        products_count: products?.length || 0,
        products: products || [],
      });
    } catch (err) {
      sendJSON(res, { error: err.message }, 500);
    }
  },
};

// =============================================================
// MAIN HANDLER
// =============================================================
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,apikey');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;

  if (pathname.startsWith('/api/')) {
    const key = `${method} ${pathname}`;
    const handler = handlers[key];

    if (handler) {
      try {
        await handler(req, res);
      } catch (err) {
        sendJSON(res, { error: err.message }, 500);
      }
    } else {
      sendJSON(res, { error: 'endpoint not found', path: pathname, method }, 404);
    }
    return;
  }

  serveStaticFile(res, pathname);
};
