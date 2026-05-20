#!/usr/bin/env node
/**
 * ml-web-scrape-test.js
 *
 * Smoke test: scrape la página pública listado.mercadolibre.com.mx/<query>
 * y extrae nombre+precio+imagen del primer resultado.
 */
'use strict';

const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      method: 'GET',
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-MX,es;q=0.9',
      },
    }, res => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

function extract(html) {
  const result = { title: '', price: null, image: '' };

  // Múltiples patrones para título (ML usa varias estructuras)
  const titleMatch =
    html.match(/<h2[^>]*class="[^"]*ui-search-item__title[^"]*"[^>]*>([^<]+)</) ||
    html.match(/<h3[^>]*class="[^"]*poly-component__title[^"]*"[^>]*>(?:<a[^>]*>)?([^<]+)</) ||
    html.match(/<a[^>]*class="[^"]*poly-component__title[^"]*"[^>]*>([^<]+)</);
  if (titleMatch) result.title = titleMatch[1].trim();

  // Precio
  const priceMatch =
    html.match(/<span class="andes-money-amount__fraction"[^>]*>([0-9.,]+)</) ||
    html.match(/"price":\s*([0-9.]+)/);
  if (priceMatch) {
    const raw = String(priceMatch[1]).replace(/[.,]/g, '');
    const n = parseInt(raw, 10);
    if (n > 0 && n < 10000000) result.price = n;
  }

  // Imagen
  const imgMatch =
    html.match(/<img[^>]+class="[^"]*poly-component__picture[^"]*"[^>]+src="([^"]+)"/) ||
    html.match(/<img[^>]+src="(https:\/\/http2\.mlstatic\.com\/[^"]+)"/) ||
    html.match(/<img[^>]+data-src="(https:\/\/http2\.mlstatic\.com\/[^"]+)"/);
  if (imgMatch) result.image = imgMatch[1];

  return result;
}

(async () => {
  const QUERIES = ['taco-al-pastor', 'pizza-margarita', 'martillo', 'anillo-oro-14k', 'cuaderno-profesional'];
  for (const q of QUERIES) {
    const url = 'https://listado.mercadolibre.com.mx/' + encodeURIComponent(q);
    console.log('\n=== ' + q + ' ===');
    try {
      const r = await get(url);
      console.log('HTTP:', r.status, 'HTML length:', r.body.length);
      if (r.status === 200) {
        const x = extract(r.body);
        console.log('  title:', x.title.slice(0, 70));
        console.log('  price: $' + x.price);
        console.log('  image:', (x.image || '').slice(0, 100));
      } else {
        console.log('  body snippet:', r.body.slice(0, 200));
      }
    } catch(e) { console.log('Error:', e.message); }
  }
})();
