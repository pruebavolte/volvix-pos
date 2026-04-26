/**
 * VOLVIX · API Serverless conectada a Supabase
 * Versión: 7.1.0 - Cableado completo
 */

const fs = require('fs');
const path = require('path');
const url = require('url');
const https = require('https');

// =============================================================
// CONFIG SUPABASE
// =============================================================
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://zhvwmzkcqngcaqpdxtwr.supabase.co').trim();
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpodndtemtjcW5nY2FxcGR4dHdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDE2NzAxOCwiZXhwIjoyMDc5NzQzMDE4fQ.rvPkcyE7Cu1BzAhM_GdZjmqXvQe67gIpPaI7tLESD-Q').trim().replace(/[\r\n]+/g, '');
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim().replace(/[\r\n]+/g, '');

// =============================================================
// SUPABASE REST API CLIENT
// =============================================================
function supabaseRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const fullUrl = SUPABASE_URL + '/rest/v1' + path;
    const u = new URL(fullUrl);

    const opts = {
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search, method: method,
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
        } catch (e) { reject(new Error('Parse error: ' + e.message)); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// =============================================================
// ANTHROPIC CLAUDE API
// =============================================================
function callClaude(messages, system) {
  return new Promise((resolve, reject) => {
    if (!ANTHROPIC_API_KEY) {
      return resolve({
        simulated: true,
        content: 'Modo simulación. Configura ANTHROPIC_API_KEY para llamadas reales.'
      });
    }

    const body = JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      messages: messages || [{ role: 'user', content: 'Hola' }],
      system: system || 'Eres la IA de Volvix POS. Ayudas a comerciantes con su negocio.',
    });

    const req = https.request({
      hostname: 'api.anthropic.com', port: 443,
      path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            simulated: false,
            content: parsed.content?.[0]?.text || '',
            usage: parsed.usage,
          });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// =============================================================
// UTILIDADES
// =============================================================
async function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
  });
}

