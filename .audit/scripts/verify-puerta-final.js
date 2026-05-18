const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox']});
  const tests = ['puerta','puertas','ferretería','tornillos','cemento','pintura','vidrio','herrería','portón'];
  console.log('User flow REAL (typed + Enter):\n');
  for (const q of tests) {
    const page = await browser.newPage();
    await page.goto('https://systeminternational.app/marketplace.html?cb='+Date.now(),{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#giro-input', {timeout:8000});
    await page.click('#giro-input',{clickCount:3});
    await page.type('#giro-input', q);
    const navP = page.waitForNavigation({timeout:15000}).catch(()=>null);
    await page.keyboard.press('Enter');
    await navP;
    await new Promise(r=>setTimeout(r,2000));
    const url = page.url();
    const slug = (new URL(url)).pathname.replace(/^\//,'').replace(/\.html$/,'');
    console.log(`  "${q}" → /${slug}.html`);
    await page.close();
  }
  await browser.close();
})();
