// Validación: para cada giro × cada modal, render dinámico y captura screenshot.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;

const GIROS = [
  'navaja',       // Barbería — comisiones, agenda, servicios
  'comandero',    // Restaurante — cocina, recetas, modificadores
  'taqueria',     // Taquería — cocina, recetas
  'receta',       // Farmacia — lotes, caducidad, compliance, medico
  'tendito',      // Abarrotes — fiados, balanza, IEPS, mayoreo
  'pulso',        // Médico/Dental — expediente, medico
  'pata',         // Veterinaria — mascotas, medico
  'folio',        // Hotel — rentas, hospedaje
  'forja',        // Taller — automotriz, servicios
  'pareo',        // Boutique — variantes (tallas, colores)
  'gateo'         // Guardería — educacion
];
const MODALS = ['productos','proveedores','clientes','empleados','ventas','configuracion'];

const OUTDIR = path.join(__dirname, '..', 'screenshots-fase4-expanded');
fs.mkdirSync(OUTDIR, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 900 }
  });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('  [browser err]', m.text()); });
  page.on('pageerror', e => console.log('  [pageerror]', e.message));

  const matrix = []; // [{giro, modal, visible, total, terms}]
  let okCount = 0;
  let failCount = 0;

  for (const giro of GIROS) {
    console.log(`\n=== GIRO: ${giro} ===`);
    const url = `http://localhost:8080/fase4-demo.html?giro=${giro}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 800));

    for (const modal of MODALS) {
      // Click tab
      await page.evaluate((m) => {
        const tab = document.querySelector('.tab[data-modal="' + m + '"]');
        if (tab) tab.click();
      }, modal);
      await new Promise(r => setTimeout(r, 250));

      // Check container
      const stats = await page.evaluate((m) => {
        const c = document.querySelector('[data-vlx-dynamic-fields="' + m + '"]');
        if (!c) return { error: 'no_container' };
        return {
          visible: parseInt(c.getAttribute('data-vlx-rendered-fields') || '0', 10),
          total: parseInt(c.getAttribute('data-vlx-total-fields') || '0', 10),
          activeGiro: c.getAttribute('data-vlx-rendered-giro'),
          renderedModal: c.getAttribute('data-vlx-rendered-modal'),
          activeGiroBody: document.body.getAttribute('data-vlx-active-giro')
        };
      }, modal);

      const ok = stats.visible > 0 && stats.activeGiro === giro && stats.renderedModal === modal;
      const status = ok ? '✅' : '❌';
      console.log(`  ${status} ${modal.padEnd(13)} → ${stats.visible}/${stats.total} campos (giro=${stats.activeGiro})`);
      matrix.push({ giro, modal, visible: stats.visible, total: stats.total, ok, error: stats.error });
      ok ? okCount++ : failCount++;

      // Screenshot solo del primero por giro (productos), para no generar 66 PNG
      if (modal === 'productos' || modal === 'clientes') {
        const outPath = path.join(OUTDIR, `${giro}-${modal}.png`);
        await page.screenshot({ path: outPath, fullPage: false });
      }
    }
  }

  await browser.close();

  // Reporte
  console.log('\n========== MATRIZ GIRO × MODAL ==========');
  console.log('Total OK:', okCount, '/', okCount + failCount);
  console.log('Fail:', failCount);

  fs.writeFileSync(path.join(__dirname, '..', 'fase4-validation-matrix.json'),
    JSON.stringify({ matrix, okCount, failCount, total: okCount + failCount, generated: new Date().toISOString() }, null, 2));
  console.log('\nMatrix: .audit/fase4-validation-matrix.json');
  console.log('Screenshots:', OUTDIR);

  process.exit(failCount === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
