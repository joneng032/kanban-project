import { db } from '../db.js';
import * as elements from './domElements.js';
import { App } from '../main.js';
import { getContrastYIQ } from './utils.js';

let draggedItemId = null, draggedItemEl = null, draggedColumnEl = null;

export function renderBoard() {
    const container = document.getElementById('board-columns-container');
    container.innerHTML = '';
    App.columns.forEach(column => container.appendChild(createBoardColumn(column)));
    const btn = document.createElement('div');
    btn.className = 'flex-shrink-0 w-80';
    btn.innerHTML = `<button onclick="App.openColumnModal()" class="w-full h-12 bg-gray-200/50 dark:bg-gray-800/50 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">+ Add Column</button>`;
    container.appendChild(btn);
    // Allow the browser to layout the newly-inserted column elements before populating items.
    // Force a layout read then populate in the next animation frame to avoid zero-size bounding rects.
    requestAnimationFrame(() => {
        // Force reflow/read layout
        // eslint-disable-next-line no-unused-expressions
        container.offsetWidth;
        populateBoard();
    });
}

function createBoardColumn(column) {
    const colDiv = document.createElement('div');
    // build class list defensively to avoid accidental 'undefined' tokens
    const colClasses = ['kanban-column','flex-shrink-0','w-80','rounded-xl','bg-gray-200/50','dark:bg-gray-800','flex','flex-col'];
    if (column.isCollapsed) colClasses.push('collapsed');
    colDiv.className = colClasses.join(' ');
    colDiv.dataset.columnId = column.id;
    colDiv.innerHTML = `<div class="kanban-column-header p-4 border-b dark:border-gray-700 flex justify-between items-center cursor-grab" draggable="true"><button onclick="App.toggleColumnCollapse('${column.id}')" class="p-1 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"><svg class="w-5 h-5 collapse-btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg></button><h2 class="text-lg font-semibold">${column.title}</h2><div class="flex items-center space-x-2"><span class="text-sm font-medium text-gray-500 dark:text-gray-400" id="item-count-${column.id}">0</span><div class="dropdown"><button onclick="App.toggleDropdown('${column.id}')" class="p-1 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path></svg></button><div id="dropdown-${column.id}" class="dropdown-content"><a href="#" onclick="App.openColumnModal('${column.id}')">Rename</a><a href="#" onclick="App.confirmDeleteColumn('${column.id}', '${column.title}')">Delete</a></div></div></div></div><div id="${column.id}-items" class="p-4 space-y-4 kanban-items overflow-y-auto flex-grow"></div><div class="quick-add-container p-2 mt-auto"><button class="quick-add-btn w-full text-left p-2 rounded-md text-gray-500 hover:bg-gray-300 dark:hover:bg-gray-700">+ Add a card</button><form class="quick-add-form hidden"><textarea placeholder="Enter a title for this card..." class="modal-input w-full p-2 text-sm" rows="3"></textarea><div class="mt-2 flex items-center space-x-2"><button type="submit" class="bg-indigo-600 text-white font-semibold py-1 px-3 rounded-md text-sm">Add card</button><button type="button" class="cancel-quick-add-btn text-2xl text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">&times;</button></div></form></div>`;
    const header = colDiv.querySelector('.kanban-column-header');
    header.addEventListener('dragstart', handleColumnDragStart);
    header.addEventListener('dragend', handleColumnDragEnd);
    const itemsContainer = colDiv.querySelector('.kanban-items');
    itemsContainer.addEventListener('dragover', handleDragOver);
    itemsContainer.addEventListener('drop', handleDrop);
    itemsContainer.addEventListener('dragenter', (e) => e.currentTarget.classList.add('drag-over'));
    itemsContainer.addEventListener('dragleave', (e) => e.currentTarget.classList.remove('drag-over'));
    const addBtn = colDiv.querySelector('.quick-add-btn'), addForm = colDiv.querySelector('.quick-add-form'), cancelBtn = colDiv.querySelector('.cancel-quick-add-btn'), textarea = colDiv.querySelector('textarea');
    addBtn.onclick = (e) => { e.stopPropagation(); addBtn.classList.add('hidden'); addForm.classList.remove('hidden'); textarea.focus(); };
    cancelBtn.onclick = (e) => { e.stopPropagation(); addForm.classList.add('hidden'); addBtn.classList.remove('hidden'); textarea.value = ''; };
    addForm.onsubmit = async (e) => { e.preventDefault(); e.stopPropagation(); const title = textarea.value.trim(); if (title) { const newItemData = await App.quickAddTask(title, column.id); itemsContainer.appendChild(createTaskCard(newItemData)); addEventListenersToCards(); const countEl = colDiv.querySelector(`#item-count-${column.id}`); countEl.textContent = parseInt(countEl.textContent) + 1; textarea.value = ''; textarea.focus(); } };
    textarea.addEventListener('blur', (e) => { if (e.relatedTarget !== addForm.querySelector('button[type="submit"]') && textarea.value.trim() === '') cancelBtn.click(); });
    textarea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); } if (e.key === 'Escape') cancelBtn.click(); });
    return colDiv;
}

