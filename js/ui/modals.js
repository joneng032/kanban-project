import { db } from '../db.js';
import { App } from '../main.js';
import * as elements from './domElements.js';
import { templates } from '../config.js';
import { showToast } from './utils.js';

export function openNewProjectModal() {
    try {
        elements.newProjectForm.reset();
        updateTemplateOptions();
        document.getElementById('new-project-modal').classList.remove('hidden');
    } catch (error) {
        console.error('openNewProjectModal', error);
    }
}

export function closeNewProjectModal() {
    document.getElementById('new-project-modal').classList.add('hidden');
}

async function updateTemplateOptions() {
    const type = document.querySelector('input[name="project-type"]:checked').value;
    const select = document.getElementById('project-template');
    select.innerHTML = '';
    const builtInGroup = document.createElement('optgroup');
    builtInGroup.label = 'Built-in Templates';
    Object.entries(templates[type]).forEach(([key, template]) => builtInGroup.appendChild(new Option(template.name, `builtin_${key}`)));
    select.appendChild(builtInGroup);
    const customTemplates = await db.templates.where({ type: type }).toArray();
    if (customTemplates.length > 0) {
        const customGroup = document.createElement('optgroup');
        customGroup.label = 'My Templates';
        customTemplates.forEach(template => customGroup.appendChild(new Option(template.name, `custom_${template.id}`)));
        select.appendChild(customGroup);
    }
}

export async function openModal(itemId = null) {
    // Populate and open the task modal. If itemId is provided, load it from db.
    const modal = document.getElementById('task-modal');
    try { elements.taskForm.reset(); } catch (e) {}
    const safe = id => id ?? '';
    const setVal = (elId, v) => { const el = document.getElementById(elId); if (el) el.value = v ?? ''; };

    setVal('task-id', '');
    document.getElementById('checklist-container').innerHTML = '';
    document.getElementById('attachments-container').innerHTML = '';
    document.getElementById('comments-container').innerHTML = '';
    document.getElementById('tags-container').innerHTML = '';
    document.getElementById('assignees-container').innerHTML = '';
    document.getElementById('dependency-list').innerHTML = '';

    if (itemId) {
        try {
            const item = await db.items.get(itemId);
            if (!item) return showToast('Task not found');
            setVal('task-id', item.id);
            setVal('task-title', item.title || item.name || '');
            setVal('task-details', item.details || item.description || '');
            setVal('task-start-date', item.startDate || '');
            setVal('task-end-date', item.endDate || '');
            setVal('task-priority', item.priority || 'low');
            // Checklist
            (item.checklist || []).forEach(ci => renderChecklistItem(ci));
            // Attachments
            renderAttachments(item.attachments || []);
            // Tags
            renderTaskTags(item.tags || []);
            // Assignees
            renderTaskAssignees(item.assignees || []);
            // Dependencies
            renderDependencies(item.id);
            // Time tracking
            renderTimeTracking(item);
        } catch (err) {
            console.error('openModal error', err);
            showToast('Error opening task');
        }
    } else {
        // new task default state
        setVal('task-priority', 'low');
        populateChecklistTemplateSelect();
    }

    modal.classList.remove('hidden');
}

export function closeModal() { document.getElementById('task-modal').classList.add('hidden'); }

export function openColumnModal(columnId = null) {
    const form = document.getElementById('column-form'), modal = document.getElementById('column-modal');
    form.reset();
    if (columnId) {
        const column = App.columns.find(c => c.id === columnId);
        document.getElementById('column-modal-title').textContent = 'Edit Column';
        document.getElementById('column-id').value = columnId;
        document.getElementById('column-name').value = column.title;
        document.getElementById('column-wip-limit').value = column.wipLimit || 0;
    } else {
        document.getElementById('column-modal-title').textContent = 'Create New Column';
        document.getElementById('column-id').value = '';
        document.getElementById('column-wip-limit').value = 0;
    }
    modal.classList.remove('hidden');
}

export function closeColumnModal() { document.getElementById('column-modal').classList.add('hidden'); }

export function openConfirmModal(title, message, onConfirm) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    App.confirmCallback = onConfirm;
    document.getElementById('confirm-modal').classList.remove('hidden');
}

export function closeConfirmModal() { document.getElementById('confirm-modal').classList.add('hidden'); }

export function openSettingsModal() { document.getElementById('project-name-edit').value = App.activeProject?.name || ''; document.getElementById('settings-modal').classList.remove('hidden'); }

export function closeSettingsModal() { document.getElementById('settings-modal').classList.add('hidden'); }

