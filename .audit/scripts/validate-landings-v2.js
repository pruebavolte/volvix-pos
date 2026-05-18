const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOTS = path.join(__dirname, '..', 'landings-v2');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, {recursive:true});

const URLS = [
  'https://systeminternational.app/navaja.html?b=navaja',
  'https://systeminternational.app/comandero.html?b=comandero',
  'https://systeminternational.app/tendito.html?b=tendito',
  'https://systeminternational.app/receta.html?b=receta',
  'https://systeminternational.app/corte.html?b=corte',
];

(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox', '--disable-dev-shm-usage']});
  const results = [];

  for (const url of URLS) {
    const page = await browser.newPage();
    await page.setViewport({width:1366, height:900});
    try {
      await page.goto(url + '&cb=' + Date.now(), {waitUntil:'domcontentloaded', timeout:25000});
      await new Promise(r => setTimeout(r, 5000));

      const info = await page.evaluate(() => {
        const body = (document.body.innerText || '').trim();
        return {
          char_count: body.length,
          has_dolores: body.toLowerCase().includes('dolores que sí te resolvemos') || body.toLowerCase().includes('dolores que si te resolvemos'),
          imgs_total: document.images.length,
          imgs_loaded: Array.from(document.images).filter(i => i.complete && i.naturalHeight > 0).length,
          title: document.title,
          body_preview: body.slice(0, 200)
        };
      });

      const slug = url.match(/\/([^/.]+)\.html/)[1];
      const shotPath = path.join(SHOTS, slug + '.png');
      await page.screenshot({path: shotPath, fullPage: true});

      const pass = info.char_count >= 4000 && info.has_dolores && info.imgs_loaded >= 5;
      results.push({url, slug, ...info, pass, screenshot: shotPath});

      console.log(`${pass ? '✅' : '❌'} ${slug}`);
      console.log(`  chars: ${info.char_count} (need ≥4000)`);
      console.log(`  has 'dolores que sí te resolvemos': ${info.has_dolores}`);
      console.log(`  imgs loaded: ${info.imgs_loaded}/${info.imgs_total} (need ≥5)`);
    } catch(e) {
      results.push({url, error: e.message, pass: false});
      console.log('❌ ' + url + ' → ERROR: ' + e.message);
    }
    await page.close();
  }

  // Check 3 pitch URLs
  const pitchUrls = [
    'https://systeminternational.app/',
    'https://systeminternational.app/salvadorex-pos.html',
    'https://systeminternational.app/paneldecontrol.html'
  ];
  console.log('\n=== 3 pitch URLs ===');
  for (const u of pitchUrls) {
    const p = await browser.newPage();
    try {
      const r = await p.goto(u, {waitUntil:'domcontentloaded', timeout:15000});
      console.log(`${r.status()} ${u}`);
    } catch(e) { console.log('ERR ' + u + ': ' + e.message); }
    await p.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(__dirname, '..', 'landings-v2-results.json'), JSON.stringify(results, null, 2));

  const passed = results.filter(r => r.pass).length;
  console.log(`\n${passed}/${URLS.length} landings PASS`);
  process.exit(passed === URLS.length ? 0 : 1);
})();
