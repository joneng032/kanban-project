import { App } from '../main.js';

export function renderCalendar() {
    const calendarGrid = document.getElementById('calendar-grid');
    calendarGrid.innerHTML = '';
    document.getElementById('month-year-title').textContent = App.currentCalendarDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    const year = App.currentCalendarDate.getFullYear(),
        month = App.currentCalendarDate.getMonth(),
        firstDay = new Date(year, month, 1),
        lastDay = new Date(year, month + 1, 0),
        tasksWithEndDates = App.items.filter(item => item.endDate && !item.childProjectId),
        doneColumnIds = App.columns.filter(c => c.title.toLowerCase() === 'done').map(c => c.id),
        today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < firstDay.getDay(); i++) {
        calendarGrid.insertAdjacentHTML('beforeend', `<div class="calendar-day other-month"></div>`);
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        dayDiv.innerHTML = `<div class="calendar-day-header">${day}</div><div class="calendar-tasks-container"></div>`;
        if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            dayDiv.querySelector('.calendar-day-header').classList.add('is-today');
        }
        const tasksContainer = dayDiv.querySelector('.calendar-tasks-container'),
            currentDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        tasksWithEndDates.filter(t => t.endDate === currentDateStr).forEach(task => {
            let taskClasses = `calendar-task priority-${task.priority || 'low'}`;
            if (doneColumnIds.includes(task.status)) {
                taskClasses += ' status-done';
            }
            if (new Date(task.endDate + 'T23:59:59') < today && !doneColumnIds.includes(task.status)) {
                taskClasses += ' is-overdue';
            }
            const safeTitle = (task.title || task.name || '').replace(/"/g, '&quot;');
            tasksContainer.insertAdjacentHTML('beforeend', `<div class="${taskClasses}" onclick="App.openModal('${task.id}')" title="${safeTitle}">${task.title || task.name}</div>`);
        });
        calendarGrid.appendChild(dayDiv);
    }
}