// Validator v2: chunks paralelos directos con Puppeteer (sin workerpool)
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_BASE = 'https://systeminternational.app';
const GIROS_FILE = path.join(__dirname, '..', 'giros-1000-manual.json');
const RAW_RESULTS = path.join(__dirname, '..', 'raw-results.jsonl');
const PROGRESS = path.join(__dirname, '..', 'progress.json');
const SCREENSHOTS = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(SCREENSHOTS)) fs.mkdirSync(SCREENSHOTS, {recursive:true});

const freeMB = () => Math.floor(os.freemem() / 1024 / 1024);
const freePct = () => Math.floor((os.freemem() / os.totalmem()) * 100);
const ms = () => new Date().toISOString();

async function validateGiro(giro, browser) {
  const t0 = Date.now();
  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({width:1280, height:900});
    await page.goto(URL_BASE + '/marketplace.html', {waitUntil:'domcontentloaded', timeout:20000});
    await page.waitForSelector('#giro-input', {timeout:6000});
    await page.click('#giro-input', {clickCount:3});
    await page.type('#giro-input', giro.query);

    const navP = page.waitForNavigation({waitUntil:'domcontentloaded', timeout:15000}).catch(()=>null);
    await page.keyboard.press('Enter');
    await navP;
    await new Promise(r=>setTimeout(r,500));

    const finalUrl = page.url();
    const urlObj = new URL(finalUrl);
    const slug = urlObj.pathname.split('/').pop().replace('.html','');
    const isPlano = /^\/landing-/.test(urlObj.pathname);

    const data = await page.evaluate(() => {
      const text = sel => (document.querySelector(sel)?.innerText || '').trim();
      const all = sel => Array.from(document.querySelectorAll(sel)).map(e => e.innerText.trim()).filter(Boolean);
      const visibleH1 = Array.from(document.querySelectorAll('h1')).filter(el => {
        const cs = window.getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden';
      }).map(el => el.innerText.trim()).filter(Boolean);
      return {
        title: document.title,
        h1: visibleH1[0] || text('h1'),
        h1_all: visibleH1,
        eyebrow: text('.eyebrow, .v-eyebrow, [class*="eyebrow"]'),
        deck: text('.deck, .v-deck, [class*="deck"]'),
        brandName: text('[class*="brand-name"], header [class*="logo"]'),
        firstParagraphs: all('p').slice(0, 3),
        features: all('.feature h3, .v-feature h3, [class*="feature"] h3, [class*="feature"] h4').slice(0, 6),
        thefts: all('.theft h3, .v-theft h3, [class*="theft"] h3').slice(0, 3),
        galleryUrls: Array.from(document.querySelectorAll('.v-gallery img, .gallery img'))
                        .slice(0,4).map(i => ({src:i.src, alt:i.alt||''})),
      };
    });

    let screenshotPath = null;
    if (giro.screenshotEvery) {
      const gal = await page.$('.v-gallery, .gallery, [class*="gallery"]');
      if (gal) {
        const filename = `${String(giro.rank).padStart(4,'0')}-${slug.slice(0,20)}.jpg`;
        const sp = path.join(SCREENSHOTS, filename);
        await gal.screenshot({path: sp, quality: 55, type: 'jpeg'}).catch(()=>{});
        if (fs.existsSync(sp)) screenshotPath = path.relative(path.join(__dirname,'..'), sp);
      }
    }

    await page.close();
    return {
      rank: giro.rank, query: giro.query,
      category_expected: giro.category_expected,
      marca_premium_esperada_si_existiera: giro.marca_premium_esperada_si_existiera,
      finalUrl, slug, check1: true, check2: !isPlano,
      data, screenshotPath,
      elapsedMs: Date.now() - t0,
      timestamp: ms()
    };
  } catch (err) {
    if (page) try { await page.close(); } catch(_){}
    return {
      rank: giro.rank, query: giro.query, error: err.message,
      elapsedMs: Date.now() - t0, timestamp: ms()
    };
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(GIROS_FILE, 'utf8'));
  let giros = data.giros;

  // Filter: resume from where we left off if raw-results.jsonl exists
  let alreadyDone = new Set();
  if (fs.existsSync(RAW_RESULTS)) {
    const existing = fs.readFileSync(RAW_RESULTS, 'utf8').split('\n').filter(Boolean);
    existing.forEach(l => {
      try { const r = JSON.parse(l); if (r.rank) alreadyDone.add(r.rank); } catch(_){}
    });
  }
  if (alreadyDone.size > 0) {
    console.log(`[v2] Resuming: ${alreadyDone.size} ya completados`);
    giros = giros.filter(g => !alreadyDone.has(g.rank));
  } else {
    fs.writeFileSync(RAW_RESULTS, '');
  }
  console.log(`[v2] Faltan ${giros.length} giros por procesar`);

  // Inject screenshotEvery flag
  giros.forEach(g => { g.screenshotEvery = (g.rank % 10 === 0); });

  // CONCURRENCY: lanzar N browsers, cada uno procesa una porción
  const fm = freeMB();
  // V2.1: forzar 3 browsers para evitar saturar RAM (8 mató los workers anteriores)
  const PARALLEL = 3;
  console.log(`[v2.1] RAM ${fm}MB free, usando ${PARALLEL} browsers paralelos (cap fijo para estabilidad)`);

  // Cada browser procesa giros del array en round-robin
  const browsers = await Promise.all(Array.from({length: PARALLEL}, () =>
    puppeteer.launch({
      executablePath: CHROME_PATH, headless:'new',
      args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
             '--disable-features=site-per-process,IsolateOrigins',
             '--no-first-run','--no-default-browser-check']
    })
  ));
  console.log(`[v2] ${PARALLEL} browsers iniciados`);

  let completed = alreadyDone.size, planos = 0, errors = 0, ok = 0;
  const startTime = Date.now();

  function updateProgress() {
    const elapsed = (Date.now() - startTime) / 60000;
    const speed = (completed - alreadyDone.size) / Math.max(elapsed, 0.01);
    const total = data.giros.length;
    const remaining = total - completed;
    const eta = remaining / Math.max(speed, 0.01);
    const pct = Math.floor((completed / total) * 100);
    const bar = '█'.repeat(Math.floor(pct/5)) + '░'.repeat(20 - Math.floor(pct/5));
    fs.writeFileSync(PROGRESS, JSON.stringify({
      total, completed, pct,
      parallel_browsers: PARALLEL,
      ram_free_pct: freePct(), ram_free_mb: freeMB(),
      http_ok: ok, template_planos: planos, errors,
      speed_per_min: Math.round(speed*10)/10,
      eta_min: Math.round(eta),
      elapsed_min: Math.round(elapsed*10)/10,
      status: completed === total ? 'DONE' : 'RUNNING',
      timestamp: ms()
    }, null, 2));
    if (completed % 50 === 0 || completed === total) {
      console.log(`[${bar}] ${pct}% · ${completed}/${total} · ${PARALLEL} browsers · RAM ${freePct()}% · speed ${speed.toFixed(1)}/min · ETA ${Math.round(eta)}min`);
    }
  }

  // Repartir giros en N colas (round-robin)
  const queues = Array.from({length: PARALLEL}, () => []);
  giros.forEach((g, i) => queues[i % PARALLEL].push(g));

  // Cada browser procesa su cola en serie
  await Promise.all(browsers.map(async (browser, idx) => {
    for (const g of queues[idx]) {
      const r = await validateGiro(g, browser);
      fs.appendFileSync(RAW_RESULTS, JSON.stringify(r) + '\n');
      completed++;
      if (r.error) errors++;
      else { ok++; if (!r.check2) planos++; }
      if (completed % 10 === 0) updateProgress();
    }
  }));

  updateProgress();
  await Promise.all(browsers.map(b => b.close().catch(()=>{})));
  console.log(`[v2] DONE. Total ${completed} en ${Math.round((Date.now()-startTime)/60000)}min`);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
