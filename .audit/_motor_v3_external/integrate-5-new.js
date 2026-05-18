#!/usr/bin/env node
/**
 * Integra las 5 marcas nuevas del ZIP volvix-motor-v3:
 *   - pulso (salud)
 *   - brillo (belleza)
 *   - folio (servicios profesionales)
 *   - forja (deporte)
 *   - tarima (entretenimiento/eventos)
 *
 * Acciones:
 *   1. Backup brands.config.js, volvix-brand-router.js
 *   2. Extrae las 5 BRAND_X consts del ZIP brands.config.js
 *   3. Inserta antes de "// SOCIAL PROOF" en producción
 *   4. Agrega 5 entries en BRANDS = {}
 *   5. Agrega 5 entries en SOCIAL_PROOF = []
 *   6. Copia 5 HTMLs del ZIP a public/
 *   7. Actualiza router con aliases por sector
 */

const fs = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname, '..', '..');
const BRANDS_CFG = path.join(PROJECT, 'public', 'brands.config.js');
const ROUTER = path.join(PROJECT, 'public', 'volvix-brand-router.js');
const PUBLIC = path.join(PROJECT, 'public');
const ZIP_CFG = path.join(__dirname, 'brands.config.js');
const ZIP_DIST = path.join(__dirname, 'dist');

const BACKUP_DIR = path.join(__dirname, 'backups-pre-5-new');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// === Step 0: Safety — only run once
let src = fs.readFileSync(BRANDS_CFG, 'utf8');
if (src.includes('BRAND_PULSO')) {
  console.error('❌ brands.config.js already has BRAND_PULSO — already integrated. Aborting.');
  process.exit(1);
}

// === Step 1: Backup
fs.writeFileSync(path.join(BACKUP_DIR, 'brands.config.js.bak'), src);
fs.writeFileSync(path.join(BACKUP_DIR, 'volvix-brand-router.js.bak'), fs.readFileSync(ROUTER, 'utf8'));
console.log(`✅ Backups in: ${BACKUP_DIR}`);

// === Step 2: Extract 5 new BRAND_X consts from ZIP
const zipCfg = fs.readFileSync(ZIP_CFG, 'utf8');
const newBrands = ['PULSO', 'BRILLO', 'FOLIO', 'FORJA', 'TARIMA'];
const extractedConsts = [];

for (const b of newBrands) {
  const re = new RegExp(`(// =+\\s*\\n// BRAND_${b}[^\\n]*\\n// =+\\s*\\nconst BRAND_${b} = \\{[\\s\\S]+?\\n\\};)`, 'm');
  const m = zipCfg.match(re);
  if (m) {
    extractedConsts.push(m[1]);
  } else {
    // Fallback: just match `const BRAND_X = { ... };`
    const re2 = new RegExp(`(const BRAND_${b} = \\{[\\s\\S]+?\\n\\};)`, 'm');
    const m2 = zipCfg.match(re2);
    if (!m2) {
      console.error(`❌ Could not find BRAND_${b} in ZIP brands.config.js`);
      process.exit(1);
    }
    extractedConsts.push(`// =============================================================
// BRAND_${b} (from motor-v3 ZIP)
// =============================================================
${m2[1]}`);
  }
}
console.log(`✅ Extracted ${extractedConsts.length} BRAND_X consts from ZIP`);

// === Step 3: Insert before "// SOCIAL PROOF" in production config
const anchor = '// =============================================================\n// SOCIAL PROOF';
const pos = src.indexOf(anchor);
if (pos < 0) {
  console.error('❌ Could not find SOCIAL PROOF anchor');
  process.exit(1);
}
const newBlock = extractedConsts.join('\n\n\n') + '\n\n\n';
src = src.slice(0, pos) + newBlock + src.slice(pos);
console.log(`✅ Inserted ${extractedConsts.length} new BRAND_X consts before SOCIAL_PROOF`);

