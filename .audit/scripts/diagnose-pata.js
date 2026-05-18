const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox']});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERR: '+e.message+(e.stack?'\nSTACK: '+e.stack.split('\n').slice(0,3).join(' | '):'')));
  await page.goto('https://systeminternational.app/pata.html?b=pata&cb='+Date.now(), {waitUntil:'load'});
  await new Promise(r=>setTimeout(r, 3500));
  console.log('Errors:');
  errors.forEach(e => console.log(e));
  await browser.close();
})();
