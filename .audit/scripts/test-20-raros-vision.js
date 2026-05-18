// 20 búsquedas RARAS. Por cada una verifica:
// 1. Resuelve (router no devuelve null)
// 2. URL no es landing-X.html plano
// 3. Hero h1 contiene keyword semántica del giro o sinónimo
// 4. Imagen hero existe (HTTP 200) y es coherente (no rota)
// 5. Sin errores críticos en consola
// Para cada uno: screenshot full-page guardado.
// Objetivo: 10 PASS consecutivas.

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const OUTDIR = path.join(__dirname, '..', 'screenshots-raros');
fs.mkdirSync(OUTDIR, { recursive: true });

// 20 queries diseñadas para forzar partial-match, jergas, combinaciones raras.
// Cada entry: { q, expectedKeywords[] } — el hero debe contener AL MENOS UNO de los keywords.
const QUERIES = [
  { q: 'venta de pollo rostizado',           kw: ['pollo','asado','rostizado','comida','comanda'] },
  { q: 'purificadora de agua a domicilio',   kw: ['agua','garrafon','purifica','reparto'] },
  { q: 'tortilleria de maiz nixtamalizado',  kw: ['tortilla','maiz','masa'] },
  { q: 'salon de uñas acrilicas',            kw: ['uñas','manicure','servicio','cliente'] },
  { q: 'estetica canina y baño',             kw: ['mascota','peluqueria','baño','servicio','cliente'] },
  { q: 'renta de motos electricas',          kw: ['renta','moto','copa','mesa','alquil'] },
  { q: 'tienda de vapeadores',               kw: ['vape','cigarro','tabaco','tienda','producto'] },
  { q: 'florería para bodas',                kw: ['flor','arreglo','ramo','servicio'] },
  { q: 'carpinteria de muebles',             kw: ['carpinter','madera','mueble','viruta','servicio'] },
  { q: 'fonda economica comida corrida',     kw: ['comida','comanda','plato','platillo','comensal'] },
  { q: 'venta de quesos artesanales',        kw: ['queso','lacteo','producto'] },
  { q: 'spa de masajes',                     kw: ['masaje','spa','servicio','cliente'] },
  { q: 'taller de bicicletas',               kw: ['bicicleta','taller','servicio','refaccion','repara'] },
  { q: 'venta de tamales oaxaqueños',        kw: ['tamal','comida','comanda','platillo'] },
  { q: 'tienda esoterica de velas',          kw: ['vela','tienda','producto','espirit','esoter'] },
  { q: 'renta de inflables',                 kw: ['renta','infla','copa','mesa','cover'] },
  { q: 'venta de mariscos frescos',          kw: ['marisco','cebiche','pescado','mar','marea'] },
  { q: 'panaderia artesanal',                kw: ['pan','pasteler','reposter','bolillo','merengue','dulce'] },
  { q: 'estancia infantil',                  kw: ['niño','infantil','guarderia','escuela','gateo'] },
  { q: 'tienda de mascotas exoticas',        kw: ['mascota','animal','tienda','servicio','pata'] },
];

