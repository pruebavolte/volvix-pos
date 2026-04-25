/**
 * VOLVIX · Serverless API para Vercel
 * Este archivo maneja todas las requests HTTP
 */

const fs = require('fs');
const path = require('path');
const url = require('url');

// Cargar base de datos (simulada con JSON)
const DB_PATH = './db/volvix.db.json';
let db = null;

function loadDB() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    db = {
      users: [
        { id: 'USR001', email: 'admin@volvix.test', password: 'Volvix2026!', role: 'superadmin', tenant_id: 'TNT001', status: 'active' },
        { id: 'USR002', email: 'owner@volvix.test', password: 'Volvix2026!', role: 'owner', tenant_id: 'TNT002', status: 'active' },
        { id: 'USR003', email: 'cajero@volvix.test', password: 'Volvix2026!', role: 'cajero', tenant_id: 'TNT001', status: 'active' },
      ],
      tenants: [
        { id: 'TNT001', name: 'Abarrotes Don Chucho', giro: 'abarrotes', plan: 'pro', status: 'active' },
        { id: 'TNT002', name: 'Restaurante Los Compadres', giro: 'restaurante', plan: 'enterprise', status: 'active' },
        { id: 'TNT003', name: 'BarberShop Ruiz', giro: 'barberia', plan: 'pro', status: 'active' },
      ],
      features: [],
      tickets: [],
      knowledge: [],
    };
  }
  return db;
}

// Leer body de request
async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// Response JSON
function sendJSON(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(data));
}

// Response HTML
function sendHTML(res, html, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(html);
}

// Servir archivos estáticos
function serveFile(res, pathname) {
  if (pathname === '/') pathname = '/login.html';

  const filePath = path.join(__dirname, '..', pathname);

  // Seguridad
  if (!filePath.startsWith(path.join(__dirname, '..'))) {
    return sendJSON(res, { error: 'Forbidden' }, 403);
  }

  try {
    if (!fs.existsSync(filePath)) {
      return sendHTML(res, '<h1>404 - Archivo no encontrado</h1>', 404);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();

    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
    };

    const mime = mimeTypes[ext] || 'application/octet-stream';
    res.statusCode = 200;
    res.setHeader('Content-Type', mime);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(content);
  } catch (err) {
    return sendHTML(res, `<h1>500 - Error</h1><p>${err.message}</p>`, 500);
  }
}

// Handlers de API
const handlers = {
  'POST /api/login': async (req, res) => {
    try {
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

      const session = {
        user_id: user.id,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id,
        tenant_name: tenant?.name || 'Mi Negocio',
        expires_at: Date.now() + (3600 * 1000),
        plan: tenant?.plan || 'free',
      };

      sendJSON(res, { ok: true, session });
    } catch (err) {
      sendJSON(res, { error: 'Error en login: ' + err.message }, 500);
    }
  },

  'GET /api/health': async (req, res) => {
    sendJSON(res, { ok: true, time: Date.now() });
  },
};

// Main handler
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;

  // API routes
  const key = `${method} ${pathname}`;
  const handler = handlers[key];

  if (handler) {
    try {
      await handler(req, res);
    } catch (err) {
      sendJSON(res, { error: err.message }, 500);
    }
  } else {
    // Static files
    serveFile(res, pathname);
  }
};
