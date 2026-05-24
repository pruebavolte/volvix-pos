#!/usr/bin/env node
/**
 * Railway Adapter: Sirve static files + API endpoints
 * Levanta en port 8080 (Railway standard)
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR || './public');

// ============================================================
// SUPABASE + AUTH (duplicado mínimo de api/index.js)
// ============================================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cd6936c4-d884-4d4d-ad42-0d74f02aa106.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

async function supabaseRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    if (!SUPABASE_SERVICE_KEY) return reject(new Error('SUPABASE_SERVICE_KEY not configured'));

    const https = require('https');
    const u = new URL(SUPABASE_URL + '/rest/v1' + path);
    const data = body ? JSON.stringify(body) : null;

    const r = https.request({
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      method,
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
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
// MINI REGISTER-SIMPLE ENDPOINT (sin Cloudflare CAPTCHA)
// ============================================================
async function handleRegisterSimple(req, body, res) {
  try {
    const { email, business_name, giro, password, phone } = body || {};

    if (!email || !business_name || !giro || !password) {
      return sendJSON(res, { ok: false, error: 'email, business_name, giro, password required' }, 400);
    }

    // 1. Crear tenant
    const tenantId = 'TNT-' + Date.now().toString(36).toUpperCase();
    const tenant = await supabaseRequest('POST', '/pos_tenants', {
      id: tenantId,
      business_name,
      business_type: giro,
      status: 'active',
      created_at: new Date().toISOString(),
    });

    // 2. Crear usuario
    const userId = 'USR-' + Date.now().toString(36).toUpperCase();
    const user = await supabaseRequest('POST', '/pos_users', {
      id: userId,
      tenant_id: tenantId,
      email: email.toLowerCase(),
      password: password, // En prod: hashear con bcrypt
      role: 'owner',
      status: 'active',
      created_at: new Date().toISOString(),
    });

    // 3. JWT simple (en prod: usar algoritmo correcto)
    const token = Buffer.from(JSON.stringify({
      sub: userId,
      email: email,
      tenant_id: tenantId,
      role: 'owner',
      iat: Date.now(),
    })).toString('base64');

    return sendJSON(res, {
      ok: true,
      user: { id: userId, email, tenant_id: tenantId, role: 'owner' },
      tenant: { id: tenantId, business_name, business_type: giro },
      token,
      message: 'Cuenta creada. Redirigiendo...',
    });
  } catch (err) {
    console.error('[register-simple]', err.message);
    return sendJSON(res, { ok: false, error: 'Error al registrar: ' + err.message }, 500);
  }
}

// ============================================================
// UTILIDADES
// ============================================================
function sendJSON(res, data, code = 200) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  });
  res.end(JSON.stringify(data));
}

function rewriteHTML(html, hostHeader) {
  // Si viene como volvix-pos-production.up.railway.app, inyectar meta tag para redirect
  if (hostHeader && hostHeader.includes('railway')) {
    // Inyectar meta tag canonical-domain si no existe
    if (!html.includes('meta name="canonical-domain"')) {
      const metaTag = '<meta name="canonical-domain" content="negocio.international">\n';
      html = html.replace('</head>', metaTag + '</head>');
    }

    // Inyectar script que intenta hacer redirect más agresivo
    const redirectScript = `
<script>
// Redirect agresivo: intentar ir a negocio.international
if (window.location.hostname === 'volvix-pos-production.up.railway.app' && !sessionStorage.getItem('redirect-attempted')) {
  sessionStorage.setItem('redirect-attempted', 'true');
  // location.replace en lugar de location.href para no dejar en historial
  setTimeout(function() {
    var target = 'https://negocio.international' + window.location.pathname + window.location.search + window.location.hash;
    window.location.replace(target);
  }, 50);
}
</script>
`;
    // Inyectar ANTES de otros scripts
    html = html.replace('<head>', '<head>' + redirectScript);
  }

  return html;
}

function serveFile(filePath, res, hostHeader) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('404 Not Found');
  }

  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';

  // Para HTML, leer y reescribir; para otros, stream directo
  if (ext === '.html') {
    fs.readFile(filePath, 'utf-8', (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('500 Server Error');
      }

      const rewritten = rewriteHTML(data, hostHeader);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': Buffer.byteLength(rewritten),
        'Cache-Control': 'no-cache',
      });
      res.end(rewritten);
    });
  } else {
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Cache-Control': 'public, max-age=31536000',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

// ============================================================
// SERVER
// ============================================================
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url);
  const pathname = parsed.pathname;
  const hostHeader = req.headers.host || '';

  // Si acceden directamente a railway.app (no a negocio.international)
  // y no es una request a /api, mostrar página de setup
  if (hostHeader.includes('railway.app') && !pathname.startsWith('/api/')) {
    // Para / mostrar dns-check.html
    if (pathname === '/') {
      return serveFile(path.join(PUBLIC_DIR, 'dns-check.html'), res, hostHeader);
    }
  }

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
    // POST /api/auth/register-simple
    if (req.method === 'POST' && pathname === '/api/auth/register-simple') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          await handleRegisterSimple(req, data, res);
        } catch (e) {
          sendJSON(res, { ok: false, error: 'Invalid JSON' }, 400);
        }
      });
      return;
    }

    // Fallback
    return sendJSON(res, { error: 'endpoint not found' }, 404);
  }

  // Static files
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Si no existe y no tiene extensión, intenta .html
  if (!fs.existsSync(filePath) && !path.extname(pathname)) {
    const withHtml = filePath + '.html';
    if (fs.existsSync(withHtml)) filePath = withHtml;
  }

  const hostHeader = req.headers.host || '';
  serveFile(filePath, res, hostHeader);
});

server.listen(PORT, HOST, () => {
  console.log(`\n✓ Volvix API servidor en http://${HOST}:${PORT}`);
  console.log(`✓ Static files: ${PUBLIC_DIR}`);
  console.log(`✓ Endpoints disponibles:\n  POST /api/auth/register-simple\n`);
});
