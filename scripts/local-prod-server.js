#!/usr/bin/env node
/**
 * local-prod-server.js
 *
 * Wrapper para correr el MISMO backend de producción en local.
 * Producción usa api/index.js (Vercel serverless function).
 * Este wrapper:
 *   1. Carga .env del main repo
 *   2. Levanta http.createServer en puerto 3000
 *   3. /api/* → forwards a api/index.js handler
 *   4. Resto → sirve estáticos desde public/
 *
 * Resultado: localhost:3000 se comporta IDÉNTICO a systeminternational.app
 */
'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');

// Forzar cwd al main repo y cargar .env
const REPO_ROOT = path.resolve(__dirname, '..');
process.chdir(REPO_ROOT);
require('dotenv').config({ path: path.join(REPO_ROOT, '.env') });

// Simular el SHA de commit que Vercel inyecta como cache-bust
// (api/index.js usa process.env.VERCEL_GIT_COMMIT_SHA.slice(0,8))
if (!process.env.VERCEL_GIT_COMMIT_SHA) {
  try {
    const { execSync } = require('child_process');
    process.env.VERCEL_GIT_COMMIT_SHA = execSync('git rev-parse HEAD', {
      cwd: REPO_ROOT, encoding: 'utf8'
    }).trim();
  } catch (_) { process.env.VERCEL_GIT_COMMIT_SHA = 'localdev'; }
}

// Asegurar que api/index.js encuentre sus archivos relativos
process.env.PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(REPO_ROOT, 'public');

const PUBLIC_DIR = process.env.PUBLIC_DIR;
const API_HANDLER = require(path.join(REPO_ROOT, 'api', 'index.js'));

// ============================================================
// DEV AUTH BYPASS — mint un JWT válido para localhost
// Replicates api/index.js signJWT() para evitar tener que hacer login manual.
// Solo se inyecta cuando host=localhost en HTMLs.
// ============================================================
const crypto = require('crypto');
const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_EXPIRES_SECONDS = 24 * 60 * 60; // 24h
function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function mintDevJwt() {
  if (!JWT_SECRET) return null;
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'dev-localhost',
    email: 'admin@systeminternational.app',
    role: 'superadmin',
    user_id: 'dev-localhost-uid',
    tenant_id: null,
    jti: crypto.randomBytes(16).toString('hex'),
    iat: now,
    exp: now + JWT_EXPIRES_SECONDS,
    _dev_bypass: true,
  };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const data = h + '.' + p;
  const sig = b64url(crypto.createHmac('sha256', JWT_SECRET).update(data).digest());
  return data + '.' + sig;
}
const DEV_JWT = mintDevJwt();
const DEV_SESSION = JSON.stringify({
  user_id: 'dev-localhost-uid',
  user: {
    id: 'dev-localhost-uid',
    email: 'admin@systeminternational.app',
    full_name: 'Dev Admin (localhost)',
    role: 'superadmin',
    tenant_id: null,
  },
  token: DEV_JWT,
  expires_at: Date.now() + (JWT_EXPIRES_SECONDS * 1000),
});

// Mime types básicos
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
};

