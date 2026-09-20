// Uso: node scripts/dev-mock-pos.js  ->  http://127.0.0.1:8899/salvadorex-pos.html  (API simulada, NO toca produccion)
// Antes: en la consola del navegador, en ese mismo origen, poner localStorage 'volvix_token' = JWT sin firma con exp futuro
// y 'volvixSession' = {user_id,tenant_id:'DEMO',role:'owner',expires_at:Date.now()+864e5}. auth-gate solo valida exp.
// Quitar el #onboarding-modal si estorba. Viewport movil 375x812 para verificar la cuadricula.
// Servidor local de PRUEBA: sirve public/ del repo y simula /api/* (sin tocar producción).
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' };
const PRODUCTS = [
  ['Enchiladas Suizas', 140, 'Antojitos'], ['Enmoladas', 140, 'Antojitos'], ['Milanesa de Res', 150, 'Guisados y Caldos'],
  ['Caldo de Res', 150, 'Guisados y Caldos'], ['Arroz', 30, 'Guarniciones'], ['Frijoles', 30, 'Guarniciones'],
  ['Agua natural', 40, 'Bebidas'], ['Coca vidrio', 35, 'Bebidas'], ['Pay de queso', 60, 'Postres y Botanas'],
].map((p, i) => ({ id: 'p' + i, code: 'p' + i, name: p[0], price: p[1], stock: 99, category: p[2], tenant_id: 'DEMO', is_active: true, image_url: null }));
const pending = [];
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      const send = (o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      const k = req.method + ' ' + u.pathname;
      console.log(k);
      if (k === 'GET /api/products') return send({ ok: true, items: PRODUCTS, products: PRODUCTS, data: PRODUCTS });
      if (k === 'GET /api/sales/pending') return send({ ok: true, items: pending });
      if (k === 'POST /api/sales/pending') { const b = JSON.parse(body || '{}'); b.id = 'PEND' + (pending.length + 1); b.created_at = new Date().toISOString(); pending.push(b); return send({ ok: true, id: b.id }); }
      if (k.startsWith('DELETE /api/sales/pending/')) { const id = u.pathname.split('/').pop(); const i = pending.findIndex(p => p.id === id); if (i >= 0) pending.splice(i, 1); return send({ ok: true }); }
      if (k === 'GET /api/products/modifiers') { const sku = u.searchParams.get('sku') || u.searchParams.get('parent_sku'); if (sku === 'p0') return send({ ok: true, modifiers: [ { modifier_key: 'a', modifier_label: 'Arroz', group_label: 'Guarnicion', price_delta: 0, required: true, multiselect: false, max_qty: 1, active: true, sort_order: 0 }, { modifier_key: 'b', modifier_label: 'Frijoles', group_label: 'Guarnicion', price_delta: 0, required: true, multiselect: false, max_qty: 1, active: true, sort_order: 1 }, { modifier_key: 'c', modifier_label: 'Queso extra', group_label: 'Extras', price_delta: 15, required: false, multiselect: true, max_qty: 1, active: true, sort_order: 2 } ] }); return send({ ok: true, modifiers: [] }); }
      if (u.pathname === '/api/me' || u.pathname === '/api/auth/me') return send({ ok: true, user: { id: 'u1', tenant_id: 'DEMO', role: 'owner', name: 'Demo' } });
      return send({ ok: true, items: [], data: [], modifiers: [] });
    });
    return;
  }
  let p = decodeURIComponent(u.pathname); if (p === '/') p = '/salvadorex-pos.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
const PORT = Number(process.env.MOCK_PORT) || 8899; // MOCK_PORT=8897 node scripts/dev-mock-pos.js (evita choque con otras sesiones)
srv.listen(PORT, '127.0.0.1', () => console.log('mock POS en http://127.0.0.1:' + PORT));
