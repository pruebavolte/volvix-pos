#!/usr/bin/env node
/**
 * dedupe-images.js (V10.41)
 *
 * Para los 13 productos con imágenes duplicadas en V10.40, asigna URLs
 * únicas de loremflickr con keywords diferenciados. loremflickr siempre
 * devuelve imagen distinta para keyword distinto.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ECO_PATH = path.join(__dirname, '..', 'public', 'data', 'giros-ecosystem.json');
const data = JSON.parse(fs.readFileSync(ECO_PATH, 'utf8'));

// Asignaciones únicas (keyword especifico + ID único en URL)
const REPLACEMENTS = {
  'hotel|Noche en habitación doble':       { kw: 'king-size-hotel-room',           p: 1200 },
  'hotel|Cama extra en habitación':        { kw: 'folding-bed-rollaway',           p: 300 },
  'abarrotes|Huevo blanco docena':         { kw: 'egg-carton-twelve-pack',         p: 42 },
  'polleria|Huevo blanco docena':          { kw: 'fresh-farm-eggs',                p: 48 },
  'carniceria|Pechuga de pollo por kilo':  { kw: 'raw-chicken-breast-meat',        p: 120 },
  'polleria|Milanesa de pollo kg':         { kw: 'breaded-chicken-cutlet',         p: 145 },
  'polleria|Pechuga con hueso kg':         { kw: 'bone-in-chicken-breast',         p: 95 },
  'polleria|Pechuga sin hueso kg':         { kw: 'boneless-chicken-fillet',        p: 120 },
  'polleria|Muslo de pollo kg':            { kw: 'raw-chicken-thigh',              p: 75 },
  'electronica|Cargador USB-C carga rápida':{ kw: 'usb-c-fast-charger-adapter',    p: 220 },
  'electronica|Power bank 10000mAh':       { kw: 'portable-battery-bank',          p: 380 },
  'lavanderia|Lavado y secado por carga':  { kw: 'commercial-washing-machine',     p: 75 },
  'lavanderia|Lavado a mano delicado':     { kw: 'hand-washing-delicate-clothes',  p: 95 },
};

let applied = 0;
data.giros.forEach(g => {
  (g.productos_plantilla || []).forEach(p => {
    const key = g.slug + '|' + p.nombre;
    const rep = REPLACEMENTS[key];
    if (rep) {
      p.imagen = 'https://loremflickr.com/640/480/' + encodeURIComponent(rep.kw) + '?lock=' + (Math.abs(hashCode(key)) % 100000);
      p.precio = rep.p;
      p.moneda = 'MXN';
      p.source = 'curated_dedupe';
      delete p.ml_title;
      applied++;
    }
  });
});

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

data._meta.last_audit = new Date().toISOString();
data._meta.products_total = data.giros.reduce((s, g) => s + (g.productos_plantilla || []).length, 0);
data._meta.curated_version = 'V10.41';

// Verificar dedupe
const imgs = {};
data.giros.forEach(g => (g.productos_plantilla || []).forEach(p => {
  imgs[p.imagen] = (imgs[p.imagen] || 0) + 1;
}));
const dups = Object.entries(imgs).filter(([k, v]) => v > 1);

fs.writeFileSync(ECO_PATH, JSON.stringify(data, null, 2));

console.log('═══ DEDUPE V10.41 ═══');
console.log('Aplicado a:', applied, 'productos');
console.log('Total productos:', data._meta.products_total);
console.log('Imágenes únicas:', Object.keys(imgs).length);
console.log('Imágenes duplicadas remaining:', dups.length);
if (dups.length) {
  console.log('');
  dups.forEach(([img, count]) => console.log(' ', count + 'x', img.slice(0, 90)));
}
console.log('');
console.log('✅ Guardado');
