// Test masivo de giros potencialmente problemáticos
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// Giros agrupados por categoría con la marca destino IDEAL esperada
const TESTS = [
  // ==== HOGAR / DECORACIÓN ====
  ['persianas',        'almohada',  'hogar'],
  ['decoración hogar', 'ramillete', 'hogar'],
  ['alfombras',        'almohada',  'hogar'],
  ['colchones',        'almohada',  'hogar'],
  ['cortinas',         'almohada',  'hogar'],
  ['recámaras',        'mueble',    'hogar'],
  ['salas',            'mueble',    'hogar'],
  ['comedores',        'mueble',    'hogar'],

  // ==== SERVICIOS TÉCNICOS ====
  ['plomería',         'tueria',    'servicios'],
  ['plomero',          'tueria',    'servicios'],
  ['electricista',     'watt',      'servicios'],
  ['fontanería',       'tueria',    'servicios'],
  ['internet en casa', 'folio',     'servicios'],
  ['fibra óptica',     'folio',     'servicios'],
  ['reparación celulares', 'repara-cel', 'servicios'],
  ['reparación laptops',   'repara-pc',  'servicios'],
  ['reparación tv',        'repara-tv',  'servicios'],

  // ==== BELLEZA ESPECÍFICA ====
  ['microblading',     'brillo',    'belleza'],
  ['lash lift',        'brillo',    'belleza'],
  ['extensiones pestañas', 'brillo','belleza'],
  ['depilación láser', 'brillo',    'belleza'],
  ['masajes',          'brillo',    'belleza'],
  ['masaje a domicilio', 'brillo',  'belleza'],
  ['cejas',            'brillo',    'belleza'],
  ['uñas a domicilio', 'brillo',    'belleza'],
  ['estética canina',  'pata',      'mascotas'],

  // ==== MASCOTAS ====
  ['peluquería canina', 'pata',     'mascotas'],
  ['hotel para mascotas', 'pata',   'mascotas'],
  ['adiestramiento perros', 'pata', 'mascotas'],
  ['venta de mascotas', 'pata',     'mascotas'],
  ['acuario',          'pata',      'mascotas'],

  // ==== VEHÍCULOS ====
  ['lavado de autos',  'burbuja',   'auto'],
  ['polarizado autos', 'pulido',    'auto'],
  ['detailing',        'pulido',    'auto'],
  ['venta de llantas', 'refacciona','auto'],
  ['hojalatería',      'latonero',  'auto'],
  ['mecánica diesel',  'refacciona','auto'],
  ['venta de autos',   'folio',     'auto'],
  ['agencia automotriz','folio',    'auto'],

  // ==== EVENTOS ====
  ['banquetes',        'tarima',    'eventos'],
  ['mariachi',         'tarima',    'eventos'],
  ['dj para fiestas',  'tarima',    'eventos'],
  ['mesas y sillas',   'tarima',    'eventos'],
  ['fiestas infantiles', 'tarima',  'eventos'],
  ['piñatas',          'helio',     'eventos'],
  ['globos',           'helio',     'eventos'],
  ['brincolines',      'tarima',    'eventos'],

  // ==== EDUCACIÓN ESPECÍFICA ====
  ['clases de inglés', 'bloque',    'educacion'],
  ['regularización',   'bloque',    'educacion'],
  ['academia de música', 'bloque',  'educacion'],
  ['clases de piano',  'bloque',    'educacion'],
  ['preparatoria abierta', 'bloque','educacion'],
  ['preescolar montessori', 'bloque','educacion'],

  // ==== COMIDA NICHO ====
  ['mariscos',         'marea',     'alimentos'],
  ['pescadería',       'escama',    'alimentos'],
  ['tortillería',      'comandero', 'alimentos'],
  ['rosticería',       'brasa',     'alimentos'],
  ['pollo rostizado',  'brasa',     'alimentos'],
  ['barbacoa',         'hornito',   'alimentos'],
  ['birrería',         'comandero', 'alimentos'],
  ['cevichería',       'marea',     'alimentos'],
  ['comida japonesa',  'kappa',     'alimentos'],
  ['comida china',     'wokito',    'alimentos'],
  ['comida coreana',   'bibim',     'alimentos'],
  ['comida italiana',  'trattoria', 'alimentos'],
  ['ramen',            'kappa',     'alimentos'],
  ['sushi a domicilio','kappa',     'alimentos'],

  // ==== TECNOLOGÍA ====
  ['cyber café',       'folio',     'servicios'],
  ['venta de software', 'folio',    'servicios'],
  ['agencia digital',  'folio',     'servicios'],
  ['marketing digital','folio',     'servicios'],
  ['páginas web',      'folio',     'servicios'],
  ['seo',              'folio',     'servicios'],
  ['venta de drones',  'movil',     'retail'],

  // ==== SERVICIOS PROFESIONALES ====
  ['psicólogo',        'pulso',     'salud'],
  ['nutriólogo',       'pulso',     'salud'],
  ['psiquiatra',       'pulso',     'salud'],
  ['fisioterapia',     'pulso',     'salud'],
  ['quiropráctico',    'pulso',     'salud'],
  ['notaría pública',  'folio',     'profesionales'],
  ['contador público', 'folio',     'profesionales'],
  ['despacho jurídico','folio',     'profesionales'],
  ['gestoría vehicular', 'folio',   'profesionales'],

  // ==== TRANSPORTE ====
  ['mudanzas',         'folio',     'servicios'],
  ['fletes',           'folio',     'servicios'],
  ['paquetería',       'folio',     'servicios'],
  ['envíos',           'folio',     'servicios'],

  // ==== HOSPEDAJE ====
  ['hotel',            'folio',     'hospedaje'],
  ['motel',            'folio',     'hospedaje'],
  ['hostal',           'folio',     'hospedaje'],
  ['airbnb',           'folio',     'hospedaje'],
  ['cabañas',          'folio',     'hospedaje'],

  // ==== TIENDAS ESPECÍFICAS ====
  ['lentes graduados', 'armazon',   'salud'],
  ['óptica',           'armazon',   'salud'],
  ['relojería',        'tictac',    'retail'],
  ['joyería',          'quilate',   'retail'],
  ['perfumería',       'brillo',    'retail'],
  ['cosméticos',       'brillo',    'retail'],
  ['ropa interior',    'seda',      'retail'],
  ['lencería',         'discreto',  'retail'],
  ['traje de baño',    'pareo',     'retail'],
  ['tienda de bolsas', 'asa',       'retail'],
  ['venta de mochilas','mochila',   'retail'],
  ['venta de tenis',   'pareo',     'retail'],
  ['venta de juguetes','trompito',  'retail'],
  ['venta de regalos', 'ramillete', 'retail'],

  // ==== FUNERARIA ====
  ['funeraria',        'folio',     'profesionales'],
  ['servicios funerarios', 'folio', 'profesionales'],

  // ==== GIMNASIO ====
  ['gimnasio',         'forja',     'deporte'],
  ['crossfit',         'forja',     'deporte'],
  ['yoga',             'forja',     'deporte'],
  ['pilates',          'forja',     'deporte'],
  ['spinning',         'forja',     'deporte'],
];

