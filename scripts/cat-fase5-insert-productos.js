#!/usr/bin/env node
/**
 * cat-fase5-insert-productos.js
 * Inserta los 2830 productos en productos_por_giro via PostgREST (batches de 200).
 */
'use strict';
require('dotenv').config();
const fs = require('fs');
const https = require('https');

const SRV = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const URL = (process.env.SUPABASE_URL || '').trim();
const HOST = URL.replace(/^https:\/\//, '').replace(/\/.*/, '');

function pgRest(path, method, body) {
  return new Promise(res => {
    const data = body ? JSON.stringify(body) : '';
    const req = https.request({
      hostname: HOST, path, method,
      headers: {
        'apikey': SRV, 'Authorization': 'Bearer ' + SRV,
        'Content-Type': 'application/json', 'Accept': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
        'Content-Length': Buffer.byteLength(data),
      }
    }, r => {
      let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b }));
    });
    req.on('error', e => res({ status: 0, err: e.message }));
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  // 1) Obtener id por slug de giros_maestro
  const r = await pgRest('/rest/v1/giros_maestro?select=id,slug,sinonimos', 'GET');
  const giros = JSON.parse(r.body);
  console.log('Giros en maestro:', giros.length);
  // Mapear slug + sinonimos → uuid
  const slugToId = {};
  giros.forEach(g => {
    slugToId[g.slug] = g.id;
    (g.sinonimos || []).forEach(s => { slugToId[s] = g.id; });
  });

  // 2) Cargar productos del JSON
  const eco = JSON.parse(fs.readFileSync('public/data/giros-ecosystem.json', 'utf8'));
  const allInserts = [];
  let mapeados = 0, huerfanos = 0;
  eco.giros.forEach(g => {
    const id = slugToId[g.slug];
    if (!id) { huerfanos++; return; }
    (g.productos_plantilla || []).forEach((p, i) => {
      allInserts.push({
        giro_id: id,
        nombre: (p.nombre || '').slice(0, 250),
        precio_mxn: p.precio || null,
        imagen_url: p.imagen || null,
        posicion: i + 1,
        fuente: p.fuente || null,
        hash: p.hash || null,
      });
    });
    mapeados++;
  });
  console.log('Giros eco mapeados:', mapeados, 'huerfanos:', huerfanos);
  console.log('Inserts pendientes:', allInserts.length);

  // 3) Insertar en batches de 200
  const BATCH = 200;
  let inserted = 0, errors = 0;
  for (let i = 0; i < allInserts.length; i += BATCH) {
    const slice = allInserts.slice(i, i + BATCH);
    const r = await pgRest('/rest/v1/productos_por_giro', 'POST', slice);
    if (r.status >= 200 && r.status < 300) {
      inserted += slice.length;
      process.stdout.write('.');
    } else {
      errors++;
      console.log('\nBatch '+(i/BATCH)+' err '+r.status+':', r.body.slice(0,200));
    }
  }
  console.log('\nInsertados:', inserted, 'errors:', errors);

  // 4) Verificar
  const c = await pgRest('/rest/v1/productos_por_giro?select=count', 'GET');
  console.log('Total en tabla:', c.body);
})();
