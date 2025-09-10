import { db } from '../db.js';
import { App } from '../main.js';
import * as elements from '../ui/domElements.js';
import { showToast } from '../ui/utils.js';
import { templates } from '../config.js';
import { renderBoard } from '../ui/board.js';

export async function showProjectSelectionView() {
    App.activeProjectId = null;
    App.activeProject = null;
    Object.values(App.activeTimers).forEach(t => clearInterval(t.interval));
    App.activeTimers = {};
    elements.projectSelectionView.classList.remove('hidden');
    elements.activeProjectView.classList.add('hidden');
    elements.globalAddBtn.classList.add('hidden');
    await App.loadGlobalData();
    renderProjectList();
}

async function renderProjectList() {
    const allProjects = await db.projects.toArray();
    const topLevelProjects = allProjects.filter(p => !p.parentId);
    const container = document.getElementById('project-list-container');
    container.innerHTML = topLevelProjects.length === 0 ? `<p class="text-center text-gray-500 col-span-full">No projects yet. Create one to get started!</p>` : topLevelProjects.map(p => `<div class="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-lg cursor-pointer" onclick="App.loadProject(${p.id})"><h3 class="font-bold text-xl">${p.name}</h3><p class="text-sm text-gray-500 mt-1">${p.type === 'tasks' ? 'Task Manager' : 'Reserve Study'}</p></div>`).join('');
}

export async function loadProject(projectId) {
    try {
        Object.values(App.activeTimers).forEach(t => clearInterval(t.interval));
        App.activeTimers = {};
        App.activeProjectId = parseInt(projectId);
        App.activeProject = await db.projects.get(App.activeProjectId);
        if (!App.activeProject) {
            showToast("Error: Could not find project.");
            return showProjectSelectionView();
        }
        elements.projectSelectionView.classList.add('hidden');
        elements.activeProjectView.classList.remove('hidden');
        elements.globalAddBtn.classList.remove('hidden');
        elements.mainTitle.textContent = App.activeProject.name;
        elements.mainSubtitle.textContent = `(${App.activeProject.type === 'tasks' ? 'Task Manager' : 'Reserve Study'})`;
        const backToParentBtn = document.getElementById('back-to-parent-btn');
        if (App.activeProject.parentId) {
            backToParentBtn.classList.remove('hidden');
            backToParentBtn.dataset.parentId = App.activeProject.parentId;
            document.getElementById('back-to-projects-btn').classList.add('hidden');
        } else {
            backToParentBtn.classList.add('hidden');
            document.getElementById('back-to-projects-btn').classList.remove('hidden');
        }
        await App.fetchProjectData();
    } catch (error) {
        handleError('loadProject', error);
    }
}

export function goBackToParent() {
    const parentId = document.getElementById('back-to-parent-btn').dataset.parentId;
    if (parentId) loadProject(parentId);
}

export async function newProjectSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('project-name').value;
    if (!name.trim()) return showToast("Project name cannot be empty.");
    const type = document.querySelector('input[name="project-type"]:checked').value,
        templateValue = document.getElementById('project-template').value;
    const customTemplates = await db.templates.toArray();
    let template;
    if (templateValue.startsWith('custom_')) {
        const templateId = parseInt(templateValue.replace('custom_', ''));
        template = customTemplates.find(t => t.id === templateId);
    } else {
        template = templates[type][templateValue.replace('builtin_', '')];
    }
    const newProjectId = await db.projects.add({ name, type });
    const newColumns = template.columns.map((col, i) => ({ ...col, templateId: col.id || col.title, id: App.generateUUID(), projectId: newProjectId, order: i, isCollapsed: col.isCollapsed || false, wipLimit: col.wipLimit || 0 }));
    await db.columns.bulkAdd(newColumns);
    if (template.items?.length > 0) {
        const newItems = template.items.map((item, index) => ({ ...item, id: App.generateUUID(), projectId: newProjectId, order: Date.now() + index, status: newColumns.find(c => c.templateId === item.status)?.id || newColumns[0].id, isArchived: 'false', tags: [], comments: [], assignees: [], timeLogs: [], attachments: [], recurrence: item.recurrence || null, projectNumber: item.projectNumber || '' }));
        await db.items.bulkAdd(newItems);
    }
    App.closeNewProjectModal();
    showToast(`Project "${name}" created!`);
    loadProject(newProjectId);
}

export function exportProject() {
    if (!App.activeProjectId) return showToast("No active project.");
    const projectData = {
        project: App.activeProject,
        columns: App.columns,
        items: App.items,
        automations: App.automations,
        links: App.links,
        tags: App.tags,
        users: App.users,
        checklistTemplates: App.checklistTemplates,
        activity: App.activity
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' }));
    a.download = `${App.activeProject.name.replace(/\s/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("Project exported!");
}

export function importProject() {
    document.getElementById('import-file-input').click();
}

export function importFileInputChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            const newProject = { ...data.project };
            delete newProject.id;
            const newProjectId = await db.projects.add(newProject);
            const idMaps = { columns: {}, items: {}, tags: {}, users: {} };
            const globalTags = await db.tags.toArray();
            for (const t of (data.tags || [])) {
                const et = globalTags.find(gt => gt.name === t.name);
                idMaps.tags[t.id] = et ? et.id : (await db.tags.add({ ...t, id: Date.now() + Math.random() }));
            }
            const globalUsers = await db.users.toArray();
            for (const u of (data.users || [])) {
                const eu = globalUsers.find(gu => gu.name === u.name);
                idMaps.users[u.id] = eu ? eu.id : (await db.users.add({ ...u, id: Date.now() + Math.random() }));
            }
            for (const col of data.columns) {
                const oldId = col.id;
                col.id = App.generateUUID();
                idMaps.columns[oldId] = col.id;
                col.projectId = newProjectId;
            }
            await db.columns.bulkAdd(data.columns);
            for (const item of data.items) {
                const oldId = item.id;
                item.id = App.generateUUID();
                idMaps.items[oldId] = item.id;
                item.projectId = newProjectId;
                if (item.status) item.status = idMaps.columns[item.status];
                if (item.tags) item.tags = item.tags.map(oldTagId => idMaps.tags[oldTagId]).filter(Boolean);
                if (item.assignees) item.assignees = item.assignees.map(oldUserId => idMaps.users[oldUserId]).filter(Boolean);
            }
            await db.items.bulkAdd(data.items);
            const newLinks = (data.links || []).map(l => ({ ...l, projectId: newProjectId, source: idMaps.items[l.source], target: idMaps.items[l.target] })).filter(l => l.source && l.target);
            if(newLinks.length) await db.links.bulkAdd(newLinks);
            showToast(`Project "${newProject.name}" imported!`);
            showProjectSelectionView();
        } catch (err) {
            showToast("Error: Invalid project file.");
            console.error("Import Error:", err);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}