(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox']});
  const page = await browser.newPage();
  await page.goto('https://systeminternational.app/marketplace.html?cb='+Date.now(), {waitUntil:'load'});
  await new Promise(r => setTimeout(r, 2500));

  const results = await page.evaluate((tests) => {
    const r = window.vlxBrandRouter;
    return tests.map(([q, expected, category]) => {
      const brand = r.resolve(q);
      const fallback = !brand ? r.fallbackToClosestHero(q) : null;
      const dest = brand ? brand.url : (fallback || 'NO_REDIRECT');
      const destSlug = dest.replace(/^\//,'').replace(/\.html$/,'');
      return {q, expected, category, dest_slug: destSlug, pass: destSlug === expected || destSlug.replace('-','') === expected.replace('-','')};
    });
  }, TESTS);

  // Backend test for cases that need backend check
  const backendTests = [];
  for (const r of results) {
    if (!r.pass) {
      const resp = await page.evaluate(async (q) => {
        try {
          const r = await fetch('/api/giros/search?q=' + encodeURIComponent(q));
          return await r.json();
        } catch(e) { return {error: e.message}; }
      }, r.q);
      backendTests.push({q: r.q, backend: resp});
    }
  }

  await browser.close();

  // Análisis
  const fails = results.filter(r => !r.pass);
  console.log(`Total: ${results.length} | Pass: ${results.length - fails.length} | Fail: ${fails.length}\n`);

  console.log('=== FAILS ===');
  fails.forEach(r => {
    console.log(`  "${r.q}" → ${r.dest_slug} (esperado: ${r.expected}) [${r.category}]`);
  });

  console.log('\n=== BACKEND para los fails ===');
  backendTests.forEach(b => {
    const note = b.backend.exists ? `→ ${b.backend.landing}` : '(no exists, frontend toma over)';
    console.log(`  "${b.q}" ${note}`);
  });

  // Group fails by destination (para detectar patterns)
  const byDest = {};
  fails.forEach(r => {
    if (!byDest[r.dest_slug]) byDest[r.dest_slug] = [];
    byDest[r.dest_slug].push(r.q);
  });

  console.log('\n=== Top destinos incorrectos ===');
  Object.entries(byDest).sort((a,b)=>b[1].length-a[1].length).slice(0,10).forEach(([d, qs]) => {
    console.log(`  ${d}: ${qs.length}`);
    qs.forEach(q => console.log(`    - ${q}`));
  });

  fs.writeFileSync('D:/github/volvix-pos/.audit/stress-test-results.json', JSON.stringify({results, backendTests}, null, 2));
})();
