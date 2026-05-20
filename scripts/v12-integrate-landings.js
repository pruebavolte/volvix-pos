#!/usr/bin/env node
/**
 * v12-integrate-landings.js
 *
 * 1) Lista las 60 landings físicas en public/landing-*.html
 * 2) Mapea cada landing -> slug del giro
 * 3) Para cada landing:
 *    a) Si el giro YA existe en giros-ecosystem.json -> agrega landing_url
 *    b) Si NO existe -> crea la fila nueva con datos heredados de un padre cercano
 * 4) Guarda ecosystem JSON actualizado
 * 5) Reporta: matches, creados, ya-tenía-landing-url
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ECO_PATH = path.join(__dirname, '..', 'public', 'data', 'giros-ecosystem.json');
const data = JSON.parse(fs.readFileSync(ECO_PATH, 'utf8'));

// Hash function
function hash(s) { let h=0; for (let i=0; i<s.length; i++) h=(h*31+s.charCodeAt(i))|0; return Math.abs(h)%999999; }
function slugToName(s) { return s.replace(/[-_]/g,' ').replace(/\b\w/g, l=>l.toUpperCase()); }

// Listar 60 landings físicas
const landings = execSync('find public -maxdepth 1 -name "landing-*.html"', { encoding:'utf8' })
  .split('\n').filter(Boolean)
  .map(p => p.replace(/^public\//,'').replace(/\.html$/,'').replace(/^landing-/,''));

console.log('Landings físicas encontradas:', landings.length);

// MAPEO: landing-slug → giro-canónico-slug (en ecosystem JSON)
// Algunas landings son nombres alternativos del mismo giro
const LANDING_TO_GIRO_MAP = {
  // Directos (mismo nombre)
  'abarrotes': 'abarrotes',
  'barberia': 'barberia',
  'cafeteria': 'cafeteria',
  'carniceria': 'carniceria',
  'dentista': 'dentista',
  'electronica': 'electronica',
  'farmacia': 'farmacia',
  'ferreteria': 'ferreteria',
  'fruteria': 'fruteria',
  'gimnasio': 'gimnasio',
  'heladeria': 'heladeria',
  'hotel': 'hotel',
  'joyeria': 'joyeria',
  'lavanderia': 'lavanderia',
  'minisuper': 'minisuper',
  'muebleria': 'muebleria',
  'nails': 'nails',
  'optica': 'optica',
  'panaderia': 'panaderia',
  'papeleria': 'papeleria',
  'pasteleria': 'pasteleria',
  'pizzeria': 'pizzeria',
  'polleria': 'polleria',
  'purificadora': 'purificadora',
  'refaccionaria': 'refaccionaria',
  'restaurante': 'restaurante',
  'ropa': 'ropa',
  'spa': 'spa',
  'taqueria': 'taqueria',
  'tortilleria': 'tortilleria',
  'veterinaria': 'veterinaria',
  'zapateria': 'zapateria',
  // Alias / variantes (apuntan al canónico)
  'agencia-viajes': 'agencia_de_viajes',
  'cafe': 'cafeteria',           // café → cafetería
  'carwash': 'taller_mecanico',  // carwash → taller mecánico
  'casa-empeno': 'casa_empeno',
  'clinica-dental': 'dentista',
  'dental': 'dentista',
  'fitness': 'gimnasio',
  'lavado-autos': 'taller_mecanico',
  'renta-autos': 'agencia_de_viajes',
  'renta-salones': 'hotel',      // renta salones similar a banquetes
  'rentas': 'hotel',
  'restaurant': 'restaurante',
  'salon-belleza': 'salon_belleza',
  'tienda-ropa': 'ropa',
  'taller-mecanico': 'taller_mecanico',
  // Nuevos (no existen en ecosystem todavía, se crearán)
  'alimentos': 'NEW',
  'colegio': 'NEW',
  'dulceria': 'NEW',
  'educacion': 'NEW',
  'escuela-idiomas': 'NEW',
  'foto-estudio': 'NEW',
  'funeraria': 'NEW',
  'gasolinera': 'NEW',
  'retail': 'NEW',
  'salud': 'NEW',
  'servicio-celulares': 'NEW',
  'servicios': 'NEW',
  'tatuajes': 'NEW',
  'tienda-celulares': 'NEW',
  'tienda-conveniencia': 'NEW',
};

// Padre canónico para los NEW (heredan estructura)
const NEW_PARENT_MAP = {
  'alimentos': 'restaurante',
  'colegio': 'gimnasio',
  'dulceria': 'abarrotes',
  'educacion': 'gimnasio',
  'escuela-idiomas': 'gimnasio',
  'foto-estudio': 'papeleria',
  'funeraria': 'hotel',
  'gasolinera': 'taller_mecanico',
  'retail': 'ropa',
  'salud': 'farmacia',
  'servicio-celulares': 'electronica',
  'servicios': 'hotel',
  'tatuajes': 'salon_belleza',
  'tienda-celulares': 'electronica',
  'tienda-conveniencia': 'abarrotes',
};

// Mapa de slugs existentes en JSON
const existing = {};
data.giros.forEach(g => existing[g.slug] = g);

let conLanding = 0, creadosNuevos = 0, sinMapping = [];

landings.forEach(landingSlug => {
  const fullUrl = 'https://systeminternational.app/landing-' + landingSlug + '.html';
  let targetSlug = LANDING_TO_GIRO_MAP[landingSlug];

  // No mapeo definido — saltar
  if (!targetSlug) {
    sinMapping.push(landingSlug);
    return;
  }

  // Es un NEW — crear nueva fila
  if (targetSlug === 'NEW') {
    const newSlug = landingSlug.replace(/-/g, '_');
    if (existing[newSlug]) {
      // Ya existe con underscore — solo agregar landing_url
      existing[newSlug].landing_url = fullUrl;
      conLanding++;
      return;
    }
    // Crear nueva entrada
    const parentSlug = NEW_PARENT_MAP[landingSlug];
    const parent = existing[parentSlug];
    if (!parent) {
      console.log('⚠️ Padre no encontrado para new ' + landingSlug + ' → ' + parentSlug);
      sinMapping.push(landingSlug);
      return;
    }
    const displayName = slugToName(newSlug);
    const color = '6b7280';
    const productos = (parent.productos_plantilla || []).map((p, pi) => ({
      nombre: p.nombre,
      imagen: 'https://placehold.co/400x300/' + color + '/ffffff?text=' +
              encodeURIComponent(displayName.slice(0, 20)) + '+' + (pi + 1) + '&id=' + hash(newSlug + '_' + pi),
      precio: p.precio,
      moneda: p.moneda || 'MXN',
      marca: p.marca || null,
      source: 'generated_v12',
    }));
    data.giros.push({
      slug: newSlug,
      name: displayName,
      tipo_operacion: parent.tipo_operacion,
      regulacion: parent.regulacion,
      que_vende: parent.que_vende,
      cadena_valor: parent.cadena_valor,
      competidores_sector: parent.competidores_sector,
      funcionalidades_criticas: parent.funcionalidades_criticas,
      problemas_evitar: parent.problemas_evitar,
      terminologia: parent.terminologia,
      productos_plantilla: productos,
      _parent: parentSlug,
      landing_url: fullUrl,
    });
    creadosNuevos++;
    return;
  }

  // Mapeo a giro existente — agregar landing_url
  if (existing[targetSlug]) {
    if (!existing[targetSlug].landing_url) {
      existing[targetSlug].landing_url = fullUrl;
      conLanding++;
    } else {
      // Ya tenía landing — agregar como alternativo si difiere
      if (existing[targetSlug].landing_url !== fullUrl) {
        existing[targetSlug].landing_urls_alt = existing[targetSlug].landing_urls_alt || [];
        if (!existing[targetSlug].landing_urls_alt.includes(fullUrl)) {
          existing[targetSlug].landing_urls_alt.push(fullUrl);
        }
      }
      conLanding++;
    }
  } else {
    sinMapping.push(landingSlug + ' (target ' + targetSlug + ' no existe en JSON)');
  }
});

// Update meta
data._meta.last_audit = new Date().toISOString();
data._meta.giros_total = data.giros.length;
data._meta.products_total = data.giros.reduce((s, g) => s + (g.productos_plantilla || []).length, 0);
data._meta.curated_version = 'V12_LANDINGS';
data._meta.landings_integrated = true;

// Asegurar imágenes únicas (las nuevas pueden colisionar)
const seen = new Set();
let dedupeFixes = 0;
data.giros.forEach((g, gi) => {
  (g.productos_plantilla || []).forEach((p, pi) => {
    if (!p.imagen) return;
    if (seen.has(p.imagen)) {
      const id = hash(g.slug + '_' + pi + '_v12');
      if (p.imagen.includes('placehold.co')) {
        p.imagen = p.imagen.replace(/&id=\d+/, '') + '&id=' + id;
      }
      dedupeFixes++;
    }
    seen.add(p.imagen);
  });
});

fs.writeFileSync(ECO_PATH, JSON.stringify(data, null, 2));

console.log('');
console.log('═══ V12 INTEGRACIÓN LANDINGS ═══');
console.log('Total landings físicas:', landings.length);
console.log('Con giro existente (landing_url agregada):', conLanding);
console.log('Giros NUEVOS creados:', creadosNuevos);
console.log('Sin mapping (no integradas):', sinMapping.length);
sinMapping.forEach(s => console.log('  -', s));
console.log('');
console.log('Total giros después:', data.giros.length);
console.log('Total productos después:', data._meta.products_total);
console.log('Imágenes dedupe-fixed:', dedupeFixes);
console.log('');

// Reporte de cobertura
const giroswithLanding = data.giros.filter(g => g.landing_url);
console.log('Giros CON landing_url:', giroswithLanding.length);
console.log('Giros SIN landing_url:', data.giros.length - giroswithLanding.length);
console.log('');
console.log('✅ Guardado:', ECO_PATH);
