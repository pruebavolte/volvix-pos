// ============================================================
// SERVER-SIDE HTML RENDERER
// ============================================================
// renderHTML(config) → HTML string
//
// Toma el config generado por la IA y produce el HTML estático
// usando el motor.html como template. El config se inyecta como
// variable global BRANDS para que el JS del motor lo encuentre.
// ============================================================

const fs   = require('fs').promises;
const path = require('path');

const MOTOR_PATH = path.join(__dirname, '..', 'motor.html');

let motorTemplate = null;

async function loadTemplate() {
  if (motorTemplate) return motorTemplate;
  motorTemplate = await fs.readFile(MOTOR_PATH, 'utf-8');
  return motorTemplate;
}

async function renderHTML(config) {
  const tpl = await loadTemplate();

  // Inyectamos el config como inline JS, ANTES del script que carga
  // brands.config.js. El motor.html ya tiene la lógica de render —
  // solo necesita BRANDS y un slug en la URL.

  const slug = config.slug;
  const inlineConfig = `
<script>
// SSG-injected config — generado por brand-generator
window.BRANDS = window.BRANDS || {};
window.BRANDS[${JSON.stringify(slug)}] = ${JSON.stringify(config)};
// Forzar slug en URL para que el motor lo lea
if (!new URLSearchParams(window.location.search).get('b')) {
  history.replaceState(null, '', '?b=${slug}');
}
</script>
`;

  // Reemplazos:
  // 1. Inyectar config justo antes de </head>
  // 2. Reemplazar <script src="brands.config.js"> por nuestro inline
  //    (porque ese archivo en producción puede no existir)
  let html = tpl
    .replace('</head>', inlineConfig + '</head>')
    .replace('<script src="brands.config.js"></script>', '<!-- brands.config inline -->');

  // SEO: actualizar title y description con datos de la marca
  html = html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHTML(config.brand)} — ${escapeHTML(config.tagline)}</title>`
  );
  html = html.replace(
    /<meta name="description"[^>]*>/,
    `<meta name="description" content="${escapeHTML(config.tagline)}.">`
  );

  // Open Graph + Twitter (importante para WhatsApp/Facebook shares)
  const ogTags = `
<meta property="og:title" content="${escapeHTML(config.brand)} — ${escapeHTML(config.tagline)}">
<meta property="og:description" content="${escapeHTML(config.tagline)}.">
<meta property="og:image" content="${escapeHTML(config.images?.hero || '')}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHTML(config.brand)}">
<meta name="twitter:description" content="${escapeHTML(config.tagline)}.">
<meta name="twitter:image" content="${escapeHTML(config.images?.hero || '')}">
`;
  html = html.replace(/<\/head>/, ogTags + '</head>');

  return html;
}

function escapeHTML(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

module.exports = { renderHTML };
