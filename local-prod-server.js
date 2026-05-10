// =========================================================================
// LOCAL-PROD-SERVER · Volvix POS · arranca api/index.js (mismo handler de
// produccion en Vercel) localmente, con env vars y routing identicos.
//
// Uso: node local-prod-server.js
// Carga: .env.local (priorizado) -> .env.production -> .env
// Puerto: PORT env o 3000 default
// =========================================================================

const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');

// 1) Cargar env vars con dotenv (prioridad: .env.local > .env.production > .env)
const dotenv = require('dotenv');
const envFiles = ['.env.local', '.env.production', '.env'];
let envLoaded = null;
for (const f of envFiles) {
  const p = path.join(__dirname, f);
  if (fs.existsSync(p)) {
    dotenv.config({ path: p, override: false });
    envLoaded = envLoaded || f;
  }
}

// 2) Limpiar valores con \n al final (Vercel CLI a veces los exporta asi)
for (const key of Object.keys(process.env)) {
  if (typeof process.env[key] === 'string') {
    process.env[key] = process.env[key].replace(/\\n$/, '').replace(/\n+$/, '');
  }
}

// 3) Verificar credenciales criticas
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error('\n❌ Faltan env vars criticas:', missing.join(', '));
  console.error('   Corre: vercel env pull .env.local --environment=production --yes\n');
  process.exit(1);
}

// 3.1) DEV-ONLY: deshabilitar rate-limits para que el dev pueda probar
// registro/login/OTP sin chocar con el limite "Too many requests".
// IMPORTANTE: este env var NUNCA debe estar en produccion (Vercel) — solo
// se setea en este wrapper que corre localmente.
process.env.VOLVIX_DEV_DISABLE_RATELIMIT = '1';
process.env.API_RATE_LIMIT_PER_MIN = '99999'; // bypass del limiter global tambien

// 4) Importar el handler de produccion (api/index.js)
const apiHandler = require('./api/index.js');

// 5) Aplicar routing de vercel.json (rutas /api/* y SPA fallback)
const vercelConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8'));
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.pdf': 'application/pdf',
};

// Script que se inyecta al inicio de <head> en HTMLs para hacer que el
// navegador piense que estamos en produccion (oculta test-creds, perf
// overlay, rate-limit toasts, etc.).
const PROD_SPOOF_SCRIPT = `<script>
(function(){
  try {
    // 1) Spoof location.hostname / host para que checks tipo
    //    location.hostname === 'localhost' devuelvan false.
    var SPOOFED_HOST = 'systeminternational.app';
    var origLoc = window.location;
    var locProxy = new Proxy(origLoc, {
      get: function(t, p) {
        if (p === 'hostname' || p === 'host') return SPOOFED_HOST;
        var v = t[p];
        return typeof v === 'function' ? v.bind(t) : v;
      },
      set: function(t, p, v) { t[p] = v; return true; }
    });
    try { Object.defineProperty(document, 'location', { get: function(){ return locProxy; } }); } catch(e){}
    try { Object.defineProperty(window, 'location', { get: function(){ return locProxy; } }); } catch(e){}
  } catch(e){}
})();
</script>
<style>
  /* Ocultar UI de dev/debug que solo aparece en localhost */
  #testCreds, .test-creds { display: none !important; }
  #volvix-perf-panel, [id^="volvix-perf"]:not([id^="volvix-perf-wiring"]) { display: none !important; }
  /* Toasts de rate-limit (RATE LIMIT WARNING en orange) */
  .vlx-ratelimit-warning, .ratelimit-toast, [data-rate-limit-warning] { display: none !important; }
  /* Badge "Volvix listo: X/Y modulos" */
  .volvix-modules-badge, [data-volvix-modules] { display: none !important; }
</style>`;

function injectProdSpoof(html) {
  if (typeof html !== 'string') return html;
  // Inyectar despues del primer <head> (case-insensitive)
  var idx = html.search(/<head[^>]*>/i);
  if (idx === -1) return html;
  var headEnd = html.indexOf('>', idx) + 1;
  return html.slice(0, headEnd) + PROD_SPOOF_SCRIPT + html.slice(headEnd);
}

