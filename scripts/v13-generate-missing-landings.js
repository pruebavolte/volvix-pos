#!/usr/bin/env node
/**
 * Genera 8 landings físicas faltantes para canónicos del SSOT.
 * Usa landing-template.html como base (es 100% dinámico — solo necesitamos
 * crear archivos físicos con redirect/canonical para SEO).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const FALTANTES = [
  { slug: 'hamburguesas',    name: 'Hamburguesería',        emoji: '🍔', color: '#B45309' },
  { slug: 'sushi',           name: 'Sushi · Comida Japonesa', emoji: '🍣', color: '#991B1B' },
  { slug: 'marisqueria',     name: 'Marisquería',            emoji: '🦐', color: '#0369A1' },
  { slug: 'jugos-naturales', name: 'Jugos Naturales',        emoji: '🥤', color: '#16A34A' },
  { slug: 'cremeria',        name: 'Cremería',               emoji: '🧀', color: '#F59E0B' },
  { slug: 'joyeria',         name: 'Joyería',                emoji: '💍', color: '#92400E' },
  { slug: 'floreria',        name: 'Florería',               emoji: '💐', color: '#DB2777' },
  { slug: 'sex-shop',        name: 'Sex Shop',               emoji: '💋', color: '#E91E63' },
];

const TEMPLATE = ({ slug, name, emoji, color }) => `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>POS para ${name} | Volvix</title>
<meta name="description" content="Sistema POS profesional para ${name.toLowerCase()}. Inventario, ventas, clientes, reportes. Prueba gratis.">
<meta name="keywords" content="pos ${name.toLowerCase()}, sistema ${name.toLowerCase()}, software ${name.toLowerCase()}, punto de venta">
<meta name="theme-color" content="${color}">
<link rel="canonical" href="https://systeminternational.app/landing-${slug}.html">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:url" content="https://systeminternational.app/landing-${slug}.html">
<meta property="og:title" content="POS para ${name} | Volvix">
<meta property="og:description" content="Sistema POS profesional para ${name.toLowerCase()}. Prueba gratis.">
<meta property="og:locale" content="es_MX">
<meta property="og:site_name" content="Volvix POS">

<link rel="manifest" href="/manifest.json">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='${encodeURIComponent(color)}'/%3E%3Ctext x='50%25' y='52%25' font-size='38' text-anchor='middle' dominant-baseline='middle' fill='white'%3E${emoji}%3C/text%3E%3C/svg%3E">

<!-- Esta landing se sirve por SEO. El contenido dinámico viene del template universal. -->
<script>
  // Cargar contenido del template dinámico con el slug correcto
  location.replace('/landing-template.html?giro=${slug.replace(/-/g, '_')}&canonical=${slug}');
</script>
<noscript>
  <meta http-equiv="refresh" content="0; url=/landing-template.html?giro=${slug.replace(/-/g, '_')}">
</noscript>
</head>
<body>
<p style="text-align:center;padding:40px;font-family:system-ui">Cargando POS para ${name}…<br><a href="/landing-template.html?giro=${slug.replace(/-/g, '_')}">Ver landing</a></p>
</body>
</html>
`;

let created = 0;
FALTANTES.forEach(g => {
  const outPath = path.join(__dirname, '..', 'public', 'landing-' + g.slug + '.html');
  if (fs.existsSync(outPath)) {
    console.log('⏭️  Ya existe:', outPath);
    return;
  }
  fs.writeFileSync(outPath, TEMPLATE(g));
  console.log('✅ Creada:', outPath);
  created++;
});

console.log('');
console.log('Total creadas:', created, 'de', FALTANTES.length);
