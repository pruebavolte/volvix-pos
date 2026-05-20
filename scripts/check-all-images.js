#!/usr/bin/env node
/**
 * check-all-images.js (V10.41)
 *
 * HEAD-check de las 360 URLs de imagen para detectar huecos (404, timeout).
 */
'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'giros-ecosystem.json'), 'utf8'));
const items = [];
data.giros.forEach(g => (g.productos_plantilla || []).forEach(p => items.push({ g: g.slug, n: p.nombre, img: p.imagen })));

function head(url, timeout = 5000) {
  // Use GET with Range 0-0 (only 1 byte) — mlstatic.com no acepta HEAD pero sí GET
  return new Promise(r => {
    if (!url || !url.startsWith('http')) return r({ ok: false, code: 0 });
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; try { req.destroy(); } catch(_){} r({ ok: false, code: 0, err: 'timeout' }); } }, timeout);
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
        'Range': 'bytes=0-0',
        'Accept': 'image/*',
      }
    }, res => {
      if (!done) { done = true; clearTimeout(t); try { req.destroy(); } catch(_){} r({ ok: res.statusCode >= 200 && res.statusCode < 400, code: res.statusCode }); }
    });
    req.on('error', e => { if (!done) { done = true; clearTimeout(t); r({ ok: false, code: 0, err: e.message }); } });
    req.end();
  });
}

(async () => {
  console.log('═══ HEAD-CHECK '+items.length+' IMÁGENES ═══');
  const fails = [];
  const okByHost = {};
  const CONCURRENCY = 20;
  let done = 0;
  async function worker(start) {
    for (let i = start; i < items.length; i += CONCURRENCY) {
      const it = items[i];
      const r = await head(it.img);
      done++;
      if (done % 50 === 0) process.stdout.write('.');
      if (!r.ok) {
        fails.push({ ...it, code: r.code, err: r.err });
      } else {
        try {
          const host = new URL(it.img).hostname;
          okByHost[host] = (okByHost[host] || 0) + 1;
        } catch(_){}
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
  console.log('');
  console.log('');
  console.log('OK por host:');
  Object.entries(okByHost).sort((a, b) => b[1] - a[1]).forEach(([h, c]) => console.log(' ', c, '×', h));
  console.log('');
  console.log('FALLAS:', fails.length);
  fails.slice(0, 20).forEach(f => console.log(' ', f.code || 'ERR', f.g.padEnd(14), '→', f.n.slice(0,35).padEnd(35), '   ', (f.img || '').slice(0, 80)));
})();
