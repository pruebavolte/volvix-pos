const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox']});
  const tests = [
    // V9.4 ferretería/construcción
    ['puerta', 'viruta'],
    ['ferretería', 'yunque'],
    ['tornillos', 'yunque'],
    ['cemento', 'obra'],
    ['pintura', 'barniz'],
    ['portón', 'yunque'],
    // V9.5 stress test fixes
    ['persianas', 'almohada'],
    ['alfombras', 'almohada'],
    ['acuario', 'pata'],
    ['lash lift', 'brillo'],
    ['estética canina', 'pata'],
    ['fiestas infantiles', 'tarima'],
    ['cevichería', 'marea'],
    ['páginas web', 'folio'],
    ['cyber café', 'folio'],
    ['hotel', 'folio'],
    ['cabañas', 'folio'],
    ['traje de baño', 'pareo'],
    ['mudanzas', 'folio'],
    ['venta de regalos', 'ramillete'],
    ['envíos', 'folio']
  ];

  console.log('User flow REAL (typed + Enter, 5s wait):\n');
  let pass = 0, fail = 0;
  for (const [q, expected] of tests) {
    const page = await browser.newPage();
    try {
      await page.goto('https://systeminternational.app/marketplace.html?cb='+Date.now(),{waitUntil:'domcontentloaded'});
      await page.waitForSelector('#giro-input', {timeout:8000});
      await page.click('#giro-input',{clickCount:3});
      await page.type('#giro-input', q);
      await page.keyboard.press('Enter');
      await new Promise(r=>setTimeout(r, 5000));
      const url = page.url();
      const slug = (new URL(url)).pathname.replace(/^\//,'').replace(/\.html$/,'');
      const ok = slug === expected;
      ok ? pass++ : fail++;
      console.log(`  ${ok?'✅':'❌'} "${q}" → /${slug}.html (esperado: ${expected})`);
    } catch(e) { console.log('  ERR ' + q + ': ' + e.message); fail++; }
    await page.close();
  }
  console.log(`\n${pass}/${tests.length} PASS`);
  await browser.close();
})();
