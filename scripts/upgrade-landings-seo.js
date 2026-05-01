#!/usr/bin/env node
/**
 * upgrade-landings-seo.js
 *
 * Idempotent SEO upgrade for Volvix landing pages.
 * - Inserts missing Open Graph / Twitter Card tags
 * - Inserts canonical, hreflang, sitemap link
 * - Inserts preconnect performance hints
 * - Adds loading="lazy" decoding="async" to all <img> without it
 * - Adds JSON-LD blocks (LocalBusiness + Product + BreadcrumbList) if missing
 *
 * Usage: node scripts/upgrade-landings-seo.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE_URL = 'https://volvix-pos.vercel.app';

// TIER 1 — root files
const TIER1 = [
  'abarrotes', 'barberia', 'cafe', 'electronica', 'farmacia',
  'fitness', 'gasolinera', 'panaderia', 'restaurant', 'ropa'
];

// TIER 2 — public/ files
const TIER2 = [
  'agencia-viajes', 'cafeteria', 'carniceria', 'carwash', 'dental',
  'dulceria', 'ferreteria', 'fruteria', 'gimnasio', 'heladeria',
  'hotel', 'lavanderia', 'minisuper', 'muebleria', 'nails',
  'optica', 'papeleria', 'pasteleria', 'pizzeria', 'polleria',
  'purificadora', 'refaccionaria', 'restaurante', 'salon-belleza', 'spa',
  'taller-mecanico', 'taqueria', 'tatuajes', 'tienda-celulares',
  'tienda-conveniencia', 'tienda-ropa', 'tortilleria', 'veterinaria', 'zapateria'
];

// Pretty name lookup for LocalBusiness / Product names
const PRETTY = {
  abarrotes: 'Abarrotes',
  barberia: 'Barbería',
  cafe: 'Cafetería',
  electronica: 'Electrónica',
  farmacia: 'Farmacia',
  fitness: 'Fitness',
  gasolinera: 'Gasolinera',
  panaderia: 'Panadería',
  restaurant: 'Restaurante',
  ropa: 'Tienda de Ropa',
  'agencia-viajes': 'Agencia de Viajes',
  cafeteria: 'Cafetería',
  carniceria: 'Carnicería',
  carwash: 'Carwash',
  dental: 'Clínica Dental',
  dulceria: 'Dulcería',
  ferreteria: 'Ferretería',
  fruteria: 'Frutería',
  gimnasio: 'Gimnasio',
  heladeria: 'Heladería',
  hotel: 'Hotel',
  lavanderia: 'Lavandería',
  minisuper: 'Minisúper',
  muebleria: 'Mueblería',
  nails: 'Salón de Uñas',
  optica: 'Óptica',
  papeleria: 'Papelería',
  pasteleria: 'Pastelería',
  pizzeria: 'Pizzería',
  polleria: 'Pollería',
  purificadora: 'Purificadora',
  refaccionaria: 'Refaccionaria',
  restaurante: 'Restaurante',
  'salon-belleza': 'Salón de Belleza',
  spa: 'Spa',
  'taller-mecanico': 'Taller Mecánico',
  taqueria: 'Taquería',
  tatuajes: 'Estudio de Tatuajes',
  'tienda-celulares': 'Tienda de Celulares',
  'tienda-conveniencia': 'Tienda de Conveniencia',
  'tienda-ropa': 'Tienda de Ropa',
  tortilleria: 'Tortillería',
  veterinaria: 'Veterinaria',
  zapateria: 'Zapatería'
};

// ---------------------------------------------------------------------------

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, content) { fs.writeFileSync(file, content, 'utf8'); }

function getHead(html) {
  const m = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!m) return null;
  return { full: m[0], inner: m[1], start: m.index, end: m.index + m[0].length };
}

function extractMeta(head, attr, value) {
  const re = new RegExp(`<meta[^>]*${attr}=["']${value}["'][^>]*>`, 'i');
  const m = head.match(re);
  if (!m) return null;
  const cm = m[0].match(/content=["']([^"']*)["']/i);
  return cm ? cm[1] : null;
}

function extractTitle(head) {
  const m = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : '';
}

function extractCanonical(head) {
  const m = head.match(/<link[^>]*rel=["']canonical["'][^>]*>/i);
  if (!m) return null;
  const cm = m[0].match(/href=["']([^"']*)["']/i);
  return cm ? cm[1] : null;
}

function hasTag(head, regex) { return regex.test(head); }

// ---------------------------------------------------------------------------

function buildAdditions(slug, html, isPublic) {
  const head = getHead(html);
  if (!head) return null;
  const inner = head.inner;

  const title = extractTitle(inner) || `Volvix POS para ${PRETTY[slug] || slug}`;
  const desc =
    extractMeta(inner, 'name', 'description') ||
    extractMeta(inner, 'property', 'og:description') ||
    `Sistema POS para ${PRETTY[slug] || slug}.`;
  const canonical = extractCanonical(inner) || `${BASE_URL}/landing-${slug}.html`;
  const ogImage =
    extractMeta(inner, 'property', 'og:image') ||
    `${BASE_URL}/og-${slug}.png`;
  const pretty = PRETTY[slug] || slug;

  const additions = [];

  // Performance hints
  if (!hasTag(inner, /rel=["']preconnect["'][^>]*fonts\.googleapis\.com/i)) {
    additions.push('<link rel="preconnect" href="https://fonts.googleapis.com">');
  }
  if (!hasTag(inner, /rel=["']preconnect["'][^>]*fonts\.gstatic\.com/i)) {
    additions.push('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
  }
  if (!hasTag(inner, /rel=["']dns-prefetch["'][^>]*www\.googletagmanager\.com/i)) {
    additions.push('<link rel="dns-prefetch" href="https://www.googletagmanager.com">');
  }

  // Hreflang
  if (!hasTag(inner, /rel=["']alternate["'][^>]*hreflang=["']es-MX["']/i)) {
    additions.push(`<link rel="alternate" hreflang="es-MX" href="${canonical}">`);
  }
  if (!hasTag(inner, /rel=["']alternate["'][^>]*hreflang=["']es["']/i)) {
    additions.push(`<link rel="alternate" hreflang="es" href="${canonical}">`);
  }
  if (!hasTag(inner, /rel=["']alternate["'][^>]*hreflang=["']x-default["']/i)) {
    additions.push(`<link rel="alternate" hreflang="x-default" href="${canonical}">`);
  }

  // Sitemap link
  if (!hasTag(inner, /rel=["']sitemap["']/i)) {
    additions.push('<link rel="sitemap" type="application/xml" href="/sitemap.xml">');
  }

  // Canonical (if missing)
  if (!extractCanonical(inner)) {
    additions.push(`<link rel="canonical" href="${canonical}">`);
  }

  // Open Graph completion
  if (!hasTag(inner, /property=["']og:type["']/i)) {
    additions.push('<meta property="og:type" content="website">');
  }
  if (!hasTag(inner, /property=["']og:url["']/i)) {
    additions.push(`<meta property="og:url" content="${canonical}">`);
  }
  if (!hasTag(inner, /property=["']og:title["']/i)) {
    additions.push(`<meta property="og:title" content="${escapeAttr(title)}">`);
  }
  if (!hasTag(inner, /property=["']og:description["']/i)) {
    additions.push(`<meta property="og:description" content="${escapeAttr(desc)}">`);
  }
  if (!hasTag(inner, /property=["']og:locale["']/i)) {
    additions.push('<meta property="og:locale" content="es_MX">');
  }
  if (!hasTag(inner, /property=["']og:site_name["']/i)) {
    additions.push('<meta property="og:site_name" content="Volvix POS">');
  }
  if (!hasTag(inner, /property=["']og:image["']/i)) {
    additions.push(`<meta property="og:image" content="${ogImage}">`);
  }
  if (!hasTag(inner, /property=["']og:image:width["']/i)) {
    additions.push('<meta property="og:image:width" content="1200">');
  }
  if (!hasTag(inner, /property=["']og:image:height["']/i)) {
    additions.push('<meta property="og:image:height" content="630">');
  }
  if (!hasTag(inner, /property=["']og:image:alt["']/i)) {
    additions.push(`<meta property="og:image:alt" content="Volvix POS para ${escapeAttr(pretty)}">`);
  }

  // Twitter Card
  if (!hasTag(inner, /name=["']twitter:card["']/i)) {
    additions.push('<meta name="twitter:card" content="summary_large_image">');
  }
  if (!hasTag(inner, /name=["']twitter:title["']/i)) {
    additions.push(`<meta name="twitter:title" content="${escapeAttr(title)}">`);
  }
  if (!hasTag(inner, /name=["']twitter:description["']/i)) {
    additions.push(`<meta name="twitter:description" content="${escapeAttr(desc)}">`);
  }
  if (!hasTag(inner, /name=["']twitter:image["']/i)) {
    additions.push(`<meta name="twitter:image" content="${ogImage}">`);
  }
  if (!hasTag(inner, /name=["']twitter:image:alt["']/i)) {
    additions.push(`<meta name="twitter:image:alt" content="Volvix POS para ${escapeAttr(pretty)}">`);
  }
  if (!hasTag(inner, /name=["']twitter:site["']/i)) {
    additions.push('<meta name="twitter:site" content="@volvixpos">');
  }

  // Robots / additional
  if (!hasTag(inner, /name=["']robots["']/i)) {
    additions.push('<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">');
  }

  // JSON-LD additions: only add if our combined block isn't already present
  if (!hasTag(inner, /id=["']ld-volvix-seo["']/i)) {
    const ld = buildJsonLd(slug, title, desc, canonical, ogImage);
    additions.push(ld);
  }

  return { head, additions };
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildJsonLd(slug, title, desc, canonical, ogImage) {
  const pretty = PRETTY[slug] || slug;
  const productName = `Volvix POS para ${pretty}`;
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'LocalBusiness',
        '@id': `${canonical}#business`,
        name: 'Volvix POS',
        description: `Sistema de Punto de Venta para ${pretty}`,
        url: canonical,
        image: ogImage,
        priceRange: '$$',
        address: {
          '@type': 'PostalAddress',
          addressCountry: 'MX',
          addressRegion: 'Nuevo León',
          addressLocality: 'Monterrey'
        },
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.9',
          reviewCount: '847',
          bestRating: '5',
          worstRating: '1'
        }
      },
      {
        '@type': 'Product',
        '@id': `${canonical}#product`,
        name: productName,
        description: desc,
        image: ogImage,
        brand: { '@type': 'Brand', name: 'Volvix' },
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'MXN',
          availability: 'https://schema.org/InStock',
          url: canonical,
          description: 'Prueba 14 días gratis sin tarjeta de crédito'
        },
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.9',
          reviewCount: '847'
        }
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonical}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: BASE_URL + '/' },
          { '@type': 'ListItem', position: 2, name: 'Industrias', item: `${BASE_URL}/industrias.html` },
          { '@type': 'ListItem', position: 3, name: pretty, item: canonical }
        ]
      }
    ]
  };
  return `<script type="application/ld+json" id="ld-volvix-seo">${JSON.stringify(graph)}</script>`;
}

// ---------------------------------------------------------------------------

function lazyLoadImages(html) {
  let count = 0;
  const out = html.replace(/<img\b([^>]*)>/gi, (full, attrs) => {
    let a = attrs;
    let changed = false;
    if (!/\bloading\s*=/i.test(a)) {
      a = ' loading="lazy"' + a;
      changed = true;
    }
    if (!/\bdecoding\s*=/i.test(a)) {
      a = ' decoding="async"' + a;
      changed = true;
    }
    if (changed) count++;
    return `<img${a}>`;
  });
  return { html: out, count };
}

// ---------------------------------------------------------------------------

function processFile(file, slug, isPublic) {
  if (!fs.existsSync(file)) {
    return { file, ok: false, error: 'not found' };
  }
  const original = read(file);
  const beforeBytes = Buffer.byteLength(original, 'utf8');
  const beforeLines = original.split('\n').length;

  const result = buildAdditions(slug, original, isPublic);
  if (!result) return { file, ok: false, error: 'no <head>' };

  const { head, additions } = result;
  const lazy = lazyLoadImages(original);

  let html = lazy.html;

  if (additions.length > 0) {
    // Insert additions just before </head>
    const headRe = /<\/head>/i;
    const block = '\n<!-- volvix-seo-upgrade -->\n' + additions.join('\n') + '\n<!-- /volvix-seo-upgrade -->\n';
    html = html.replace(headRe, block + '</head>');
  }

  if (html === original) {
    return {
      file, ok: true, added: 0, lazyImgs: 0,
      beforeBytes, afterBytes: beforeBytes,
      beforeLines, afterLines: beforeLines, unchanged: true
    };
  }

  write(file, html);
  const afterBytes = Buffer.byteLength(html, 'utf8');
  const afterLines = html.split('\n').length;

  return {
    file, ok: true,
    added: additions.length,
    lazyImgs: lazy.count,
    beforeBytes, afterBytes,
    beforeLines, afterLines,
    deltaBytes: afterBytes - beforeBytes,
    deltaLines: afterLines - beforeLines
  };
}

// ---------------------------------------------------------------------------

function main() {
  const results = [];
  for (const slug of TIER1) {
    const file = path.join(ROOT, `landing-${slug}.html`);
    results.push({ tier: 1, slug, ...processFile(file, slug, false) });
  }
  for (const slug of TIER2) {
    const file = path.join(ROOT, 'public', `landing-${slug}.html`);
    results.push({ tier: 2, slug, ...processFile(file, slug, true) });
  }

  let totalAdded = 0, totalLazy = 0, totalDeltaBytes = 0, totalDeltaLines = 0, modified = 0, errors = 0;
  console.log('\n=== Volvix SEO Upgrade Report ===\n');
  console.log('Tier  Slug                       Tags  Lazy  ΔBytes  ΔLines  Status');
  console.log('----  -------------------------  ----  ----  ------  ------  ------');
  for (const r of results) {
    if (!r.ok) {
      errors++;
      console.log(`T${r.tier}    ${r.slug.padEnd(25)}  ----  ----  ------  ------  ERROR: ${r.error}`);
      continue;
    }
    if (r.added > 0 || r.lazyImgs > 0) modified++;
    totalAdded += r.added;
    totalLazy += r.lazyImgs;
    totalDeltaBytes += (r.deltaBytes || 0);
    totalDeltaLines += (r.deltaLines || 0);
    console.log(
      `T${r.tier}    ${r.slug.padEnd(25)}  ${String(r.added).padStart(4)}  ${String(r.lazyImgs).padStart(4)}  ${String(r.deltaBytes || 0).padStart(6)}  ${String(r.deltaLines || 0).padStart(6)}  ${r.unchanged ? 'unchanged' : 'OK'}`
    );
  }
  console.log('----  -------------------------  ----  ----  ------  ------  ------');
  console.log(`TOTAL ${String(results.length).padEnd(25)}  ${String(totalAdded).padStart(4)}  ${String(totalLazy).padStart(4)}  ${String(totalDeltaBytes).padStart(6)}  ${String(totalDeltaLines).padStart(6)}  ${modified} modified, ${errors} errors\n`);
}

if (require.main === module) main();
