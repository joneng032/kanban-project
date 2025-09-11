const { test, expect } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');

function serveFolder(root) {
  const mime = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'
  };
  return http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.join(root, urlPath.replace(/\/+/, '/'));
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not Found'); return; }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

test.describe('DB compatibility', () => {
  let server;
  let port;

  test.beforeAll(async () => {
    const root = path.resolve(__dirname, '..');
    server = serveFolder(root);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
    console.log('Started static server on port', port);
  });

  test.afterAll(async () => {
    server.close();
  });

  test('where.equals().first() and modify()', async ({ page }) => {
    const url = `http://127.0.0.1:${port}/index.html`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

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
      const updated = await db.items.where('id').equals('t-1').first();
      if (!updated || updated.title !== 'updated') return { ok: false, err: 'modify failed', modifiedCount, updated };

      return { ok: true };
    });

    expect(result.ok).toBeTruthy();
  });
});
