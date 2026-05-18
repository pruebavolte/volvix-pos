// Servidor HTTP estático mínimo para servir public/ en localhost
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', 'public');
const PORT = parseInt(process.env.PORT || '8080', 10);

const MIME = {
  '.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.svg':'image/svg+xml','.ico':'image/x-icon','.webp':'image/webp'
};

http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const full = path.join(ROOT, decodeURIComponent(p));
  // Seguridad simple
  if (!full.startsWith(ROOT)) { res.statusCode = 403; res.end('forbidden'); return; }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('Content-Type', MIME[path.extname(full)] || 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    fs.createReadStream(full).pipe(res);
  });
}).listen(PORT, () => console.log(`Serving ${ROOT} on http://localhost:${PORT}`));
