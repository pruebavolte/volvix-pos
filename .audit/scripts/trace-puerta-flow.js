const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox']});
  const page = await browser.newPage();
  const requests = [];
  page.on('request', r => requests.push({method: r.method(), url: r.url()}));
  page.on('response', r => {
    if (r.url().includes('/api/')) {
      r.text().then(t => {
        const i = requests.findIndex(x => x.url === r.url() && !x.status);
        if (i >= 0) { requests[i].status = r.status(); requests[i].body = t.slice(0,200); }
      }).catch(()=>{});
    }
  });

  await page.goto('https://systeminternational.app/marketplace.html?cb='+Date.now(),{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#giro-input');
  await page.click('#giro-input',{clickCount:3});
  await page.type('#giro-input', 'puerta');
  await page.keyboard.press('Enter');
  await new Promise(r=>setTimeout(r, 10000)); // wait 10s

  const final = page.url();
  console.log('Final URL after 10s:', final);
  console.log('\nAPI calls made:');
  requests.filter(r => r.url.includes('/api/')).forEach(r => {
    console.log(`  ${r.method} ${r.status||'?'} ${r.url}`);
    if (r.body) console.log(`    body: ${r.body}`);
  });

  // Check page state
  const state = await page.evaluate(() => {
    const wrap = document.getElementById('ai-response');
    return {
      url: window.location.href,
      ai_response_visible: wrap ? wrap.classList.contains('visible') : false,
      ai_response_html: wrap ? wrap.innerHTML.slice(0, 300) : null
    };
  });
  console.log('\nPage state:', JSON.stringify(state, null, 2));

  await browser.close();
})();
