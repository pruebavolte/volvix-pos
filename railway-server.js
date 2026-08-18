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
// API HANDLER COMPLETO (delegado a api/index.js)
// ============================================================
// api/index.js exporta un único handler (req, res) tipo serverless con TODOS los
// endpoints (/api/log/client, /api/owner/low-stock, /api/sales/latest, login,
// register, etc.). Lo importamos aquí para que Railway sirva la API completa.
// No hay backend alterno: si la configuración/handler canónico falla, el
// proceso debe abortar para evitar escribir en otro proyecto o emitir IDs legacy.
const apiHandler = require('./api/index.js');

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
  // Custom domain (negocio.international) ya configurado en Railway.
  // No se inyecta redirect; Railway sirve directo el dominio correcto.
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

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    });
    return res.end();
  }

  // API routes — delegamos al handler completo de api/index.js
  if (pathname.startsWith('/api/')) {
    try {
      return await apiHandler(req, res);
    } catch (err) {
      console.error('[railway-server] apiHandler error:', err);
      if (!res.headersSent) {
        return sendJSON(res, { ok: false, error: 'Internal server error' }, 500);
      }
      return;
    }
  }

  // Static files
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Si no existe y no tiene extensión, intenta .html
  if (!fs.existsSync(filePath) && !path.extname(pathname)) {
    const withHtml = filePath + '.html';
    if (fs.existsSync(withHtml)) filePath = withHtml;
  }

  serveFile(filePath, res, hostHeader);
});

server.listen(PORT, HOST, () => {
  console.log(`\n✓ Volvix API servidor en http://${HOST}:${PORT}`);
  console.log(`✓ Static files: ${PUBLIC_DIR}`);
  console.log('✓ Endpoints disponibles: handler canónico de api/index.js (cargado)\n');
});
