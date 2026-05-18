// Validación Puppeteer del schema-driven UI contra servidor local
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5757';
const SHOTS = path.join(__dirname, '..', 'screenshots-fase4');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const results = [];

  // TEST 1: paneldecontrol carga correctamente con el script
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    const consoleLogs = [];
    page.on('console', msg => consoleLogs.push(msg.type() + ': ' + msg.text()));
    try {
      await page.goto(BASE + '/paneldecontrol.html', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise(r => setTimeout(r, 2000));

      // Check que applyGiroConfig se cargó
      const hasFn = await page.evaluate(() => typeof window.applyGiroConfig === 'function');
      const hasFab = await page.evaluate(() => !!document.getElementById('vlx-giro-config-fab'));
      const hasDrawer = await page.evaluate(() => !!document.getElementById('vlx-giro-config-drawer'));

      results.push({
        test: 'paneldecontrol.html — script + drawer cargados',
        applyGiroConfig_loaded: hasFn,
        fab_present: hasFab,
        drawer_present: hasDrawer,
        consoleErrors: consoleLogs.filter(l => l.startsWith('error:')).slice(0, 3),
        consoleLog_relevant: consoleLogs.filter(l => l.includes('applyGiroConfig')).slice(0, 5)
      });

      await page.screenshot({ path: path.join(SHOTS, '01-paneldecontrol-loaded.jpg'), quality: 70, type: 'jpeg' });
    } catch (e) {
      results.push({ test: 'paneldecontrol load', error: e.message });
    }
    await page.close();
  }

  // TEST 2: Open drawer y verify tabs
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    try {
      await page.goto(BASE + '/paneldecontrol.html', { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 1500));
      await page.evaluate(() => { window.vlxOpenGiroConfig(); });
      await new Promise(r => setTimeout(r, 2000));

      const drawerOpen = await page.evaluate(() => document.getElementById('vlx-giro-config-drawer').classList.contains('open'));
      const statGiros = await page.evaluate(() => document.getElementById('vlx-stat-giros').textContent);
      const statModulos = await page.evaluate(() => document.getElementById('vlx-stat-modulos').textContent);
      const statTerms = await page.evaluate(() => document.getElementById('vlx-stat-terms').textContent);
      const filasGiros = await page.evaluate(() => document.querySelectorAll('#vlx-tbody-giros tr').length);

      results.push({
        test: 'drawer abierto + datos cargados',
        drawer_open: drawerOpen,
        stats: { giros: statGiros, modulos: statModulos, terms: statTerms },
        filas_tabla_giros: filasGiros
      });

      await page.screenshot({ path: path.join(SHOTS, '02-drawer-open.jpg'), quality: 70, type: 'jpeg' });
    } catch (e) {
      results.push({ test: 'drawer open', error: e.message });
    }
    await page.close();
  }

  // TEST 3-7: Probar applyGiroConfig() para 5 giros distintos en paneldecontrol
  const giros = ['navaja', 'pulso', 'comandero', 'forja', 'discreto'];
  for (const g of giros) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    try {
      await page.goto(BASE + '/paneldecontrol.html', { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 1500));
      const result = await page.evaluate(async (slug) => {
        if (typeof window.applyGiroConfig !== 'function') return { error: 'applyGiroConfig not loaded' };
        const ok = await window.applyGiroConfig(slug);
        const activeGiro = document.body.getAttribute('data-vlx-active-giro');
        const hidden = document.querySelectorAll('[data-vlx-hidden-reason]').length;
        return { ok, activeGiro, hidden };
      }, g);

      results.push({
        test: 'applyGiroConfig("' + g + '")',
        ...result
      });
      await page.screenshot({ path: path.join(SHOTS, `03-applyGiro-${g}.jpg`), quality: 70, type: 'jpeg' });
    } catch (e) {
      results.push({ test: 'applyGiro ' + g, error: e.message });
    }
    await page.close();
  }

  // TEST 8: Cargar giros-terminologias.json directo
  {
    const page = await browser.newPage();
    try {
      const resp = await page.goto(BASE + '/data/giros-terminologias.json');
      const json = await resp.json();
      const giros = Object.keys(json).filter(k => !k.startsWith('_') && k !== 'default');
      results.push({
        test: 'giros-terminologias.json válido',
        http: resp.status(),
        total_giros: giros.length,
        sample: giros.slice(0, 5),
        has_meta: !!json._meta
      });
    } catch (e) {
      results.push({ test: 'json fetch', error: e.message });
    }
    await page.close();
  }

  // TEST 9: salvadorex-pos.html también carga el script
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    try {
      await page.goto(BASE + '/salvadorex-pos.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 3000));
      const hasFn = await page.evaluate(() => typeof window.applyGiroConfig === 'function');
      const hasGetGiro = await page.evaluate(() => typeof window.vlxGetTenantGiro === 'function');
      results.push({
        test: 'salvadorex-pos.html — script cargado',
        applyGiroConfig_loaded: hasFn,
        vlxGetTenantGiro_loaded: hasGetGiro
      });
      await page.screenshot({ path: path.join(SHOTS, '09-salvadorex-pos.jpg'), quality: 70, type: 'jpeg' });
    } catch (e) {
      results.push({ test: 'salvadorex-pos load', error: e.message });
    }
    await page.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(__dirname, '..', 'validacion-chrome-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})();
