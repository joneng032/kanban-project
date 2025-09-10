import { db } from '../db.js';
import { App } from '../main.js';
import * as elements from '../ui/domElements.js';
import { showToast } from '../ui/utils.js';
import { openConfirmModal, renderChecklistItem, renderTaskTags, populateAddTagSelect, renderTaskAssignees, populateAddAssigneeSelect, renderDependencies, renderTimeTracking, renderAttachments, populateChecklistTemplateSelect } from '../ui/modals.js';

let currentEditingItemId = null;
let originalTaskValues = {};

export function initializeTaskHistory() {
    const originalOpenTaskModal = App.openModal;
    if (originalOpenTaskModal) {
        App.openModal = async function(itemId = null) {
            const item = itemId ? await db.items.get(itemId) : null;
            currentEditingItemId = item ? item.id : null;
            if (item) {
                originalTaskValues = { title: item.title || '', description: item.description || '', priority: item.priority || '', status: item.status || '', dueDate: item.dueDate || '', assignees: item.assignees || [] };
            }
            await originalOpenTaskModal(itemId);
            setTimeout(() => {
                resetTaskTabs();
                if (item && !item.history) recordTaskChange(item.id, 'created', null, 'Task created', '✨');
            }, 50);
        };
    }

    const originalTaskFormSubmit = elements.taskForm.onsubmit;
     elements.taskForm.addEventListener('submit', async function(event) {
        if (event) event.preventDefault();
        await trackTaskChanges();
        if(originalTaskFormSubmit) return originalTaskFormSubmit(event);
    });
    
    enhanceStatusTracking();
}

function recordTaskChange(itemId, changeType, oldValue, newValue, icon = '🔄') {
    if (oldValue === newValue) return;
    const historyEntry = { id: App.generateUUID(), timestamp: new Date().toISOString(), type: changeType, oldValue, newValue, icon };
    db.items.where('id').equals(itemId).modify(item => {
        if (!item.history) item.history = [];
        item.history.push(historyEntry);
        item.updatedAt = historyEntry.timestamp;
    }).catch(err => console.error('Error recording task change:', err));
}

async function trackTaskChanges() {
    if (!currentEditingItemId) return;
    const title = document.getElementById('task-title').value;
    const desc = document.getElementById('task-details').value; // Changed from task-description to task-details
    const priority = document.getElementById('task-priority').value;
    const dueDate = document.getElementById('task-end-date').value; // Changed from task-due-date to task-end-date
    if (originalTaskValues.title !== title) recordTaskChange(currentEditingItemId, 'title-change', originalTaskValues.title, title, '📝');
    if (originalTaskValues.description !== desc) recordTaskChange(currentEditingItemId, 'description-change', 'Description updated', desc ? 'New description' : 'Description removed', '📄');
    if (originalTaskValues.priority !== priority) recordTaskChange(currentEditingItemId, 'priority-change', originalTaskValues.priority || 'None', priority, '⚡');
    if (originalTaskValues.dueDate !== dueDate) recordTaskChange(currentEditingItemId, 'dueDate-change', originalTaskValues.dueDate || 'None', dueDate || 'None', '📅');
}

function enhanceStatusTracking() {
    const originalTrackItemMovement = window.trackItemMovement;
    window.trackItemMovement = function(itemId, newStatus, oldStatus) {
        if(originalTrackItemMovement) originalTrackItemMovement(itemId, newStatus, oldStatus);
        const oldCol = App.columns.find(c => c.id === oldStatus)?.title || oldStatus;
        const newCol = App.columns.find(c => c.id === newStatus)?.title || newStatus;
        recordTaskChange(itemId, 'status-change', oldCol, newCol, '🔄');
    };
}

export function showTaskTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.task-tab').forEach(btn => btn.classList.remove('active'));
    const targetTab = document.getElementById(tabName + '-tab');
    if (targetTab) targetTab.classList.add('active');
    
    const tabButton = Array.from(document.querySelectorAll('.task-tab')).find(btn => btn.textContent.toLowerCase().includes(tabName));
    if(tabButton) tabButton.classList.add('active');

    if (tabName === 'history' && currentEditingItemId) loadTaskHistory(currentEditingItemId);
}
function resetTaskTabs() { showTaskTab('details'); }

