// Verificar qué giros van mal a tendito (cuando deberían ir a otra marca específica)
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox']});
  const page = await browser.newPage();
  await page.goto('https://systeminternational.app/marketplace.html?cb='+Date.now(), {waitUntil:'load'});
  await new Promise(r => setTimeout(r, 2000));

  const queries = [
    'puerta','puertas','puerta de madera','puerta metálica','portón',
    'ferretería','ferreteria','tornillos','clavos','herramientas',
    'pintura','pinturas','barniz','vidrio','vidriería',
    'cerradura','cerraduras','candado','llaves','copia de llaves',
    'cemento','arena','grava','tabique','varilla','materiales de construcción',
    'ventana','ventanas','aluminio','acero','soldadura',
    'mueble a medida','closet a medida','cocina integral','recámara',
    'sierra','taladro','martillo','tijeras',
    'mascarillas','guantes','equipo de seguridad',
    'cera para muebles','pegamento','silicón'
  ];

  const results = await page.evaluate((qs) => {
    const r = window.vlxBrandRouter;
    return qs.map(q => {
      const brand = r.resolve(q);
      const fallback = !brand ? r.fallbackToClosestHero(q) : null;
      return {q, dest: brand ? brand.url : (fallback || 'NO_REDIRECT')};
    });
  }, queries);

  // Agrupar por destino
  const byDest = {};
  results.forEach(r => {
    if (!byDest[r.dest]) byDest[r.dest] = [];
    byDest[r.dest].push(r.q);
  });

  console.log('=== Routing actual para giros de ferretería/construcción ===\n');
  Object.entries(byDest).sort((a,b)=>b[1].length-a[1].length).forEach(([dest, qs]) => {
    console.log(`${dest} (${qs.length}):`);
    qs.forEach(q => console.log(`  - ${q}`));
  });

  await browser.close();
})();
