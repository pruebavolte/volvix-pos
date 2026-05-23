// Verifica que el h1 REAL de marca (no el del picker) está renderizado en las 5 landings
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const slugs = ['navaja', 'comandero', 'tendito', 'receta', 'corte'];
  for (const slug of slugs) {
    const page = await browser.newPage();
    const consoleErrs = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 150)); });
    page.on('pageerror', e => consoleErrs.push('[pageerror] ' + e.message.slice(0, 150)));
    await page.goto(`https://systeminternational.app/${slug}.html?b=${slug}`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));
    const data = await page.evaluate(() => {
      const pickerEl = document.querySelector('#picker');
      const pickerCss = pickerEl ? window.getComputedStyle(pickerEl).display : null;
      // offsetParent is null when element OR an ancestor is display:none
      const pickerVisible = pickerEl && pickerEl.offsetParent !== null && pickerCss !== 'none';
      // Find the visible brand h1 (not in picker, not in nav)
      const allH1s = Array.from(document.querySelectorAll('h1'));
      const realH1 = allH1s.find(h => {
        if (h.closest('#picker')) return false;
        const cs = window.getComputedStyle(h);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        return h.innerText.trim().length > 0;
      });
      // Brand router result
      const router = window.vlxBrandRouter;
      const r = router ? router.resolve(window.location.pathname.replace('.html','').replace('/','')) : null;
      return {
        slug: window.location.pathname,
        pickerVisible,
        realH1: realH1 ? realH1.innerText.slice(0, 100) : null,
        bodyLoaded: document.body.classList.contains('loaded'),
        h1Count: allH1s.length,
        routerSlug: r && r.url
      };
    });
    console.log(`${slug}.html:`);
    console.log(`  bodyLoaded: ${data.bodyLoaded}, pickerVisible: ${data.pickerVisible}`);
    console.log(`  realH1: "${data.realH1}"`);
    console.log(`  h1Count: ${data.h1Count}`);
    if (consoleErrs.length) {
      console.log(`  console errors (${consoleErrs.length}):`);
      consoleErrs.slice(0, 5).forEach(e => console.log(`    - ${e}`));
    }
    await page.close();
  }
  await browser.close();
})();