async function loadTaskHistory(itemId) {
    const historyContainer = document.getElementById('task-history-content');
    if (!historyContainer) return console.error('History container not found');
    try {
        const item = await db.items.where('id').equals(itemId).first();
        if (!item || !item.history || item.history.length === 0) {
            historyContainer.innerHTML = `<div class="no-history">📜 No history available.</div>`; return;
        }
        const sortedHistory = [...item.history].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        let historyHTML = '';
        sortedHistory.forEach(entry => {
            const timeStr = new Date(entry.timestamp).toLocaleString();
            const icon = entry.icon || '🔄';
            let actionText = '', detailsText = '';
            switch (entry.type) {
                case 'status-change': actionText = 'Status Changed'; detailsText = `Moved from <span class="history-value">${entry.oldValue}</span> to <span class="history-value">${entry.newValue}</span>`; break;
                case 'priority-change': actionText = 'Priority Updated'; detailsText = `Changed from <span class="history-value">${entry.oldValue}</span> to <span class="history-value">${entry.newValue}</span>`; break;
                case 'title-change': actionText = 'Title Modified'; detailsText = `Renamed from <span class="history-value">${entry.oldValue}</span> to <span class="history-value">${entry.newValue}</span>`; break;
                case 'description-change': actionText = 'Description Updated'; detailsText = 'Task description was modified'; break;
                case 'dueDate-change': actionText = 'Due Date Changed'; detailsText = `Updated from <span class="history-value">${entry.oldValue}</span> to <span class="history-value">${entry.newValue}</span>`; break;
                case 'created': actionText = 'Task Created'; detailsText = 'Task was initially created'; break;
                default: actionText = 'Task Updated'; detailsText = `${entry.type} was modified`;
            }
            historyHTML += `<div class="history-entry ${entry.type}"><div class="history-timestamp">${timeStr}</div><div class="history-action"><span>${icon}</span> <span>${actionText}</span></div><div class="history-details">${detailsText}</div></div>`;
        });
        historyContainer.innerHTML = historyHTML;
    } catch (error) {
        console.error('Error loading task history:', error);
        historyContainer.innerHTML = `<div class="no-history" style="color: #ef4444;">❌ Error loading history.</div>`;
    }
}

export async function taskFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('task-id').value;
    const oldTask = id ? App.items.find(i => i.id === id) : null;
    const wasChecklistComplete = oldTask?.checklist?.length > 0 && oldTask.checklist.every(i => i.completed);
    const currentTags = Array.from(document.querySelectorAll('#tags-container .tag-pill')).map(pill => pill.dataset.tagId);
    const currentAssignees = Array.from(document.querySelectorAll('#assignees-container .assignee-avatar')).map(pill => parseInt(pill.dataset.userId));
    const recurrenceType = document.getElementById('recurrence-type').value;
    let recurrenceData = null;
    if (recurrenceType !== 'none') {
        recurrenceData = { type: recurrenceType };
        if (recurrenceType === 'weekly') recurrenceData.day = document.getElementById('recurrence-weekly-day').value;
        else if (recurrenceType === 'monthly') recurrenceData.day = document.getElementById('recurrence-monthly-day').value;
    }
    const taskData = {
        title: document.getElementById('task-title').value,
        details: document.getElementById('task-details').value,
        startDate: document.getElementById('task-start-date').value,
        endDate: document.getElementById('task-end-date').value,
        priority: document.getElementById('task-priority').value,
        checklist: Array.from(document.querySelectorAll('#checklist-container .checklist-item')).map(el => ({ text: el.querySelector('span').textContent, completed: el.querySelector('input[type="checkbox"]').checked, dueDate: el.querySelector('.checklist-item-due-date').value })),
        projectNumber: document.getElementById('task-project-number').value,
        replacementValue: document.getElementById('task-value').value,
        condition: document.getElementById('task-condition').value,
        tags: currentTags,
        assignees: currentAssignees,
        recurrence: recurrenceData
    };
    let updatedTask;
    if (id) {
        if(oldTask && oldTask.title !== taskData.title) await App.logActivity(`renamed task "${oldTask.title}" to "${taskData.title}"`);
        await db.items.update(id, taskData);
        updatedTask = { ...oldTask, ...taskData };
    } else {
        const maxOrder = App.items.reduce((max, i) => Math.max(max, i.order || 0), 0);
        const newItem = { ...taskData, id: App.generateUUID(), projectId: App.activeProjectId, status: App.columns[0].id, order: maxOrder + 1, isArchived: 'false', timeLogs: [], attachments: [] };
        await db.items.add(newItem);
        await App.logActivity(`created task "${newItem.title}"`);
        updatedTask = newItem;
    }
    const isChecklistNowComplete = updatedTask.checklist?.length > 0 && updatedTask.checklist.every(i => i.completed);
    if (isChecklistNowComplete && !wasChecklistComplete) {
        if (await App.runAutomations('checklist_completed', updatedTask.id, updatedTask)) {
            await App.fetchProjectData();
        } else {
            await App.fetchProjectData();
        }
    } else {
        await App.fetchProjectData();
    }
    App.closeModal();
}

