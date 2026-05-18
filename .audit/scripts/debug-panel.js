const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox']});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERR: ' + e.message));
  page.on('requestfailed', req => errors.push('REQFAIL: ' + req.url() + ' ' + req.failure().errorText));
  page.on('console', m => { if (m.type()==='error') errors.push('CONSOLE: '+m.text().slice(0,200)); });
  await page.goto('http://localhost:5757/paneldecontrol.html', {waitUntil:'load'});
  await new Promise(r=>setTimeout(r,4000));
  const info = await page.evaluate(()=>({
    applyGiroConfig: typeof window.applyGiroConfig,
    vlxOpenGiroConfig: typeof window.vlxOpenGiroConfig,
    scriptsTotal: document.querySelectorAll('script').length,
    scriptsWithSrc: Array.from(document.querySelectorAll('script[src]')).map(s=>s.src),
    bodyHTMLLength: document.body.innerHTML.length,
    hasFab: !!document.getElementById('vlx-giro-config-fab'),
    hasDrawer: !!document.getElementById('vlx-giro-config-drawer')
  }));
  console.log('--- errors ---');
  console.log(JSON.stringify(errors.slice(0,15), null, 2));
  console.log('--- info ---');
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
