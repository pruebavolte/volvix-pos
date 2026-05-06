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
  publicDir: path.resolve(process.env.PUBLIC_DIR || './public'),
  dbPath: path.resolve(process.env.DB_PATH || './db/volvix.db'),
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  openBrowser: process.env.OPEN_BROWSER !== 'false',
  isProduction: process.env.NODE_ENV === 'production' || !!process.env.VERCEL || !!process.env.RAILWAY_ENVIRONMENT,
};

// ============================================================
// SEED USERS LOADER (DEV-ONLY)
// Carga los usuarios semilla desde env var, NUNCA desde código.
// En prod los usuarios viven en Supabase (tabla pos_users).
// Setear SEED_USERS_JSON='[{"id":"USR001","email":"...","password":"...","role":"...","tenant_id":"...","status":"active"}]'
// o DEV_PASSWORDS_JSON='{"admin@volvix.test":"...","owner@volvix.test":"...","cajero@volvix.test":"..."}'
// ============================================================
function _loadSeedUsers() {
  // Prioridad 1: SEED_USERS_JSON (array completo)
  if (process.env.SEED_USERS_JSON) {
    try {
      const parsed = JSON.parse(process.env.SEED_USERS_JSON);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      console.warn('[seed] SEED_USERS_JSON inválido:', e.message);
    }
  }
  // Prioridad 2: DEV_PASSWORDS_JSON (mapa email -> password) — DEV-ONLY
  const devPwMap = (() => {
    try { return JSON.parse(process.env.DEV_PASSWORDS_JSON || '{}'); }
    catch { return {}; }
  })();
  const mkUser = (id, email, role, tenant_id, ageDays) => ({
    id, email,
    password: devPwMap[email] || '',  // vacío si no hay env -> login fallará intencionalmente
    role, tenant_id, status: 'active',
    created: Date.now() - 86400000 * ageDays,
  });
  // DEV-ONLY: si no hay env vars, los users semilla quedan SIN password (login falla en local sin config)
  return [
    mkUser('USR001', 'admin@volvix.test',  'superadmin', 'TNT001', 365),
    mkUser('USR002', 'owner@volvix.test',  'owner',     'TNT002', 90),
    mkUser('USR003', 'cajero@volvix.test', 'cajero',    'TNT001', 30),
  ];
}

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
      users: _loadSeedUsers(),
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
// SESSIONS (in-memory) + role/auth helpers
// ============================================================
const _sessions = new Map(); // token -> { user_id, role, tenant_id, email, expires_at }
function _newToken() { return crypto.randomBytes(24).toString('hex'); }
function _getSession(req) {
  const h = req.headers['authorization'] || '';
  const m = /^Bearer\s+([a-f0-9]+)$/i.exec(h);
  if (!m) return null;
  const s = _sessions.get(m[1]);
  if (!s) return null;
  if (s.expires_at && s.expires_at < Date.now()) { _sessions.delete(m[1]); return null; }
  return s;
}
function requireRole(roles) {
  return (handler) => async (req, res, params) => {
    const s = _getSession(req);
    if (!s) return json(res, { ok: false, error: 'unauthorized' }, 401);
    if (roles && roles.length && !roles.includes(s.role)) {
      return json(res, { ok: false, error: 'forbidden', need: roles, have: s.role }, 403);
    }
    req.session = s;
    return handler(req, res, params);
  };
}
// Reports helpers: range parsing + validation
function _parseRange(q) {
  const now = Date.now();
  const to = q.to ? new Date(q.to) : new Date(now);
  const from = q.from ? new Date(q.from) : new Date(now - 30 * 86400000);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return { error: 'invalid date' };
  if (from.getTime() > to.getTime()) return { error: 'inverted_range', from: from.toISOString(), to: to.toISOString() };
  const ONE_YEAR = 366 * 86400000;
  let limited = false;
  let actualFrom = from;
  if (to.getTime() - from.getTime() > ONE_YEAR) {
    actualFrom = new Date(to.getTime() - ONE_YEAR);
    limited = true;
  }
  return { from: actualFrom.toISOString(), to: to.toISOString(), limited };
}
function reportSafe(buildExtra) {
  return requireRole(['admin', 'owner', 'superadmin'])((req, res) => {
    try {
      const q = url.parse(req.url, true).query || {};
      const r = _parseRange(q);
      if (r.error === 'inverted_range') {
        return json(res, { ok: false, error: 'inverted_range', from: r.from, to: r.to }, 400);
      }
      if (r.error) return json(res, { ok: false, error: r.error }, 400);
      const tenant_id = req.session.tenant_id;
      const extra = (typeof buildExtra === 'function')
        ? buildExtra({ req, q, range: r, tenant_id })
        : (buildExtra || {});
      const payload = {
        ok: true,
        tenant_id,
        period: { from: r.from, to: r.to },
        items: [], data: [], total: 0,
        note: 'pending mv refresh',
        generated_at: Date.now(),
        ...extra,
      };
      if (r.limited) payload.range_limited = true;
      json(res, payload);
    } catch (err) {
      try {
        json(res, { ok: true, items: [], data: [], note: 'fallback after error: ' + (err && err.message || 'unknown') });
      } catch (_) {}
    }
  });
}

