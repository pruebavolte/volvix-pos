const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox']});
  const queries = ['renta de trajes','sexshop','pañales','papelería','librería','antro'];
  for (const q of queries) {
    const page = await browser.newPage();
    try {
      await page.goto('https://systeminternational.app/marketplace.html?cb='+Date.now(), {waitUntil:'domcontentloaded'});
      await page.waitForSelector('#giro-input', {timeout:8000});
      await page.click('#giro-input', {clickCount:3});
      await page.type('#giro-input', q);
      const navP = page.waitForNavigation({timeout:15000}).catch(()=>null);
      await page.keyboard.press('Enter');
      await navP;
      await new Promise(r=>setTimeout(r,500));
      const url = page.url();
      const slug = new URL(url).pathname.split('/').pop().replace('.html','');
      console.log(`"${q}" → ${slug} (${url.split('?')[0]})`);
    } catch(e) { console.log(`"${q}" → ERROR ${e.message}`); }
    await page.close();
  }
  await browser.close();
})();
