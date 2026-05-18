const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox']});
  const page = await browser.newPage();
  const errors = [];
  const reqFails = [];
  page.on('pageerror', e => errors.push('PAGEERR: ' + e.message));
  page.on('requestfailed', req => reqFails.push(req.url() + ' ' + req.failure().errorText));
  page.on('console', m => { if (m.type()==='error') errors.push('CONSOLE: '+m.text().slice(0,200)); });

  await page.goto('https://systeminternational.app/pareo.html?b=pareo', {waitUntil:'load', timeout:30000});
  await new Promise(r=>setTimeout(r, 5000));

  const info = await page.evaluate(()=>{
    const visibleH1s = Array.from(document.querySelectorAll('h1')).filter(el=>{
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    }).map(el=>el.innerText.slice(0,80));

    return {
      visibleH1s,
      hasMotorH1Visible: visibleH1s.some(h=>h.includes('Motor de marcas')),
      hasBrandH1: !!document.querySelector('.v-h1, .v-brand-h1, .v-hero h1'),
      BRANDS_loaded: typeof window.BRANDS !== 'undefined',
      SOCIAL_PROOF_loaded: typeof window.SOCIAL_PROOF !== 'undefined',
      hasBrandsConfigScript: !!Array.from(document.querySelectorAll('script[src]')).find(s=>s.src.includes('brands.config')),
      pickerVisible: document.getElementById('picker') ? getComputedStyle(document.getElementById('picker')).display : 'no-picker',
      brandRendered: document.querySelector('.v-hero, [data-brand-section]') ? 'yes' : 'no',
      urlParam: new URLSearchParams(window.location.search).get('b'),
      bodyContent200: document.body.innerText.slice(0, 200)
    };
  });

  console.log('errors:'); console.log(JSON.stringify(errors.slice(0,10), null, 2));
  console.log('reqFails:'); console.log(JSON.stringify(reqFails.slice(0,5), null, 2));
  console.log('info:'); console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
