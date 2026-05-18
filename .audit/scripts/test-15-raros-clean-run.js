// 15 queries NUEVAS (no usadas antes). Objetivo: 10 PASS consecutivas en UNA corrida limpia.
// Criterio PASS endurecido: imgs >= 80% cargadas.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const OUTDIR = path.join(__dirname, '..', 'screenshots-clean-run');
fs.mkdirSync(OUTDIR, { recursive: true });

// Queries nuevas — giros raros con jergas, combinaciones inusuales, regionalismos
const QUERIES = [
  { q: 'venta de raspados con leche condensada',  ok: ['/nieve.html','/tamarindo.html','/comandero.html'] },
  { q: 'cremería y embutidos',                    ok: ['/despensa.html','/tendito.html','/carnitas.html'] },
  { q: 'venta de churros con cajeta',             ok: ['/merengue.html','/comandero.html'] },
  { q: 'tienda de telas por metro',               ok: ['/pareo.html','/hilito.html','/tendito.html'] },
  { q: 'lavado de autos a mano',                  ok: ['/burbuja.html','/forja.html','/refacciona.html'] },
  { q: 'venta de carbón para asar',               ok: ['/tendito.html','/asado.html','/brasa.html'] },
  { q: 'taller de costura y arreglos',            ok: ['/hilito.html','/pareo.html'] },
  { q: 'tienda de productos naturistas',          ok: ['/receta.html','/tendito.html'] },
  { q: 'venta de plantas y flores para jardín',   ok: ['/petalo.html','/tendito.html'] },
  { q: 'salón de eventos para 100 personas',      ok: ['/tarima.html','/folio.html'] },
  { q: 'fumigación residencial',                  ok: ['/burbuja.html','/yunque.html','/tendito.html'] },
  { q: 'venta de aguas frescas',                  ok: ['/limonero.html','/tamarindo.html','/espuma.html'] },
  { q: 'tienda de mochilas escolares',            ok: ['/mochila.html','/tendito.html'] },
  { q: 'venta de uniformes escolares',            ok: ['/pareo.html','/tendito.html'] },
  { q: 'taller de soldadura',                     ok: ['/yunque.html','/forja.html'] }
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', args: ['--no-sandbox'],
    defaultViewport: { width: 1280, height: 900 }
  });

  const results = [];
  let consecutivePass = 0;
  let maxConsecutive = 0;

  for (let i = 0; i < QUERIES.length; i++) {
    const { q, ok: acceptableUrls } = QUERIES[i];
    const seq = String(i+1).padStart(2,'0');
    console.log(`\n[${i+1}/${QUERIES.length}] "${q}"`);
    const page = await browser.newPage();

    try {
      await page.goto('https://systeminternational.app/marketplace.html?cb=' + Date.now(), { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 1500));
      const routed = await page.evaluate(query => {
        try {
          const r = window.vlxBrandRouter && window.vlxBrandRouter.resolve(query);
          return { url: r && r.url, brand: r && r.brand };
        } catch(e) { return { error: e.message }; }
      }, q);

      if (!routed || !routed.url) {
        console.log('  ❌ router null');
        results.push({ q, ok:false, fail: 'router_null' });
        consecutivePass = 0;
        await page.close(); continue;
      }
      const urlNorm = '/' + routed.url.replace(/^\/+/, '');
      console.log(`  → ${urlNorm}`);

      const isAcceptable = acceptableUrls.some(u => urlNorm === u || urlNorm.endsWith(u));
      if (!isAcceptable) {
        console.log(`  ❌ URL ${urlNorm} no aceptable: [${acceptableUrls.join(', ')}]`);
        results.push({ q, ok:false, fail: 'url_not_acceptable', url: urlNorm, acceptable: acceptableUrls });
        consecutivePass = 0;
        await page.close(); continue;
      }
      if (/^\/?landing-/.test(routed.url)) {
        console.log(`  ❌ landing plana`);
        results.push({ q, ok:false, fail: 'landing_plana', url: urlNorm });
        consecutivePass = 0;
        await page.close(); continue;
      }

      const fullUrl = 'https://systeminternational.app' + urlNorm;
      const resp = await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      if (!resp || resp.status() !== 200) {
        console.log(`  ❌ HTTP ${resp ? resp.status() : 'no_response'}`);
        results.push({ q, ok:false, fail: 'http_status', url: fullUrl, status: resp && resp.status() });
        consecutivePass = 0;
        await page.close(); continue;
      }
      await new Promise(r => setTimeout(r, 4000)); // 4s para lazy load (más generoso)

      const inspection = await page.evaluate(() => {
        const pickerEl = document.querySelector('#picker');
        const pickerVisible = pickerEl && pickerEl.offsetParent !== null;
        const realH1 = Array.from(document.querySelectorAll('h1')).find(h => h !== document.querySelector('#picker h1') && (h.textContent||'').trim().length > 5);
        const heroText = realH1 ? realH1.textContent.trim() : '';
        const imgs = Array.from(document.querySelectorAll('img')).slice(0, 6).map(img => ({
          loaded: img.complete && img.naturalWidth > 0
        }));
        return { pickerVisible, heroText, imgs };
      });

      const totalImgs = inspection.imgs.length;
      const loadedImgs = inspection.imgs.filter(i => i.loaded).length;
      const imgPct = totalImgs ? Math.round((loadedImgs / totalImgs) * 100) : 100;

      const fails = [];
      if (inspection.pickerVisible) fails.push('picker_visible');
      if (!inspection.heroText) fails.push('no_hero');
      if (imgPct < 80) fails.push(`imgs_${imgPct}%`); // criterio endurecido a 80%

      const ssPath = path.join(OUTDIR, `${seq}-${q.replace(/[^\w]+/g,'_').slice(0,40)}.png`);
      await page.screenshot({ path: ssPath, fullPage: false });

      const passed = fails.length === 0;
      const status = passed ? '✅' : '❌';
      console.log(`  ${status} hero: "${inspection.heroText.slice(0,80)}"`);
      console.log(`     imgs cargadas: ${loadedImgs}/${totalImgs} (${imgPct}%)`);
      if (!passed) console.log(`     fails: ${fails.join(', ')}`);

      results.push({ q, url: urlNorm, ok: passed, heroText: inspection.heroText, imgsLoaded: loadedImgs, imgsTotal: totalImgs, imgPct, fails, screenshot: ssPath });

      if (passed) {
        consecutivePass++;
        if (consecutivePass > maxConsecutive) maxConsecutive = consecutivePass;
      } else {
        consecutivePass = 0;
      }
    } catch (e) {
      console.log('  ❌ exception:', e.message);
      results.push({ q, ok:false, fail: 'exception', error: e.message });
      consecutivePass = 0;
    }
    await page.close();
  }

  await browser.close();

  console.log('\n========== RESULT ==========');
  const pass = results.filter(r => r.ok).length;
  console.log(`Pass: ${pass} / ${results.length}`);
  console.log(`Max consecutive: ${maxConsecutive}`);
  if (maxConsecutive >= 10) console.log('🎯 OBJETIVO 10 PASS CONSECUTIVAS CUMPLIDO');

  console.log('\nFails:');
  results.filter(r => !r.ok).forEach(r => {
    console.log(`  - "${r.q}" → ${r.fail || (r.fails||[]).join(',')}`);
    if (r.url) console.log(`    URL: ${r.url}`, r.acceptable ? `(esperaba: ${r.acceptable.join('|')})` : '');
    if (r.heroText) console.log(`    hero: "${r.heroText.slice(0,80)}"`);
  });

  fs.writeFileSync(path.join(__dirname, '..', 'clean-run-results.json'),
    JSON.stringify({ results, pass, max: maxConsecutive, total: results.length, generated: new Date().toISOString() }, null, 2));
  process.exit(maxConsecutive >= 10 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