export function populateBoard() {
    const searchTerm = elements.searchInput.value.toLowerCase(), selectedTagIds = Array.from(elements.tagFilterSelect.selectedOptions).map(opt => opt.value), selectedAssigneeIds = Array.from(elements.assigneeFilterSelect.selectedOptions).map(opt => opt.value), specialFilter = document.getElementById('special-filter-select').value;
    const filteredItems = App.items.filter(item => {
        const matchesSearch = (item.title || item.name).toLowerCase().includes(searchTerm);
        const matchesTags = selectedTagIds.length === 0 || (item.tags && selectedTagIds.every(tagId => item.tags.includes(tagId)));
        const matchesAssignees = selectedAssigneeIds.length === 0 || (item.assignees && selectedAssigneeIds.some(userId => item.assignees.includes(parseInt(userId))));
        let matchesSpecial = true;
        if (specialFilter !== 'all') {
            const today = new Date(); today.setHours(0, 0, 0, 0); const doneColumnIds = App.columns.filter(c => c.title.toLowerCase().includes('done')).map(c => c.id);
            switch(specialFilter) {
                case 'overdue': matchesSpecial = item.endDate && new Date(item.endDate + 'T00:00:00') < today && !doneColumnIds.includes(item.status); break;
                case 'due_today': matchesSpecial = item.endDate && new Date(item.endDate + 'T00:00:00').getTime() === today.getTime(); break;
                case 'due_this_week': const endOfWeek = new Date(today); endOfWeek.setDate(today.getDate() + (6 - today.getDay())); endOfWeek.setHours(23, 59, 59, 999); const itemDueDate = item.endDate ? new Date(item.endDate + 'T00:00:00') : null; matchesSpecial = itemDueDate && itemDueDate >= today && itemDueDate <= endOfWeek; break;
                case 'no_assignee': matchesSpecial = !item.assignees || item.assignees.length === 0; break;
                case 'no_tags': matchesSpecial = !item.tags || item.tags.length === 0; break;
            }
        }
        return matchesSearch && matchesTags && matchesAssignees && matchesSpecial;
    });
    document.querySelectorAll('.kanban-items').forEach(colEl => colEl.innerHTML = '');
    App.columns.forEach(c => { const countEl = document.getElementById(`item-count-${c.id}`); if (countEl) countEl.textContent = 0; });
    filteredItems.sort((a, b) => a.order - b.order).forEach(item => { const colItems = document.getElementById(`${item.status}-items`); if (colItems) { colItems.appendChild(createTaskCard(item)); const countEl = document.getElementById(`item-count-${item.status}`); if(countEl) countEl.textContent = parseInt(countEl.textContent) + 1; } });
    App.columns.forEach(column => { const countEl = document.getElementById(`item-count-${column.id}`); if (!countEl) return; const count = parseInt(countEl.textContent), headerEl = document.querySelector(`.kanban-column[data-column-id="${column.id}"] .kanban-column-header`); if (headerEl) headerEl.classList.toggle('wip-exceeded', column.wipLimit > 0 && count > column.wipLimit); });
    addEventListenersToCards();
    App.items.forEach(item => { if (item.timerRunning?.start) App.startCardTimer(item.id, item.timerRunning.start); });
}

