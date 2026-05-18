#!/usr/bin/env node
/* ============================================================
   VOLVIX MOTOR — Static Site Generator
   ----------------------------------------------------------------
   Lee brands.config.js, genera un HTML estático por marca en /dist
   
   Uso:
     node build.js              → genera todas las marcas
     node build.js pareo navaja → solo esas marcas
   ============================================================ */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'dist');

// Cargar config
const { BRANDS } = require('./brands.config.js');

// Cargar template
const MOTOR_HTML = fs.readFileSync(path.join(ROOT, 'motor.html'), 'utf-8');

// CLI args
const args = process.argv.slice(2);
const targets = args.length > 0 ? args : Object.keys(BRANDS);

// Asegurar dir
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function inject(brand) {
  // El motor lee BRANDS[?b=slug] de la URL; para SSG inyectamos el slug
  // fijo y removemos el picker para que renderice directamente
  const injection = `
<script>
  // SSG: pre-pick this brand
  window.location.search = window.location.search || '?b=${brand.slug}';
  if (!new URLSearchParams(window.location.search).get('b')) {
    history.replaceState(null, '', '?b=${brand.slug}');
  }
</script>
`;
  let html = MOTOR_HTML.replace('</head>', injection + '</head>');
  
  // Actualizar meta tags por marca (SEO)
  html = html.replace(
    /<title>.*?<\/title>/,
    `<title>${brand.brand} — ${brand.tagline}</title>`
  );
  html = html.replace(
    /<meta name="description"[^>]*>/,
    `<meta name="description" content="${brand.tagline}.">`
  );
  
  return html;
}

// Generar cada marca
let count = 0;
targets.forEach(slug => {
  const brand = BRANDS[slug];
  if (!brand) {
    console.warn(`⚠  Marca "${slug}" no encontrada en config. Skip.`);
    return;
  }
  const html = inject(brand);
  const outPath = path.join(OUT_DIR, `${slug}.html`);
  fs.writeFileSync(outPath, html);
  console.log(`✓  ${slug}.html  (${brand.brand}, ${(html.length/1024).toFixed(1)}KB)`);
  count++;
});

// Copy brands.config.js junto al output para que motor.html funcione standalone
fs.copyFileSync(
  path.join(ROOT, 'brands.config.js'),
  path.join(OUT_DIR, 'brands.config.js')
);

// Y el motor mismo (para que dist/ sea autosuficiente)
fs.copyFileSync(
  path.join(ROOT, 'motor.html'),
  path.join(OUT_DIR, 'motor.html')
);

console.log(`\n→ Generadas ${count} marcas en ${OUT_DIR}`);
console.log(`→ Para probar: cd dist && python3 -m http.server 8000`);
