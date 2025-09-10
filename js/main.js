// Central app bootstrap: provide an `App` object that other modules import.
// This file keeps initialization minimal so the rest of the modularized code can run.

import { db } from './db.js';
import { generateUUID } from './ui/utils.js';
import * as elements from './ui/domElements.js';
import { renderBoard } from './ui/board.js';
import { renderCalendar } from './ui/calendar.js';
import { renderGantt } from './ui/gantt.js';
import { renderDashboard } from './ui/dashboard.js';

export const App = {
	// State
	activeProjectId: null,
	activeProject: null,
	items: [],
	columns: [],
	automations: [],
	links: [],
	tags: [],
	users: [],
	checklistTemplates: [],
	activity: [],
	currentView: 'board',
	activeTimers: {},
	currentCalendarDate: new Date(),
	// callbacks / placeholders
	confirmCallback: null,

	// Utilities
	generateUUID,

	formatTime(ms) { return ms ? `${String(Math.floor(ms/3600)).padStart(2,'0')}:${String(Math.floor((ms%3600)/60)).padStart(2,'0')}:${String(ms/1000%60).padStart(2,'0')}` : '00:00:00'; },

	// Initialization
	async init() {
		// Attach to window for inline handlers in HTML
		window.App = App;
		// expose the same db instance to the global window so tests or inline scripts can use the same module instance
		try { window.App.db = db; window.db = db; } catch (e) { /* ignore in restrictive envs */ }
		// Wire simple DOM event handlers that reference App
		document.getElementById('import-file-input').addEventListener('change', (e) => {
			// lazy import projectService to handle import
			import('./services/projectService.js').then(mod => mod.importFileInputChange(e));
		});
		// Load global data
		await this.loadGlobalData();
		// Show project selection view
		elements.projectSelectionView.classList.remove('hidden');
		elements.activeProjectView.classList.add('hidden');
	},

	async loadGlobalData() {
		// Read global tables into App state
		this.tags = await db.tags.toArray().catch(()=>[]);
		this.users = await db.users.toArray().catch(()=>[]);
		this.checklistTemplates = await db.checklistTemplates.toArray().catch(()=>[]);
		this.activity = await db.activity.toArray().catch(()=>[]);
		this.automations = await db.automations.toArray().catch(()=>[]);
		this.templates = await db.templates.toArray().catch(()=>[]);
	},

	async fetchProjectData() {
		if (!this.activeProjectId) return;
		// Ensure the active project view is visible so rendered columns/cards participate in layout
		try {
			if (elements && elements.projectSelectionView && elements.activeProjectView) {
				elements.projectSelectionView.classList.add('hidden');
				elements.activeProjectView.classList.remove('hidden');
			}
		} catch (e) { /* ignore if elements not available */ }
		// load active project record for UI helpers that read project metadata
		this.activeProject = await db.projects.get(this.activeProjectId).catch(()=>null);
		this.columns = (await db.columns.where({ projectId: this.activeProjectId }).toArray()).sort((a,b)=> (a.order||0)-(b.order||0));
		this.items = await db.items.where({ projectId: this.activeProjectId }).toArray();
		this.links = await db.links.where({ projectId: this.activeProjectId }).toArray().catch(()=>[]);
		// keep automations/tags/users loaded
		// re-render current view
		if (this.currentView === 'board') renderBoard();
		else if (this.currentView === 'calendar') renderCalendar();
		else if (this.currentView === 'gantt') renderGantt();
		else if (this.currentView === 'dashboard') renderDashboard();
	},

	async logActivity(text) {
		const entry = { id: Date.now() + Math.random(), projectId: this.activeProjectId, text, timestamp: new Date().toISOString() };
		await db.activity.add(entry).catch(()=>{});
	},

	// Modal helpers (these are overridden or used by UI modules)
	openModal(itemId = null) {
		// ensure modals module handles population
		import('./ui/modals.js').then(mod => mod.openModal(itemId));
	},
	closeModal() { import('./ui/modals.js').then(mod => mod.closeModal()); },
	openNewProjectModal() { import('./ui/modals.js').then(mod => mod.openNewProjectModal()); },
	closeNewProjectModal() { import('./ui/modals.js').then(mod => mod.closeNewProjectModal()); },

	// Utility to close any open dropdowns (used by body onclick)
	closeAllDropdowns(e) {
		try {
			// Close any `.dropdown-content` elements with the `.show` class
			document.querySelectorAll('.dropdown-content.show').forEach(el => el.classList.remove('show'));
		} catch (err) {
			// ignore
		}
	},

	async runAutomations(triggerType, triggerValue, task) {
		const svc = await import('./services/automationService.js');
		return svc.runAutomations(triggerType, triggerValue, task);
	},

	async fetchAndRefresh() { await this.loadGlobalData(); if (this.activeProjectId) await this.fetchProjectData(); }
};

// Kick off init on module load so behavior matches original inline script expectations
App.init().catch(err => console.error('App init error', err));

export default App;