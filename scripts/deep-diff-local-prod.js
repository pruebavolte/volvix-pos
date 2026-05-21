#!/usr/bin/env node
/**
 * Auditoría PROFUNDA de diferencias local vs prod.
 * Compara: HTMLs, JS, JSON, APIs (status + estructura).
 * Reporta no solo diff sino DIFFS REALES de contenido (líneas distintas).
 */
'use strict';
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const LOCAL = 'http://localhost:3000';
const PROD = 'https://systeminternational.app';

const URLS = [
  '/',
  '/marketplace.html',
  '/login.html',
  '/registro.html',
  '/paneldecontrol.html',
  '/salvadorex-pos.html',
  '/landing-template.html',
  '/landing-restaurante.html',
  '/landing-taqueria.html',
  '/version.json',
  '/manifest.json',
  '/sw.js',
  '/auth-gate.js',
  '/data/giros-ecosystem.json',
];

const APIS = [
  '/api/status',
  '/api/giros',
  '/api/giros/stats',
  '/api/giros/list',
  '/api/giros/search?q=carniceria',
  '/api/giros/search?q=plomeria_industrial',  // probable no existe
  '/api/giros/search?q=algo_inventado_xyz',   // certeza no existe
];

function fetch(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https:') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'audit/1' } }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          body: body.toString('utf8'),
          hash: crypto.createHash('sha256').update(body).digest('hex'),
          size: body.length,
        });
      });
      res.on('error', e => resolve({ error: e.message, status: 0 }));
    }).on('error', e => resolve({ error: e.message, status: 0 }));
  });
}

function findRealDiffs(a, b) {
  // Buscar líneas distintas (primeras 5)
  const linesA = a.split('\n');
  const linesB = b.split('\n');
  const diffs = [];
  const max = Math.min(linesA.length, linesB.length);
  for (let i = 0; i < max && diffs.length < 5; i++) {
    if (linesA[i] !== linesB[i]) {
      diffs.push({
        line: i + 1,
        local: linesA[i].slice(0, 100),
        prod: linesB[i].slice(0, 100),
      });
    }
  }
  // Si difieren en cantidad de líneas
  if (linesA.length !== linesB.length) {
    diffs.push({ note: 'line-count', local: linesA.length, prod: linesB.length });
  }
  return diffs;
}

(async () => {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║  AUDITORÍA PROFUNDA: ¿qué difiere ENTRE local y producción?        ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  for (const url of URLS) {
    const [L, P] = await Promise.all([fetch(LOCAL + url), fetch(PROD + url)]);
    if (L.error || P.error) {
      console.log(`❌ ${url}: ERROR L=${L.error || 'ok'} P=${P.error || 'ok'}`);
      continue;
    }
    if (L.hash === P.hash) {
      console.log(`✅ ${url}: IDÉNTICO (${L.size}B)`);
    } else {
      console.log(`⚠️  ${url}: DIFFER (${L.size}B vs ${P.size}B)`);
      const diffs = findRealDiffs(L.body, P.body);
      diffs.forEach(d => {
        if (d.note) {
          console.log(`     · note: ${d.note} local=${d.local} prod=${d.prod}`);
        } else {
          console.log(`     · L${d.line}: [LOCAL] ${d.local}`);
          console.log(`            [PROD ] ${d.prod}`);
        }
      });
    }
  }

  console.log('\n## APIs\n');
  for (const url of APIS) {
    const [L, P] = await Promise.all([fetch(LOCAL + url), fetch(PROD + url)]);
    if (L.status === P.status) {
      console.log(`✅ ${url}: ambos HTTP ${L.status}`);
    } else {
      console.log(`⚠️  ${url}: L=${L.status} P=${P.status}`);
    }
    try {
      const lj = JSON.parse(L.body);
      const pj = JSON.parse(P.body);
      const lKeys = Object.keys(lj).sort().join(',');
      const pKeys = Object.keys(pj).sort().join(',');
      if (lKeys !== pKeys) {
        console.log(`     · DIFFER en estructura: local=[${lKeys}] prod=[${pKeys}]`);
      }
      // Si es /api/giros/search, mostrar exists/slug
      if (url.includes('/search')) {
        console.log(`     · L: exists=${lj.exists}, slug=${lj.slug || 'null'}, landing=${lj.landing || 'null'}`);
        console.log(`     · P: exists=${pj.exists}, slug=${pj.slug || 'null'}, landing=${pj.landing || 'null'}`);
      }
    } catch (_) {}
  }
})();
