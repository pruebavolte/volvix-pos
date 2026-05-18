// Test masivo 100 giros NUEVOS — frases que el usuario escribe en buscador
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// 100 giros NUEVOS (no probados antes) — agrupados por categoría
const TESTS_100 = [
  // === COMIDA específica (20) ===
  ['tortas ahogadas', 'comandero'],
  ['tortas cubanas', 'comandero'],
  ['gorditas', 'comandero'],
  ['quesadillas', 'comandero'],
  ['sopes', 'comandero'],
  ['tlayudas', 'comandero'],
  ['chilaquiles', 'comandero'],
  ['enchiladas', 'comandero'],
  ['flautas', 'comandero'],
  ['tamales', 'comandero'],
  ['pozole', 'consome'],
  ['menudo', 'consome'],
  ['caldo de res', 'consome'],
  ['birria', 'comandero'],
  ['cabrito', 'asado'],
  ['arrachera', 'asado'],
  ['cochinita pibil', 'comandero'],
  ['mole oaxaqueño', 'comandero'],
  ['empanadas', 'comandero'],
  ['hot dogs', 'comandero'],

  // === BEBIDAS / POSTRES (10) ===
  ['licuados', 'limonero'],
  ['smoothies', 'limonero'],
  ['jugos naturales', 'limonero'],
  ['agua de horchata', 'limonero'],
  ['café para llevar', 'espuma'],
  ['paletas heladas', 'nieve'],
  ['nieve de garrafa', 'nieve'],
  ['raspados', 'nieve'],
  ['churros', 'merengue'],
  ['donas glaseadas', 'merengue'],

  // === BELLEZA / ESTÉTICA (10) ===
  ['salón de uñas', 'brillo'],
  ['uñas acrílicas', 'brillo'],
  ['manicure', 'brillo'],
  ['pedicure', 'brillo'],
  ['depilación', 'brillo'],
  ['masaje terapéutico', 'brillo'],
  ['aromaterapia', 'brillo'],
  ['baño turco', 'brillo'],
  ['tatuajes', 'brillo'],
  ['piercing', 'brillo'],

  // === SALUD ESPECIALIZADA (10) ===
  ['dentista', 'pulso'],
  ['ortodoncista', 'pulso'],
  ['psicólogo', 'pulso'],
  ['nutriólogo', 'pulso'],
  ['fisioterapeuta', 'pulso'],
  ['oftalmólogo', 'pulso'],
  ['cardiólogo', 'pulso'],
  ['pediatra', 'pulso'],
  ['dermatólogo', 'pulso'],
  ['ginecólogo', 'pulso'],

  // === SERVICIOS DOMÉSTICOS (10) ===
  ['plomero', 'tueria'],
  ['electricista', 'watt'],
  ['fumigación', 'pulgon'],
  ['jardinería', 'folio'],
  ['poda de árboles', 'folio'],
  ['limpieza de oficinas', 'trapeador'],
  ['limpieza de hogar', 'trapeador'],
  ['pintor de casas', 'barniz'],
  ['impermeabilizante', 'barniz'],
  ['cerrajero a domicilio', 'yunque'],

  // === FRASES con typos/abreviaciones (10) ===
  ['barberia', 'navaja'],
  ['restaurnt', 'comandero'],
  ['kafeteria', 'espuma'],
  ['farmaci', 'receta'],
  ['gym', 'forja'],
  ['vet', 'pata'],
  ['salon belleza', 'brillo'],
  ['lavadero', 'burbuja'],
  ['estetik', 'brillo'],
  ['tienda', 'tendito'],

  // === ROPA / CALZADO (10) ===
  ['ropa deportiva', 'pareo'],
  ['tenis para correr', 'pareo'],
  ['zapatos de niño', 'pareo'],
  ['botas vaqueras', 'pareo'],
  ['ropa de bebé', 'mochila'],
  ['uniformes escolares', 'mochila'],
  ['ropa de hombre', 'pareo'],
  ['vestidos de novia', 'pareo'],
  ['ropa de gala', 'pareo'],
  ['sombreros', 'pareo'],

  // === TECNOLOGÍA / GADGETS (10) ===
  ['venta de celulares', 'movil'],
  ['fundas para celular', 'funda'],
  ['accesorios para celular', 'funda'],
  ['venta de tablets', 'movil'],
  ['venta de audífonos', 'funda'],
  ['venta de bocinas', 'funda'],
  ['venta de cámaras', 'movil'],
  ['venta de pantallas', 'linea-b'],
  ['venta de pcs', 'torre'],
  ['venta de laptops', 'torre'],

  // === RAROS / NICHO MEXICANO (10) ===
  ['nevera', 'nieve'],
  ['paletería', 'nieve'],
  ['michelada', 'tarima'],
  ['cerveza artesanal', 'tarima'],
  ['mezcal', 'tarima'],
  ['vinatería', 'tarima'],
  ['ropa de marca', 'pareo'],
  ['boutique infantil', 'mochila'],
  ['tortillería de harina', 'comandero'],
  ['pescadería local', 'escama']
];

(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox']});
  const page = await browser.newPage();
  await page.goto('https://systeminternational.app/marketplace.html?cb='+Date.now(), {waitUntil:'load'});
  await new Promise(r => setTimeout(r, 2500));

  const results = await page.evaluate((tests) => {
    const r = window.vlxBrandRouter;
    return tests.map(([q, expected]) => {
      const brand = r.resolve(q);
      const fallback = !brand ? r.fallbackToClosestHero(q) : null;
      const dest = brand ? brand.url : (fallback || 'NO_REDIRECT');
      const destSlug = dest.replace(/^\//,'').replace(/\.html$/,'');
      // Cualquier marca premium es "OK" mientras NO sea tendito (frutería) cuando no debería
      const acceptableTendito = expected === 'tendito';
      const goesToWrongTendito = destSlug === 'tendito' && !acceptableTendito;
      return {q, expected, dest_slug: destSlug, pass: destSlug === expected, critical_fail: goesToWrongTendito};
    });
  }, TESTS_100);

  await browser.close();

  const passes = results.filter(r => r.pass);
  const fails = results.filter(r => !r.pass);
  const critFails = results.filter(r => r.critical_fail);

  console.log(`Total: ${results.length} | Pass exactos: ${passes.length} | Differentes: ${fails.length} | CRÍTICOS (tendito): ${critFails.length}\n`);

  if (critFails.length > 0) {
    console.log('=== 🚨 CRÍTICOS (van a frutería) ===');
    critFails.forEach(r => console.log(`  "${r.q}" → /tendito (esperado: ${r.expected})`));
    console.log('');
  }

  console.log('=== Fails (otros — verificar si son aceptables) ===');
  fails.filter(r => !r.critical_fail).forEach(r => {
    console.log(`  "${r.q}" → ${r.dest_slug} (esperado: ${r.expected})`);
  });

  fs.writeFileSync('D:/github/volvix-pos/.audit/test-100-results.json', JSON.stringify(results, null, 2));
})();
