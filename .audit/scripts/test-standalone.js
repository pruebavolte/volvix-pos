// Test standalone — sin auth-gate, prueba real del schema-driven UI
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOTS = path.join(__dirname, '..', 'screenshots-fase4');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, {recursive:true});

(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox']});
  const giros = ['navaja','pulso','comandero','forja','discreto','default'];
  const allResults = [];

  for (const g of giros) {
    const page = await browser.newPage();
    await page.setViewport({width:1280, height:900});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto('http://localhost:5757/test-schema-ui.html?cb=' + Date.now(), {waitUntil:'load'});
    await new Promise(r=>setTimeout(r,1500));

    // Apply giro
    const result = await page.evaluate(async (slug) => {
      const ok = await window.applyGiroConfig(slug);
      await new Promise(r=>setTimeout(r,200));

      // Inspect what's visible vs hidden
      const demos = Array.from(document.querySelectorAll('.demo')).map(el => ({
        text: el.textContent.trim().slice(0, 80),
        module: el.getAttribute('data-module'),
        giros_attr: el.getAttribute('data-giros'),
        hidden: el.style.display === 'none',
        hiddenReason: el.getAttribute('data-vlx-hidden-reason')
      }));

      // Inspect terminology replacements
      const terms = Array.from(document.querySelectorAll('[data-i18n]')).map(el => ({
        key: el.getAttribute('data-i18n'),
        currentText: el.textContent
      }));

      const placeholder = document.querySelector('[data-i18n-placeholder]')?.placeholder;

      return {
        applyOk: ok,
        activeGiro: document.body.getAttribute('data-vlx-active-giro'),
        demos,
        terms,
        placeholder,
        fabPresent: !!document.getElementById('vlx-giro-config-fab'),
        drawerPresent: !!document.getElementById('vlx-giro-config-drawer')
      };
    }, g);

    await page.screenshot({path: path.join(SHOTS, `standalone-${g}.jpg`), quality:75, type:'jpeg', fullPage:true});

    allResults.push({ giro: g, result, errors: errors.slice(0,3) });
    console.log(`\n=== ${g} ===`);
    console.log('activeGiro:', result.activeGiro);
    console.log('hidden demos:', result.demos.filter(d=>d.hidden).map(d => d.module || d.giros_attr).join(', '));
    console.log('visible demos:', result.demos.filter(d=>!d.hidden).map(d => d.module || d.giros_attr).join(', '));
    console.log('terms:', result.terms.map(t => `${t.key}→"${t.currentText}"`).join(' · '));
    console.log('placeholder:', result.placeholder);
    console.log('fab+drawer:', result.fabPresent && result.drawerPresent ? 'OK' : 'MISSING');
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname,'..','validacion-standalone-results.json'), JSON.stringify(allResults,null,2));
})();
