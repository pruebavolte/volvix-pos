/**
 * VOLVIX · Serverless API para Vercel
 * Maneja API endpoints + sirve archivos estáticos
 */

const fs = require('fs');
const path = require('path');
const url = require('url');

// =============================================================
// BASE DE DATOS - Cargada en cada invocación (stateless)
// =============================================================
const SEED_DB = {
  users: [
    { id: 'USR001', email: 'admin@volvix.test', password: 'Volvix2026!', role: 'superadmin', tenant_id: 'TNT001', status: 'active' },
    { id: 'USR002', email: 'owner@volvix.test', password: 'Volvix2026!', role: 'owner', tenant_id: 'TNT002', status: 'active' },
    { id: 'USR003', email: 'cajero@volvix.test', password: 'Volvix2026!', role: 'cajero', tenant_id: 'TNT001', status: 'active' },
  ],
  tenants: [
    { id: 'TNT001', name: 'Abarrotes Don Chucho', giro: 'abarrotes', plan: 'pro', status: 'active', mrr: 799 },
    { id: 'TNT002', name: 'Restaurante Los Compadres', giro: 'restaurante', plan: 'enterprise', status: 'active', mrr: 1499 },
    { id: 'TNT003', name: 'BarberShop Ruiz', giro: 'barberia', plan: 'pro', status: 'active', mrr: 799 },
  ],
  products: [
    { id: 'PRD001', code: '7501055303045', name: 'Coca Cola 600ml', price: 25.00, cost: 18.00, stock: 50, tenant_id: 'TNT001' },
    { id: 'PRD002', code: '7501030411025', name: 'Pan dulce', price: 8.50, cost: 5.00, stock: 100, tenant_id: 'TNT001' },
    { id: 'PRD003', code: '7501058634511', name: 'Queso fresco 250g', price: 120.00, cost: 80.00, stock: 20, tenant_id: 'TNT001' },
    { id: 'PRD004', code: '7501025410016', name: 'Tortillas 1kg', price: 18.00, cost: 12.00, stock: 80, tenant_id: 'TNT001' },
    { id: 'PRD005', code: '7501020310028', name: 'Leche 1L', price: 28.00, cost: 22.00, stock: 40, tenant_id: 'TNT001' },
  ],
  sales: [],
  customers: [],
  features: [],
  tickets: [],
  knowledge: [],
};

