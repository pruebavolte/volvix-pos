// Verifica que el motor schema-driven se ACTIVA con ?giro=<slug>
const puppeteer = require('puppeteer-core');
const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.text()));

  console.log('\n=== Test motor schema-driven con ?giro=navaja ===\n');

  // PRE-LOGIN: obtener JWT y setear en localStorage del navegador
  const https = require('https');
  const token = await new Promise((resolve, reject) => {
    const d = JSON.stringify({ email: 'grupovolvix@gmail.com', password: '123456789' });
    const r = https.request({ hostname: 'systeminternational.app', path: '/api/login', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } },
      x => { let b = ''; x.on('data', c => b += c); x.on('end', () => resolve(JSON.parse(b).token)); });
    r.on('error', reject); r.write(d); r.end();
  });
  console.log('Token JWT obtenido:', token ? token.slice(0, 20) + '...' : 'FAIL');

  // Setear localStorage via inicialización en about:blank
  await page.goto('https://systeminternational.app/marketplace.html', { waitUntil: 'load' });
  await page.evaluate((t) => {
    localStorage.setItem('volvix_token', t);
    localStorage.setItem('volvixAuthToken', t);
  }, token);

  // 1. Cargar paneldecontrol.html?giro=navaja
  await page.goto('https://systeminternational.app/paneldecontrol.html?giro=navaja&cb=' + Date.now(),
    { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4500));

  const state = await page.evaluate(() => ({
    motorLoaded: typeof window.applyGiroConfig === 'function',
    motorAvail: !!window.vlxSchemaDrivenUI,
    motorVersion: window.vlxSchemaDrivenUI && window.vlxSchemaDrivenUI.version,
    activeGiro: window.vlxSchemaDrivenUI && window.vlxSchemaDrivenUI.activeGiro && window.vlxSchemaDrivenUI.activeGiro(),
    bodyAttr: document.body.getAttribute('data-vlx-active-giro'),
    title: document.title
  }));

  console.log('Estado del motor:');
  console.log('  motorLoaded:', state.motorLoaded);
  console.log('  motorAvail:', state.motorAvail);
  console.log('  motorVersion:', state.motorVersion);
  console.log('  activeGiro:', state.activeGiro);
  console.log('  body[data-vlx-active-giro]:', state.bodyAttr);
  console.log('  document.title:', state.title);

  console.log('\nLogs del motor:');
  const motorLogs = logs.filter(l => l.includes('applyGiroConfig') || l.includes('vlx'));
  motorLogs.forEach(l => console.log('  -', l));

  // 2. Cargar paneldecontrol.html SIN ?giro (debe quedar inerte)
  console.log('\n=== Sin ?giro= (debe quedar inerte) ===\n');
  await page.goto('https://systeminternational.app/paneldecontrol.html?cb=' + Date.now(),
    { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  const inerteState = await page.evaluate(() => ({
    motorLoaded: typeof window.applyGiroConfig === 'function',
    activeGiro: window.vlxSchemaDrivenUI && window.vlxSchemaDrivenUI.activeGiro(),
    bodyAttr: document.body.getAttribute('data-vlx-active-giro')
  }));
  console.log('  motorLoaded:', inerteState.motorLoaded);
  console.log('  activeGiro:', inerteState.activeGiro || '(null = inerte ✅)');
  console.log('  body attr:', inerteState.bodyAttr || '(none = inerte ✅)');

  await browser.close();

  const ok = state.motorLoaded && state.activeGiro === 'navaja' && inerteState.motorLoaded && !inerteState.activeGiro;
  console.log('\n========== RESULT ==========');
  console.log(ok ? '✅ Motor activado correctamente con ?giro= y inerte sin él.' : '❌ Algo no anda. Revisar logs.');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