// === Step 4: Add to BRANDS = { ... }
const brandsStart = src.indexOf('const BRANDS = {');
const brandsEnd = src.indexOf('};', brandsStart);
const brandsRegistry = newBrands.map(b => `  ${b.toLowerCase()}: BRAND_${b},`).join('\n');
src = src.slice(0, brandsEnd) + brandsRegistry + '\n' + src.slice(brandsEnd);
console.log(`✅ Added ${newBrands.length} entries to BRANDS registry`);

// === Step 5: Add SOCIAL_PROOF entries
const socialEntries = [
  `  {brand:'Pulso',  biz:'Clínica San Ángel',     city:'San Ángel, CDMX',   when:'hace 5 min'},`,
  `  {brand:'Brillo', biz:'Salón Estética Vivian', city:'Polanco, CDMX',     when:'hace 11 min'},`,
  `  {brand:'Folio',  biz:'Despacho Hernández',    city:'Monterrey, NL',     when:'hace 18 min'},`,
  `  {brand:'Forja',  biz:'CrossFit Vallarta',     city:'Vallarta, JAL',     when:'hace 26 min'},`,
  `  {brand:'Tarima', biz:'Salón La Hacienda',     city:'San Pedro, NL',     when:'hace 34 min'},`,
].join('\n');
const socialStart = src.indexOf('const SOCIAL_PROOF = [');
const socialEnd = src.indexOf('];', socialStart);
src = src.slice(0, socialEnd) + socialEntries + '\n' + src.slice(socialEnd);
console.log(`✅ Added 5 entries to SOCIAL_PROOF`);

// === Step 6: Write brands.config.js
fs.writeFileSync(BRANDS_CFG, src);
console.log(`✅ brands.config.js updated. New size: ${src.split('\n').length} lines`);

// === Step 7: Copy 5 new HTMLs
for (const b of newBrands) {
  const slug = b.toLowerCase();
  const srcHtml = path.join(ZIP_DIST, `${slug}.html`);
  const dstHtml = path.join(PUBLIC, `${slug}.html`);
  if (fs.existsSync(dstHtml)) {
    console.error(`❌ ${slug}.html already exists in public/. Aborting.`);
    process.exit(1);
  }
  fs.copyFileSync(srcHtml, dstHtml);
  console.log(`✅ Copied ${slug}.html → public/`);
}

