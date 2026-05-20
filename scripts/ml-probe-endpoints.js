#!/usr/bin/env node
/**
 * ml-probe-endpoints.js
 *
 * Verifica qué endpoints sí responden 200 con el token actual.
 * Confirma que el token es válido y descubre qué hay disponible.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const env = {};
fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2];
});
const token = env.MERCADOLIBRE_ACCESS_TOKEN || env.MERCADOLIBRE_TOKEN;

function req(p) {
  return new Promise(r => {
    const x = https.request({
      method: 'GET',
      hostname: 'api.mercadolibre.com',
      path: p,
      headers: { 'Authorization': 'Bearer ' + token, 'User-Agent': 'Volvix-POS/10.40' },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => r({ status: res.statusCode, body: d.slice(0, 400) }));
    });
    x.on('error', e => r({ status: 0, err: e.message }));
    x.end();
  });
}

const ENDPOINTS = [
  '/users/me',
  '/sites/MLM',
  '/sites/MLM/categories',
  '/items?ids=MLM3506876756',           // anillo de oro popular
  '/items/MLM3506876756',
  '/highlights/MLM/category/MLM1132',   // categoria juguetes
  '/categories/MLM1132',
  '/sites/MLM/category_predictor/predict?title=' + encodeURIComponent('pizza margarita'),
  '/products/search?status=active&site_id=MLM&q=' + encodeURIComponent('taco'),
  '/products/search?site_id=MLM&q=' + encodeURIComponent('taco'),
];

(async () => {
  console.log('═══ ML API ENDPOINT PROBE ═══\n');
  for (const ep of ENDPOINTS) {
    const r = await req(ep);
    console.log((r.status === 200 ? '✅' : '❌'), r.status, ep.slice(0,80));
    if (r.status !== 200 && r.body) console.log('   ', r.body.slice(0, 150));
  }
})();
