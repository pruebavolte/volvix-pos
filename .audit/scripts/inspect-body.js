const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox']});
  const page = await browser.newPage();
  // Disable JS to see raw HTML
  await page.setJavaScriptEnabled(false);
  await page.goto('http://localhost:5757/paneldecontrol.html', {waitUntil:'load'});
  const info = await page.evaluate(()=>({
    bodyHTMLLen: document.body.innerHTML.length,
    bodyLastChars: document.body.innerHTML.slice(-2000),
    bodyFirstChars: document.body.innerHTML.slice(0,500),
    hasMyInjection: document.body.innerHTML.includes('vlx-giro-config-fab'),
    fullDOMScripts: document.querySelectorAll('script').length
  }));
  console.log('with JS disabled:');
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
