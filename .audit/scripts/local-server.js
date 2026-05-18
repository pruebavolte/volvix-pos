// Servidor estático local para validar la branch feature SIN tocar prod
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5757;
const ROOT = path.resolve(__dirname, '../../public');

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/marketplace.html';
  const filepath = path.join(ROOT, p);
  if (!filepath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.readFile(filepath, (err, data) => {
    if (err) {
      console.log(`404 ${p}`);
      res.writeHead(404); return res.end('Not found: ' + p);
    }
    const ext = path.extname(filepath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
    console.log(`200 ${p}`);
  });
}).listen(PORT, () => {
  console.log(`[local-server] http://localhost:${PORT}/ serving ${ROOT}`);
});