function serveStatic(req, res, pathname) {
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }
  let filepath = path.join(PUBLIC_DIR, decodeURIComponent(pathname));
  // Bloquear path traversal
  if (!filepath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  if (!fs.existsSync(filepath) || fs.statSync(filepath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    return res.end('<h1>404</h1><p>No encontrado: ' + pathname + '</p>');
  }
  const ext = path.extname(filepath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const stream = fs.createReadStream(filepath);
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
  stream.pipe(res);
}

// Wrapper de res que intercepta .end() y .write() para normalizar CRLF→LF
// (Windows disk tiene CRLF, Vercel produce LF — esto garantiza byte-parity).
function wrapResForLfNormalize(res) {
  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);
  let isText = false;
  const origWriteHead = res.writeHead.bind(res);
  res.writeHead = function(code, ...rest) {
    // Determinar si el content-type es texto
    const headers = (rest[rest.length - 1] && typeof rest[rest.length - 1] === 'object')
      ? rest[rest.length - 1] : null;
    const ct = (headers && (headers['content-type'] || headers['Content-Type']))
      || res.getHeader('content-type') || '';
    isText = /text\/|application\/(javascript|json|xml|manifest)/i.test(String(ct));
    return origWriteHead(code, ...rest);
  };
  const normalize = (chunk) => {
    if (!isText) return chunk;
    let str = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : (typeof chunk === 'string' ? chunk : null);
    if (str == null) return chunk;
    // Normalizar line endings CRLF → LF (Windows → Linux/Vercel)
    str = str.replace(/\r\n/g, '\n');
    // FIX FORCE-DARK del browser preview de Claude Code:
    // Chrome auto-invierte colores si el sitio no declara color-scheme.
    // Inyectamos meta + style para forzar light mode (matchea cómo se ve en browsers
    // normales donde el user visita producción).
    // SOLO se aplica a HTML completos (que tienen <head>).
    const ct = res.getHeader('content-type') || '';
    if (/text\/html/i.test(String(ct)) && /<head[^>]*>/i.test(str)) {
      // 1) color-scheme meta para opt-out de Chrome auto-dark
      // 2) Inline script que setea localStorage['volvix:theme']='light' ANTES
      //    de que cargue volvix-theme-wiring.js (que usa 'auto' por default
      //    y detecta prefers-color-scheme: dark del preview browser → dark theme).
      //    Solo se aplica si NO hay theme guardado (respeta elección del user).
      // DEV AUTH BYPASS: inyecta el JWT y session en localStorage ANTES de que
      // corra auth-gate.js. Solo si el host es localhost.
      const devAuthInject = DEV_JWT
        ? '\n<script>(function(){try{if(location.hostname==="localhost"||location.hostname==="127.0.0.1"){if(!localStorage.getItem("volvix_token")){localStorage.setItem("volvix_token",' + JSON.stringify(DEV_JWT) + ');localStorage.setItem("volvixAuthToken",' + JSON.stringify(DEV_JWT) + ');localStorage.setItem("volvixSession",' + JSON.stringify(DEV_SESSION) + ');}}}catch(_){}})();</script>'
        : '';
      const injectionFix =
        '\n<meta name="color-scheme" content="light only">' +
        '\n<style>:root,html,body{color-scheme:only light !important;forced-color-adjust:none !important}</style>' +
        '\n<script>(function(){try{if(!localStorage.getItem("volvix:theme")){localStorage.setItem("volvix:theme","light");}}catch(_){}})();</script>' +
        devAuthInject;
      if (!/color-scheme.*light only/.test(str)) {
        str = str.replace(/(<head[^>]*>)/i, '$1' + injectionFix);
      }
    }
    return Buffer.from(str, 'utf8');
  };
  res.write = function(chunk, ...args) { return origWrite(normalize(chunk), ...args); };
  res.end = function(chunk, ...args) {
    if (chunk == null) return origEnd(chunk, ...args);
    // Si content-type no se setteó vía writeHead, leerlo del header actual
    if (!isText) {
      const ct = res.getHeader('content-type') || '';
      isText = /text\/|application\/(javascript|json|xml|manifest)/i.test(String(ct));
    }
    return origEnd(normalize(chunk), ...args);
  };
  return res;
}

const server = http.createServer(async (req, res) => {
  try {
    // En producción, Vercel envía TODAS las requests a api/index.js
    // (vercel.json: { "src": "/(.*)", "dest": "/api/index.js" })
    // api/index.js sirve estáticos + APIs + inyecta cache-bust ?v=SHA en HTMLs.
    // Para paridad 100% con prod, forwardeamos TODO a API_HANDLER.
    // El wrapper res normaliza CRLF→LF para byte-parity con Vercel (Linux/LF).
    wrapResForLfNormalize(res);
    return await API_HANDLER(req, res);
  } catch (err) {
    console.error('[server-error]', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({ error: String(err && err.message || err) }));
  }
});

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🚀 Volvix LOCAL-PROD server (con api/index.js cargado)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✓ http://' + HOST + ':' + PORT);
  console.log('  ✓ Public dir: ' + PUBLIC_DIR);
  console.log('  ✓ Supabase URL: ' + (process.env.SUPABASE_URL || '(MISSING)').slice(0, 50));
  console.log('  ✓ Service key: ' + (process.env.SUPABASE_SERVICE_KEY ? '[SET]' : '(MISSING)'));
  console.log('  ✓ Dev JWT minted: ' + (DEV_JWT ? '[YES — auth bypass active]' : '(NO JWT_SECRET)'));
  console.log('  ✓ Behavior: IDÉNTICO a https://systeminternational.app/');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => { console.log('shutdown'); server.close(); process.exit(0); });
process.on('SIGTERM', () => { server.close(); process.exit(0); });