function createTaskCard(task) {
    const card = document.createElement('div');
    card.dataset.id = task.id;
    card.draggable = true;

    if (task.childProjectId) {
        // build class list defensively
        card.className = ['item-card','p-4','bg-indigo-100','dark:bg-indigo-900/50','rounded-lg','shadow-sm','hover:shadow-md','border-l-4','border-indigo-500'].join(' ');
        card.innerHTML = `<div class="flex justify-between items-center"><h4 class="font-bold flex items-center"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path d="M2 4a2 2 0 012-2h6a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V4zm11-1a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2h-2zM4 12a2 2 0 00-2 2v2a2 2 0 002 2h6a2 2 0 002-2v-2a2 2 0 00-2-2H4z"/></svg>${task.title}</h4><span class="text-indigo-600 dark:text-indigo-400"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" /></svg></span></div><p class="text-sm truncate text-indigo-500 dark:text-indigo-400 mt-1">Click to open sub-board.</p>`;
    } else {
        let dueDateClass = '';
        if (task.endDate) { const today = new Date(); today.setHours(0,0,0,0); const dueDate = new Date(task.endDate + 'T00:00:00'); if (dueDate < today) dueDateClass = 'overdue'; else if (dueDate.getTime() === today.getTime()) dueDateClass = 'due-today'; }
        const priorityBorderClasses = {high: 'border-l-4 border-red-500', medium: 'border-l-4 border-yellow-500', low: 'border-l-4 border-green-500'};
    // Build class list defensively to avoid 'undefined' insertion when task.priority is not set
    const baseClasses = ['item-card','group','relative','p-4','bg-white','dark:bg-gray-700','rounded-lg','shadow-sm','hover:shadow-md'];
    if (priorityBorderClasses[task.priority]) baseClasses.push(priorityBorderClasses[task.priority]);
    if (dueDateClass) baseClasses.push(dueDateClass);
    card.className = baseClasses.join(' ');
        let tagsHTML = '';
        if (task.tags && task.tags.length > 0) { tagsHTML = '<div class="mt-2 flex flex-wrap">'; task.tags.forEach(tagId => { const tag = App.tags.find(t => t.id == tagId); if (tag) tagsHTML += `<span class="tag-pill" style="background-color:${tag.color}; color: ${getContrastYIQ(tag.color)}">${tag.name}</span>`; }); tagsHTML += '</div>'; }
        let assigneesHTML = '<div class="flex items-center">';
        if (task.assignees && task.assignees.length > 0) { task.assignees.forEach(userId => { const user = App.users.find(u => u.id === userId); if (user) assigneesHTML += `<div class="assignee-avatar" title="${user.name}">${user.name.charAt(0).toUpperCase()}</div>`; }); }
        assigneesHTML += '</div>';
        const isBlockedCount = App.links.filter(l => l.target === task.id).length, isBlockingCount = App.links.filter(l => l.source === task.id).length;
        let indicatorsHTML = '<div class="flex items-center gap-3">';
        if (isBlockedCount > 0) indicatorsHTML += `<div class="text-xs flex items-center text-red-500" title="Blocked by ${isBlockedCount} task(s)"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clip-rule="evenodd" /></svg>${isBlockedCount}</div>`;
        if (isBlockingCount > 0) indicatorsHTML += `<div class="text-xs flex items-center text-blue-500" title="Blocking ${isBlockingCount} task(s)"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clip-rule="evenodd" /></svg>${isBlockingCount}</div>`;
        if (task.recurrence) indicatorsHTML += `<div class="text-xs flex items-center text-gray-500 dark:text-gray-400" title="Recurring Task"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.898 2.186A1.001 1.001 0 0116 8.39l-1-1.43A1 1 0 0116.15.587l.285.202a5.002 5.002 0 00-8.29-2.311V3a1 1 0 01-2 0V2a1 1 0 011-1zm12 15a1 1 0 01-1-1v-2.101a7.002 7.002 0 01-11.898-2.186A1.001 1.001 0 014 11.61l1 1.43A1 1 0 013.85 14.413l-.285-.202a5.002 5.002 0 008.29 2.311V17a1 1 0 012 0v1a1 1 0 01-1 1z" clip-rule="evenodd" /></svg></div>`;
        if (task.checklist?.length > 0) { const completed = task.checklist.filter(i => i.completed).length; indicatorsHTML += `<div class="text-xs flex items-center text-gray-500 dark:text-gray-400" title="Checklist"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>${completed}/${task.checklist.length}</div>`; const today = new Date(); today.setHours(0, 0, 0, 0); const overdueChecklistItems = task.checklist.filter(i => !i.completed && i.dueDate && new Date(i.dueDate + 'T00:00:00') < today).length; if (overdueChecklistItems > 0) indicatorsHTML += `<div class="text-xs flex items-center text-red-500" title="${overdueChecklistItems} overdue sub-item(s)"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>${overdueChecklistItems}</div>`; }
        if (task.attachments?.length > 0) indicatorsHTML += `<div class="text-xs flex items-center text-gray-500 dark:text-gray-400" title="Attachments"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a3 3 0 00-3 3v4a3 3 0 006 0V7a1 1 0 112 0v4a5 5 0 01-10 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clip-rule="evenodd" /></svg>${task.attachments.length}</div>`;
        indicatorsHTML += `<div id="timer-${task.id}" class="timer-indicator"></div></div>`;
        const safeTitle = (task.title || task.name || '').replace(/'/g, "\'");
        const deleteBtnHTML = `<button onclick="App.confirmDeleteItem(event, '${task.id}', '${safeTitle}')" title="Delete Task" class="absolute top-2 right-2 p-1 rounded-full text-gray-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity z-10"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg></button>`;
        const editBtnHTML = `<button title="Edit Task" class="edit-task-btn absolute top-2 right-9 p-1 rounded-full text-gray-400 hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity z-10"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-7.939 7.939-3.44-1.096a.5.5 0 01.621-.621l1.096 3.44zM16 16.5V19h-2.5v-2.5h2.5z"/></svg></button>`;
        let reserveStudyHTML = '';
        if (App.activeProject.type === 'reserve-study') reserveStudyHTML = `<div class="mt-2 text-xs text-gray-500 dark:text-gray-400"><div><strong>Project Name:</strong> ${App.activeProject.name}</div><div><strong>Project Number:</strong> ${task.projectNumber || 'N/A'}</div><div><strong>Replacement Cost:</strong> ${task.replacementValue ? parseFloat(task.replacementValue).toLocaleString() : 'N/A'}</div></div>`;
        card.innerHTML = `${deleteBtnHTML}${editBtnHTML}<h4 class="font-bold">${task.title || task.name}</h4>${reserveStudyHTML}${tagsHTML}<p class="text-sm truncate text-gray-500 dark:text-gray-400 mt-1">${task.details || ''}</p><div class="flex justify-between items-center mt-3">${indicatorsHTML}${assigneesHTML}</div>`;
    }
    return card;
}

function addEventListenersToCards() {
    document.querySelectorAll('.item-card').forEach(card => {
        const itemId = card.dataset.id, item = App.items.find(i => i.id === itemId);
        card.ondragstart = (e) => { e.stopPropagation(); draggedItemId = e.currentTarget.dataset.id; draggedItemEl = e.currentTarget; setTimeout(() => { if(draggedItemEl) draggedItemEl.classList.add('dragging') }, 0); };
        card.ondragend = (e) => { e.stopPropagation(); if (draggedItemEl) draggedItemEl.classList.remove('dragging'); draggedItemId = null; draggedItemEl = null; };
        if (item && item.childProjectId) card.onclick = () => App.loadProject(item.childProjectId);
        else {
            // Double-clicking the card opens the edit modal.
            card.addEventListener('dblclick', (e) => { e.stopImmediatePropagation(); App.openModal(card.dataset.id); });
            // Attach the click handler to the new edit button.
            const editBtn = card.querySelector('.edit-task-btn');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopImmediatePropagation();
                    App.openModal(card.dataset.id);
                });
            }
            // Inline title editing is still active for dblclick on the title.
            const titleEl = card.querySelector('h4');
            if (titleEl) {
               titleEl.addEventListener('dblclick', (e) => { e.stopImmediatePropagation(); const currentTitle = titleEl.textContent, input = document.createElement('input'); input.type = 'text'; input.value = currentTitle; input.className = 'w-full -ml-1 p-0 border-0 rounded bg-white dark:bg-gray-600 focus:ring-2 focus:ring-indigo-500 font-bold'; titleEl.style.display = 'none'; titleEl.parentNode.insertBefore(input, titleEl); input.focus(); const saveEdit = async () => { const newTitle = input.value.trim(); if (newTitle && newTitle !== currentTitle) { await db.items.update(itemId, { title: newTitle }); await App.logActivity(`renamed task "${currentTitle}" to "${newTitle}"`); await App.fetchProjectData(); } else { input.remove(); titleEl.style.display = ''; } }; input.addEventListener('blur', saveEdit); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); else if (e.key === 'Escape') { input.remove(); titleEl.style.display = ''; } }); });
            }
        }
    });
}

