// Validación final: mock sesión y verificar el drawer
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOTS = path.join(__dirname, '..', 'screenshots-fase4');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, {recursive:true});

const MOCK_SESSION = {
  user: { id: 'test-user', email: 'test@volvix.test', role: 'owner' },
  tenant: { id: 'test-tenant', name: 'Test Business', giro_slug: 'navaja' },
  giro_slug: 'navaja',
  token: 'mock-token-for-test',
  expires_at: Date.now() + 1000 * 60 * 60 * 24
};

async function testGiro(browser, giroSlug) {
  const page = await browser.newPage();
  await page.setViewport({width:1366, height:900});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  // Inyectar sesión ANTES de navegar
  await page.evaluateOnNewDocument((session) => {
    try {
      localStorage.setItem('volvix:session', JSON.stringify(session));
      localStorage.setItem('volvix_session', JSON.stringify(session));
      sessionStorage.setItem('volvix_session', JSON.stringify(session));
      localStorage.setItem('volvix:theme', 'light');
    } catch (e) {}
  }, {...MOCK_SESSION, giro_slug: giroSlug, tenant: {...MOCK_SESSION.tenant, giro_slug: giroSlug}});

  await page.goto('http://localhost:5757/paneldecontrol.html?cb=' + Date.now(), {waitUntil:'load', timeout:25000});
  await new Promise(r=>setTimeout(r, 4000));

  const info = await page.evaluate(async () => {
    const result = {
      url_after_load: window.location.pathname,
      applyGiroConfig_loaded: typeof window.applyGiroConfig === 'function',
      vlxOpenGiroConfig_loaded: typeof window.vlxOpenGiroConfig === 'function',
      vlxPanelDrawerInject_loaded: typeof window.vlxPanelDrawerInject === 'function',
      hasFab: !!document.getElementById('vlx-giro-config-fab'),
      hasDrawer: !!document.getElementById('vlx-giro-config-drawer'),
      bodyChildren: document.body.children.length,
      bodyHTMLLength: document.body.innerHTML.length
    };
    // Try to open drawer
    if (typeof window.vlxOpenGiroConfig === 'function') {
      try {
        await window.vlxOpenGiroConfig();
        await new Promise(r=>setTimeout(r, 1500));
        result.drawerOpenAfter = document.getElementById('vlx-giro-config-drawer')?.classList.contains('open') || false;
        result.stats = {
          giros: document.getElementById('vlx-stat-giros')?.textContent,
          modulos: document.getElementById('vlx-stat-modulos')?.textContent,
          terms: document.getElementById('vlx-stat-terms')?.textContent
        };
        result.filasGiros = document.querySelectorAll('#vlx-tbody-giros tr').length;
      } catch(e) { result.openError = e.message; }
    }
    return result;
  });

  // Take screenshot regardless
  await page.screenshot({path: path.join(SHOTS, `final-${giroSlug}.jpg`), quality:70, type:'jpeg', fullPage:false});

  await page.close();
  return { giroSlug, info, errors: errors.slice(0,5) };
}

(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox','--disable-cache']});
  const giros = ['navaja','pulso','comandero','forja','discreto'];
  const results = [];
  for (const g of giros) {
    const r = await testGiro(browser, g);
    results.push(r);
    console.log(`[${g}]`, JSON.stringify(r.info, null, 0).slice(0, 300));
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname,'..','validacion-final-chrome.json'), JSON.stringify(results,null,2));
  console.log('\n\nFULL RESULTS:');
  console.log(JSON.stringify(results, null, 2));
})();
