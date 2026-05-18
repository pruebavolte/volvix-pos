const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox', '--disable-cache']});
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERR: ' + e.message));
  page.on('console', m => { if (['error','warning'].includes(m.type())) errors.push(m.type() + ': '+m.text().slice(0,150)); });
  await page.goto('http://localhost:5757/paneldecontrol.html?cb=' + Date.now(), {waitUntil:'load'});
  await new Promise(r=>setTimeout(r,4000));
  const info = await page.evaluate(()=>({
    applyGiroConfig: typeof window.applyGiroConfig,
    vlxOpenGiroConfig: typeof window.vlxOpenGiroConfig,
    scriptsWithSrc: Array.from(document.querySelectorAll('script[src]')).map(s=>s.src),
    headScripts: Array.from(document.head.querySelectorAll('script')).length,
    bodyScripts: Array.from(document.body.querySelectorAll('script')).length,
    hasFab: !!document.getElementById('vlx-giro-config-fab'),
    bodyChildren: document.body.children.length
  }));
  console.log('errors:'); console.log(JSON.stringify(errors.slice(0,10), null, 2));
  console.log('info:'); console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