export function handleDragOver(e) {
    e.preventDefault();
    const container = e.currentTarget;
    const afterElement = getDragAfterElement(container, e.clientY);
    if (draggedItemEl && afterElement == null) container.appendChild(draggedItemEl);
    else if(draggedItemEl) container.insertBefore(draggedItemEl, afterElement);
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.item-card:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect(), offset = y - box.top - box.height / 2;
        return (offset < 0 && offset > closest.offset) ? { offset: offset, element: child } : closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

export async function handleDrop(e) {
    e.preventDefault();
    const columnItemsEl = e.currentTarget;
    columnItemsEl.classList.remove('drag-over');
    if (!draggedItemEl) return;
    const draggedItem = await db.items.get(draggedItemId), oldStatusId = draggedItem.status, newStatusId = columnItemsEl.id.replace('-items', ''), oldColumn = App.columns.find(c => c.id === oldStatusId), newColumn = App.columns.find(c => c.id === newStatusId);
    if (newColumn.title.toLowerCase() === 'done') {
        const predecessors = App.links.filter(l => l.target === draggedItemId).map(l => l.source);
        if (predecessors.length > 0) {
            const doneColumnIds = App.columns.filter(c => c.title.toLowerCase() === 'done').map(c => c.id);
            const incomplete = (await db.items.where({ projectId: App.activeProjectId }).toArray()).filter(item => predecessors.includes(item.id) && !doneColumnIds.includes(item.status)).length;
            if (incomplete > 0) {
                showToast('Cannot complete task: predecessors are not done.');
                renderBoard();
                return;
            }
        }
    }
    draggedItemEl.classList.remove('dragging');
    const itemsInNewCol = Array.from(columnItemsEl.querySelectorAll('.item-card')),
        draggedIndex = itemsInNewCol.findIndex(el => el.dataset.id === draggedItemId),
        prevItem = itemsInNewCol[draggedIndex - 1],
        nextItem = itemsInNewCol[draggedIndex + 1];
    const prevOrder = prevItem ? (await db.items.get(prevItem.dataset.id)).order : 0,
        nextOrder = nextItem ? (await db.items.get(nextItem.dataset.id)).order : (prevOrder || Date.now()) + 1000;
    const newOrder = (prevOrder + nextOrder) / 2;
    const updates = { status: newStatusId, order: newOrder };
    if (newColumn?.title.toLowerCase().includes('done')) {
        updates.completedAt = new Date().toISOString();
        if (draggedItem.recurrence) {
            await App.createNextRecurringTask(draggedItem);
            updates.recurrence = null;
        }
    } else {
        updates.completedAt = null;
    }
    await db.items.update(draggedItemId, updates);
    if(oldStatusId !== newStatusId) {
        await App.logActivity(`moved task "${draggedItem.title}" from "${oldColumn.title}" to "${newColumn.title}"`);
        const updatedTask = await db.items.get(draggedItemId);
        if (await App.runAutomations('move', newStatusId, updatedTask)) {
            await App.fetchProjectData();
        } else {
            await App.fetchProjectData();
        }
    } else {
        await App.fetchProjectData();
    }
}

export function handleColumnDragStart(e) {
    if (e.target.closest('button')) {
        e.preventDefault();
        return;
    }
    draggedColumnEl = e.currentTarget.closest('.kanban-column');
    if (!draggedColumnEl) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedColumnEl.dataset.columnId);
    setTimeout(() => {
        if (draggedColumnEl) draggedColumnEl.classList.add('dragging-column');
    }, 0);
}