// === Step 8: Update router with aliases
const aliasesBySlug = {
  pulso: [
    'clinica', 'clínica', 'clinica general', 'clinica privada', 'consultorio', 'consultorio medico', 'medico', 'médico', 'doctor',
    'pediatra', 'pediatria', 'pediatría', 'ginecologo', 'ginecologa', 'ginecologia', 'ginecología',
    'dermatologo', 'dermatologa', 'dermatologia', 'dermatología',
    'cardiologo', 'cardiologia',
    'ortopedista', 'ortopedia',
    'medicina familiar', 'medicina interna', 'medicina deportiva', 'medicina estetica', 'medicina estética',
    'laboratorio', 'laboratorio clinico', 'lab clinico', 'ultrasonido', 'rayos x', 'tomografia', 'tomografía', 'resonancia',
    'psicologo', 'psicóloga', 'psicologia', 'psicología', 'psiquiatra', 'psiquiatria',
    'nutriologo', 'nutriologa', 'nutriología', 'nutricion', 'nutrición',
    'fisio', 'fisioterapia', 'fisioterapeuta',
    'quiropractico', 'quiropráctico', 'quiropractica', 'quiropráctica', 'acupuntura', 'homeopatia', 'homeopatía',
    'dentista', 'dental', 'clinica dental', 'odontologo', 'odontóloga', 'ortodoncista', 'endodoncista',
    'optica', 'óptica', 'oftalmologo', 'oftalmologia', 'oftalmología', 'optometra',
    'podologo', 'podología',
    'salud', 'salud y bienestar',
    'rehabilitacion', 'rehabilitación', 'terapia',
  ],
  brillo: [
    'estetica', 'estética', 'salon', 'salón', 'salon de belleza', 'salón de belleza',
    'spa', 'spa de dia', 'spa de día',
    'uñas', 'unas', 'salon de unas', 'manicure', 'pedicure',
    'pestañas', 'pestanas', 'estudio de pestañas',
    'cejas', 'microblading',
    'maquillaje', 'maquillaje profesional',
    'depilacion', 'depilación', 'depilacion laser', 'depilación láser', 'cera',
    'masaje', 'masajes', 'masaje terapeutico',
    'sauna', 'vapor', 'hidroterapia',
    'limpieza facial', 'tratamientos faciales', 'peeling',
    'mesoterapia', 'radiofrecuencia', 'cavitacion', 'cavitación', 'presoterapia',
    'extensiones de cabello', 'coloracion', 'coloración', 'balayage', 'mechas', 'queratina',
    'peluqueria infantil', 'peluquería infantil',
    'tatuador', 'tatuajes', 'piercing', 'micropigmentacion',
    'perfumeria', 'perfumería',
    'belleza', 'cosmetica', 'cosmética', 'shaving bar',
  ],
  folio: [
    'despacho', 'despacho contable', 'contador', 'contadora',
    'abogado', 'abogada', 'firma legal', 'bufete', 'abogados penalistas', 'abogados civiles', 'abogados laborales',
    'notaria', 'notaría', 'notario publico', 'notario público',
    'corredor publico', 'corredor público',
    'asesor fiscal', 'asesoria fiscal', 'asesoría fiscal', 'tramites sat', 'trámites SAT',
    'aduanal', 'agencia aduanal',
    'inmobiliaria', 'agencia inmobiliaria', 'broker hipotecario',
    'asesor financiero', 'seguros', 'fianzas', 'agente de seguros', 'corredor de bolsa',
    'casa de cambio', 'envios de dinero',
    'cobranza', 'cobranza extrajudicial',
    'consultoria', 'consultoría', 'consultoria empresarial', 'consultor',
    'coach', 'coach de negocios', 'coach de vida',
    'agencia marketing', 'agencia de marketing', 'agencia publicidad', 'agencia de publicidad',
    'diseño grafico', 'diseño gráfico', 'diseño web',
    'desarrollo software', 'desarrollo apps', 'agencia digital', 'seo',
    'social media manager',
    'fotografia profesional', 'fotografía profesional',
    'servicios profesionales',
  ],
  forja: [
    'gimnasio crossfit', 'crossfit', 'gym mujeres', 'gimnasio funcional',
    'estudio de pilates', 'pilates',
    'estudio de yoga', 'yoga', 'clases de yoga',
    'spinning', 'studio de spinning',
    'boxeo', 'academia de boxeo',
    'mma', 'artes marciales', 'taekwondo', 'karate', 'judo',
    'academia de tenis', 'tenis',
    'academia de futbol', 'academia de fútbol',
    'academia de beisbol', 'beisbol', 'béisbol',
    'padel', 'pádel', 'cancha de padel',
    'futbol rapido', 'fútbol rápido',
    'centro deportivo',
    'natacion adultos', 'natación adultos', 'natacion infantil', 'natación infantil',
    'buceo', 'clases de buceo',
    'surf', 'academia de surf',
    'skate', 'academia de skate',
    'ciclismo', 'bicicleta indoor',
    'rehabilitacion deportiva',
    'nutricion deportiva', 'nutrición deportiva',
    'tienda deportiva',
    'suplementos deportivos', 'accesorios fitness',
    'deporte', 'recreacion', 'recreación',
    'danza', 'baile fitness',
  ],
  tarima: [
    'salon de eventos', 'salón de eventos', 'jardin de eventos', 'jardín de eventos', 'terraza para fiestas',
    'wedding planner', 'coordinador de bodas',
    'catering', 'catering corporativo', 'catering bodas',
    'banquete', 'banquetes mexicanos',
    'food truck para eventos',
    'mesa de dulces', 'mesa de quesos',
    'barra libre',
    'dj', 'dj profesional',
    'animacion infantil', 'animación infantil',
    'show de magos', 'show de payasos', 'show de robots',
    'salon de fiestas', 'salón de fiestas', 'fiesta infantil',
    'inflables', 'brincolines',
    'casino mesa de juegos',
    'karaoke',
    'boliche', 'billar',
    'salon de baile', 'salón de baile',
    'cantina con musica', 'cantina con música',
    'peña tradicional',
    'fiesta privada',
    'xv años',
    'fotografia de eventos', 'fotografía de eventos', 'video de eventos', 'drone para eventos',
    'iluminacion profesional', 'iluminación profesional', 'sonido profesional',
    'eventos', 'entretenimiento',
    'bar', 'antro', 'discoteca', 'pub',
  ],
};

