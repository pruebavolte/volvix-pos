// FINAL ROUND. Queries NUEVAS. PASS = url premium real + hero + imgs >=80% + botón Empezar gratis va a /registro.html
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const OUTDIR = path.join(__dirname, '..', 'screenshots-final-round');
fs.mkdirSync(OUTDIR, { recursive: true });

const QUERIES = [
  { q: 'venta de pollo asado para llevar',          genericOK: false },
  { q: 'cocina mediterránea de pastas',              genericOK: false },
  { q: 'venta de jugos de zanahoria',                genericOK: false },
  { q: 'taller de joyería y arreglos',               genericOK: false },
  { q: 'venta de gorras snapback',                   genericOK: false },
  { q: 'consultorio de psicología clínica',          genericOK: false },
  { q: 'venta de pinturas vinílicas',                genericOK: false },
  { q: 'cocina argentina parrilla',                  genericOK: false },
  { q: 'venta de tacos al pastor estilo DF',         genericOK: false },
  { q: 'tienda de productos para perros',            genericOK: false },
  { q: 'consultorio de fisioterapia deportiva',      genericOK: false },
  { q: 'venta de helados de yogurt',                 genericOK: false }
];

const GENERIC_URLS = new Set(['/folio.html','/tarima.html']);

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 900 } });
  const results = []; let consecutivePass = 0; let maxConsecutive = 0;

  for (let i = 0; i < QUERIES.length; i++) {
    const { q, genericOK } = QUERIES[i];
    const seq = String(i+1).padStart(2,'0');
    console.log(`\n[${i+1}/${QUERIES.length}] "${q}"`);
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    try {
      await page.goto('https://systeminternational.app/marketplace.html?cb=' + Date.now(), { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 1500));
      const routed = await page.evaluate(query => {
        try { const r = window.vlxBrandRouter && window.vlxBrandRouter.resolve(query); return { url: r && r.url }; }
        catch(e) { return { error: e.message }; }
      }, q);

      if (!routed || !routed.url) { console.log('  ❌ router null'); results.push({q,ok:false,fail:'router_null'}); consecutivePass=0; await page.close(); continue; }
      const urlNorm = '/' + routed.url.replace(/^\/+/, '');
      console.log(`  → ${urlNorm}`);
      if (/^\/?landing-/.test(routed.url)) { console.log('  ❌ landing plana'); results.push({q,ok:false,fail:'landing_plana',url:urlNorm}); consecutivePass=0; await page.close(); continue; }
      if (!genericOK && GENERIC_URLS.has(urlNorm)) { console.log('  ❌ fallback genérico'); results.push({q,ok:false,fail:'generic_fallback',url:urlNorm}); consecutivePass=0; await page.close(); continue; }

      const fullUrl = 'https://systeminternational.app' + urlNorm;
      const resp = await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      if (!resp || resp.status() !== 200) { console.log(`  ❌ HTTP ${resp ? resp.status() : 'no_response'}`); results.push({q,ok:false,fail:'http_status',url:fullUrl,status:resp&&resp.status()}); consecutivePass=0; await page.close(); continue; }
      await new Promise(r => setTimeout(r, 4500));

      const inspection = await page.evaluate(() => {
        const pickerEl = document.querySelector('#picker');
        const pickerVisible = pickerEl && pickerEl.offsetParent !== null;
        const realH1 = Array.from(document.querySelectorAll('h1')).find(h => h !== document.querySelector('#picker h1') && (h.textContent||'').trim().length > 5);
        const heroText = realH1 ? realH1.textContent.trim() : '';
        const imgs = Array.from(document.querySelectorAll('img')).slice(0, 6).map(img => ({ loaded: img.complete && img.naturalWidth > 0 }));
        // Verificar botón "Empezar gratis" apunta a /registro.html
        const empezarBtns = Array.from(document.querySelectorAll('a')).filter(a => (a.textContent||'').trim().toLowerCase().includes('empezar'));
        const empezarOk = empezarBtns.length > 0 && empezarBtns.every(a => (a.getAttribute('href')||'').includes('/registro.html'));
        return { pickerVisible, heroText, imgs, empezarOk, empezarCount: empezarBtns.length };
      });
      const totalImgs = inspection.imgs.length;
      const loadedImgs = inspection.imgs.filter(i => i.loaded).length;
      const imgPct = totalImgs ? Math.round((loadedImgs/totalImgs)*100) : 100;

      const fails = [];
      if (inspection.pickerVisible) fails.push('picker_visible');
      if (!inspection.heroText) fails.push('no_hero');
      if (imgPct < 80) fails.push(`imgs_${imgPct}%`);
      if (!inspection.empezarOk) fails.push(`empezar_roto:${inspection.empezarCount}btns`);

      const ssPath = path.join(OUTDIR, `${seq}-${q.replace(/[^\w]+/g,'_').slice(0,40)}.png`);
      await page.screenshot({ path: ssPath, fullPage: false });

      const passed = fails.length === 0;
      console.log(`  ${passed?'✅':'❌'} hero: "${inspection.heroText.slice(0,70)}"`);
      console.log(`     imgs: ${loadedImgs}/${totalImgs} (${imgPct}%) | empezar btns: ${inspection.empezarCount} ${inspection.empezarOk?'OK':'ROTO'}`);
      if (!passed) console.log(`     fails: ${fails.join(', ')}`);
      results.push({q,url:urlNorm,ok:passed,heroText:inspection.heroText,imgsLoaded:loadedImgs,imgsTotal:totalImgs,imgPct,empezarBtnsCount:inspection.empezarCount,empezarOk:inspection.empezarOk,fails,screenshot:ssPath});

      if (passed) { consecutivePass++; if (consecutivePass > maxConsecutive) maxConsecutive = consecutivePass; }
      else consecutivePass = 0;
    } catch (e) {
      console.log('  ❌ exception:', e.message);
      results.push({q,ok:false,fail:'exception',error:e.message});
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
    if (r.url) console.log(`    URL: ${r.url}`);
  });
  fs.writeFileSync(path.join(__dirname, '..', 'final-round-results.json'),
    JSON.stringify({ results, pass, max: maxConsecutive, total: results.length, generated: new Date().toISOString() }, null, 2));
  process.exit(maxConsecutive >= 10 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