export async function quickAddTask(title, columnId) {
    const maxOrder = App.items.filter(i => i.status === columnId).reduce((max, i) => Math.max(max, i.order || 0), 0);
    const newItem = {
        title,
        id: App.generateUUID(),
        projectId: App.activeProjectId,
        status: columnId,
        order: maxOrder + 1000,
        isArchived: 'false',
        priority: 'low',
        tags: [],
        comments: [],
        assignees: [],
        timeLogs: [],
        attachments: [],
        checklist: [],
        details: '',
        startDate: '',
        endDate: '',
        recurrence: null,
        projectNumber: '',
        replacementValue: '',
        condition: 'good'
    };
    if (App.activeProject.parentInfo) {
        let detailsText = `Parent Project: ${App.activeProject.parentInfo.projectName}\n`;
        if (App.activeProject.parentInfo.projectNumber) detailsText += `Parent Number: ${App.activeProject.parentInfo.projectNumber}\n`;
        if (App.activeProject.parentInfo.projectCost) detailsText += `Parent Cost: $${App.activeProject.parentInfo.projectCost}\n`;
        newItem.details = detailsText;
    }
    await db.items.add(newItem);
    App.items.push(newItem);
    await App.logActivity(`created task "${newItem.title}" via quick add`);
    return newItem;
}

export async function createNextRecurringTask(completedTask) {
    if (!completedTask.endDate) return showToast("Cannot recur task without a due date.");
    const currentDueDate = new Date(completedTask.endDate + 'T00:00:00');
    let nextDueDate = new Date(currentDueDate);
    switch (completedTask.recurrence.type) {
        case 'daily': nextDueDate.setDate(nextDueDate.getDate() + 1); break;
        case 'weekly': nextDueDate.setDate(nextDueDate.getDate() + 7); break;
        case 'monthly':
            const d = currentDueDate.getDate();
            nextDueDate.setMonth(nextDueDate.getMonth() + 1);
            if (nextDueDate.getDate() !== d) nextDueDate.setDate(0);
            break;
        default: return;
    }
    const newTask = { ...completedTask };
    delete newTask.completedAt;
    newTask.id = App.generateUUID();
    newTask.endDate = nextDueDate.toISOString().split('T')[0];
    newTask.startDate = '';
    newTask.status = App.columns[0].id;
    newTask.checklist = (newTask.checklist || []).map(item => ({ ...item, completed: false }));
    await db.items.add(newTask);
    App.items.push(newTask);
    await App.logActivity(`created recurring task "${newTask.title}"`);
    showToast(`Next recurring task for "${newTask.title}" created.`);
}

export function confirmDeleteItem(event, itemId, itemName) {
    event.stopPropagation();
    openConfirmModal(
        'Delete Task',
        `Are you sure you want to permanently delete "${itemName}"?`,
        async () => {
            await db.items.delete(itemId);
            await App.logActivity(`deleted task "${itemName}"`);
            await App.fetchProjectData();
            showToast(`Task "${itemName}" deleted.`);
        }
    );
}

export async function unarchiveItem(itemId) {
    await db.items.update(itemId, { isArchived: 'false' });
    await App.logActivity(`restored task`);
    await App.fetchProjectData();
    App.openArchiveModal();
}

export function deleteItemPermanently(itemId, itemName) {
    openConfirmModal(
        'Delete Permanently',
        `Are you sure you want to permanently delete "${itemName}"?`,
        async () => {
            await db.items.delete(itemId);
            await App.logActivity(`permanently deleted task "${itemName}"`);
            await App.fetchProjectData();
            App.openArchiveModal();
        }
    );
}

export async function toggleTimer(taskId) {
    const task = App.items.find(i => i.id === taskId);
    if (!task) return;
    if (task.timerRunning) {
        const newLog = { start: task.timerRunning.start, end: Date.now() };
        task.timeLogs = [...(task.timeLogs || []), newLog];
        task.timerRunning = null;
        await db.items.update(taskId, { timeLogs: task.timeLogs, timerRunning: null });
        await App.logActivity(`stopped timer on task "${task.title}"`);
        if(App.activeTimers[taskId]) clearInterval(App.activeTimers[taskId].interval);
        delete App.activeTimers[taskId];
    } else {
        const startTime = Date.now();
        task.timerRunning = { start: startTime };
        await db.items.update(taskId, { timerRunning: { start: startTime } });
        await App.logActivity(`started timer on task "${task.title}"`);
    }
    renderTimeTracking(task);
    App.populateBoard();
}
