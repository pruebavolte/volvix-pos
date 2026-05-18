// V2: critério de PASS realista:
// 1. Router resuelve (URL no null)
// 2. URL resuelta está en lista acceptable_urls (yo defino semánticamente correctas)
// 3. URL no es landing-X.html (template plano viejo)
// 4. Landing devuelve HTTP 200
// 5. Hero h1 no vacío (palabras > 5 chars)
// 6. Picker oculto
// 7. AL MENOS 50% de las imágenes hero (primeras 6) cargaron OK
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const OUTDIR = path.join(__dirname, '..', 'screenshots-raros-v2');
fs.mkdirSync(OUTDIR, { recursive: true });

const QUERIES = [
  { q: 'venta de pollo rostizado',           ok: ['/brasa.html','/comandero.html','/asado.html'] },
  { q: 'purificadora de agua a domicilio',   ok: ['/tendito.html'] },
  { q: 'tortilleria de maiz nixtamalizado',  ok: ['/comandero.html','/tendito.html'] },
  { q: 'salon de uñas acrilicas',            ok: ['/brillo.html'] },
  { q: 'estetica canina y baño',             ok: ['/pata.html','/brillo.html'] },
  { q: 'renta de motos electricas',          ok: ['/folio.html','/tarima.html'] },
  { q: 'tienda de vapeadores',               ok: ['/discreto.html'] },
  { q: 'florería para bodas',                ok: ['/petalo.html','/tarima.html'] },
  { q: 'carpinteria de muebles',             ok: ['/viruta.html'] },
  { q: 'fonda economica comida corrida',     ok: ['/comedor.html','/comandero.html'] },
  { q: 'venta de quesos artesanales',        ok: ['/despensa.html','/tendito.html'] },
  { q: 'spa de masajes',                     ok: ['/brillo.html'] },
  { q: 'taller de bicicletas',               ok: ['/refacciona.html','/yunque.html','/forja.html'] },
  { q: 'venta de tamales oaxaqueños',        ok: ['/comandero.html','/tamalero.html'] },
  { q: 'tienda esoterica de velas',          ok: ['/discreto.html'] },
  { q: 'renta de inflables',                 ok: ['/folio.html','/tarima.html'] },
  { q: 'venta de mariscos frescos',          ok: ['/marea.html'] },
  { q: 'panaderia artesanal',                ok: ['/merengue.html','/espuma.html'] },
  { q: 'estancia infantil',                  ok: ['/gateo.html'] },
  { q: 'tienda de mascotas exoticas',        ok: ['/pata.html','/tendito.html'] },
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
      await new Promise(r => setTimeout(r, 1200));
      const routed = await page.evaluate(query => {
        try {
          const r = window.vlxBrandRouter && window.vlxBrandRouter.resolve(query);
          return { url: r && r.url, brand: r && r.brand };
        } catch(e) { return { error: e.message }; }
      }, q);

      if (!routed || !routed.url) {
        console.log('  ❌ router null');
        results.push({ q, fail: 'router_null' });
        consecutivePass = 0;
        await page.close(); continue;
      }
      const urlNorm = '/' + routed.url.replace(/^\/+/, '');
      console.log(`  → ${urlNorm}`);

      // Verificar URL es acceptable
      const isAcceptable = acceptableUrls.some(u => urlNorm === u || urlNorm.endsWith(u));
      if (!isAcceptable) {
        console.log(`  ❌ URL ${urlNorm} NO está en aceptables: [${acceptableUrls.join(', ')}]`);
        results.push({ q, fail: 'url_not_acceptable', url: urlNorm, acceptable: acceptableUrls });
        consecutivePass = 0;
        await page.close(); continue;
      }

      // No landing-X.html plano
      if (/^\/?landing-/.test(routed.url)) {
        console.log(`  ❌ landing plana vieja`);
        results.push({ q, fail: 'landing_plana', url: urlNorm });
        consecutivePass = 0;
        await page.close(); continue;
      }

      // Navegar
      const fullUrl = 'https://systeminternational.app' + urlNorm;
      const resp = await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      if (!resp || resp.status() !== 200) {
        console.log(`  ❌ HTTP ${resp ? resp.status() : 'no_response'}`);
        results.push({ q, fail: 'http_status', url: fullUrl, status: resp && resp.status() });
        consecutivePass = 0;
        await page.close(); continue;
      }
      await new Promise(r => setTimeout(r, 3000)); // espera 3s para lazy load de imgs

      // Inspección
      const inspection = await page.evaluate(() => {
        const pickerEl = document.querySelector('#picker');
        const pickerVisible = pickerEl && pickerEl.offsetParent !== null;
        const realH1 = Array.from(document.querySelectorAll('h1')).find(h => h !== document.querySelector('#picker h1') && (h.textContent||'').trim().length > 5);
        const heroText = realH1 ? realH1.textContent.trim() : '';
        // Primeras 6 imágenes visibles (sin lazy unresolved aún)
        const imgs = Array.from(document.querySelectorAll('img')).slice(0, 6).map(img => ({
          loaded: img.complete && img.naturalWidth > 0,
          natW: img.naturalWidth
        }));
        return { pickerVisible, heroText, imgs };
      });

      const totalImgs = inspection.imgs.length;
      const loadedImgs = inspection.imgs.filter(i => i.loaded).length;
      const imgPct = totalImgs ? Math.round((loadedImgs / totalImgs) * 100) : 100;

      const fails = [];
      if (inspection.pickerVisible) fails.push('picker_visible');
      if (!inspection.heroText) fails.push('no_hero');
      if (imgPct < 50) fails.push(`imgs_${imgPct}%`);

      const ssPath = path.join(OUTDIR, `${seq}-${q.replace(/[^\w]+/g,'_').slice(0,40)}.png`);
      await page.screenshot({ path: ssPath, fullPage: false });

      const passed = fails.length === 0;
      const status = passed ? '✅' : '❌';
      console.log(`  ${status} hero: "${inspection.heroText.slice(0,80)}"`);
      console.log(`     imgs cargadas: ${loadedImgs}/${totalImgs} (${imgPct}%)`);
      if (!passed) console.log(`     fails: ${fails.join(', ')}`);

      results.push({
        q, url: urlNorm, ok: passed, heroText: inspection.heroText,
        imgsLoaded: loadedImgs, imgsTotal: totalImgs, imgPct, fails,
        screenshot: ssPath
      });

      if (passed) {
        consecutivePass++;
        if (consecutivePass > maxConsecutive) maxConsecutive = consecutivePass;
      } else {
        consecutivePass = 0;
      }
    } catch (e) {
      console.log('  ❌ exception:', e.message);
      results.push({ q, fail: 'exception', error: e.message });
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

  fs.writeFileSync(path.join(__dirname, '..', 'rare-vision-v2-results.json'),
    JSON.stringify({ results, pass, max: maxConsecutive, total: results.length, generated: new Date().toISOString() }, null, 2));
  process.exit(maxConsecutive >= 10 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
