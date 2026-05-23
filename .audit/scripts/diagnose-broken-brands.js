const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox']});
  for (const b of ['merengue','burbuja','pata']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message + ' @ line ' + (e.stack ? e.stack.match(/:(\d+):\d+/)?.[1] : '?')));
    await page.goto(`https://systeminternational.app/${b}.html?b=${b}&cb=${Date.now()}`, {waitUntil:'load'});
    await new Promise(r=>setTimeout(r,3500));
    const info = await page.evaluate(() => ({appLen: document.getElementById('app')?.innerHTML?.length || 0}));
    console.log(`${b}: app=${info.appLen} | errors: ${errors.slice(0,3).join(' || ')}`);
    await page.close();
  }
  await browser.close();
})();
