const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox']});

  // TEST A: Las 3 marcas previamente rotas ahora renderizan
  console.log('=== A. Brand pages render ===');
  for (const b of ['bloque','pata','gateo','navaja','comandero']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`https://systeminternational.app/${b}.html?b=${b}&cb=${Date.now()}`, {waitUntil:'load'});
    await new Promise(r=>setTimeout(r, 3500));
    const appLen = await page.evaluate(() => document.getElementById('app')?.innerHTML?.length || 0);
    console.log(`  ${b}: app=${appLen} chars · errors=${errors.length}`);
    await page.close();
  }

  // TEST B: Routing semántico via router direct
  console.log('\n=== B. Router semantic routing ===');
  const page = await browser.newPage();
  await page.goto('https://systeminternational.app/marketplace.html?cb='+Date.now(), {waitUntil:'load'});
  await new Promise(r=>setTimeout(r, 2000));
  const tests = ['papelería','librería','panadería','venta de ropa','bolsas para basura','kínder','veterinaria','renta de trajes','sexshop','pañales'];
  const results = await page.evaluate((queries) => {
    if (!window.vlxBrandRouter) return {error:'no router'};
    return queries.map(q => {
      const brand = window.vlxBrandRouter.resolve(q);
      const fallback = !brand ? window.vlxBrandRouter.fallbackToClosestHero(q) : null;
      return {q, dest: brand ? brand.url : (fallback || 'NO_REDIRECT')};
    });
  }, tests);
  results.forEach(r => console.log(`  "${r.q}" → ${r.dest}`));
  await page.close();
  await browser.close();
})();
