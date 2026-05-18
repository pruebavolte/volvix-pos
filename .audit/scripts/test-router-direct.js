const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox']});
  const page = await browser.newPage();
  await page.goto('https://systeminternational.app/marketplace.html?cb='+Date.now(), {waitUntil:'load'});
  await new Promise(r=>setTimeout(r, 2000));
  const tests = ['renta de trajes','sexshop','pañales','papelería','librería','antro','renta de autos','panales'];
  const results = await page.evaluate((queries) => {
    if (!window.vlxBrandRouter) return {error:'no router'};
    return queries.map(q => {
      const brand = window.vlxBrandRouter.resolve(q);
      const fallback = !brand ? window.vlxBrandRouter.fallbackToClosestHero(q) : null;
      const final = brand ? brand.url : fallback;
      return {q, final};
    });
  }, tests);
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
