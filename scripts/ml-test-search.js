#!/usr/bin/env node
/**
 * ml-test-search.js
 *
 * Smoke test: usar MERCADOLIBRE_ACCESS_TOKEN para buscar productos en MLM.
 * Prueba 5 queries variadas y reporta nombre+precio+thumbnail por cada.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const envPath = path.join(__dirname, '..', '.env');
const envText = fs.readFileSync(envPath, 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2];
});

const token = env.MERCADOLIBRE_ACCESS_TOKEN || env.MERCADOLIBRE_TOKEN;
if (!token) { console.error('❌ No token'); process.exit(1); }

function search(q) {
  return new Promise((resolve, reject) => {
    const url = '/sites/MLM/search?q=' + encodeURIComponent(q) + '&limit=3';
    const req = https.request({
      method: 'GET',
      hostname: 'api.mercadolibre.com',
      path: url,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
        'User-Agent': 'Volvix-POS/10.40',
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const QUERIES = ['taco', 'pizza', 'martillo', 'anillo oro', 'cuaderno'];
  for (const q of QUERIES) {
    const r = await search(q);
    console.log('\n=== Query: '+q+' ===');
    console.log('HTTP:', r.status);
    if (r.status !== 200) {
      console.log('Body:', r.body.slice(0, 300));
      continue;
    }
    try {
      const j = JSON.parse(r.body);
      console.log('Total results:', j.paging?.total);
      (j.results || []).slice(0, 3).forEach((p, i) => {
        console.log(' ', (i+1)+'.', p.title.slice(0,50), '— $'+p.price, p.currency_id);
        console.log('     thumb:', (p.thumbnail || '').slice(0, 90));
      });
    } catch(e) { console.log('Parse error:', e.message); }
  }
})();