export async function openArchiveModal() {
    const archivedItems = await db.items.where({ projectId: App.activeProjectId, isArchived: 'true' }).toArray();
    const container = document.getElementById('archived-items-container');
    container.innerHTML = archivedItems.length === 0 ? `<p>No archived items.</p>` : archivedItems.map(item => `<div class="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"><span>${item.title || item.name}</span><div><button class="text-sm text-green-600 hover:underline mr-4" onclick="App.unarchiveItem('${item.id}')">Restore</button><button class="text-sm text-red-600 hover:underline" onclick="App.deleteItemPermanently('${item.id}', '${(item.title || item.name).replace(/'/g, "\\'")}')">Delete Forever</button></div></div>`).join('');
    document.getElementById('archive-modal').classList.remove('hidden');
}

export function closeArchiveModal() { document.getElementById('archive-modal').classList.add('hidden'); }

export function openSaveAsTemplateModal() { document.getElementById('save-template-modal').classList.remove('hidden'); document.getElementById('template-name').value = `${App.activeProject?.name || 'Project'} Template`; }

export function closeSaveAsTemplateModal() { document.getElementById('save-template-modal').classList.add('hidden'); }

export function openInstructionsModal() { document.getElementById('instructions-modal').classList.remove('hidden'); }

export function closeInstructionsModal() { document.getElementById('instructions-modal').classList.add('hidden'); }

export function openAutomationsModal() { renderAutomations(); document.getElementById('automations-modal').classList.remove('hidden'); }

export function closeAutomationsModal() { document.getElementById('automations-modal').classList.add('hidden'); }

export function openTagsManagementModal() { renderTagsForManagement(); document.getElementById('tags-management-modal').classList.remove('hidden'); }

export async function closeTagsManagementModal() { document.getElementById('tags-management-modal').classList.add('hidden'); await App.loadGlobalData(); await App.fetchProjectData(); }

export function openTeamManagementModal() { renderTeamForManagement(); document.getElementById('team-management-modal').classList.remove('hidden'); }

export async function closeTeamManagementModal() { document.getElementById('team-management-modal').classList.add('hidden'); await App.loadGlobalData(); await App.fetchProjectData(); }

export async function openActivityLogModal() {
    const container = document.getElementById('activity-log-container');
    container.innerHTML = '<p>Loading...</p>';
    document.getElementById('activity-log-modal').classList.remove('hidden');
    const activities = await db.activity.where({ projectId: App.activeProjectId }).toArray();
    container.innerHTML = activities.length === 0 ? '<p>No activity yet.</p>' : '';
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach(log => container.insertAdjacentHTML('beforeend', `<div class="text-sm border-b dark:border-gray-700 pb-2"><p>${log.text}</p><p class="text-xs text-gray-400 text-right mt-1">${new Date(log.timestamp).toLocaleString()}</p></div>`));
}

export function closeActivityLogModal() { document.getElementById('activity-log-modal').classList.add('hidden'); }

export function openChecklistTemplatesModal() { renderChecklistTemplatesForManagement(); document.getElementById('checklist-templates-modal').classList.remove('hidden'); }

export function closeChecklistTemplatesModal() { document.getElementById('checklist-templates-modal').classList.add('hidden'); }

function renderAutomations() { /* TODO: move to automationService.js */ }
function renderTagsForManagement() { /* TODO: move to taskService.js */ }
function renderTeamForManagement() { /* TODO: move to taskService.js */ }
function renderChecklistTemplatesForManagement() { /* TODO: move to taskService.js */ }

export function renderChecklistItem(item) {
    const container = document.getElementById('checklist-container');
    const div = document.createElement('div');
    div.className = 'flex items-center space-x-2 checklist-item';
    div.innerHTML = `<input type="checkbox" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0" ${item.completed ? 'checked' : ''}><span class="flex-grow ${item.completed ? 'line-through text-gray-500' : ''}">${item.text}</span><input type="date" class="checklist-item-due-date modal-input w-auto text-xs p-1" value="${item.dueDate || ''}"><button type="button" class="remove-checklist-item text-red-500 font-bold text-lg leading-none flex-shrink-0">&times;</button>`;
    container.appendChild(div);
    div.querySelector('.remove-checklist-item').onclick = () => div.remove();
    div.querySelector('input[type="checkbox"]').onchange = (e) => {
        div.querySelector('span').classList.toggle('line-through', e.target.checked);
        div.querySelector('span').classList.toggle('text-gray-500', e.target.checked);
    };
}