let router = fs.readFileSync(ROUTER, 'utf8');

// Insert VLX_BRANDS entries
const newBrandLines = newBrands.map(b => {
  const slug = b.toLowerCase();
  return `    '${slug}'.padEnd(20)`.replace(`'${slug}'.padEnd(20)`, `'${slug}'`.padEnd(20));
});
const brandSnippet = '\n    // V8 — 5 marcas hero nuevas del motor-v3\n' +
  newBrands.map(b => {
    const slug = b.toLowerCase();
    const Brand = b.charAt(0) + b.slice(1).toLowerCase();
    return `    '${slug}'`.padEnd(24) + `: { brand: '${Brand}', url: '${slug}.html' },`;
  }).join('\n');

const brandsRegEnd = router.indexOf('  };', router.indexOf('var VLX_BRANDS = {'));
router = router.slice(0, brandsRegEnd) + brandSnippet + '\n' + router.slice(brandsRegEnd);
console.log(`✅ Added 5 entries to VLX_BRANDS in router`);

// Insert VLX_ALIASES entries
const seenAliases = new Set();
for (const m of router.matchAll(/^\s*'([^']+)':\s*'/gm)) {
  seenAliases.add(m[1]);
}
const aliasLines = ['\n    // V8 — aliases de 5 marcas hero nuevas'];
let aliasCount = 0;
for (const slug of Object.keys(aliasesBySlug)) {
  for (const alias of aliasesBySlug[slug]) {
    const a = alias.toLowerCase().trim();
    if (seenAliases.has(a)) continue;
    seenAliases.add(a);
    aliasLines.push(`    '${a}'`.padEnd(40) + `: '${slug}',`);
    aliasCount++;
  }
}
const aliasSnippet = aliasLines.join('\n');
const aliasesEnd = router.indexOf('  };', router.indexOf('var VLX_ALIASES = {'));
router = router.slice(0, aliasesEnd) + aliasSnippet + '\n' + router.slice(aliasesEnd);
console.log(`✅ Added ${aliasCount} new aliases to VLX_ALIASES`);

fs.writeFileSync(ROUTER, router);
console.log(`✅ Router updated. New size: ${router.split('\n').length} lines`);

// === Step 9: Verify
try {
  delete require.cache[BRANDS_CFG];
  const mod = require(BRANDS_CFG);
  const brandCount = Object.keys(mod.BRANDS).length;
  const socialCount = mod.SOCIAL_PROOF.length;
  console.log(`\n✅ Module loads OK: ${brandCount} brands, ${socialCount} social entries`);
  for (const b of newBrands) {
    if (!mod.BRANDS[b.toLowerCase()]) {
      console.error(`❌ BRANDS missing ${b.toLowerCase()}`);
      process.exit(1);
    }
  }
  console.log(`✅ All 5 new brands registered correctly`);
} catch (e) {
  console.error('❌ Module load failed:', e.message);
  process.exit(1);
}

console.log('\n🎉 Integration complete. Ready to bump version + commit.');
