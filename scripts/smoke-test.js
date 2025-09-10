const puppeteer = require('puppeteer');

(async () => {
  const logs = [];
  const errors = [];
  const pageErrors = [];
  let browser;
  try {
    browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    // Install early handlers to capture errors during parsing/execution
    await page.evaluateOnNewDocument(() => {
      window.__puppeteerErrors = [];
      window.addEventListener('error', (e) => {
        try {
          const out = { message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno, error: e.error && e.error.stack };
          console.error('__PAGE_ERROR__', JSON.stringify(out));
          window.__puppeteerErrors.push(out);
        } catch (err) { console.error('__PAGE_ERROR_SERIALIZE_FAIL__', err && err.stack); }
      });
      window.addEventListener('unhandledrejection', (ev) => {
        try {
          const out = { reason: ev.reason && (ev.reason.stack || ev.reason.toString()) };
          console.error('__UNHANDLED_REJECTION__', JSON.stringify(out));
          window.__puppeteerErrors.push(out);
        } catch (err) { console.error('__UNHANDLED_REJECTION_SERIALIZE_FAIL__', err && err.stack); }
      });
    });

    page.on('console', msg => logs.push({ type: msg.type(), text: msg.text(), location: msg.location ? msg.location() : null }));
    page.on('pageerror', err => pageErrors.push(err.stack || err.toString()));
    page.on('error', err => errors.push(err.stack || err.toString()));
    page.on('requestfailed', r => logs.push({ type: 'requestfailed', url: r.url(), status: r.failure() ? r.failure().errorText : null }));

    await page.goto('http://localhost:8000/', { waitUntil: 'networkidle2', timeout: 30000 }).catch(e => logs.push({ type: 'goto-error', text: e && e.message }));
    await page.waitForTimeout(1000);

    const earlyErrors = await page.evaluate(() => window.__puppeteerErrors || []);
    logs.push({ type: 'info', text: `earlyErrorsCount=${earlyErrors.length}` });
    if (earlyErrors.length) logs.push({ type: 'earlyErrors', text: JSON.stringify(earlyErrors, null, 2) });

    const appExists = await page.evaluate(() => !!window.App);
    logs.push({ type: 'info', text: `App exists=${appExists}` });

    // Try opening project modal and task modal to exercise code paths
    await page.evaluate(() => {
      try { if (window.App && window.App.openNewProjectModal) window.App.openNewProjectModal(); } catch (e) { console.error('openNewProjectModal eval error', e.stack || e.toString()); }
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      try { if (window.App && window.App.openModal) window.App.openModal(null); } catch (e) { console.error('openModal eval error', e.stack || e.toString()); }
    });
    await page.waitForTimeout(1000);

    console.log('=== CONSOLE LOGS ===');
    console.log(JSON.stringify(logs, null, 2));
    console.log('=== PAGE ERRORS ===');
    console.log(JSON.stringify(pageErrors, null, 2));
    console.log('=== ERRORS ===');
    console.log(JSON.stringify(errors, null, 2));

  } catch (e) {
    console.error('Script error', e.stack || e.toString());
  } finally {
    if (browser) await browser.close();
  }
})();