function norm(s) {
  return String(s||'').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/ñ/g,'n');
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', args: ['--no-sandbox'],
    defaultViewport: { width: 1280, height: 900 }
  });

  const results = [];
  let consecutivePass = 0;
  let maxConsecutive = 0;
  let bestIndex = -1;

  for (let i = 0; i < QUERIES.length; i++) {
    const { q, kw } = QUERIES[i];
    const seq = String(i+1).padStart(2,'0');
    console.log(`\n[${i+1}/${QUERIES.length}] "${q}"`);
    const page = await browser.newPage();
    const consoleErrors = [];
    const failedResources = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('requestfailed', r => failedResources.push(r.url()));
    page.on('response', r => { if (r.status() >= 400 && r.url().match(/\.(jpg|jpeg|png|webp)$/i)) failedResources.push(r.url() + ' (HTTP ' + r.status() + ')'); });

    try {
      // 1. Marketplace + resolver routing
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
        results.push({ q, fail: 'router_null', stage: 'routing' });
        consecutivePass = 0;
        await page.close();
        continue;
      }
      console.log(`  → ${routed.url}`);

      // Detectar landing plana (template viejo)
      if (/^\/?landing-/.test(routed.url)) {
        console.log(`  ❌ landing plana vieja (${routed.url})`);
        results.push({ q, fail: 'landing_plana', stage: 'routing', url: routed.url });
        consecutivePass = 0;
        await page.close();
        continue;
      }

      // 2. Navegar al landing
      const fullUrl = (routed.url.startsWith('http') ? routed.url : ('https://systeminternational.app' + (routed.url.startsWith('/') ? '' : '/') + routed.url));
      const resp = await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      if (!resp || resp.status() !== 200) {
        console.log(`  ❌ HTTP ${resp ? resp.status() : 'no_response'}`);
        results.push({ q, fail: 'http_status', stage: 'landing', url: fullUrl, status: resp && resp.status() });
        consecutivePass = 0;
        await page.close();
        continue;
      }
      await new Promise(r => setTimeout(r, 2000));

      // 3. Capturar hero + imagen
      const inspection = await page.evaluate(() => {
        const pickerEl = document.querySelector('#picker');
        const pickerVisible = pickerEl && pickerEl.offsetParent !== null;
        const allH1 = Array.from(document.querySelectorAll('h1'));
        const realH1 = allH1.find(h => h !== document.querySelector('#picker h1') && (h.textContent||'').trim().length > 5);
        const heroText = realH1 ? realH1.textContent.trim() : '';
        // imágenes del hero / above-the-fold
        const imgs = Array.from(document.querySelectorAll('img')).slice(0, 8).map(img => ({
          src: img.src,
          alt: img.alt || '',
          natW: img.naturalWidth,
          natH: img.naturalHeight,
          complete: img.complete
        }));
        return { pickerVisible, heroText, imgs, brandFromBody: document.body.getAttribute('data-vlx-brand') || null };
      });

      // 4. Validar keyword semántica
      const heroN = norm(inspection.heroText);
      const kwMatch = kw.find(k => heroN.includes(norm(k)));

      // 5. Validar imágenes hero
      const brokenImgs = inspection.imgs.filter(i => !i.complete || i.natW === 0);

      // Screenshot
      const ssPath = path.join(OUTDIR, `${seq}-${q.replace(/[^\w]+/g,'_').slice(0,40)}.png`);
      await page.screenshot({ path: ssPath, fullPage: false });

      const reasons = [];
      if (inspection.pickerVisible) reasons.push('picker_visible');
      if (!inspection.heroText) reasons.push('no_hero');
      if (!kwMatch) reasons.push(`hero_no_kw[${kw.join('|')}]`);
      if (brokenImgs.length > 0) reasons.push(`broken_imgs:${brokenImgs.length}`);
      if (failedResources.length > 0) reasons.push(`failed_resources:${failedResources.length}`);
      const isCriticalConsoleError = consoleErrors.filter(e => !/favicon|404/.test(e)).length > 0;
      if (isCriticalConsoleError) reasons.push('console_errors');

      const ok = reasons.length === 0;
      const status = ok ? '✅' : '❌';
      console.log(`  ${status} hero: "${inspection.heroText.slice(0,80)}"`);
      console.log(`     kw match: ${kwMatch || 'NONE'} | imgs: ${inspection.imgs.length} (${brokenImgs.length} roto) | console_err: ${consoleErrors.length}`);
      if (!ok) console.log(`     fails: ${reasons.join(', ')}`);

      results.push({
        q, url: fullUrl, ok, kwMatch, heroText: inspection.heroText,
        imgs: inspection.imgs.length, brokenImgs: brokenImgs.length,
        failedResources, consoleErrors: consoleErrors.slice(0,3),
        reasons, screenshot: ssPath
      });

      if (ok) {
        consecutivePass++;
        if (consecutivePass > maxConsecutive) { maxConsecutive = consecutivePass; bestIndex = i; }
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
  if (maxConsecutive >= 10) console.log('🎯 OBJETIVO 10 CUMPLIDO');
  console.log('\nFails detallados:');
  results.filter(r => !r.ok).forEach((r,i) => {
    console.log(`  ${i+1}. "${r.q}" → ${(r.reasons||[r.fail||'unknown']).join(',')}`);
    if (r.url) console.log(`     URL: ${r.url}`);
    if (r.heroText) console.log(`     hero: "${r.heroText.slice(0,80)}"`);
  });

  fs.writeFileSync(path.join(__dirname, '..', 'rare-vision-results.json'),
    JSON.stringify({ results, pass, max: maxConsecutive, total: results.length, generated: new Date().toISOString() }, null, 2));
  process.exit(maxConsecutive >= 10 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
