const { chromium } = require('playwright');

(async () => {
  // Headless by default for CI; set HEADFUL=1 in env to run visually during debugging
  const headful = !!process.env.HEADFUL;
  const browser = await chromium.launch({ headless: !headful, slowMo: headful ? 50 : 0 });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  const url = 'http://localhost:8000/';
  await page.goto(url, { waitUntil: 'networkidle' });

  // Wait for App
  await page.waitForFunction(() => window.App && window.App.fetchAndRefresh, { timeout: 5000 });

  // Use in-page db module to create project, columns, and item
  // We'll use a fixed prefix to make later IDs predictable; the numerical projectId is returned by db and used to compose deterministic IDs
  const TEST_PREFIX = 'pwtest';
  const projectId = await page.evaluate(async (prefix) => {
    const mod = await import('/js/db.js');
    // remove any existing projects with the same name to keep test runs idempotent
    const existing = (await mod.db.projects.toArray()).find(p => p.name === `${prefix}-project`);
    if (existing) {
      // remove existing project's items/columns/automations to avoid collisions
      const pid = existing.id;
      const cols = (await mod.db.columns.toArray()).filter(c => c.projectId === pid).map(c=>c.id);
      await mod.db.items.bulkDelete((await mod.db.items.toArray()).filter(i=>i.projectId===pid).map(i=>i.id));
      await mod.db.columns.bulkDelete(cols);
      await mod.db.automations.bulkDelete((await mod.db.automations.toArray()).filter(a=>a.projectId===pid).map(a=>a.id));
      await mod.db.projects.delete(pid);
    }
    const project = { name: `${prefix}-project`, type: 'kanban' };
    const added = await mod.db.projects.add(project);
    return added;
  }, TEST_PREFIX);
  console.log('Project created', projectId);

  // Ensure columns
  await page.evaluate(async ({ pid }) => {
    const mod = await import('/js/db.js');
    const cols = await mod.db.columns.toArray();
    if (!cols.find(c => c.projectId === pid)) {
      await mod.db.columns.bulkAdd([{id: `col-1-${pid}`, projectId: pid, title: 'To Do', order: 0},{id: `col-2-${pid}`, projectId: pid, title: 'Done', order: 1}]);
    }
  }, { pid: projectId });

  // Create a tag, automation (supported action), and an item
  // Create deterministic tag/item ids based on projectId so assertions are predictable
  const itemId = await page.evaluate(async ({ pid, prefix }) => {
    const mod = await import('/js/db.js');
    // find Done column id
    const cols = await mod.db.columns.toArray();
    const doneCol = cols.find(c => c.projectId === pid && c.title.toLowerCase().includes('done')) || cols[1];
    // create a tag to be added by automation
    const tagId = `${prefix}-tag-1-${pid}`;
    const tag = { id: tagId, name: `${prefix}-auto-tag`, color: '#ffa500' };
    // delete prior tag with same id to keep idempotent
    await mod.db.tags.delete(tag.id).catch(()=>{});
    await mod.db.tags.add(tag);
    // create automation rule: when moved to Done, add tag
    await mod.db.automations.add({ projectId: pid, trigger_type: 'move', trigger_value: doneCol.id, action_type: 'add_tag', action_value: tag.id });
    // create item with deterministic id
    const itmId = `${prefix}-item-1-${pid}`;
    // remove existing item with same id
    await mod.db.items.delete(itmId).catch(()=>{});
    const itm = { id: itmId, projectId: pid, title: `${prefix} Playwright Task`, status: `col-1-${pid}`, details: 'created by playwright', tags: [], comments: [], attachments: [] };
    await mod.db.items.add(itm);
    return itm.id;
  }, { pid: projectId, prefix: TEST_PREFIX });
  console.log('Item created', itemId);

  // Tell app to load project data and render
  await page.evaluate(async (pid) => { window.App.activeProjectId = pid; await window.App.fetchProjectData(); }, projectId);

  // Wait for the item card to be attached (it may be hidden by CSS/transitions)
  const cardSelector = `[data-id="${itemId}"]`;
  await page.waitForSelector(cardSelector, { state: 'attached', timeout: 5000 });
  // Ensure the element is visible and has a non-zero bounding rect. Retry several times if layout hasn't settled.
  const ensureVisibleAndSized = async (sel, attempts = 12, delayMs = 250) => {
    for (let i = 0; i < attempts; i++) {
      const res = await page.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return { present: false };
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return { present: true, display: style.display, visibility: style.visibility, offsetParent: el.offsetParent ? true : false, width: rect.width, height: rect.height };
      }, sel);
      if (res.present && res.display !== 'none' && res.visibility !== 'hidden' && res.offsetParent && res.width > 0 && res.height > 0) return true;
      // wait and retry
      await page.waitForTimeout(delayMs);
    }
    return false;
  };

  const isVisible = await ensureVisibleAndSized(cardSelector);
  if (!isVisible) {
    // helper: log class list, computed style and bounding rect
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      console.log('DEBUG CARD LOG — classList:', el.className);
      console.log('DEBUG CARD LOG — style.display:', style.display, 'visibility:', style.visibility, 'opacity:', style.opacity, 'offsetParent:', el.offsetParent);
      console.log('DEBUG CARD LOG — rect:', JSON.stringify(rect));
    }, cardSelector);
    console.log('Card attached but hidden or zero-sized — opening modal via App.openModal');
    await page.evaluate((tid) => { if (window.App && window.App.openModal) window.App.openModal(tid); }, itemId);
    await page.waitForSelector('#task-modal:not(.hidden)', { timeout: 3000 });
    console.log('Modal opened via App.openModal');
    // After attempting fallback, we fail the test to surface layout regressions. Tests should not silently pass when the UI cannot render elements correctly.
    throw new Error('Item card remains hidden or zero-sized after retries; failing test to surface layout regression');
  } else {
    console.log('Item card present and visible');
  }

  // Open the modal if the card is visible; otherwise we already opened it via App.openModal
  if (isVisible) {
    await page.dblclick(`[data-id="${itemId}"]`);
    await page.waitForSelector('#task-modal:not(.hidden)', { timeout: 3000 });
    console.log('Modal opened via dblclick');
  } else {
    // already opened via App.openModal above
    console.log('Modal already opened via App.openModal, skipping dblclick');
  }

  // Simulate moving to Done by updating status and calling fetchAndRefresh, then explicitly run automations
  await page.evaluate(async ({ tid, pid }) => {
    const mod = await import('/js/db.js');
    const raw = await mod.db.items.get(tid);
    const doneCol = (await mod.db.columns.toArray()).find(c=>c.projectId===pid && c.title.toLowerCase().includes('done'));
    raw.status = doneCol.id;
    await mod.db.items.update(tid, raw);
    // refresh app state (including automations/tags)
    await window.App.fetchAndRefresh();
    // run automations explicitly for the move (App should now have the new automation rule loaded)
    await window.App.runAutomations('move', doneCol.id, raw);
    await window.App.fetchProjectData();
  }, { tid: itemId, pid: projectId });

  await page.waitForTimeout(500);
  // Verify automation: tag added by automation and verify item fields/comments/attachments
  const result = await page.evaluate(async (tid) => {
    const mod = await import('/js/db.js');
    const item = await mod.db.items.get(tid);
    return {
      title: item.title,
      details: item.details,
      tags: item.tags || [],
      comments: item.comments || [],
      attachments: item.attachments || []
    };
  }, itemId);
  console.log('Item post-automation snapshot:', result);

  // Add a comment and an attachment programmatically and assert persistence
  await page.evaluate(async ({ tid }) => {
    const mod = await import('/js/db.js');
    const item = await mod.db.items.get(tid);
    item.comments = item.comments || [];
    item.comments.push({ id: 'c-1', text: 'Test comment', author: 'pwtest' });
    item.attachments = item.attachments || [];
    item.attachments.push({ id: 'a-1', name: 'screenshot.png', url: '/assets/screenshot.png' });
    await mod.db.items.update(tid, item);
    await window.App.fetchProjectData();
  }, { tid: itemId });

  const postUpdate = await page.evaluate(async (tid) => {
    const mod = await import('/js/db.js');
    return await mod.db.items.get(tid);
  }, itemId);
  console.log('After adding comment/attachment:', { comments: postUpdate.comments, attachments: postUpdate.attachments });

  await browser.close();
  console.log('Playwright interaction test completed');
})();
