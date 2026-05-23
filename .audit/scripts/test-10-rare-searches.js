// 10 búsquedas raras de giros. Verifica que TODAS resuelvan a una landing premium real.
// "Falla" = router devuelve URL pero la URL es genérica/plana o no existe.
const puppeteer = require('puppeteer-core');
const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const fs = require('fs');

// Lista de 10 búsquedas raras (probablemente no mapeadas a HARD_EXCEPTIONS)
const QUERIES = [
  'hojalatería',           // taller hojalata - carrocería
  'raspados con chamoy',    // postre callejero
  'venta de mole',          // comida regional
  'trompo al pastor',       // taquería específica
  'elotitos en vaso',       // antojito
  'tacos sudados',          // taquería específica
  'agua de tamarindo',      // bebida
  'cabello chino permanente', // estética
  'venta de tamales',       // antojito
  'renta de inflables',     // eventos
];

// Set de marcas premium VÁLIDAS conocidas (estas son las "buenas")
const PREMIUM_BRANDS = new Set([
  'navaja','comandero','tendito','receta','corte','pulso','pata','folio','forja',
  'tarima','refacciona','pareo','bloque','gateo','burbuja','almohada','quilate',
  'tictac','armazon','mochila','asa','discreto','comedor','consome','nieve',
  'merengue','brillo','marea','yunque','viruta','obra','espuma','tasca','kappa',
  'asado','licuado','oxford','hilito','torre','funda','mueble','canasto','pareo',
  'cafeteria','restaurante','taqueria','barberia','farmacia','dental'
]);

async function testQuery(page, q) {
  const r = await page.evaluate((query) => {
    try {
      const router = window.vlxBrandRouter;
      if (!router) return { error: 'no_router' };
      const res = router.resolve(query);
      return { url: res && res.url, brand: res && res.brand, raw: res };
    } catch (e) {
      return { error: e.message };
    }
  }, q);
  return r;
}

async function checkLanding(page, url) {
  // Visita la URL y verifica:
  // 1) HTTP 200 (no 404)
  // 2) NO contiene "landing-" en path (= template plano viejo)
  // 3) Tiene un h1 que NO sea el del picker
  // Normalizar: si no empieza con http ni con /, anteponer /
  let fullUrl = url;
  if (!fullUrl.startsWith('http')) {
    if (!fullUrl.startsWith('/')) fullUrl = '/' + fullUrl;
    fullUrl = 'https://systeminternational.app' + fullUrl;
  }
  const full = fullUrl;
  if (full.includes('/landing-')) {
    return { ok: false, reason: 'landing_plana_vieja', url: full };
  }
  try {
    const resp = await page.goto(full, { waitUntil: 'load', timeout: 20000 });
    const status = resp ? resp.status() : 0;
    if (status !== 200) return { ok: false, reason: 'http_' + status, url: full };
    await new Promise(r => setTimeout(r, 1500));
    const data = await page.evaluate(() => {
      const pickerH1 = document.querySelector('#picker h1');
      const allH1s = Array.from(document.querySelectorAll('h1'));
      const realH1 = allH1s.find(h => h !== pickerH1 && (h.textContent || '').trim().length > 5);
      const pickerEl = document.querySelector('#picker');
      const pickerVisible = pickerEl && pickerEl.offsetParent !== null;
      return {
        h1Count: allH1s.length,
        realH1Text: realH1 ? realH1.textContent.trim().slice(0, 120) : null,
        pickerVisible,
        bodyLoaded: document.body.classList.contains('loaded')
      };
    });
    if (data.pickerVisible) return { ok: false, reason: 'picker_visible_no_brand', url: full, data };
    if (!data.realH1Text) return { ok: false, reason: 'no_real_h1', url: full, data };
    return { ok: true, url: full, data };
  } catch (e) {
    return { ok: false, reason: 'exception', error: e.message, url: full };
  }
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.goto('https://systeminternational.app/marketplace.html?cb=' + Date.now(), { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));

  const results = [];
  let consecutivePass = 0;
  let maxConsecutive = 0;

  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i];
    console.log(`\n[${i+1}/${QUERIES.length}] "${q}"`);

    const routed = await testQuery(page, q);
    if (routed.error || !routed.url) {
      console.log(`  ❌ router error: ${routed.error || 'no url'}`);
      results.push({ query: q, ok: false, stage: 'router', error: routed.error || 'no url' });
      consecutivePass = 0;
      continue;
    }
    console.log(`  → ${routed.url} (${routed.brand || 'no-brand'})`);

    const landing = await checkLanding(page, routed.url);
    if (!landing.ok) {
      console.log(`  ❌ landing fail: ${landing.reason}`, landing.error || '');
      results.push({ query: q, ok: false, stage: 'landing', url: routed.url, reason: landing.reason, ...landing });
      consecutivePass = 0;
    } else {
      console.log(`  ✅ ok — hero: "${landing.data.realH1Text.slice(0,60)}..."`);
      results.push({ query: q, ok: true, url: routed.url, brand: routed.brand, hero: landing.data.realH1Text });
      consecutivePass++;
      if (consecutivePass > maxConsecutive) maxConsecutive = consecutivePass;
    }

    // Regresar a marketplace para próxima query
    await page.goto('https://systeminternational.app/marketplace.html?cb=' + Date.now(), { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1500));
  }

  await browser.close();

  console.log('\n========== RESULT ==========');
  console.log('Pass:', results.filter(r => r.ok).length, '/', results.length);
  console.log('Max consecutive PASS:', maxConsecutive);
  console.log('Fails:');
  results.filter(r => !r.ok).forEach(r => console.log('  -', r.query, '→', r.stage, r.reason || r.error));

  fs.writeFileSync('.audit/rare-searches-results.json', JSON.stringify(results, null, 2));
  console.log('\nReport: .audit/rare-searches-results.json');

  // Exit code based on success
  process.exit(maxConsecutive >= 10 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
