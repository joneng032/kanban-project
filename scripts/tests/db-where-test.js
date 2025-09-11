/*
  Playwright-based DB compatibility test
  Runs in a real browser context so window.localStorage is available.
  Verifies db.items.where('id').equals(...).first() and .modify().
*/
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const serverRoot = path.resolve(__dirname, '..', '..');
  const http = require('http');
  const fs = require('fs');

  const mime = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'
  };

  const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.join(serverRoot, urlPath.replace(/\/+/, '/'));
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not Found'); return; }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });

  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/index.html`;
  console.log('Starting browser and opening', url);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // wait until the in-page DB is initialized (scripts assign window.db or window.App.db)
  await page.waitForFunction(() => !!(window.db || (window.App && window.App.db)), { timeout: 10000 });

  const result = await page.evaluate(async () => {
    const db = window.db || (window.App && window.App.db);
    if (!db) return { ok: false, err: 'no db' };

    // clear items table
    const existing = await db.items.toArray();
    for (const e of existing) {
      if (typeof db.items.delete === 'function') await db.items.delete(e.id).catch(() => {});
    }

    await db.items.add({ id: 't-1', title: 'test item' });

    const found = await db.items.where('id').equals('t-1').first();
    if (!found || found.id !== 't-1') return { ok: false, err: 'where.equals.first failed', found };

    const modifiedCount = await db.items.where('id').equals('t-1').modify(row => { row.title = 'updated'; });
    // modify may return number of modified items or undefined depending on impl
    const updated = await db.items.where('id').equals('t-1').first();
    if (!updated || updated.title !== 'updated') return { ok: false, err: 'modify failed', modifiedCount, updated };

    return { ok: true };
  });

  if (!result.ok) {
    console.error('DB test failed:', result);
    await browser.close();
    process.exit(2);
  }

  console.log('DB where.equals().first()/modify() test passed');
  await browser.close();
  process.exit(0);
})();
