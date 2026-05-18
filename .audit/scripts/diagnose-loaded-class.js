const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--no-sandbox']});
  const page = await browser.newPage();
  await page.goto('https://systeminternational.app/pareo.html?b=pareo', {waitUntil:'load'});
  await new Promise(r=>setTimeout(r, 3000));
  const info = await page.evaluate(()=>{
    const picker = document.getElementById('picker');
    return {
      bodyClasses: document.body.className,
      hasLoadedClass: document.body.classList.contains('loaded'),
      pickerExists: !!picker,
      pickerComputedDisplay: picker ? getComputedStyle(picker).display : 'no-picker',
      pickerInnerHTML_first200: picker ? picker.innerHTML.slice(0, 200) : 'no-picker',
      appExists: !!document.getElementById('app'),
      appInnerHTML_first200: document.getElementById('app') ? document.getElementById('app').innerHTML.slice(0, 200) : 'no-app',
      bodyFirstH1Position: document.querySelector('h1')?.getBoundingClientRect().top
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
