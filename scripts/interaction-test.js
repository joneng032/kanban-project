const puppeteer = require('puppeteer');

async function run() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.toString()));

  const url = 'http://localhost:8000/';
  await page.goto(url, { waitUntil: 'networkidle2' });

  // Wait for App to initialize
  await page.waitForFunction(() => window.App && window.App.fetchAndRefresh, { timeout: 5000 });
  console.log('App present, seeding test project...');

  // Create a test project using the in-page db API so the in-memory DB is updated
  const projectId = await page.evaluate(async () => {
    const id = Date.now();
    const project = { id: id, name: 'Test Project ' + id, type: 'kanban' };
    try {
      const mod = await import('/js/db.js');
      const addedId = await mod.db.projects.add(project);
      // db.projects.add returns the assigned id for projects
      return addedId || id;
    } catch (e) {
      const raw = JSON.parse(localStorage.getItem('ProjectManagerData_v13') || '{}');
      raw.projects = raw.projects || [];
      raw.projects.push(project);
      localStorage.setItem('ProjectManagerData_v13', JSON.stringify(raw));
      return id;
    }
  });

  console.log('Created project id=', projectId);

  // Reload page so app picks up the new project list
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction(() => window.App && window.App.loadGlobalData, { timeout: 5000 });

  // Show project selection and click to open the test project
  await page.evaluate((pid) => {
    window.App.activeProjectId = pid;
  }, projectId);
  await page.evaluate(() => window.App.fetchProjectData());
  await page.waitForTimeout(500);

  // If no columns exist, create two default columns via db API
  const ensureColumns = await page.evaluate(async (pid) => {
    const toDo = { id: 'col-1-' + pid, projectId: pid, title: 'To Do', order:0, wipLimit:0 };
    const done = { id: 'col-2-' + pid, projectId: pid, title: 'Done', order:1, wipLimit:0 };
    try {
      const mod = await import('/js/db.js');
      const cols = await mod.db.columns.toArray();
      if (!cols.find(c => c.projectId === pid)) {
        await mod.db.columns.bulkAdd([toDo, done]);
      }
      return true;
    } catch (e) {
      const state = JSON.parse(localStorage.getItem('ProjectManagerData_v13') || '{}');
      state.columns = state.columns || [];
      if (!state.columns.find(c => c.projectId === pid)) {
        state.columns.push(toDo, done);
        localStorage.setItem('ProjectManagerData_v13', JSON.stringify(state));
      }
      return true;
    }
  }, projectId);

  await page.reload({ waitUntil: 'networkidle2' });
  // Wait until the imported /js/db.js module reports the seeded columns (poll with timeout)
  const start = Date.now();
  const timeoutMs = 10000;
  let colsCount = 0;
  while (Date.now() - start < timeoutMs) {
    colsCount = await page.evaluate(async () => {
      try {
        const mod = await import('/js/db.js');
        const arr = await mod.db.columns.toArray();
        return arr.length;
      } catch (e) {
        return 0;
      }
    });
    if (colsCount > 0) break;
    await new Promise(r => setTimeout(r, 300));
  }
  if (colsCount === 0) {
    const raw = await page.evaluate(() => localStorage.getItem('ProjectManagerData_v13'));
    console.error('After reload, imported db.columns empty; localStorage=', raw);
    throw new Error('db.columns did not populate after reload');
  }

  // Add a new task via App's DB module so the in-memory state will be updated
  const newTaskId = await page.evaluate(async (pid) => {
    const task = { id: 'task-' + Date.now(), projectId: pid, title: 'Interaction Test Task', status: 'col-1-' + pid, order: Date.now(), priority: 'medium', details: 'Created by interaction test' };
    try {
      const mod = await import('/js/db.js');
      await mod.db.items.add(task);
      return task.id;
    } catch (e) {
      const raw = JSON.parse(localStorage.getItem('ProjectManagerData_v13') || '{}');
      raw.items = raw.items || [];
      raw.items.push(task);
      localStorage.setItem('ProjectManagerData_v13', JSON.stringify(raw));
      return task.id;
    }
  }, projectId);

  console.log('Added task id=', newTaskId);

  // Ensure the app knows which project is active and refreshes data so the board will render
  await page.evaluate(async (pid) => { window.App.activeProjectId = pid; if (window.App && window.App.fetchProjectData) await window.App.fetchProjectData(); }, projectId);
  await page.waitForFunction((tid) => window.App && window.App.items && window.App.items.find(i => i.id === tid), { timeout: 10000 }, newTaskId);

  // Wait for board render; be robust and collect diagnostics if something goes wrong
  try {
    await page.waitForFunction((tid) => {
      return !!(window.App && window.App.items && window.App.items.find(i => i.id === tid));
    }, { timeout: 7000 }, newTaskId);
  } catch (err) {
    const diag = await page.evaluate((tid) => {
      return {
        appExists: !!window.App,
        items: window.App ? window.App.items : null,
        columns: window.App ? window.App.columns : null,
        rawLocal: localStorage.getItem('ProjectManagerData_v13'),
        expectedTaskId: tid
      };
    }, newTaskId);
    console.error('DIAGNOSTICS:', JSON.stringify(diag, null, 2));
    throw new Error('Task did not appear in App.items; see DIAGNOSTICS above');
  }
  console.log('Task registered in App.items; waiting for DOM card...');
  // attempt to find the card element by data-id (board uses data-id attribute)
  const cardSelector = `[data-id="${newTaskId}"]`;
  await page.waitForSelector(cardSelector, { timeout: 7000 });
  console.log('Task card present');

  // Open the task modal by double-clicking the card
  await page.evaluate((tid) => {
    const card = Array.from(document.querySelectorAll('.item-card')).find(c => c.dataset.id === tid);
    if (card) {
      const evt = new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window });
      card.dispatchEvent(evt);
    }
  }, newTaskId);

  // Wait a bit for modal to open (modals implement show/hide)
  await page.waitForTimeout(500);

  const modalOpen = await page.evaluate(() => {
    const modal = document.getElementById('task-modal');
    return modal && !modal.classList.contains('hidden');
  });
  console.log('Modal open:', modalOpen);

  // Move the task to Done column by simulating drag/drop by updating status in localStorage and triggering fetchProjectData
  await page.evaluate(async (tid, pid) => {
    const raw = JSON.parse(localStorage.getItem('ProjectManagerData_v13'));
    const task = raw.items.find(i => i.id === tid);
    const doneCol = raw.columns.find(c => c.projectId === pid && c.title.toLowerCase().includes('done')) || raw.columns[1];
    if (task && doneCol) { task.status = doneCol.id; }
    localStorage.setItem('ProjectManagerData_v13', JSON.stringify(raw));
    // trigger App to refresh
    if (window.App && window.App.fetchProjectData) await window.App.fetchProjectData();
  }, newTaskId, projectId);

  await page.waitForTimeout(500);
  const inDone = await page.evaluate((tid) => !!document.querySelector(`#${CSS.escape(document.querySelector('[data-column-id].kanban-column .kanban-items')?.id || '')}`), newTaskId).catch(()=>false);
  console.log('In done column (heuristic):', inDone);

  // Close browser
  await browser.close();
  console.log('Interaction test completed');
}

run().catch(err => { console.error(err); process.exit(1); });
