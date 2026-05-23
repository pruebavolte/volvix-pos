#!/usr/bin/env node
/**
 * verify-local-prod-parity.js
 *
 * Verifica byte-por-byte (via hash SHA256) que cada URL en local
 * coincide con la misma URL en producción.
 *
 * Reporta diferencias en HTMLs, JS, CSS, JSON.
 * Sobre APIs: compara estructura (mismo schema/campos), no valores exactos
 * (porque APIs traen timestamps dinámicos).
 */
'use strict';
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const LOCAL = 'http://localhost:3000';
const PROD = 'https://systeminternational.app';

const STATIC_PATHS = [
  // HTMLs principales
  '/',
  '/marketplace.html',
  '/login.html',
  '/registro.html',
  '/paneldecontrol.html',
  '/salvadorex-pos.html',
  '/pos.html',
  '/volvix_owner_panel_v7.html',
  '/volvix_owner_panel_v8.html',
  '/volvix-launcher.html',
  // PWA
  '/manifest.json',
  '/sw.js',
  // Landings (algunas para muestreo)
  '/landing-template.html',
  '/landing-abarrotes.html',
  '/landing-cafeteria.html',
  // JS módulos
  '/version.json',
  '/auth-gate.js',
  '/data/giros-ecosystem.json',
];

const API_PATHS = [
  '/api/status',
  '/api/giros',
  '/api/giros/config?slug=abarrotes',
];

function fetch(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https:') ? https : http;
    const start = Date.now();
    lib.get(url, { headers: { 'User-Agent': 'parity-checker/1.0' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
          hash: crypto.createHash('sha256').update(body).digest('hex'),
          size: body.length,
          ms: Date.now() - start,
        });
      });
      res.on('error', (e) => resolve({ status: 0, error: e.message }));
    }).on('error', (e) => resolve({ status: 0, error: e.message }));
  });
}

function pad(s, n) { return String(s).padEnd(n).slice(0, n); }

(async () => {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  VERIFICACIÓN DE PARIDAD LOCAL vs PRODUCCIÓN');
  console.log('  Local: ' + LOCAL);
  console.log('  Prod:  ' + PROD);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // STATIC
  console.log('## ESTÁTICOS (HTML/JS/CSS/JSON) — hash SHA256 byte-por-byte');
  console.log('');
  console.log(pad('PATH', 36) + pad('LOCAL', 12) + pad('PROD', 12) + pad('SIZE', 18) + 'MATCH');
  console.log('─'.repeat(95));
  let matches = 0, diffs = 0, errors = 0;
  for (const p of STATIC_PATHS) {
    const [L, P] = await Promise.all([fetch(LOCAL + p), fetch(PROD + p)]);
    let status;
    if (L.status === 0 || P.status === 0) {
      errors++; status = 'ERROR (' + (L.error || P.error) + ')';
    } else if (L.status !== P.status) {
      diffs++; status = '❌ STATUS DIFF';
    } else if (L.hash === P.hash) {
      matches++; status = '✅ IDÉNTICO';
    } else {
      diffs++;
      status = '⚠️  DIFF (L=' + L.hash.slice(0, 8) + ' P=' + P.hash.slice(0, 8) + ')';
    }
    const sizeStr = (L.size || 0) + 'B vs ' + (P.size || 0) + 'B';
    console.log(pad(p, 36) + pad(L.status, 12) + pad(P.status, 12) + pad(sizeStr, 18) + status);
  }
  console.log('');
  console.log('Estáticos: ' + matches + ' IDÉNTICOS · ' + diffs + ' DIFF · ' + errors + ' ERROR');

  // APIs
  console.log('');
  console.log('## APIs — status code + estructura (campos top-level)');
  console.log('');
  console.log(pad('PATH', 40) + pad('LOCAL', 10) + pad('PROD', 10) + 'CAMPOS');
  console.log('─'.repeat(85));
  for (const p of API_PATHS) {
    const [L, P] = await Promise.all([fetch(LOCAL + p), fetch(PROD + p)]);
    let lJson = null, pJson = null;
    try { lJson = JSON.parse(L.body.toString()); } catch (_) {}
    try { pJson = JSON.parse(P.body.toString()); } catch (_) {}
    const lFields = lJson && typeof lJson === 'object' ? Object.keys(lJson).sort().join(',') : '(no-json)';
    const pFields = pJson && typeof pJson === 'object' ? Object.keys(pJson).sort().join(',') : '(no-json)';
    const sameStruct = lFields === pFields ? '✅' : '❌ L: ' + lFields + ' vs P: ' + pFields;
    console.log(pad(p, 40) + pad(L.status, 10) + pad(P.status, 10) + sameStruct);
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (diffs === 0 && errors === 0) {
    console.log('  ✅ 100% PARIDAD — Local === Producción byte-por-byte');
  } else {
    console.log('  ⚠️  HAY DIFERENCIAS — revisar tabla arriba');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
})();
