// Worker: cada uno levanta Puppeteer + Chrome local y valida giros en serie
const workerpool = require('workerpool');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_BASE = 'https://systeminternational.app';
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, {recursive:true});

async function validateGiro({rank, query, category_expected, marca_premium_esperada_si_existiera, screenshotEvery}) {
  const t0 = Date.now();
  let browser, page;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
             '--disable-features=site-per-process,IsolateOrigins',
             '--disable-web-security', '--no-first-run', '--no-default-browser-check']
    });
    page = await browser.newPage();
    await page.setViewport({width:1280, height:900});

    // Navegar al marketplace
    await page.goto(URL_BASE + '/marketplace.html', {waitUntil:'domcontentloaded', timeout:25000});
    await page.waitForSelector('#giro-input', {timeout:8000});

    // Escribir el giro y enviar
    await page.click('#giro-input', {clickCount: 3}); // clear
    await page.type('#giro-input', query);
    await Promise.race([
      page.waitForNavigation({waitUntil:'domcontentloaded', timeout:15000}),
      (async ()=>{ await page.keyboard.press('Enter'); await new Promise(r=>setTimeout(r,15000)); })()
    ]).catch(()=>{});

    // Esperar un tick para que se asiente la nueva página
    await new Promise(r => setTimeout(r, 800));

    const finalUrl = page.url();
    const urlObj = new URL(finalUrl);
    const slug = urlObj.pathname.split('/').pop().replace('.html','');

    // CHECK 1: ya cargó si llegamos aquí
    const check1 = true;
    // CHECK 2: NO template plano
    const isPlano = /^\/landing-/.test(urlObj.pathname);
    const check2 = !isPlano;

    // Extraer datos crudos del DOM
    const data = await page.evaluate(() => {
      const text = sel => (document.querySelector(sel)?.innerText || '').trim();
      const all = sel => Array.from(document.querySelectorAll(sel)).map(e => e.innerText.trim()).filter(Boolean);
      return {
        title: document.title,
        h1: text('h1'),
        eyebrow: text('.eyebrow, .v-eyebrow, [class*="eyebrow"]'),
        deck: text('.deck, .v-deck, [class*="deck"], .hero p'),
        brandName: text('.brand, .v-brand, [class*="brand-name"], header [class*="logo"]'),
        firstParagraphs: all('p').slice(0, 3),
        features: all('.feature h3, .v-feature h3, [class*="feature"] h3, [class*="feature"] h4').slice(0, 6),
        thefts: all('.theft h3, .v-theft h3, [class*="theft"] h3, [class*="robo"] h3').slice(0, 3),
        galleryUrls: Array.from(document.querySelectorAll('.v-gallery img, .gallery img, [class*="gallery"] img'))
                        .slice(0,4).map(i => ({src: i.src, alt: i.alt || ''})),
      };
    });

    // Screenshot de gallery si existe (limitado para no saturar disco)
    let screenshotPath = null;
    if (screenshotEvery) {
      const galleryEl = await page.$('.v-gallery, .gallery, [class*="gallery"]');
      if (galleryEl) {
        const filename = `${String(rank).padStart(4,'0')}-${slug.slice(0,20)}.jpg`;
        screenshotPath = path.join(SCREENSHOTS_DIR, filename);
        await galleryEl.screenshot({path: screenshotPath, quality: 60, type: 'jpeg'}).catch(()=>{});
        if (!fs.existsSync(screenshotPath)) screenshotPath = null;
      }
    }

    await browser.close();
    return {
      rank, query, category_expected, marca_premium_esperada_si_existiera,
      finalUrl, slug,
      check1, check2,
      data,
      screenshotPath: screenshotPath ? path.relative(path.join(__dirname,'..'), screenshotPath) : null,
      elapsedMs: Date.now() - t0,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    if (browser) try { await browser.close(); } catch (_) {}
    return {
      rank, query, category_expected, marca_premium_esperada_si_existiera,
      error: err.message,
      elapsedMs: Date.now() - t0,
      timestamp: new Date().toISOString()
    };
  }
}

workerpool.worker({validateGiro});