function sendJSON(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

function parseNotes(notesStr) {
  try { return JSON.parse(notesStr || '{}'); }
  catch { return {}; }
}

// =============================================================
// ARCHIVOS ESTÁTICOS
// =============================================================
function findFile(filename) {
  const possibleRoots = [
    path.join(__dirname, '..'), path.join(process.cwd()), '/var/task'
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
    res.end(`<h1>404</h1><p>${pathname}</p><p><a href="/login.html">Login</a></p>`);
    return;
  }

  try {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js':   'application/javascript; charset=utf-8',
      '.css':  'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png':  'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
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
// HANDLERS - ENDPOINTS COMPLETOS
// =============================================================
const handlers = {
  // ============ AUTH ============
  'POST /api/login': async (req, res) => {
    try {
      const body = await readBody(req);
      const { email, password } = body;

      if (!email || !password) return sendJSON(res, { error: 'Email y contraseña requeridos' }, 400);

      const users = await supabaseRequest('GET',
        `/pos_users?email=eq.${encodeURIComponent(email)}&select=id,email,password_hash,role,plan,full_name,company_id,notes,is_active`);

      if (!users || users.length === 0) return sendJSON(res, { error: 'Credenciales inválidas' }, 401);

      const user = users[0];
      if (user.password_hash !== password) return sendJSON(res, { error: 'Credenciales inválidas' }, 401);
      if (!user.is_active) return sendJSON(res, { error: 'Usuario inactivo' }, 403);

      const notes = parseNotes(user.notes);
      const volvixRole = notes.volvix_role || (user.role === 'ADMIN' ? 'superadmin' : 'cajero');
      const tenantId = notes.tenant_id || 'TNT001';
      const tenantName = notes.tenant_name || 'Mi Negocio';

      supabaseRequest('PATCH', `/pos_users?id=eq.${user.id}`, {
        last_login_at: new Date().toISOString()
      }).catch(() => {});

      supabaseRequest('POST', '/pos_login_events', {
        pos_user_id: user.id, platform: 'web', ip: 'serverless'
      }).catch(() => {});

      sendJSON(res, {
        ok: true,
        session: {
          user_id: user.id, email: user.email, role: volvixRole,
          tenant_id: tenantId, tenant_name: tenantName,
          full_name: user.full_name, company_id: user.company_id,
          expires_at: Date.now() + (3600 * 1000), plan: user.plan,
        }
      });
    } catch (err) {
      sendJSON(res, { error: err.message }, 500);
    }
  },

  'POST /api/logout': async (req, res) => {
    sendJSON(res, { ok: true, message: 'Sesión cerrada' });
  },

  'GET /api/health': async (req, res) => {
    try {
      const test = await supabaseRequest('GET', '/pos_users?limit=1&select=id');
      sendJSON(res, {
        ok: true, time: Date.now(), version: '7.1.0',
        database: 'Supabase', supabase_connected: true,
        users_table_accessible: Array.isArray(test)
      });
    } catch (err) {
      sendJSON(res, { ok: true, time: Date.now(), supabase_connected: false, error: err.message });
    }
  },

  // ============ TENANTS / COMPANIES ============
  'GET /api/tenants': async (req, res) => {
    try {
      const companies = await supabaseRequest('GET',
        '/pos_companies?id=in.(11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222,33333333-3333-3333-3333-333333333333)&select=*');
      sendJSON(res, companies || []);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'POST /api/tenants': async (req, res) => {
    try {
      const body = await readBody(req);
      const result = await supabaseRequest('POST', '/pos_companies', {
        name: body.name, owner_user_id: body.owner_user_id,
        plan: body.plan || 'trial', is_active: body.is_active !== false
      });
      sendJSON(res, result[0] || result);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'PATCH /api/tenants/:id': async (req, res, params) => {
    try {
      const body = await readBody(req);
      const result = await supabaseRequest('PATCH', `/pos_companies?id=eq.${params.id}`, body);
      sendJSON(res, result);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'DELETE /api/tenants/:id': async (req, res, params) => {
    try {
      await supabaseRequest('PATCH', `/pos_companies?id=eq.${params.id}`, { is_active: false });
      sendJSON(res, { ok: true, message: 'Tenant suspendido' });
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  // ============ PRODUCTOS ============
  'GET /api/products': async (req, res) => {
    try {
      const parsed = url.parse(req.url, true);
      const tenantId = parsed.query.tenant_id;
      let posUserId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
      if (tenantId === 'TNT002') posUserId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';

      const products = await supabaseRequest('GET',
        `/pos_products?pos_user_id=eq.${posUserId}&select=*&order=name.asc`);

      sendJSON(res, (products || []).map(p => ({
        id: p.id, code: p.code, name: p.name, category: p.category,
        price: parseFloat(p.price), cost: parseFloat(p.cost),
        stock: p.stock, icon: p.icon, tenant_id: tenantId || 'TNT001',
      })));
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'POST /api/products': async (req, res) => {
    try {
      const body = await readBody(req);
      const result = await supabaseRequest('POST', '/pos_products', {
        pos_user_id: body.pos_user_id || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
        code: body.code, name: body.name, category: body.category || 'general',
        cost: body.cost || 0, price: body.price, stock: body.stock || 0,
        icon: body.icon || '📦'
      });
      sendJSON(res, result[0] || result);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'PATCH /api/products/:id': async (req, res, params) => {
    try {
      const body = await readBody(req);
      const result = await supabaseRequest('PATCH', `/pos_products?id=eq.${params.id}`, body);
      sendJSON(res, result);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'DELETE /api/products/:id': async (req, res, params) => {
    try {
      await supabaseRequest('DELETE', `/pos_products?id=eq.${params.id}`);
      sendJSON(res, { ok: true });
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  // ============ VENTAS ============
  'GET /api/sales': async (req, res) => {
    try {
      const parsed = url.parse(req.url, true);
      const userId = parsed.query.user_id;
      let qs = '?select=*&order=created_at.desc&limit=100';
      if (userId) qs = `?pos_user_id=eq.${userId}&select=*&order=created_at.desc&limit=100`;
      const sales = await supabaseRequest('GET', '/pos_sales' + qs);
      sendJSON(res, sales || []);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'POST /api/sales': async (req, res) => {
    try {
      const body = await readBody(req);
      const result = await supabaseRequest('POST', '/pos_sales', {
        pos_user_id: body.user_id || body.pos_user_id || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
        total: body.total, payment_method: body.payment_method || 'efectivo',
        items: body.items || []
      });
      sendJSON(res, result[0] || result);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  // ============ CUSTOMERS ============
  'GET /api/customers': async (req, res) => {
    try {
      const customers = await supabaseRequest('GET', '/customers?select=*&order=created_at.desc&limit=100');
      sendJSON(res, customers || []);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'POST /api/customers': async (req, res) => {
    try {
      const body = await readBody(req);
      const result = await supabaseRequest('POST', '/customers', {
        name: body.name, email: body.email, phone: body.phone,
        address: body.address, credit_limit: body.credit_limit || 0,
        credit_balance: body.credit_balance || 0,
        points: body.points || 0, loyalty_points: body.loyalty_points || 0,
        active: true, user_id: body.user_id
      });
      sendJSON(res, result[0] || result);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'PATCH /api/customers/:id': async (req, res, params) => {
    try {
      const body = await readBody(req);
      const result = await supabaseRequest('PATCH', `/customers?id=eq.${params.id}`, body);
      sendJSON(res, result);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'DELETE /api/customers/:id': async (req, res, params) => {
    try {
      await supabaseRequest('PATCH', `/customers?id=eq.${params.id}`, { active: false });
      sendJSON(res, { ok: true });
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  // ============ OWNER PANEL DASHBOARD ============
  'GET /api/owner/dashboard': async (req, res) => {
    try {
      const [users, companies, sales, products, customers] = await Promise.all([
        supabaseRequest('GET', '/pos_users?select=id,is_active'),
        supabaseRequest('GET', '/pos_companies?select=id,plan,is_active'),
        supabaseRequest('GET', '/pos_sales?select=total,created_at'),
        supabaseRequest('GET', '/pos_products?select=id,stock'),
        supabaseRequest('GET', '/customers?select=id,active'),
      ]);

      const totalRevenue = (sales || []).reduce((s, x) => s + parseFloat(x.total || 0), 0);
      const activeUsers = (users || []).filter(u => u.is_active).length;
      const activeTenants = (companies || []).filter(c => c.is_active).length;
      const lowStock = (products || []).filter(p => (p.stock || 0) < 20).length;

      // MRR cálculo
      const planPrices = { trial: 0, free: 0, pro: 799, enterprise: 1499 };
      const mrr = (companies || [])
        .filter(c => c.is_active)
        .reduce((s, c) => s + (planPrices[c.plan] || 0), 0);

      sendJSON(res, {
        ok: true,
        metrics: {
          total_users: (users || []).length,
          active_users: activeUsers,
          total_tenants: (companies || []).length,
          active_tenants: activeTenants,
          total_sales: (sales || []).length,
          total_revenue: totalRevenue,
          total_products: (products || []).length,
          low_stock_count: lowStock,
          total_customers: (customers || []).length,
          active_customers: (customers || []).filter(c => c.active).length,
          mrr: mrr,
          arr: mrr * 12,
        },
        sales_by_day: (sales || []).slice(0, 30),
        top_tenants: (companies || []).slice(0, 5),
      });
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'GET /api/owner/tenants': async (req, res) => {
    try {
      const companies = await supabaseRequest('GET', '/pos_companies?select=*&order=created_at.desc');
      sendJSON(res, companies || []);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'GET /api/owner/users': async (req, res) => {
    try {
      const users = await supabaseRequest('GET', '/pos_users?select=id,email,role,is_active,plan,full_name,phone,company_id,last_login_at,created_at&order=created_at.desc&limit=100');
      sendJSON(res, users || []);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'POST /api/owner/users': async (req, res) => {
    try {
      const body = await readBody(req);
      const result = await supabaseRequest('POST', '/pos_users', {
        email: body.email, password_hash: body.password || 'changeme',
        role: body.role || 'USER', is_active: body.is_active !== false,
        plan: body.plan || 'trial', full_name: body.full_name,
        phone: body.phone, company_id: body.company_id,
        notes: JSON.stringify(body.notes || {})
      });
      sendJSON(res, result[0] || result);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'GET /api/owner/sales-report': async (req, res) => {
    try {
      const report = await supabaseRequest('GET', '/daily_sales_report?select=*&order=sale_date.desc&limit=30');
      sendJSON(res, report || []);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'GET /api/owner/licenses': async (req, res) => {
    try {
      const licenses = await supabaseRequest('GET', '/licenses?select=*&order=created_at.desc&limit=100');
      sendJSON(res, licenses || []);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'POST /api/owner/licenses': async (req, res) => {
    try {
      const body = await readBody(req);
      const result = await supabaseRequest('POST', '/licenses', {
        license_key: body.license_key || ('LIC-' + Date.now()),
        machine_name: body.machine_name, platform: body.platform,
        restaurant_id: body.restaurant_id, restaurant_name: body.restaurant_name,
        is_active: true, notes: body.notes
      });
      sendJSON(res, result[0] || result);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'GET /api/owner/domains': async (req, res) => {
    try {
      const domains = await supabaseRequest('GET', '/domains?select=*&order=created_at.desc');
      sendJSON(res, domains || []);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'GET /api/owner/billing': async (req, res) => {
    try {
      const billing = await supabaseRequest('GET', '/billing_configs?select=*&order=created_at.desc&limit=100');
      sendJSON(res, billing || []);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'GET /api/owner/low-stock': async (req, res) => {
    try {
      const products = await supabaseRequest('GET',
        '/pos_products?select=id,code,name,stock,price&order=stock.asc&limit=50');
      const lowStock = (products || []).filter(p => (p.stock || 0) < 20);
      sendJSON(res, lowStock);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'GET /api/owner/sync-queue': async (req, res) => {
    try {
      const queue = await supabaseRequest('GET', '/sync_queue?select=*&order=created_at.desc&limit=100');
      sendJSON(res, queue || []);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  // ============ MARKETPLACE / FEATURES ============
  'GET /api/features': async (req, res) => {
    sendJSON(res, [
      { id: 'FEAT-0001', name: 'Cobrar ticket', module: 'pos', status: 'stable', usage: 1843, price: 0 },
      { id: 'FEAT-0002', name: 'Agregar producto por código', module: 'pos', status: 'stable', usage: 1843, price: 0 },
      { id: 'FEAT-0030', name: 'Corte de caja estándar', module: 'corte', status: 'stable', usage: 1843, price: 0 },
      { id: 'FEAT-0050', name: 'Factura CFDI 4.0', module: 'facturacion', status: 'stable', usage: 892, price: 99 },
      { id: 'FEAT-0080', name: 'Comanda a cocina (KDS)', module: 'restaurante', status: 'stable', usage: 347, price: 199 },
      { id: 'FEAT-0120', name: 'Control de colegiaturas', module: 'educacion', status: 'stable', usage: 48, price: 299 },
      { id: 'FEAT-0150', name: 'Diseñador drag-and-drop etiquetas', module: 'etiquetas', status: 'stable', usage: 234, price: 0 },
      { id: 'FEAT-0240', name: 'Envío de ticket a WhatsApp', module: 'pos', status: 'new', usage: 23, price: 49, createdByAI: true },
    ]);
  },

  'POST /api/features/request': async (req, res) => {
    try {
      const body = await readBody(req);
      const { clientRequest, tenantId } = body;

      // Si Anthropic API key disponible, usa Claude para decidir
      const aiResp = await callClaude([{
        role: 'user',
        content: `Cliente pidió: "${clientRequest}". Decide si esto es una feature existente, una extensión, o nueva. Responde JSON: {"decision": "activate|extend|create", "feature_name": "...", "module": "...", "reason": "..."}`
      }], 'Eres la IA de Volvix que decide si crear features. Responde SOLO JSON.');

      let decision = { decision: 'create', feature_name: clientRequest, module: 'custom', reason: 'Auto-creado' };
      try {
        if (aiResp.content) decision = JSON.parse(aiResp.content);
      } catch {}

      const featureId = 'FEAT-' + Date.now();
      sendJSON(res, {
        ok: true,
        decision: decision.decision,
        feature: {
          id: featureId,
          name: decision.feature_name,
          module: decision.module,
          status: decision.decision === 'create' ? 'new' : 'extended',
          tenantScope: [tenantId],
          createdByAI: !aiResp.simulated,
          reason: decision.reason
        }
      });
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'POST /api/features/activate': async (req, res) => {
    try {
      const body = await readBody(req);
      sendJSON(res, {
        ok: true,
        message: `Feature ${body.featureId} activada para tenant ${body.tenantId}`,
        activated_at: Date.now()
      });
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  // ============ AI ENGINE / SUPPORT ============
  'POST /api/ai/decide': async (req, res) => {
    try {
      const body = await readBody(req);
      const result = await callClaude([{
        role: 'user',
        content: body.prompt || 'Hola'
      }], body.system || 'Eres la IA autónoma de Volvix.');
      sendJSON(res, result);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'POST /api/ai/support': async (req, res) => {
    try {
      const body = await readBody(req);
      const result = await callClaude([{
        role: 'user',
        content: body.message || 'Necesito ayuda'
      }], 'Eres soporte técnico de Volvix POS. Resuelve problemas comunes: impresoras, cortes, ventas, inventario.');
      sendJSON(res, result);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'GET /api/ai/decisions': async (req, res) => {
    sendJSON(res, [
      { id: 'DEC-001', request: 'Quiero cobrar con propinas', decision: 'extend', feature_id: 'FEAT-0001-ext', timestamp: Date.now() - 3600000 },
      { id: 'DEC-002', request: 'Necesito reporte por mesero', decision: 'create', feature_id: 'FEAT-0241', timestamp: Date.now() - 7200000 },
    ]);
  },

  // ============ TICKETS ============
  'GET /api/tickets': async (req, res) => {
    sendJSON(res, [
      { id: 'TKT-1047', tenant: 'TNT001', title: 'Impresora térmica no imprime', status: 'open', aiHandling: true, opened: Date.now() - 120000 },
      { id: 'TKT-1046', tenant: 'TNT002', title: 'Error 301 al timbrar factura', status: 'solved', solvedBy: 'ai', solvedInSec: 18, opened: Date.now() - 900000 },
    ]);
  },

  'POST /api/tickets': async (req, res) => {
    try {
      const body = await readBody(req);
      const ticketId = 'TKT-' + (1000 + Math.floor(Math.random() * 9000));

      // IA intenta resolver automáticamente
      const aiResp = await callClaude([{
        role: 'user',
        content: `Ticket: "${body.title}". Detalles: "${body.description || ''}". Si conoces solución, dala en formato JSON: {"solved": true/false, "solution": "...", "confidence": 0-100}`
      }], 'Eres soporte AI. Soluciona si es problema común.');

      let aiResult = { solved: false, solution: 'Asignado a soporte humano' };
      try { aiResult = JSON.parse(aiResp.content); } catch {}

      sendJSON(res, {
        ok: true,
        ticket: {
          id: ticketId, tenant: body.tenant_id || 'TNT001',
          title: body.title, status: aiResult.solved ? 'solved' : 'open',
          aiHandling: true,
          solution: aiResult.solution,
          opened: Date.now()
        }
      });
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  // ============ INVENTORY ============
  'GET /api/inventory': async (req, res) => {
    try {
      const products = await supabaseRequest('GET',
        '/pos_products?select=id,code,name,stock,cost,price&order=name.asc');
      sendJSON(res, products || []);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'POST /api/inventory/adjust': async (req, res) => {
    try {
      const body = await readBody(req);
      const result = await supabaseRequest('PATCH',
        `/pos_products?id=eq.${body.product_id}`, { stock: body.new_stock });
      sendJSON(res, { ok: true, result });
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  // ============ REPORTES ============
  'GET /api/reports/daily': async (req, res) => {
    try {
      const report = await supabaseRequest('GET', '/daily_sales_report?select=*&order=sale_date.desc&limit=30');
      sendJSON(res, report || []);
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  'GET /api/reports/sales': async (req, res) => {
    try {
      const sales = await supabaseRequest('GET', '/pos_sales?select=*&order=created_at.desc&limit=200');
      const total = (sales || []).reduce((s, x) => s + parseFloat(x.total || 0), 0);
      sendJSON(res, { sales: sales || [], total, count: (sales || []).length });
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  // ============ SYNC ============
  'POST /api/sync': async (req, res) => {
    const body = await readBody(req);
    const results = [];
    if (Array.isArray(body.items)) {
      for (const item of body.items) {
        try {
          if (item.type === 'sale' && item.data) {
            const r = await supabaseRequest('POST', '/pos_sales', {
              pos_user_id: item.data.user_id || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
              total: item.data.total, payment_method: item.data.payment_method || 'efectivo',
              items: item.data.items || []
            });
            results.push({ type: 'sale', success: true, id: r[0]?.id });
          } else if (item.type === 'customer' && item.data) {
            const r = await supabaseRequest('POST', '/customers', item.data);
            results.push({ type: 'customer', success: true, id: r[0]?.id });
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
        ok: true, supabase_url: SUPABASE_URL,
        anthropic_configured: !!ANTHROPIC_API_KEY,
        users_count: users?.length || 0, users: users || [],
        products_count: products?.length || 0, products: products || [],
      });
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },

  // ============ STATUS DE CABLEADO (Bitácora API) ============
  'GET /api/status': async (req, res) => {
    try {
      const filePath = findFile('/status.json');
      if (filePath) {
        const data = fs.readFileSync(filePath, 'utf8');
        sendJSON(res, JSON.parse(data));
      } else {
        sendJSON(res, { error: 'status.json not found' }, 404);
      }
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
  },
};

// =============================================================
// MATCH ROUTE WITH PARAMS (e.g., /api/products/:id)
// =============================================================
function matchRoute(method, pathname) {
  // Try exact match first
  const exact = handlers[`${method} ${pathname}`];
  if (exact) return { handler: exact, params: {} };

  // Try with params
  for (const key of Object.keys(handlers)) {
    const [m, pattern] = key.split(' ');
    if (m !== method) continue;
    const regex = pattern.replace(/:[^\/]+/g, '([^/]+)');
    const match = pathname.match(new RegExp('^' + regex + '$'));
    if (match) {
      const paramNames = (pattern.match(/:[^\/]+/g) || []).map(p => p.slice(1));
      const params = {};
      paramNames.forEach((name, i) => params[name] = match[i + 1]);
      return { handler: handlers[key], params };
    }
  }
  return null;
}

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
    const match = matchRoute(method, pathname);

    if (match) {
      try {
        await match.handler(req, res, match.params);
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