export function renderTaskTags(taskTagIds) {
    const container = document.getElementById('tags-container');
    container.innerHTML = '';
    taskTagIds.forEach(tagId => {
        const tag = App.tags.find(t => t.id == tagId);
        if (tag) {
            const pill = document.createElement('span');
            pill.className = 'tag-pill';
            pill.textContent = tag.name;
            pill.style.backgroundColor = tag.color;
            pill.style.color = App.getContrastYIQ(tag.color);
            pill.dataset.tagId = tag.id;
            const removeBtn = document.createElement('button');
            removeBtn.innerHTML = '&times;';
            removeBtn.className = 'ml-2 font-bold';
            removeBtn.onclick = () => pill.remove();
            pill.appendChild(removeBtn);
            container.appendChild(pill);
        }
    });
}

export function populateAddTagSelect() {
    const select = document.getElementById('add-tag-select');
    select.innerHTML = '<option value="">Add a tag...</option>';
    App.tags.forEach(tag => select.add(new Option(tag.name, tag.id)));
}

export function renderTaskAssignees(assigneeIds) {
    const container = document.getElementById('assignees-container');
    container.innerHTML = '';
    assigneeIds.forEach(userId => {
        const user = App.users.find(u => u.id === userId);
        if (user) {
            const pill = document.createElement('div');
            pill.className = 'assignee-avatar bg-gray-300 dark:bg-gray-600';
            pill.textContent = user.name.charAt(0).toUpperCase();
            pill.title = user.name;
            pill.dataset.userId = user.id;
            container.appendChild(pill);
        }
    });
}

export function populateAddAssigneeSelect() {
    const select = document.getElementById('add-assignee-select');
    select.innerHTML = '<option value="">Assign to...</option>';
    App.users.forEach(user => select.add(new Option(user.name, user.id)));
}

export function renderDependencies(itemId) {
    const list = document.getElementById('dependency-list'), select = document.getElementById('new-dependency-select');
    list.innerHTML = '';
    select.innerHTML = '<option value="">Add prerequisite...</option>';
    const potentialDeps = App.items.filter(i => i.id !== itemId);
    potentialDeps.forEach(p => select.add(new Option(p.title, p.id)));
    if (!itemId) return;
    const predecessors = App.links.filter(l => l.target === itemId);
    for (const link of predecessors) {
        const sourceTask = App.items.find(i => i.id === link.source);
        if (sourceTask) {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center text-sm p-1 bg-gray-100 dark:bg-gray-700 rounded';
            div.innerHTML = `<span>${sourceTask.title}</span><button type="button" class="remove-dependency-btn" data-link-id="${link.id}">&times;</button>`;
            list.appendChild(div);
        }
    }
}

export function renderTimeTracking(task) {
    document.getElementById('total-time-logged').textContent = App.formatTime((task?.timeLogs || []).reduce((sum, log) => sum + (log.end - log.start), 0));
    const container = document.getElementById('time-logs-container');
    container.innerHTML = '';
    (task?.timeLogs || []).forEach(log => container.insertAdjacentHTML('beforeend', `<div class="flex justify-between items-center"><span>${new Date(log.start).toLocaleDateString()}</span><span>${App.formatTime(log.end - log.start)}</span></div>`));
    const btn = document.getElementById('time-tracker-btn');
    if (task?.timerRunning) {
        btn.textContent = 'Stop Timer';
        btn.className = 'w-full mt-2 bg-red-500 text-white font-semibold py-2 px-4 rounded-lg';
        btn.onclick = () => App.toggleTimer(task.id);
    } else {
        btn.textContent = 'Start Timer';
        btn.className = 'w-full mt-2 bg-green-500 text-white font-semibold py-2 px-4 rounded-lg';
        btn.onclick = () => App.toggleTimer(task.id);
    }
}

export function renderAttachments(attachments) {
    const container = document.getElementById('attachments-container');
    container.innerHTML = '';
    (attachments || []).forEach((att, index) => container.insertAdjacentHTML('beforeend', `<div class="flex justify-between items-center text-sm p-1 bg-gray-100 dark:bg-gray-700 rounded"><a href="${att.url}" target="_blank" class="truncate hover:underline" title="${att.url}">${att.name}</a><button type="button" class="remove-attachment-btn" data-index="${index}">&times;</button></div>`));
    container.querySelectorAll('.remove-attachment-btn').forEach(btn => btn.onclick = async (e) => {
        const taskId = document.getElementById('task-id').value, index = parseInt(e.target.dataset.index), task = await db.items.get(taskId), updatedAttachments = task.attachments.filter((_, i) => i !== index);
        await db.items.update(taskId, { attachments: updatedAttachments });
        renderAttachments(updatedAttachments);
    });
}

export function populateChecklistTemplateSelect() {
    const select = document.getElementById('insert-checklist-template');
    select.innerHTML = '<option value="">Insert Template...</option>';
    App.checklistTemplates.forEach(template => select.add(new Option(template.name, template.id)));
}