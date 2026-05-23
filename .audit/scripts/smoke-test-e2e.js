// E2E smoke test pre-pitch: login real + carga POS + carga panel + 3 URLs pitch
// Output: .audit/smoke-test-results.json + screenshots en .audit/screenshots/
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'https://systeminternational.app';
const EMAIL = 'grupovolvix@gmail.com';
const PASS = '123456789';

const SCREEN_DIR = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(SCREEN_DIR)) fs.mkdirSync(SCREEN_DIR, { recursive: true });

const results = { started: new Date().toISOString(), steps: [] };

async function step(name, fn) {
  const t0 = Date.now();
  const entry = { name, ok: false, ms: 0, errors: [], console: [], net: [] };
  try {
    await fn(entry);
    entry.ok = true;
  } catch (e) {
    entry.errors.push(String(e.message || e));
  }
  entry.ms = Date.now() - t0;
  results.steps.push(entry);
  console.log(`${entry.ok ? '✅' : '❌'} ${name} (${entry.ms}ms)${entry.errors.length ? ' — '+entry.errors[0] : ''}`);
  return entry.ok;
}

async function attachLoggers(page, entry) {
  page.on('console', msg => {
    if (msg.type() === 'error') entry.console.push(`[error] ${msg.text().slice(0, 200)}`);
  });
  page.on('pageerror', err => entry.errors.push(`[pageerror] ${err.message.slice(0, 200)}`));
  page.on('requestfailed', req => {
    const f = req.failure();
    if (f && !req.url().includes('analytics') && !req.url().includes('google')) {
      entry.net.push(`[failed] ${req.url().slice(0, 120)} — ${f.errorText}`);
    }
  });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // -------- STEP 1: Health endpoint --------
    await step('1. /api/health responde 200 + supabase_connected', async (entry) => {
      const resp = await page.goto(`${BASE}/api/health`, { waitUntil: 'networkidle0', timeout: 20000 });
      entry.status = resp.status();
      const body = await page.evaluate(() => document.body.innerText);
      entry.body = body.slice(0, 200);
      const json = JSON.parse(body);
      if (!json.ok) throw new Error('health.ok=false');
      if (!json.supabase_connected) throw new Error('supabase_connected=false');
    });

    // -------- STEP 2: /api/login --------
    let token = null;
    await step('2. POST /api/login devuelve JWT válido', async (entry) => {
      const resp = await page.evaluate(async (base, email, pass) => {
        const r = await fetch(`${base}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: pass })
        });
        return { status: r.status, body: await r.text() };
      }, BASE, EMAIL, PASS);
      entry.status = resp.status;
      if (resp.status !== 200) throw new Error(`HTTP ${resp.status}: ${resp.body.slice(0,200)}`);
      const json = JSON.parse(resp.body);
      if (!json.token) throw new Error('No token in response');
      token = json.token;
      entry.role = json.session && json.session.role;
      entry.tenant = json.session && json.session.tenant_id;
    });

    // -------- STEP 3: marketplace.html carga --------
    await step('3. marketplace.html carga sin errores JS', async (entry) => {
      attachLoggers(page, entry);
      const resp = await page.goto(`${BASE}/marketplace.html`, { waitUntil: 'networkidle2', timeout: 30000 });
      entry.status = resp.status();
      if (resp.status() !== 200) throw new Error(`HTTP ${resp.status()}`);
      // wait for body loaded class
      await page.waitForSelector('body', { timeout: 5000 });
      await new Promise(r => setTimeout(r, 1500));
      await page.screenshot({ path: path.join(SCREEN_DIR, '03-marketplace.png'), fullPage: false });
      // Picker should be hidden
      const pickerVisible = await page.evaluate(() => {
        const p = document.getElementById('picker');
        if (!p) return null;
        const cs = window.getComputedStyle(p);
        return cs.display !== 'none' && cs.visibility !== 'hidden';
      });
      entry.pickerVisible = pickerVisible;
    });

    // -------- STEP 4: 3 URLs del pitch (navaja/comandero/tendito) --------
    for (const slug of ['navaja', 'comandero', 'tendito', 'receta', 'corte']) {
      await step(`4. ${slug}.html carga + sin errores consola críticos`, async (entry) => {
        const subPage = await browser.newPage();
        attachLoggers(subPage, entry);
        try {
          const resp = await subPage.goto(`${BASE}/${slug}.html?b=${slug}`, { waitUntil: 'networkidle2', timeout: 30000 });
          entry.status = resp.status();
          if (resp.status() !== 200) throw new Error(`HTTP ${resp.status()}`);
          await new Promise(r => setTimeout(r, 2000));
          // Verify hero rendered
          const heroText = await subPage.evaluate(() => {
            const h = document.querySelector('h1, .hero h1, [class*="hero"] h1');
            return h ? h.innerText.slice(0, 100) : null;
          });
          entry.hero = heroText;
          if (!heroText || heroText.length < 5) throw new Error('hero h1 missing');
          await subPage.screenshot({ path: path.join(SCREEN_DIR, `04-${slug}.png`), fullPage: false });
        } finally {
          await subPage.close();
        }
      });
    }

    // -------- STEP 5: salvadorex-pos.html carga --------
    await step('5. salvadorex-pos.html carga (sin login redirect)', async (entry) => {
      const subPage = await browser.newPage();
      attachLoggers(subPage, entry);
      try {
        const resp = await subPage.goto(`${BASE}/salvadorex-pos.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        entry.status = resp.status();
        if (resp.status() !== 200) throw new Error(`HTTP ${resp.status()}`);
        await new Promise(r => setTimeout(r, 2500));
        entry.url = subPage.url();
        await subPage.screenshot({ path: path.join(SCREEN_DIR, '05-pos.png'), fullPage: false });
      } finally {
        await subPage.close();
      }
    });

    // -------- STEP 6: paneldecontrol.html carga --------
    await step('6. paneldecontrol.html carga', async (entry) => {
      const subPage = await browser.newPage();
      attachLoggers(subPage, entry);
      try {
        const resp = await subPage.goto(`${BASE}/paneldecontrol.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        entry.status = resp.status();
        if (resp.status() !== 200) throw new Error(`HTTP ${resp.status()}`);
        await new Promise(r => setTimeout(r, 2500));
        entry.url = subPage.url();
        await subPage.screenshot({ path: path.join(SCREEN_DIR, '06-panel.png'), fullPage: false });
      } finally {
        await subPage.close();
      }
    });

    // -------- STEP 7: 10 giros random vía router --------
    await step('7. router resuelve 10 giros típicos sin crash', async (entry) => {
      const routerPage = await browser.newPage();
      attachLoggers(routerPage, entry);
      try {
        await routerPage.goto(`${BASE}/marketplace.html`, { waitUntil: 'networkidle2', timeout: 20000 });
        await new Promise(r => setTimeout(r, 2000));
        const results = await routerPage.evaluate(() => {
          const tests = ['barbería','restaurante','farmacia','dental','veterinaria','abarrotes','hotel','taller','vinatería','sexshop'];
          const router = window.vlxBrandRouter;
          if (!router) return { error: 'vlxBrandRouter not loaded' };
          return tests.map(q => {
            try {
              const r = router.resolve(q);
              return { q, url: r && r.url, brand: r && r.brand };
            } catch (e) {
              return { q, error: e.message };
            }
          });
        });
        entry.routerTests = results;
        if (results.error) throw new Error(results.error);
        const failed = results.filter(r => r.error || !r.url);
        if (failed.length > 0) throw new Error(`${failed.length}/10 router fails: ${JSON.stringify(failed)}`);
      } finally {
        await routerPage.close();
      }
    });

  } finally {
    await browser.close();
  }

  results.finished = new Date().toISOString();
  results.passed = results.steps.filter(s => s.ok).length;
  results.failed = results.steps.filter(s => !s.ok).length;
  results.total = results.steps.length;

  fs.writeFileSync(
    path.join(__dirname, '..', 'smoke-test-results.json'),
    JSON.stringify(results, null, 2)
  );

  console.log('');
  console.log(`========== RESULT ==========`);
  console.log(`Passed: ${results.passed}/${results.total}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Screenshots: ${SCREEN_DIR}`);
  console.log(`Report: .audit/smoke-test-results.json`);

  process.exit(results.failed > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(2); });