// ============================================================
// SUPABASE REST HELPER (lecturas reales para reportes)
// ============================================================
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '').replace(/\\n$/, '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '').replace(/\\n$/, '').trim();
function _sbReq(method, path, body) {
  return new Promise((resolve, reject) => {
    if (!SUPABASE_URL || !SUPABASE_KEY) return reject(new Error('SUPABASE_NOT_CONFIGURED'));
    const https = require('https');
    const u = new URL(SUPABASE_URL + '/rest/v1' + path);
    const data = body ? JSON.stringify(body) : null;
    const r = https.request({
      hostname: u.hostname, path: u.pathname + (u.search || ''), method,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (resp) => {
      let buf = '';
      resp.on('data', (c) => (buf += c));
      resp.on('end', () => {
        if (resp.statusCode >= 400) return reject(new Error(`SB ${resp.statusCode}: ${buf.slice(0, 200)}`));
        try { resolve(JSON.parse(buf || '[]')); } catch { resolve([]); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

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
      // Issue bearer token for API role checks
      const token = _newToken();
      _sessions.set(token, session);
      session.token = token;

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

  // =============== OWNER PANEL (Slice 07) ===============
  // Métricas globales para el dashboard del dueño
  'GET /api/owner/dashboard': async (req, res) => {
    // R26: lectura REAL contra Supabase (pos_users, pos_companies, pos_sales,
    // pos_products, customers). Si Supabase falla, fallback graceful al store local.
    try {
      const [users, companies, sales, products, customers] = await Promise.all([
        _sbReq('GET', '/pos_users?select=id,is_active,role'),
        _sbReq('GET', '/pos_companies?select=id,plan,is_active,name').catch(() => []),
        _sbReq('GET', '/pos_sales?select=total,created_at'),
        _sbReq('GET', '/pos_products?select=id,stock,cost'),
        _sbReq('GET', '/customers?select=id,active').catch(() => []),
      ]);
      const totalRevenue = (sales || []).reduce((s, x) => s + parseFloat(x.total || 0), 0);
      const planPrices = { trial: 0, free: 0, pro: 799, enterprise: 1499 };
      const activeCompanies = (companies || []).filter(c => c.is_active);
      const mrr = activeCompanies.reduce((s, c) => s + (planPrices[c.plan] || 0), 0);
      // sales_chart: agrupar últimos 7 días por fecha
      const today = new Date();
      const days = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
        days[d] = 0;
      }
      (sales || []).forEach(s => {
        const d = (s.created_at || '').slice(0, 10);
        if (d in days) days[d] += parseFloat(s.total || 0);
      });
      const sales_chart = Object.entries(days).map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 }));
      return json(res, {
        ok: true,
        metrics: {
          total_users: (users || []).length,
          active_users: (users || []).filter(u => u.is_active).length,
          total_tenants: (companies || []).length,
          active_tenants: activeCompanies.length,
          total_sales: (sales || []).length,
          total_revenue: Math.round(totalRevenue * 100) / 100,
          total_products: (products || []).length,
          low_stock_count: (products || []).filter(p => (p.stock || 0) < 20).length,
          total_customers: (customers || []).length,
          active_customers: (customers || []).filter(c => c.active).length,
          mrr,
          arr: mrr * 12,
        },
        sales_chart,
        top_tenants: activeCompanies.slice(0, 5).map(c => ({ id: c.id, name: c.name, plan: c.plan })),
        generated_at: Date.now(),
        source: 'supabase',
      });
    } catch (err) {
      // Fallback graceful — datos locales solo si Supabase no responde
      const tenants = store.all('tenants');
      const users = store.all('users');
      const tickets = store.all('tickets');
      const mrr = tenants.reduce((s, t) => s + (t.mrr || 0), 0);
      return json(res, {
        ok: true,
        metrics: {
          total_tenants: tenants.length,
          active_tenants: tenants.filter(t => t.status === 'active').length,
          total_users: users.length,
          open_tickets: tickets.filter(t => t.status === 'open').length,
          mrr, arr: mrr * 12,
        },
        sales_chart: [], top_tenants: [],
        generated_at: Date.now(),
        source: 'fallback_local',
        note: 'Supabase no disponible: ' + (err && err.message || 'unknown'),
      });
    }
  },

  // Lista todos los tenants (para owner)
  'GET /api/owner/tenants': (req, res) => {
    json(res, { ok: true, tenants: store.all('tenants') });
  },

  // Crea un nuevo tenant
  'POST /api/owner/tenants': async (req, res) => {
    const body = await readBody(req);
    if (!body.name) return json(res, { ok: false, error: 'name requerido' }, 400);
    const t = {
      id: 'TNT' + String(Date.now()).slice(-6),
      name: body.name,
      giro: body.giro || 'general',
      plan: body.plan || 'free',
      status: 'active',
      mrr: body.mrr || 0,
      created: Date.now(),
    };
    store.insert('tenants', t);
    json(res, { ok: true, tenant: t }, 201);
  },

  // Pausar / reactivar un tenant
  'PATCH /api/owner/tenants/:id': async (req, res, params) => {
    const body = await readBody(req);
    const allowed = {};
    if (body.status) allowed.status = body.status;
    if (body.plan) allowed.plan = body.plan;
    if (typeof body.mrr === 'number') allowed.mrr = body.mrr;
    const t = store.update('tenants', params.id, allowed);
    if (!t) return json(res, { ok: false, error: 'tenant no encontrado' }, 404);
    json(res, { ok: true, tenant: t });
  },

  // Lista de usuarios (todos los tenants)
  'GET /api/owner/users': (req, res) => {
    const users = store.all('users').map(u => ({
      id: u.id, email: u.email, role: u.role, tenant_id: u.tenant_id,
      status: u.status, created: u.created,
    }));
    json(res, { ok: true, users });
  },

  // Invita / crea un usuario (envía email simulado)
  'POST /api/owner/users': async (req, res) => {
    const body = await readBody(req);
    if (!body.email) return json(res, { ok: false, error: 'email requerido' }, 400);
    const exists = store.all('users').find(u => u.email === body.email);
    if (exists) return json(res, { ok: false, error: 'usuario ya existe' }, 409);
    const u = {
      id: 'USR' + String(Date.now()).slice(-6),
      email: body.email,
      password: '',
      role: body.role || 'cajero',
      tenant_id: body.tenant_id || 'TNT001',
      status: 'invited',
      created: Date.now(),
    };
    store.insert('users', u);
    // Email simulado (en prod iría a SendGrid/SES)
    json(res, {
      ok: true,
      user: { id: u.id, email: u.email, role: u.role, tenant_id: u.tenant_id, status: u.status },
      invite: { sent: true, channel: 'email', to: u.email, note: 'simulated (no SMTP configured locally)' },
    }, 201);
  },

  // ============ Reports (Slice 07 + Slice 34) ============
  // Todos role-gated (admin/owner/superadmin) + tenant aislamiento + range validation
  'GET /api/reports/fiscal': reportSafe(({ tenant_id }) => {
    const tenants = store.all('tenants').filter(t => !tenant_id || t.id === tenant_id || t.tenant_id === tenant_id);
    const totalMrr = tenants.reduce((s, t) => s + (t.mrr || 0), 0);
    return {
      ingresos: totalMrr,
      iva_trasladado: Math.round(totalMrr * 0.16),
      iva_acreditable: 0,
      isr_estimado: Math.round(totalMrr * 0.30),
      note: 'needs materialized view refresh (R14_REPORTS_VIEWS.sql not applied)',
    };
  }),
  // R26: handlers REALES contra Supabase. Cada uno ejecuta lectura PostgREST
  // en pos_sales/pos_products/customers y agrega en JS. Si Supabase no responde
  // o la tabla no existe -> fallback graceful con items:[] y note:'pendiente'.
  'GET /api/reports/sales/by-product': requireRole(['admin','owner','superadmin'])(async (req, res) => {
    try {
      const q = url.parse(req.url, true).query || {};
      const r = _parseRange(q);
      const top = Math.min(Math.max(parseInt(q.top, 10) || 10, 1), 100);
      const sales = await _sbReq('GET', `/pos_sales?select=total,items,created_at&created_at=gte.${r.from}&created_at=lte.${r.to}`);
      const agg = {};
      (sales || []).forEach(s => {
        let items = s.items;
        if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
        if (!Array.isArray(items)) return;
        items.forEach(it => {
          const key = it.product_id || it.id || it.sku || it.name || 'unknown';
          const name = it.name || key;
          const qty = parseFloat(it.qty || it.quantity || 1);
          const rev = parseFloat(it.total || it.subtotal || (it.price || 0) * qty);
          if (!agg[key]) agg[key] = { product_id: key, name, qty: 0, ingreso: 0 };
          agg[key].qty += qty;
          agg[key].ingreso += rev;
        });
      });
      const by_product = Object.values(agg).sort((a, b) => b.ingreso - a.ingreso).slice(0, top);
      return json(res, { ok: true, items: by_product, by_product, period: { from: r.from, to: r.to }, source: 'supabase', generated_at: Date.now() });
    } catch (err) {
      return json(res, { ok: true, items: [], by_product: [], note: 'pendiente: ' + (err && err.message || 'error'), source: 'fallback' });
    }
  }),
  'GET /api/reports/sales/by-cashier': requireRole(['admin','owner','superadmin'])(async (req, res) => {
    try {
      const q = url.parse(req.url, true).query || {};
      const r = _parseRange(q);
      const sales = await _sbReq('GET', `/pos_sales?select=pos_user_id,total,created_at&created_at=gte.${r.from}&created_at=lte.${r.to}`);
      const agg = {};
      (sales || []).forEach(s => {
        const k = s.pos_user_id || 'unknown';
        if (!agg[k]) agg[k] = { pos_user_id: k, tickets: 0, revenue: 0 };
        agg[k].tickets++;
        agg[k].revenue += parseFloat(s.total || 0);
      });
      const by_cashier = Object.values(agg).sort((a, b) => b.revenue - a.revenue);
      return json(res, { ok: true, items: by_cashier, by_cashier, period: { from: r.from, to: r.to }, source: 'supabase', generated_at: Date.now() });
    } catch (err) {
      return json(res, { ok: true, items: [], by_cashier: [], note: 'pendiente: ' + (err && err.message || 'error'), source: 'fallback' });
    }
  }),
  'GET /api/reports/sales/daily': requireRole(['admin','owner','superadmin'])(async (req, res) => {
    try {
      const q = url.parse(req.url, true).query || {};
      const r = _parseRange(q);
      const sales = await _sbReq('GET', `/pos_sales?select=total,created_at&created_at=gte.${r.from}&created_at=lte.${r.to}`);
      const agg = {};
      (sales || []).forEach(s => {
        const d = (s.created_at || '').slice(0, 10);
        if (!agg[d]) agg[d] = { dia: d, tickets: 0, revenue: 0 };
        agg[d].tickets++;
        agg[d].revenue += parseFloat(s.total || 0);
      });
      const daily = Object.values(agg).sort((a, b) => a.dia.localeCompare(b.dia));
      return json(res, { ok: true, items: daily, daily, period: { from: r.from, to: r.to }, source: 'supabase', generated_at: Date.now() });
    } catch (err) {
      return json(res, { ok: true, items: [], daily: [], note: 'pendiente: ' + (err && err.message || 'error'), source: 'fallback' });
    }
  }),
  'GET /api/reports/inventory/value': requireRole(['admin','owner','superadmin'])(async (req, res) => {
    try {
      const products = await _sbReq('GET', '/pos_products?select=id,name,stock,cost,price');
      let total_value = 0, units = 0, retail_value = 0;
      const items = (products || []).map(p => {
        const stock = parseFloat(p.stock || 0);
        const cost = parseFloat(p.cost || 0);
        const price = parseFloat(p.price || 0);
        const v = stock * cost;
        total_value += v;
        retail_value += stock * price;
        units += stock;
        return { id: p.id, name: p.name, stock, cost, value: Math.round(v * 100) / 100 };
      });
      return json(res, { ok: true, items, total_value: Math.round(total_value * 100) / 100, retail_value: Math.round(retail_value * 100) / 100, units, by_location: [], source: 'supabase', generated_at: Date.now() });
    } catch (err) {
      return json(res, { ok: true, items: [], total_value: 0, by_location: [], note: 'pendiente: ' + (err && err.message || 'error'), source: 'fallback' });
    }
  }),
  'GET /api/reports/customers/cohort': requireRole(['admin','owner','superadmin'])(async (req, res) => {
    try {
      const customers = await _sbReq('GET', '/customers?select=id,created_at,active');
      const agg = {};
      (customers || []).forEach(c => {
        const m = (c.created_at || '').slice(0, 7);
        if (!m) return;
        if (!agg[m]) agg[m] = { cohort: m, new_customers: 0, active: 0 };
        agg[m].new_customers++;
        if (c.active) agg[m].active++;
      });
      const cohorts = Object.values(agg).sort((a, b) => a.cohort.localeCompare(b.cohort));
      return json(res, { ok: true, items: cohorts, cohorts, source: 'supabase', generated_at: Date.now() });
    } catch (err) {
      return json(res, { ok: true, items: [], cohorts: [], note: 'pendiente: ' + (err && err.message || 'error'), source: 'fallback' });
    }
  }),
  'GET /api/reports/profit': requireRole(['admin','owner','superadmin'])(async (req, res) => {
    try {
      const q = url.parse(req.url, true).query || {};
      const r = _parseRange(q);
      const [sales, products] = await Promise.all([
        _sbReq('GET', `/pos_sales?select=total,items,created_at&created_at=gte.${r.from}&created_at=lte.${r.to}`),
        _sbReq('GET', '/pos_products?select=id,cost,price'),
      ]);
      const costMap = {};
      (products || []).forEach(p => { costMap[p.id] = parseFloat(p.cost || 0); });
      let revenue = 0, cost = 0;
      (sales || []).forEach(s => {
        revenue += parseFloat(s.total || 0);
        let items = s.items;
        if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
        if (Array.isArray(items)) {
          items.forEach(it => {
            const c = costMap[it.product_id || it.id] || 0;
            const qty = parseFloat(it.qty || it.quantity || 1);
            cost += c * qty;
          });
        }
      });
      const profit = revenue - cost;
      const margin = revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : 0;
      return json(res, { ok: true, revenue: Math.round(revenue * 100) / 100, cost: Math.round(cost * 100) / 100, profit: Math.round(profit * 100) / 100, margin, period: { from: r.from, to: r.to }, source: 'supabase', generated_at: Date.now() });
    } catch (err) {
      return json(res, { ok: true, revenue: 0, cost: 0, profit: 0, margin: 0, note: 'pendiente: ' + (err && err.message || 'error'), source: 'fallback' });
    }
  }),
  'GET /api/reports/abc-analysis': requireRole(['admin','owner','superadmin'])(async (req, res) => {
    try {
      const q = url.parse(req.url, true).query || {};
      const r = _parseRange(q);
      const sales = await _sbReq('GET', `/pos_sales?select=items,total,created_at&created_at=gte.${r.from}&created_at=lte.${r.to}`);
      const agg = {};
      (sales || []).forEach(s => {
        let items = s.items;
        if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
        if (!Array.isArray(items)) return;
        items.forEach(it => {
          const key = it.product_id || it.id || it.name || 'unknown';
          const rev = parseFloat(it.total || it.subtotal || (it.price || 0) * (it.qty || 1));
          if (!agg[key]) agg[key] = { product_id: key, name: it.name || key, ingreso: 0 };
          agg[key].ingreso += rev;
        });
      });
      const sorted = Object.values(agg).sort((a, b) => b.ingreso - a.ingreso);
      const total = sorted.reduce((s, x) => s + x.ingreso, 0);
      const classes = { A: [], B: [], C: [] };
      let acc = 0;
      sorted.forEach(p => {
        acc += p.ingreso;
        const pct = total > 0 ? acc / total : 0;
        const cls = pct <= 0.8 ? 'A' : pct <= 0.95 ? 'B' : 'C';
        classes[cls].push({ ...p, cum_pct: Math.round(pct * 10000) / 100 });
      });
      return json(res, { ok: true, items: sorted, classes, total_revenue: Math.round(total * 100) / 100, period: { from: r.from, to: r.to }, source: 'supabase', generated_at: Date.now() });
    } catch (err) {
      return json(res, { ok: true, items: [], classes: { A: [], B: [], C: [] }, note: 'pendiente: ' + (err && err.message || 'error'), source: 'fallback' });
    }
  }),
  'GET /api/reports/daily': requireRole(['admin','owner','superadmin'])(async (req, res) => {
    try {
      const q = url.parse(req.url, true).query || {};
      const r = _parseRange(q);
      const sales = await _sbReq('GET', `/pos_sales?select=total,created_at&created_at=gte.${r.from}&created_at=lte.${r.to}`);
      const agg = {};
      (sales || []).forEach(s => {
        const d = (s.created_at || '').slice(0, 10);
        if (!agg[d]) agg[d] = { dia: d, tickets: 0, revenue: 0 };
        agg[d].tickets++;
        agg[d].revenue += parseFloat(s.total || 0);
      });
      const daily = Object.values(agg).sort((a, b) => a.dia.localeCompare(b.dia));
      return json(res, { ok: true, items: daily, daily, period: { from: r.from, to: r.to }, source: 'supabase', generated_at: Date.now() });
    } catch (err) {
      return json(res, { ok: true, items: [], daily: [], note: 'pendiente: ' + (err && err.message || 'error'), source: 'fallback' });
    }
  }),

  // =============== BARCODE LOOKUP (portado de 01123581321345589144233) ===============
  'GET /api/barcode-lookup': async (req, res) => {
    const q = url.parse(req.url, true).query;
    const barcode = (q.barcode || '').trim();
    if (!barcode) return json(res, { error: 'barcode requerido' }, 400);

    // 1. Buscar en productos locales primero
    const localMatch = store.all('productos').find(p => p.codigo === barcode || p.code === barcode);
    if (localMatch) return json(res, { found: true, source: 'local', product: localMatch });

    // 2. Buscar en Open Food Facts (API pública, sin costo)
    try {
      const offRes = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'SystemInternational-POS/1.0' }
      });
      if (offRes.ok) {
        const data = await offRes.json();
        if (data.status === 1 && data.product) {
          const p = data.product;
          return json(res, {
            found: true,
            source: 'openfoodfacts',
            product: {
              nombre: p.product_name_es || p.product_name || '',
              marca: p.brands || '',
              categoria: p.categories_tags?.[0]?.replace('en:', '') || '',
              imagen: p.image_url || '',
              codigo: barcode,
            }
          });
        }
      }
    } catch (_) { /* offline o timeout — continúa */ }

    return json(res, { found: false, barcode });
  },

  // =============== DEVOLUCIONES (portado de 01123581321345589144233) ===============
  'GET /api/devoluciones': (req, res) => {
    const q = url.parse(req.url, true).query;
    let items = store.all('devoluciones');
    if (q.tenant_id) items = items.filter(d => d.tenant_id === q.tenant_id);
    json(res, items.sort((a, b) => b.created_at > a.created_at ? 1 : -1));
  },
  'POST /api/devoluciones': async (req, res) => {
    const body = await readBody(req);
    const { venta_id, folio, cliente, items, motivo, tipo_reembolso, tenant_id } = body;
    if (!items?.length) return json(res, { error: 'Se requiere al menos un producto' }, 400);
    const total = items.reduce((s, i) => s + (i.precio * i.cantidad), 0);
    const devId = 'DEV-' + Date.now();
    const dev = store.insert('devoluciones', {
      id: devId, venta_id: venta_id || null, folio: folio || '—',
      cliente: cliente || 'Público general', items, motivo: motivo || 'Sin motivo',
      tipo_reembolso: tipo_reembolso || 'efectivo', total, tenant_id: tenant_id || 'TNT001',
      status: 'completada', created_at: new Date().toISOString(),
    });
    // Si es nota de crédito, crearla
    if (tipo_reembolso === 'nota_credito') {
      store.insert('notas_credito', {
        id: 'NC-' + Date.now(), devolucion_id: devId,
        cliente: cliente || 'Público general', monto_original: total,
        monto_disponible: total, tenant_id: tenant_id || 'TNT001',
        status: 'activa', created_at: new Date().toISOString(),
        vence_at: new Date(Date.now() + 90 * 86400000).toISOString(), // 90 días
      });
    }
    json(res, { ok: true, devolucion: dev });
  },
  'GET /api/notas-credito': (req, res) => {
    const q = url.parse(req.url, true).query;
    let items = store.all('notas_credito');
    if (q.tenant_id) items = items.filter(n => n.tenant_id === q.tenant_id);
    json(res, items);
  },

  // =============== FILA VIRTUAL (portado de 01123581321345589144233) ===============
  'GET /api/queue': (req, res) => {
    const q = url.parse(req.url, true).query;
    let items = store.all('fila_virtual');
    if (q.tenant_id) items = items.filter(f => f.tenant_id === q.tenant_id);
    // Solo los activos, ordenados por posición
    const activos = items
      .filter(f => ['esperando', 'llamado'].includes(f.status))
      .sort((a, b) => a.posicion - b.posicion);
    json(res, activos);
  },
  'POST /api/queue': async (req, res) => {
    const body = await readBody(req);
    const { tenant_id, nombre, telefono } = body;
    const filaActiva = store.all('fila_virtual').filter(
      f => f.tenant_id === (tenant_id || 'TNT001') && ['esperando', 'llamado'].includes(f.status)
    );
    const posicion = filaActiva.length + 1;
    const ticket = store.insert('fila_virtual', {
      id: 'TURN-' + Date.now(),
      tenant_id: tenant_id || 'TNT001',
      numero: posicion,
      posicion,
      nombre: nombre || 'Cliente',
      telefono: telefono || '',
      status: 'esperando',
      created_at: new Date().toISOString(),
    });
    json(res, { ok: true, ticket, posicion, total: posicion });
  },
  'PATCH /api/queue/:id': async (req, res) => {
    const body = await readBody(req);
    const updated = store.update('fila_virtual', params.id, body);
    if (!updated) return json(res, { error: 'Turno no encontrado' }, 404);
    json(res, { ok: true, ticket: updated });
  },
  'POST /api/queue/:id/atender': async (req, res) => {
    const ticket = store.find('fila_virtual', params.id);
    if (!ticket) return json(res, { error: 'Turno no encontrado' }, 404);
    store.update('fila_virtual', params.id, { status: 'atendido', atendido_at: new Date().toISOString() });
    // Reposicionar los restantes
    const restantes = store.all('fila_virtual').filter(
      f => f.tenant_id === ticket.tenant_id && f.status === 'esperando'
    ).sort((a, b) => a.posicion - b.posicion);
    restantes.forEach((f, i) => store.update('fila_virtual', f.id, { posicion: i + 1 }));
    json(res, { ok: true });
  },
  'DELETE /api/queue/:id': async (req, res) => {
    store.delete('fila_virtual', params.id);
    json(res, { ok: true });
  },
  'GET /api/queue/status/:id': (req, res) => {
    const ticket = store.find('fila_virtual', params.id);
    if (!ticket) return json(res, { error: 'Turno no encontrado' }, 404);
    const filaActiva = store.all('fila_virtual').filter(
      f => f.tenant_id === ticket.tenant_id && f.status === 'esperando'
    ).sort((a, b) => a.posicion - b.posicion);
    const posActual = filaActiva.findIndex(f => f.id === params.id);
    json(res, { ...ticket, posicion_actual: posActual + 1, total_espera: filaActiva.length });
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
  // Si el cliente pide /, servir index.html o volvix-owner-panel.html
  if (pathname === '/') {
    pathname = '/index.html';
    if (!fs.existsSync(path.join(CONFIG.publicDir, 'index.html'))) {
      pathname = '/volvix-owner-panel.html';
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
    console.log('    • ' + baseUrl + '/volvix-owner-panel.html  \x1b[90m(panel dueño)\x1b[0m');
    console.log('    • ' + baseUrl + '/marketplace.html               \x1b[90m(cliente final)\x1b[0m');
    console.log('    • ' + baseUrl + '/volvix_ai_engine.html          \x1b[90m(motor IA)\x1b[0m');
    console.log('    • ' + baseUrl + '/api/health                     \x1b[90m(prueba API)\x1b[0m');
    console.log('');
    console.log('  \x1b[90mPara detener: Ctrl+C\x1b[0m');
    console.log('');

    openBrowser(baseUrl + '/volvix-owner-panel.html');
  });
})();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\x1b[33mCerrando Volvix...\x1b[0m');
  store.save();
  server.close(() => process.exit(0));
});