function serveStatic(req, res, pathname) {
  const safe = pathname.replace(/\.\./g, '');
  const filepath = path.join(PUBLIC_DIR, safe);
  if (!filepath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  if (!fs.existsSync(filepath) || fs.statSync(filepath).isDirectory()) {
    return false;
  }
  const ext = path.extname(filepath);
  const mime = MIME[ext] || 'application/octet-stream';
  // Si es HTML, inyectar el spoof; si no, servir directo
  if (ext === '.html') {
    try {
      const body = fs.readFileSync(filepath, 'utf8');
      const injected = injectProdSpoof(body);
      res.writeHead(200, { 'Content-Type': mime });
      res.end(injected);
      return true;
    } catch (_) { /* fall through to stream */ }
  }
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filepath).pipe(res);
  return true;
}

// Wrapper para api/index.js que captura HTMLs renderizados y les inyecta
// el spoof tambien (para landings dinamicos servidos por api/index.js).
function wrapApiHandlerWithSpoof(handler) {
  return async function(req, res) {
    const origWriteHead = res.writeHead.bind(res);
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);
    let chunks = [];
    let isHtml = false;
    let captured = false;

    res.writeHead = function(statusCode, headers) {
      const ct = headers && (headers['Content-Type'] || headers['content-type']) || '';
      if (typeof ct === 'string' && ct.includes('text/html')) {
        isHtml = true;
        captured = true;
      }
      return origWriteHead(statusCode, headers);
    };
    res.write = function(chunk, enc) {
      if (captured && isHtml) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, enc || 'utf8') : chunk);
        return true;
      }
      return origWrite(chunk, enc);
    };
    res.end = function(chunk, enc) {
      if (captured && isHtml) {
        if (chunk) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, enc || 'utf8') : chunk);
        const body = Buffer.concat(chunks).toString('utf8');
        const injected = injectProdSpoof(body);
        return origEnd(injected);
      }
      return origEnd(chunk, enc);
    };

    return await handler(req, res);
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname || '/';

    // 5a) Routing como vercel.json: /api/* -> api/index.js (sin inyectar HTML)
    if (pathname.startsWith('/api/') || pathname === '/api') {
      return await apiHandler(req, res);
    }
    // 5b) /internal/* -> api/index.js
    if (pathname.startsWith('/internal/') || pathname === '/internal') {
      return await wrapApiHandlerWithSpoof(apiHandler)(req, res);
    }
    // 5c) Static files desde public/ (HTMLs reciben inyeccion de spoof)
    if (pathname !== '/') {
      if (serveStatic(req, res, pathname)) return;
    }
    // 5d) Fallback (incluyendo /) -> api/index.js con inyeccion de spoof
    return await wrapApiHandlerWithSpoof(apiHandler)(req, res);
  } catch (err) {
    console.error('[local-prod-server] error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error: ' + (err.message || err));
    }
  }
});

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => {
  console.log('\n  ╔════════════════════════════════════════════════════════════╗');
  console.log('  ║  🚀 VOLVIX LOCAL-PROD-SERVER (paridad 100% produccion)    ║');
  console.log('  ╚════════════════════════════════════════════════════════════╝\n');
  console.log(`  ✓ http://${HOST}:${PORT}`);
  console.log(`  ✓ Handler: api/index.js (mismo de Vercel produccion)`);
  console.log(`  ✓ Env: ${envLoaded || '(none)'} cargado`);
  console.log(`  ✓ Supabase: ${process.env.SUPABASE_URL}`);
  console.log(`  ✓ Static files: ${PUBLIC_DIR}`);
  console.log('\n  Routes disponibles (todas como en https://systeminternational.app):');
  console.log(`    • http://${HOST}:${PORT}/                 → marketplace landing`);
  console.log(`    • http://${HOST}:${PORT}/login.html       → login`);
  console.log(`    • http://${HOST}:${PORT}/registro.html    → registro`);
  console.log(`    • http://${HOST}:${PORT}/api/health       → API health check`);
  console.log('\n  Ctrl+C para detener.\n');
});
