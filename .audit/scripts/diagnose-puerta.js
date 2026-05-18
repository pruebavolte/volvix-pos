const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox']});

  // Test 1: Direct router query
  {
    const page = await browser.newPage();
    await page.goto('https://systeminternational.app/marketplace.html?cb='+Date.now(), {waitUntil:'load'});
    await new Promise(r => setTimeout(r, 2000));
    const result = await page.evaluate(() => {
      const r = window.vlxBrandRouter;
      const tests = ['puerta','puertas','puerta de madera','venta de puertas','fruta','frutas'];
      return tests.map(q => {
        const brand = r.resolve(q);
        const fallback = !brand ? r.fallbackToClosestHero(q) : null;
        // Try to find which alias matched (partial)
        const alias_match = Object.keys(r.aliases).find(a => q.toLowerCase().includes(a));
        return {q, dest: brand ? brand.url : (fallback || 'NO_REDIRECT'), partial_alias: alias_match};
      });
    });
    console.log('=== Direct router test ===');
    console.log(JSON.stringify(result, null, 2));
    await page.close();
  }

  // Test 2: Actual user flow
  {
    const page = await browser.newPage();
    await page.goto('https://systeminternational.app/marketplace.html?cb='+Date.now(), {waitUntil:'domcontentloaded'});
    await page.waitForSelector('#giro-input');
    await page.click('#giro-input',{clickCount:3});
    await page.type('#giro-input','puerta');
    const navP = page.waitForNavigation({timeout:15000}).catch(()=>null);
    await page.keyboard.press('Enter');
    await navP;
    await new Promise(r=>setTimeout(r,2000));
    console.log('=== User flow: typed "puerta" + Enter ===');
    console.log('Final URL:', page.url());
    await page.close();
  }

  await browser.close();
})();
