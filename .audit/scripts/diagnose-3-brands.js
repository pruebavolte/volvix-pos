const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox']});
  for (const b of ['bloque','pata','gateo','navaja']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERR: '+e.message));
    page.on('console', m => { if(m.type()==='error') errors.push('CONSOLE: '+m.text().slice(0,200)); });

    await page.goto(`https://systeminternational.app/${b}.html?b=${b}`, {waitUntil:'load'});
    await new Promise(r=>setTimeout(r, 4000));

    const info = await page.evaluate((slug) => {
      const app = document.getElementById('app');
      const picker = document.getElementById('picker');
      return {
        appExists: !!app,
        appInnerHTMLLen: app ? app.innerHTML.length : 0,
        appFirstChars: app ? app.innerHTML.slice(0, 200) : '',
        pickerVisible: picker ? getComputedStyle(picker).display !== 'none' : 'no-picker',
        BRANDS_keys: typeof BRANDS !== 'undefined' ? Object.keys(BRANDS).length : 'undefined',
        BRANDS_has_slug: typeof BRANDS !== 'undefined' ? !!BRANDS[slug] : false,
        BRANDS_slug_keys: typeof BRANDS !== 'undefined' && BRANDS[slug] ? Object.keys(BRANDS[slug]) : []
      };
    }, b);

    console.log(`\n=== ${b} ===`);
    console.log(JSON.stringify(info, null, 2));
    if (errors.length) console.log('ERRORS:', errors.slice(0,3));
    await page.close();
  }
  await browser.close();
})();
