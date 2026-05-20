#!/usr/bin/env node
/**
 * replace-loremflickr.js (V10.42)
 *
 * Reemplaza URLs loremflickr.com (servidor lento, puede tardar 1-3s)
 * con placehold.co (CDN edge, ~50ms). Para servicios sin foto real,
 * un placeholder con texto del producto es lo mejor.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'giros-ecosystem.json'), 'utf8'));

const GIRO_COLOR = {
  sex_shop: 'e91e63', restaurante: 'd97706', veterinaria: '0ea5e9', dentista: '06b6d4',
  hotel: '7c3aed', farmacia: '10b981', optica: '6366f1', gimnasio: 'ef4444',
  salon_belleza: 'db2777', taller_mecanico: '1f2937', abarrotes: 'f59e0b', barberia: '0f172a',
  panaderia: 'a16207', cafeteria: '78350f', ferreteria: 'b45309', pizzeria: 'dc2626',
  taqueria: 'b91c1c', heladeria: '0284c7', pasteleria: 'be185d', jugos_naturales: '16a34a',
  jugos_frescos: '15803d', marisqueria: '0369a1', sushi: '991b1b', hamburguesas: 'b45309',
  fruteria: '16a34a', carniceria: '991b1b', polleria: 'd97706', tortilleria: 'a16207',
  ropa: '7c2d12', zapateria: '6b21a8', electronica: '1e40af', papeleria: '2563eb',
  joyeria: '92400e', floreria: 'db2777', lavanderia: '0ea5e9', muebleria: '78350f',
};

let replaced = 0;
data.giros.forEach(g => {
  (g.productos_plantilla || []).forEach(p => {
    if (p.imagen && p.imagen.includes('loremflickr.com')) {
      const color = GIRO_COLOR[g.slug] || '6b7280';
      const txt = encodeURIComponent((p.nombre || '').slice(0, 28));
      p.imagen = 'https://placehold.co/400x300/' + color + '/ffffff?text=' + txt;
      p.source = 'placeholder';
      replaced++;
    }
  });
});

data._meta.last_audit = new Date().toISOString();
data._meta.products_total = data.giros.reduce((s, g) => s + (g.productos_plantilla || []).length, 0);
data._meta.curated_version = 'V10.42';

// Final dedupe check
const imgs = {};
data.giros.forEach(g => (g.productos_plantilla || []).forEach(p => imgs[p.imagen] = (imgs[p.imagen] || 0) + 1));
const dups = Object.entries(imgs).filter(([k, v]) => v > 1);

fs.writeFileSync(path.join(__dirname, '..', 'public', 'data', 'giros-ecosystem.json'), JSON.stringify(data, null, 2));

console.log('═══ REPLACE LOREMFLICKR → PLACEHOLD.CO (V10.42) ═══');
console.log('Reemplazados:', replaced);
console.log('Total productos:', data._meta.products_total);
console.log('Imágenes únicas:', Object.keys(imgs).length);
console.log('Duplicadas:', dups.length);
if (dups.length) dups.forEach(([img, c]) => console.log(' ', c + 'x', img.slice(0, 90)));
console.log('✅ Guardado');
