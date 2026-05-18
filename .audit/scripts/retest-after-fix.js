// Re-test los 2 fails de check2 después del fix V8.9
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await puppeteer.launch({executablePath:CHROME, headless:'new',
    args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  const tests = ['antro', 'librería', 'cantina', 'hotel', 'joyería'];
  const out = [];
  for (const q of tests) {
    const page = await browser.newPage();
    await page.goto('https://systeminternational.app/marketplace.html?cb='+Date.now(), {waitUntil:'domcontentloaded'});
    await page.waitForSelector('#giro-input');
    await page.click('#giro-input',{clickCount:3});
    await page.type('#giro-input', q);
    await Promise.race([
      page.waitForNavigation({waitUntil:'domcontentloaded',timeout:15000}).catch(()=>null),
      (async()=>{await page.keyboard.press('Enter');await new Promise(r=>setTimeout(r,12000));})()
    ]).catch(()=>{});
    const url = page.url();
    const isPlano = /\/landing-/.test(url);
    out.push({q, url, isPlano});
    await page.close();
  }
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})();
