const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox']});
  const page = await browser.newPage();
  await page.goto('https://systeminternational.app/marketplace.html?cb='+Date.now(),{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,3000));

  const info = await page.evaluate(() => {
    const r = window.vlxBrandRouter;
    const q = 'ropa de bebé';
    const n = r.norm(q);
    // Test the regex directly
    const myRegex = /^ropa de bebe$|ropa para bebe|ropita|ropa para niñ|ropa de niñ|ropa para nino|ropa de nino|ropa infantil|ropa recien nacido/;
    return {
      query: q,
      normalized: n,
      regex_matches: myRegex.test(n),
      brand_result: r.resolve(q),
      fallback_result: r.fallbackToClosestHero(q)
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