export function handleColumnDragEnd() {
    if (draggedColumnEl) draggedColumnEl.classList.remove('dragging-column');
    draggedColumnEl = null;
    document.getElementById('board-columns-container').classList.remove('drag-over');
}

export function handleColumnDragOver(e) {
    e.preventDefault();
    if (!draggedColumnEl) return;
    const container = document.getElementById('board-columns-container'),
        afterElement = getDragAfterColumn(container, e.clientX);
    if (afterElement == null) container.insertBefore(draggedColumnEl, container.lastElementChild);
    else container.insertBefore(draggedColumnEl, afterElement);
}

function getDragAfterColumn(container, x) {
    const draggableElements = [...container.querySelectorAll('.kanban-column:not(.dragging-column)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect(),
            offset = x - box.left - box.width / 2;
        return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

export async function updateColumnOrder() {
    const columnElements = [...document.getElementById('board-columns-container').querySelectorAll('.kanban-column')],
        columnMap = new Map(App.columns.map(col => [col.id, col])),
        newColumnsOrder = [];
    const updates = columnElements.map((el, index) => {
        const columnId = el.dataset.columnId,
            columnData = columnMap.get(columnId);
        if (columnData) {
            columnData.order = index;
            newColumnsOrder.push(columnData);
        }
        return db.columns.update(columnId, { order: index });
    });
    App.columns = newColumnsOrder;
    await Promise.all(updates);
    await App.logActivity('Reordered columns');
}