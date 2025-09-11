const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const outDir = path.resolve(__dirname, '../diagnostics');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const logPath = path.join(outDir, 'console.log');
  const errorsPath = path.join(outDir, 'page-errors.log');
  const htmlPath = path.join(outDir, 'page.html');
  const screenshotPath = path.join(outDir, 'screenshot.png');

  const url = 'http://localhost:8000/';
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const logs = [];
  page.on('console', msg => {
    const text = `[${new Date().toISOString()}] ${msg.type().toUpperCase()}: ${msg.text()}`;
    logs.push(text);
    fs.appendFileSync(logPath, text + '\n');
  });
  const pageErrors = [];
  page.on('pageerror', err => {
    const text = `[${new Date().toISOString()}] PAGE_ERROR: ${err.stack || err.message || err}`;
    pageErrors.push(text);
    fs.appendFileSync(errorsPath, text + '\n');
  });
  page.on('requestfailed', req => {
    const text = `[${new Date().toISOString()}] REQ_FAILED: ${req.method()} ${req.url()} ${req.failure().errorText}`;
    logs.push(text);
    fs.appendFileSync(logPath, text + '\n');
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);

    // capture HTML and screenshot
    const html = await page.content();
    fs.writeFileSync(htmlPath, html, 'utf8');
    await page.screenshot({ path: screenshotPath, fullPage: true });

    console.log('Diagnostics collected:');
    console.log(' -', logPath);
    console.log(' -', errorsPath);
    console.log(' -', htmlPath);
    console.log(' -', screenshotPath);
  } catch (err) {
    const txt = `DIAGNOSTIC_ERROR: ${err.stack || err.message}`;
    fs.appendFileSync(errorsPath, txt + '\n');
    console.error(txt);
  } finally {
    await browser.close();
  }
})();
