const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox']});
  const page = await browser.newPage();
  const errors = [];
  const apis = [];
  page.on('pageerror', e => errors.push('PAGEERR: '+e.message));
  page.on('response', r => { if(r.url().includes('/api/')) apis.push({url:r.url(), status:r.status()}); });
  page.on('console', m => { if(m.type()==='error') errors.push('CONSOLE: '+m.text().slice(0,200)); });

  await page.goto('https://systeminternational.app/login.html?cb='+Date.now(), {waitUntil:'load'});
  await new Promise(r=>setTimeout(r, 2000));

  // Try to login
  const result = await page.evaluate(async () => {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email:'grupovolvix@gmail.com', password:'123456789'})
    });
    let body;
    try { body = await r.json(); } catch(e) { body = await r.text(); }
    return { status: r.status, body };
  });
  console.log('=== /api/login result ===');
  console.log(JSON.stringify(result, null, 2));
  console.log('\n=== Errors ===');
  errors.slice(0,5).forEach(e => console.log(e));
  console.log('\n=== API calls ===');
  apis.slice(0,10).forEach(a => console.log(`${a.status} ${a.url}`));
  await browser.close();
})();
