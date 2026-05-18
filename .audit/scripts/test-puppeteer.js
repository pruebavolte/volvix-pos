// Pre-flight test: Puppeteer abre Chrome real y carga una URL
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const t0 = Date.now();
  console.log('[test] Launching headless Chrome at:', CHROME_PATH);
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-features=site-per-process']
    });
    const page = await browser.newPage();
    await page.setViewport({width:1280, height:900});
    await page.goto('https://systeminternational.app/', {waitUntil:'networkidle2', timeout:30000});
    const title = await page.title();
    const hasInput = await page.$('#giro-input') !== null;
    console.log(JSON.stringify({
      ok: true,
      title,
      hasGiroInput: hasInput,
      elapsedMs: Date.now() - t0
    }));
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.log(JSON.stringify({ok:false, error: err.message, elapsedMs: Date.now()-t0}));
    if (browser) await browser.close().catch(()=>{});
    process.exit(1);
  }
})();
