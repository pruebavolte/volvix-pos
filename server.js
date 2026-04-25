/* ============================================================
   VOLVIX · Backend todo-en-uno
   ============================================================
   Un solo archivo que hace TODO:
   - Sirve los HTMLs del frontend
   - API REST completa (tenants, features, tickets, licencias)
   - WebSocket para sync en tiempo real + control remoto
   - SQLite local (funciona offline, sin internet)
   - Integración con Claude API para la IA autónoma
   - Auto-detecta puerto libre (si 3000 ocupado, prueba 3001, 3002...)
   - Auto-abre el navegador cuando arranca
   - Funciona igual en: tu PC, Vercel, Railway, Render, Fly.io

   USO:
     node server.js
   o:
     npm start

   VARIABLES DE ENTORNO (opcionales):
     PORT                - Puerto (default: auto-detecta)
     HOST                - Host (default: localhost)
     ANTHROPIC_API_KEY   - Para llamadas reales a Claude
     OPEN_BROWSER        - "false" para no abrir navegador
     DB_PATH             - Ruta del SQLite (default: ./db/volvix.db)
     PUBLIC_DIR          - Carpeta de archivos (default: ./public)
============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const net = require('net');
const crypto = require('crypto');
const { exec } = require('child_process');

// ============================================================
// CONFIG AUTO-DETECTADA (nada hardcodeado)
// ============================================================
const CONFIG = {
  host: process.env.HOST || 'localhost',
  preferredPort: parseInt(process.env.PORT) || 3000,
  publicDir: path.resolve(process.env.PUBLIC_DIR || '.'),
  dbPath: path.resolve(process.env.DB_PATH || './db/volvix.db'),
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  openBrowser: process.env.OPEN_BROWSER !== 'false',
  isProduction: process.env.NODE_ENV === 'production' || !!process.env.VERCEL || !!process.env.RAILWAY_ENVIRONMENT,
};

// ============================================================
// STORAGE LAYER · JSON-based (sin dependencias externas)
// Si instalas `better-sqlite3`, cambia a SQLite real.
// Por defecto usa archivos JSON (cero dependencias = arranca en 0 seg)
// ============================================================
class Store {
  constructor(dbPath) {
    this.dbDir = path.dirname(dbPath);
    this.dbFile = dbPath + '.json';
    if (!fs.existsSync(this.dbDir)) fs.mkdirSync(this.dbDir, { recursive: true });
    this.load();
  }
  load() {
    try {
      this.data = JSON.parse(fs.readFileSync(this.dbFile, 'utf8'));
    } catch {
      this.data = this._seed();
      this.save();
    }
  }
  save() {
    fs.writeFileSync(this.dbFile, JSON.stringify(this.data, null, 2));
  }
  _seed() {
    return {
      tenants: [
        { id: 'TNT001', name: 'Abarrotes Don Chucho', giro: 'abarrotes', plan: 'pro', status: 'active', mrr: 799, created: Date.now() - 86400000*45 },
        { id: 'TNT002', name: 'Restaurante Los Compadres', giro: 'restaurante', plan: 'enterprise', status: 'active', mrr: 1499, created: Date.now() - 86400000*30 },
        { id: 'TNT003', name: 'BarberShop Ruiz', giro: 'barberia', plan: 'pro', status: 'active', mrr: 799, created: Date.now() - 86400000*12 },
      ],
      features: [
        { id: 'FEAT-0001', name: 'Cobrar ticket', module: 'pos', status: 'stable', usage: 1843, created: Date.now() - 86400000*365 },
        { id: 'FEAT-0002', name: 'Agregar producto por código', module: 'pos', status: 'stable', usage: 1843, created: Date.now() - 86400000*365 },
        { id: 'FEAT-0030', name: 'Corte de caja estándar', module: 'corte', status: 'stable', usage: 1843, created: Date.now() - 86400000*365 },
        { id: 'FEAT-0031', name: 'Corte · campo temperatura', module: 'corte', status: 'extended', parent: 'FEAT-0030', usage: 1, created: Date.now() - 3600000*3 },
        { id: 'FEAT-0050', name: 'Factura CFDI 4.0', module: 'facturacion', status: 'stable', usage: 892, created: Date.now() - 86400000*200 },
        { id: 'FEAT-0080', name: 'Comanda a cocina (KDS)', module: 'restaurante', status: 'stable', usage: 347, created: Date.now() - 86400000*200 },
        { id: 'FEAT-0120', name: 'Control de colegiaturas', module: 'educacion', status: 'stable', usage: 48, created: Date.now() - 86400000*180 },
        { id: 'FEAT-0150', name: 'Diseñador drag-and-drop etiquetas', module: 'etiquetas', status: 'stable', usage: 234, created: Date.now() - 86400000*120 },
        { id: 'FEAT-0240', name: 'Envío de ticket a WhatsApp automático', module: 'pos', status: 'new', usage: 23, createdByAI: true, created: Date.now() - 86400000*3 },
      ],
      tickets: [
        { id: 'TKT-1047', tenant: 'TNT001', title: 'Impresora térmica no imprime', status: 'open', aiHandling: true, opened: Date.now() - 120000 },
        { id: 'TKT-1046', tenant: 'TNT002', title: 'Error 301 al timbrar factura', status: 'solved', solvedBy: 'ai', solvedInSec: 18, opened: Date.now() - 900000 },
      ],
      knowledge: [
        { id: 'KB-001', problem: 'Impresora térmica Epson TM-T20III no imprime', cases: 47, mostCommonFix: 'Cambio de puerto USB003 → USB001', successRate: 0.89, avgTimeSec: 52 },
        { id: 'KB-002', problem: 'Error 301 al timbrar factura', cases: 23, mostCommonFix: 'Renovar certificado SAT', successRate: 1.00, avgTimeSec: 18 },
        { id: 'KB-003', problem: 'Báscula bluetooth no conecta', cases: 8, mostCommonFix: 'Reemparejar + driver v2.1', successRate: 0.75, avgTimeSec: 252 },
      ],
      features_custom: [],
      licenses: [],
      ai_decisions: [],
      remote_sessions: [],
      users: [
        { id: 'USR001', email: 'admin@volvix.test', password: 'Volvix2026!', role: 'superadmin', tenant_id: 'TNT001', status: 'active', created: Date.now() - 86400000*365 },
        { id: 'USR002', email: 'owner@volvix.test', password: 'Volvix2026!', role: 'owner', tenant_id: 'TNT002', status: 'active', created: Date.now() - 86400000*90 },
        { id: 'USR003', email: 'cajero@volvix.test', password: 'Volvix2026!', role: 'cajero', tenant_id: 'TNT001', status: 'active', created: Date.now() - 86400000*30 },
      ],
    };
  }
  // CRUD helpers
  all(table) { return this.data[table] || []; }
  find(table, id) { return (this.data[table] || []).find(x => x.id === id); }
  insert(table, obj) {
    if (!this.data[table]) this.data[table] = [];
    this.data[table].push(obj);
    this.save();
    return obj;
  }
  update(table, id, patch) {
    const item = this.find(table, id);
    if (item) { Object.assign(item, patch); this.save(); }
    return item;
  }
  delete(table, id) {
    this.data[table] = (this.data[table] || []).filter(x => x.id !== id);
    this.save();
  }
}

const store = new Store(CONFIG.dbPath);

// ============================================================
// INTEGRACIÓN CON CLAUDE API (llamadas reales si hay API key)
// ============================================================
async function callClaude(messages, system) {
  if (!CONFIG.apiKey) {
    // Sin API key: devuelve respuesta simulada educativa
    return {
      simulated: true,
      content: 'Modo simulación activo. Configura ANTHROPIC_API_KEY en las variables de entorno para llamadas reales a Claude.',
    };
  }

  const https = require('https');
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      messages: messages || [{ role: 'user', content: 'Hola' }],
      system: system || 'Eres la IA autónoma de Volvix. Decides si activar, extender o crear features.',
    });
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.apiKey,
        'anthropic-version': '2023-06-01',
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
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

// ============================================================
// AI ENGINE · Decide si activar, extender o crear un feature
// ============================================================
async function aiDecide(clientRequest, tenantId) {
  const features = store.all('features');
  const req = (clientRequest || '').toLowerCase();

  // Búsqueda simple por palabras clave (en producción sería vector search)
  let bestMatch = null;
  let bestScore = 0;
  for (const f of features) {
    const fname = (f.name || '').toLowerCase();
    const words = fname.split(' ');
    let score = 0;
    for (const w of words) {
      if (w.length > 3 && req.includes(w)) score += w.length;
    }
    if (score > bestScore) { bestScore = score; bestMatch = f; }
  }

  let decision, created;
  if (bestScore >= 20) {
    // Match fuerte: activar
    decision = 'activate';
    created = bestMatch;
  } else if (bestScore >= 8) {
    // Match parcial: extender
    decision = 'extend';
    const newId = 'FEAT-' + String(features.length + 240).padStart(4, '0');
    created = {
      id: newId,
      name: `${bestMatch.name} · extensión solicitada`,
      module: bestMatch.module,
      status: 'extended',
      parent: bestMatch.id,
      tenantScope: [tenantId],
      usage: 1,
      createdByAI: true,
      origRequest: clientRequest,
      created: Date.now(),
    };
    store.insert('features', created);
  } else {
    // No match: crear nuevo
    decision = 'create';
    const newId = 'FEAT-' + String(features.length + 240).padStart(4, '0');
    created = {
      id: newId,
      name: clientRequest.slice(0, 60),
      module: 'custom',
      status: 'new',
      usage: 1,
      createdByAI: true,
      origRequest: clientRequest,
      created: Date.now(),
    };
    store.insert('features', created);
  }

  // Registrar la decisión
  store.insert('ai_decisions', {
    id: 'DEC-' + Date.now(),
    tenant: tenantId,
    request: clientRequest,
    decision,
    featureId: created?.id,
    score: bestScore,
    timestamp: Date.now(),
  });

  return { decision, feature: created, score: bestScore };
}

// ============================================================
// WEBSOCKET MINIMAL (para sync en vivo y control remoto)
// Implementación propia sin deps externas
// ============================================================
const wsClients = new Set();

function wsAccept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) return socket.end();
  const hash = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + hash + '\r\n\r\n'
  );
  socket.on('data', (buf) => wsHandleFrame(socket, buf));
  socket.on('close', () => wsClients.delete(socket));
  socket.on('error', () => wsClients.delete(socket));
  wsClients.add(socket);
  wsSend(socket, JSON.stringify({ type: 'welcome', time: Date.now() }));
}

function wsHandleFrame(socket, buf) {
  try {
    const byte2 = buf[1];
    let len = byte2 & 127;
    let offset = 2;
    if (len === 126) { len = buf.readUInt16BE(2); offset = 4; }
    else if (len === 127) { len = Number(buf.readBigUInt64BE(2)); offset = 10; }
    const masked = (byte2 & 128) === 128;
    let data;
    if (masked) {
      const mask = buf.slice(offset, offset + 4);
      offset += 4;
      data = Buffer.alloc(len);
      for (let i = 0; i < len; i++) data[i] = buf[offset + i] ^ mask[i % 4];
    } else {
      data = buf.slice(offset, offset + len);
    }
    const msg = JSON.parse(data.toString('utf8'));
    wsBroadcast(msg, socket);
  } catch {}
}

function wsSend(socket, text) {
  const payload = Buffer.from(text, 'utf8');
  let header;
  if (payload.length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; header[1] = payload.length;
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  try { socket.write(Buffer.concat([header, payload])); } catch {}
}

function wsBroadcast(msg, except) {
  const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
  for (const c of wsClients) {
    if (c === except) continue;
    wsSend(c, text);
  }
}

// ============================================================
// API REST · /api/*
// ============================================================
const api = {
  // =============== CONFIG ===============
  'GET /api/config': (req, res) => {
    json(res, {
      version: '7.0.0',
      isProduction: CONFIG.isProduction,
      hasAI: !!CONFIG.apiKey,
      features: store.all('features').length,
      tenants: store.all('tenants').length,
      tickets: store.all('tickets').length,
    });
  },
  'GET /api/health': (req, res) => json(res, { ok: true, time: Date.now() }),

  // =============== AUTH ===============
  'POST /api/login': async (req, res) => {
    try {
      const body = await readBody(req);
      const { email, password } = body;

      if (!email || !password) {
        return json(res, { error: 'Email y contraseña requeridos' }, 400);
      }

      // Buscar usuario
      const user = store.all('users').find(u => u.email === email && u.password === password);
      if (!user) {
        return json(res, { error: 'Credenciales inválidas' }, 401);
      }

      // Obtener datos del tenant
      const tenant = store.find('tenants', user.tenant_id);

      // Construir sesión
      const session = {
        user_id: user.id,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id,
        tenant_name: tenant?.name || 'Mi Negocio',
        expires_at: Date.now() + (3600 * 1000), // 1 hora
        plan: tenant?.plan || 'free',
      };

      json(res, { ok: true, session });
    } catch (err) {
      json(res, { error: 'Error en login' }, 500);
    }
  },

  // =============== TENANTS ===============
  'GET /api/tenants': (req, res) => json(res, store.all('tenants')),
  'GET /api/tenants/:id': (req, res, params) => {
    const t = store.find('tenants', params.id);
    t ? json(res, t) : json(res, { error: 'not found' }, 404);
  },
  'POST /api/tenants': async (req, res) => {
    const body = await readBody(req);
    const tenant = {
      id: 'TNT' + String(store.all('tenants').length + 1).padStart(3, '0'),
      ...body,
      status: 'active',
      created: Date.now(),
    };
    store.insert('tenants', tenant);
    wsBroadcast({ type: 'tenant:created', tenant });
    json(res, tenant);
  },
  'PATCH /api/tenants/:id': async (req, res, params) => {
    const body = await readBody(req);
    const t = store.update('tenants', params.id, body);
    wsBroadcast({ type: 'tenant:updated', id: params.id });
    json(res, t);
  },

  // =============== FEATURES ===============
  'GET /api/features': (req, res) => {
    const q = url.parse(req.url, true).query;
    let features = store.all('features');
    if (q.status) features = features.filter(f => f.status === q.status);
    if (q.module) features = features.filter(f => f.module === q.module);
    json(res, features);
  },
  'POST /api/features/request': async (req, res) => {
    // EL CORAZÓN DE LA AUTO-EVOLUCIÓN
    // Cliente pide algo → IA decide qué hacer
    const body = await readBody(req);
    const { clientRequest, tenantId } = body;
    const result = await aiDecide(clientRequest, tenantId);
    wsBroadcast({ type: 'ai:decision', ...result });
    json(res, result);
  },

  // =============== TICKETS ===============
  'GET /api/tickets': (req, res) => json(res, store.all('tickets')),
  'POST /api/tickets': async (req, res) => {
    const body = await readBody(req);
    const ticket = {
      id: 'TKT-' + (1000 + store.all('tickets').length),
      ...body,
      status: 'open',
      aiHandling: true,
      opened: Date.now(),
    };
    store.insert('tickets', ticket);

    // Buscar en knowledge base si hay solución conocida
    const knowledge = store.all('knowledge');
    const related = knowledge.find(k =>
      body.title && k.problem.toLowerCase().split(' ').some(w => w.length > 4 && body.title.toLowerCase().includes(w))
    );

    wsBroadcast({ type: 'ticket:new', ticket, knowledgeMatch: related });
    json(res, { ticket, knowledgeMatch: related });
  },
  'POST /api/tickets/:id/resolve': async (req, res, params) => {
    const body = await readBody(req);
    const ticket = store.update('tickets', params.id, {
      status: 'solved',
      solvedBy: body.solvedBy || 'ai',
      solvedInSec: body.solvedInSec,
      solution: body.solution,
      solvedAt: Date.now(),
    });

    // Si se resolvió, actualizar knowledge base (aprendizaje)
    if (body.solution && body.problem) {
      const kb = store.all('knowledge').find(k => k.problem.toLowerCase() === body.problem.toLowerCase());
      if (kb) {
        kb.cases++;
        kb.avgTimeSec = Math.round((kb.avgTimeSec * (kb.cases - 1) + body.solvedInSec) / kb.cases);
        store.save();
      } else {
        store.insert('knowledge', {
          id: 'KB-' + String(store.all('knowledge').length + 1).padStart(3, '0'),
          problem: body.problem,
          cases: 1,
          mostCommonFix: body.solution,
          successRate: 1.0,
          avgTimeSec: body.solvedInSec,
        });
      }
    }

    wsBroadcast({ type: 'ticket:resolved', ticket });
    json(res, ticket);
  },

  // =============== KNOWLEDGE BASE ===============
  'GET /api/knowledge': (req, res) => json(res, store.all('knowledge')),
  'GET /api/knowledge/search': (req, res) => {
    const q = (url.parse(req.url, true).query.q || '').toLowerCase();
    const results = store.all('knowledge').filter(k =>
      k.problem.toLowerCase().includes(q)
    ).sort((a, b) => b.cases - a.cases);
    json(res, results);
  },

  // =============== REMOTE CONTROL ===============
  'POST /api/remote/start': async (req, res) => {
    const body = await readBody(req);
    const code = 'VX-' + Math.floor(1000 + Math.random() * 9000);
    const session = {
      id: code,
      tenantId: body.tenantId,
      agentId: body.agentId || 'AI-47B2',
      status: 'waiting',
      expiresAt: Date.now() + 10 * 60 * 1000,
      recordingActive: true,
    };
    store.insert('remote_sessions', session);
    wsBroadcast({ type: 'remote:started', code });
    json(res, { code, session });
  },
  'POST /api/remote/connect': async (req, res) => {
    const body = await readBody(req);
    const session = store.find('remote_sessions', body.code);
    if (!session) return json(res, { error: 'invalid code' }, 404);
    if (session.expiresAt < Date.now()) return json(res, { error: 'expired' }, 410);
    store.update('remote_sessions', body.code, { status: 'connected', connectedAt: Date.now() });
    wsBroadcast({ type: 'remote:connected', code: body.code });
    json(res, { ok: true, session });
  },

  // =============== AI CHAT ===============
  'POST /api/ai/chat': async (req, res) => {
    const body = await readBody(req);
    const result = await callClaude(
      body.messages || [{ role: 'user', content: body.message }],
      body.system
    );
    json(res, result);
  },

  // =============== STATS ===============
  'GET /api/stats': (req, res) => {
    const tenants = store.all('tenants');
    const features = store.all('features');
    const tickets = store.all('tickets');
    json(res, {
      tenants: { total: tenants.length, active: tenants.filter(t => t.status === 'active').length },
      features: {
        total: features.length,
        stable: features.filter(f => f.status === 'stable').length,
        extended: features.filter(f => f.status === 'extended').length,
        new: features.filter(f => f.status === 'new').length,
        autoCreated: features.filter(f => f.createdByAI).length,
      },
      tickets: {
        total: tickets.length,
        open: tickets.filter(t => t.status === 'open').length,
        solved: tickets.filter(t => t.status === 'solved').length,
        solvedByAI: tickets.filter(t => t.solvedBy === 'ai').length,
      },
      mrr: tenants.reduce((s, t) => s + (t.mrr || 0), 0),
    });
  },
};

// ============================================================
// ROUTER
// ============================================================
function matchRoute(method, pathname) {
  // Busca ruta exacta primero
  const exact = api[`${method} ${pathname}`];
  if (exact) return { handler: exact, params: {} };

  // Busca rutas con parámetros
  for (const key of Object.keys(api)) {
    const [m, p] = key.split(' ');
    if (m !== method) continue;
    const pattern = p.replace(/:(\w+)/g, '(?<$1>[^/]+)');
    const match = pathname.match(new RegExp('^' + pattern + '$'));
    if (match) return { handler: api[key], params: match.groups || {} };
  }
  return null;
}

// ============================================================
// HELPERS
// ============================================================
function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => data += c);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res, pathname) {
  // Si el cliente pide /, servir index.html o volvix_owner_panel_v7.html
  if (pathname === '/') {
    pathname = '/index.html';
    if (!fs.existsSync(path.join(CONFIG.publicDir, 'index.html'))) {
      pathname = '/volvix_owner_panel_v7.html';
    }
  }
  const filepath = path.join(CONFIG.publicDir, pathname);

  // Seguridad: que no salga del publicDir
  if (!filepath.startsWith(CONFIG.publicDir)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  if (!fs.existsSync(filepath) || fs.statSync(filepath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    return res.end('<h1>404 — archivo no encontrado</h1><p>Buscabas: ' + pathname + '</p><p><a href="/">← Volver al panel</a></p>');
  }
  const ext = path.extname(filepath);
  const mime = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filepath).pipe(res);
}

// ============================================================
// HTTP SERVER
// ============================================================
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url);
  const pathname = parsed.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    });
    return res.end();
  }

  // API routes
  if (pathname.startsWith('/api/')) {
    const match = matchRoute(req.method, pathname);
    if (match) {
      try { await match.handler(req, res, match.params); }
      catch (err) { json(res, { error: err.message }, 500); }
      return;
    }
    return json(res, { error: 'endpoint not found' }, 404);
  }

  // Static
  serveStatic(req, res, pathname);
});

// WebSocket upgrade
server.on('upgrade', (req, socket) => {
  if (req.headers['upgrade'] === 'websocket') wsAccept(req, socket);
  else socket.end();
});

// ============================================================
// AUTO-DETECTAR PUERTO LIBRE
// ============================================================
function findFreePort(start) {
  return new Promise((resolve) => {
    const test = (port) => {
      const s = net.createServer();
      s.once('error', () => test(port + 1));
      s.once('listening', () => {
        s.close(() => resolve(port));
      });
      s.listen(port, CONFIG.host);
    };
    test(start);
  });
}

// ============================================================
// AUTO-ABRIR NAVEGADOR
// ============================================================
function openBrowser(url) {
  if (!CONFIG.openBrowser || CONFIG.isProduction) return;
  const cmd = process.platform === 'win32' ? `start "" "${url}"` :
              process.platform === 'darwin' ? `open "${url}"` :
              `xdg-open "${url}"`;
  exec(cmd, () => {});
}

// ============================================================
// ARRANQUE
// ============================================================
(async () => {
  const port = CONFIG.isProduction
    ? (process.env.PORT || 3000)
    : await findFreePort(CONFIG.preferredPort);

  server.listen(port, CONFIG.host, () => {
    const baseUrl = `http://${CONFIG.host}:${port}`;
    console.log('');
    console.log('\x1b[33m╔════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[33m║                                                        ║\x1b[0m');
    console.log('\x1b[33m║                    🧠  VOLVIX SaaS                     ║\x1b[0m');
    console.log('\x1b[33m║              Backend + Frontend · v7.0.0               ║\x1b[0m');
    console.log('\x1b[33m║                                                        ║\x1b[0m');
    console.log('\x1b[33m╚════════════════════════════════════════════════════════╝\x1b[0m');
    console.log('');
    console.log('  \x1b[32m✓\x1b[0m Servidor arriba en: \x1b[36m' + baseUrl + '\x1b[0m');
    console.log('  \x1b[32m✓\x1b[0m Archivos servidos desde: ' + CONFIG.publicDir);
    console.log('  \x1b[32m✓\x1b[0m Base de datos: ' + CONFIG.dbPath + '.json');
    console.log('  \x1b[32m✓\x1b[0m WebSocket activo (sync en vivo)');
    console.log('  ' + (CONFIG.apiKey ? '\x1b[32m✓\x1b[0m IA real (Claude API)' : '\x1b[33m⚠\x1b[0m IA simulada (sin ANTHROPIC_API_KEY)'));
    console.log('');
    console.log('  \x1b[1mAbre estas rutas en el navegador:\x1b[0m');
    console.log('    • ' + baseUrl + '/volvix_owner_panel_v7.html  \x1b[90m(panel dueño)\x1b[0m');
    console.log('    • ' + baseUrl + '/marketplace.html               \x1b[90m(cliente final)\x1b[0m');
    console.log('    • ' + baseUrl + '/volvix_ai_engine.html          \x1b[90m(motor IA)\x1b[0m');
    console.log('    • ' + baseUrl + '/api/health                     \x1b[90m(prueba API)\x1b[0m');
    console.log('');
    console.log('  \x1b[90mPara detener: Ctrl+C\x1b[0m');
    console.log('');

    openBrowser(baseUrl + '/volvix_owner_panel_v7.html');
  });
})();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\x1b[33mCerrando Volvix...\x1b[0m');
  store.save();
  server.close(() => process.exit(0));
});