let db = null;
function loadDB() {
  if (db) return db;
  // En Vercel serverless el filesystem es read-only, usamos memoria
  db = JSON.parse(JSON.stringify(SEED_DB));
  return db;
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

function findFile(filename) {
  // Buscar archivo en múltiples ubicaciones posibles
  const possibleRoots = [
    path.join(__dirname, '..'),  // /var/task/
    path.join(process.cwd()),    // working dir
    '/var/task',                  // Vercel default
    '/var/task/api/..',          // alt
  ];

  for (const root of possibleRoots) {
    const fullPath = path.join(root, filename);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

function serveStaticFile(res, pathname) {
  // Default a login.html en raíz
  if (pathname === '/' || pathname === '') {
    pathname = '/login.html';
  }

  const filePath = findFile(pathname);

  if (!filePath) {
    // Listar archivos para debug
    let debug = '';
    try {
      const files = fs.readdirSync(path.join(__dirname, '..'));
      debug = `<p>Archivos disponibles en root: ${files.join(', ')}</p>`;
    } catch (e) {
      debug = `<p>Error leyendo dir: ${e.message}</p>`;
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<h1>404 - Archivo no encontrado</h1>
<p>Buscaba: ${pathname}</p>
<p><a href="/login.html">Ir a Login</a></p>
${debug}`);
    return;
  }

  try {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js':   'application/javascript; charset=utf-8',
      '.css':  'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png':  'image/png',
      '.jpg':  'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif':  'image/gif',
      '.svg':  'image/svg+xml',
      '.ico':  'image/x-icon',
      '.woff': 'font/woff',
      '.woff2':'font/woff2',
    };

    const mime = mimeTypes[ext] || 'application/octet-stream';
    res.statusCode = 200;
    res.setHeader('Content-Type', mime);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const content = fs.readFileSync(filePath);
    res.end(content);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<h1>500 - Error</h1><p>${err.message}</p>`);
  }
}

// =============================================================
// API HANDLERS
// =============================================================
const handlers = {
  // ============ AUTH ============
  'POST /api/login': async (req, res) => {
    const body = await readBody(req);
    const { email, password } = body;

    if (!email || !password) {
      return sendJSON(res, { error: 'Email y contraseña requeridos' }, 400);
    }

    const db = loadDB();
    const user = db.users.find(u => u.email === email && u.password === password);

    if (!user) {
      return sendJSON(res, { error: 'Credenciales inválidas' }, 401);
    }

    const tenant = db.tenants.find(t => t.id === user.tenant_id);

    sendJSON(res, {
      ok: true,
      session: {
        user_id: user.id,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id,
        tenant_name: tenant?.name || 'Mi Negocio',
        expires_at: Date.now() + (3600 * 1000),
        plan: tenant?.plan || 'free',
      }
    });
  },

  'GET /api/health': async (req, res) => {
    sendJSON(res, { ok: true, time: Date.now(), version: '7.0.0' });
  },

  // ============ TENANTS ============
  'GET /api/tenants': async (req, res) => {
    sendJSON(res, loadDB().tenants);
  },

  // ============ PRODUCTS ============
  'GET /api/products': async (req, res) => {
    const parsed = url.parse(req.url, true);
    const tenantId = parsed.query.tenant_id;
    let products = loadDB().products;
    if (tenantId) products = products.filter(p => p.tenant_id === tenantId);
    sendJSON(res, products);
  },

  'POST /api/products': async (req, res) => {
    const body = await readBody(req);
    const db = loadDB();
    const product = {
      id: 'PRD' + String(db.products.length + 1).padStart(3, '0'),
      ...body,
      created: Date.now(),
    };
    db.products.push(product);
    sendJSON(res, product);
  },

  // ============ SALES ============
  'GET /api/sales': async (req, res) => {
    const parsed = url.parse(req.url, true);
    const tenantId = parsed.query.tenant_id;
    let sales = loadDB().sales;
    if (tenantId) sales = sales.filter(s => s.tenant_id === tenantId);
    sendJSON(res, sales);
  },

  'POST /api/sales': async (req, res) => {
    const body = await readBody(req);
    const db = loadDB();
    const sale = {
      id: 'SLE-' + Date.now(),
      ...body,
      timestamp: Date.now(),
      status: 'completed',
    };
    db.sales.push(sale);
    sendJSON(res, sale);
  },

  // ============ CUSTOMERS ============
  'GET /api/customers': async (req, res) => {
    const parsed = url.parse(req.url, true);
    const tenantId = parsed.query.tenant_id;
    let customers = loadDB().customers;
    if (tenantId) customers = customers.filter(c => c.tenant_id === tenantId);
    sendJSON(res, customers);
  },

  'POST /api/customers': async (req, res) => {
    const body = await readBody(req);
    const db = loadDB();
    const customer = {
      id: 'CUS-' + Date.now(),
      ...body,
      created: Date.now(),
    };
    db.customers.push(customer);
    sendJSON(res, customer);
  },

  // ============ FEATURES ============
  'GET /api/features': async (req, res) => {
    sendJSON(res, loadDB().features);
  },

  // ============ TICKETS ============
  'GET /api/tickets': async (req, res) => {
    sendJSON(res, loadDB().tickets);
  },

  'POST /api/tickets': async (req, res) => {
    const body = await readBody(req);
    const db = loadDB();
    const ticket = {
      id: 'TKT-' + (1000 + db.tickets.length),
      ...body,
      status: 'open',
      opened: Date.now(),
    };
    db.tickets.push(ticket);
    sendJSON(res, ticket);
  },

  // ============ SYNC ============
  'POST /api/sync': async (req, res) => {
    const body = await readBody(req);
    sendJSON(res, { ok: true, synced: Date.now(), data: body });
  },
};

// =============================================================
// MAIN HANDLER
// =============================================================
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;

  // API routes
  if (pathname.startsWith('/api/')) {
    const key = `${method} ${pathname}`;
    const handler = handlers[key];

    if (handler) {
      try {
        await handler(req, res);
      } catch (err) {
        sendJSON(res, { error: err.message, stack: err.stack }, 500);
      }
    } else {
      sendJSON(res, { error: 'endpoint not found', path: pathname }, 404);
    }
    return;
  }

  // Static files
  serveStaticFile(res, pathname);
};
