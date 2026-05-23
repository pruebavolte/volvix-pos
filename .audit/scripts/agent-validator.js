// Agent validator: prueba 50 giros, registra cada uno, identifica fallas
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LOG_FILE = path.join(__dirname, '..', 'AGENT-VALIDATION-LOG.md');

const GIROS_TEST = [
  // Comida (12)
  ['taquería',          ['comandero','wokito','kappa','bibim','hornito','trompo']],
  ['tortillería',       ['tendito','comandero','tortilla']],
  ['panadería',         ['tendito','merengue','espuma','masa']],
  ['pastelería',        ['tendito','merengue','horno']],
  ['repostería',        ['tendito','merengue','horno']],
  ['dulcería',          ['tendito','comandero','caramelo']],
  ['nevería',           ['tendito','comandero','nieve']],
  ['cafetería',         ['espuma']],
  ['restaurante',       ['comandero','kappa','wokito','bibim','trattoria','comedor']],
  ['food truck',        ['comandero','tarima']],
  ['sushi',             ['wokito','bibim','kappa']],
  ['carnicería',        ['corte']],
  // Belleza (5)
  ['barbería',          ['navaja']],
  ['estética',          ['brillo','navaja']],
  ['salón de belleza',  ['brillo']],
  ['spa',               ['brillo']],
  ['uñas',              ['brillo']],
  // Salud (5)
  ['farmacia',          ['receta']],
  ['consultorio médico',['pulso']],
  ['dental',            ['pulso']],
  ['veterinaria',       ['pata']],
  ['óptica',            ['pulso','receta','armazon']],
  // Retail (12)
  ['abarrotes',         ['tendito','despensa']],
  ['miscelánea',        ['tendito']],
  ['papelería',         ['tendito','bloque']],
  ['librería',          ['tendito','bloque']],
  ['ferretería',        ['tendito','refacciona']],
  ['boutique',          ['pareo','asa']],
  ['zapatería',         ['pareo','tacon','oxford']],
  ['ropa',              ['pareo','asa']],
  ['lencería',          ['discreto','pareo','seda']],
  ['joyería',           ['quilate']],
  ['celulares',         ['folio','movil','repara-cel']],
  ['juguetería',        ['tendito','trompito']],
  // Servicios (5)
  ['taller mecánico',   ['refacciona']],
  ['lavandería',        ['folio','burbuja']],
  ['imprenta',          ['folio','bloque']],
  ['notario',           ['folio']],
  ['contador',          ['folio']],
  // Entretenimiento (5)
  ['bar',               ['tarima']],
  ['antro',             ['tarima']],
  ['salón de eventos',  ['tarima']],
  ['renta de trajes',   ['tarima']],
  ['renta de mobiliario',['tarima']],
  // Educación (3)
  ['kínder',            ['bloque','gateo']],
  ['guardería',         ['gateo','bloque']],
  ['escuela',           ['bloque']],
  // Otros (4)
  ['sexshop',           ['discreto']],
  ['vapeshop',          ['discreto','tendito']],
  ['tienda de mascotas',['pata','tendito']],
  ['florería',          ['petalo','tendito','brillo','ramillete']]
];

function extractBrand(url) {
  try {
    const p = new URL(url).pathname.replace(/^\//, '').replace(/\.html$/, '');
    return p;
  } catch (e) { return null; }
}

async function testOne(browser, giro, marcas_aceptables) {
  const page = await browser.newPage();
  await page.setViewport({width: 1280, height: 900});
  let final = null, brand_actual = null, body_len = 0, errors = [];
  try {
    await page.goto('https://systeminternational.app/marketplace.html?cb=' + Date.now(),
                    {waitUntil: 'domcontentloaded', timeout: 25000});
    await page.waitForSelector('#giro-input', {timeout: 8000});
    await page.click('#giro-input', {clickCount: 3});
    await page.type('#giro-input', giro);

    const navP = page.waitForNavigation({waitUntil: 'domcontentloaded', timeout: 18000}).catch(() => null);
    await page.keyboard.press('Enter');
    await navP;
    await new Promise(r => setTimeout(r, 3500)); // dar tiempo al render JS

    final = page.url();
    brand_actual = extractBrand(final);
    const body = await page.evaluate(() => (document.body.innerText || '').trim());
    body_len = body.length;
  } catch (e) {
    errors.push(e.message);
  }
  await page.close();

  const routing_ok = !!brand_actual && marcas_aceptables.includes(brand_actual);
  const render_ok = body_len > 1000;
  const pass = routing_ok && render_ok;
  return {
    giro, marcas_aceptables, final, brand_actual,
    body_len, routing_ok, render_ok, pass, errors
  };
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const results = [];
  let pass_count = 0, fail_count = 0;
  const failures = [];

  console.log(`Probando ${GIROS_TEST.length} giros uno por uno...\n`);

  for (let i = 0; i < GIROS_TEST.length; i++) {
    const [giro, marcas] = GIROS_TEST[i];
    const r = await testOne(browser, giro, marcas);
    results.push(r);
    if (r.pass) {
      pass_count++;
      console.log(`✅ [${pass_count}] "${giro}" → ${r.brand_actual} (body=${r.body_len})`);
    } else {
      fail_count++;
      failures.push(r);
      console.log(`❌ "${giro}" → ${r.brand_actual} | routing_ok=${r.routing_ok} render_ok=${r.render_ok} body=${r.body_len}`);
      console.log(`   esperado: [${marcas.join(', ')}]`);
    }
  }

  await browser.close();

  // Write log
  const totalScore = `${pass_count}/${GIROS_TEST.length}`;
  let log = `# Agent Validation Log — ${new Date().toISOString()}\n\n`;
  log += `## Resultado: ${pass_count} pass / ${fail_count} fail (${Math.round(pass_count/GIROS_TEST.length*100)}%)\n\n`;
  log += `### Pasaron (${pass_count})\n\n`;
  log += '| # | Giro | Brand | Body |\n|---|---|---|---|\n';
  results.filter(r => r.pass).forEach((r, i) => {
    log += `| ${i+1} | ${r.giro} | ${r.brand_actual} | ${r.body_len} |\n`;
  });
  log += `\n### Fallaron (${fail_count})\n\n`;
  log += '| Giro | Brand obtenido | Esperado | routing_ok | render_ok | body |\n|---|---|---|---|---|---|\n';
  failures.forEach(r => {
    log += `| ${r.giro} | ${r.brand_actual} | ${r.marcas_aceptables.join('/')} | ${r.routing_ok} | ${r.render_ok} | ${r.body_len} |\n`;
  });
  fs.writeFileSync(LOG_FILE, log);
  console.log(`\n${totalScore} passed. Log: ${LOG_FILE}`);
  process.exit(0);
})();
