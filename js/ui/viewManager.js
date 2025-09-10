import { App } from '../main.js';
import * as elements from './domElements.js';
import { renderBoard } from './board.js';
import { renderGantt } from './gantt.js';
import { renderCalendar } from './calendar.js';
import { renderDashboard } from './dashboard.js';

export function switchView(view) {
    App.currentView = view;
    render();
}

function render() {
    if (!App.activeProject) return;
    Object.values(elements.viewBtns).forEach(btn => btn.classList.remove('active'));
    if(elements.viewBtns[App.currentView]) elements.viewBtns[App.currentView].classList.add('active');
    elements.boardView.classList.toggle('hidden', App.currentView !== 'board');
    elements.ganttView.classList.toggle('hidden', App.currentView !== 'gantt');
    elements.calendarView.classList.toggle('hidden', App.currentView !== 'calendar');
    elements.dashboardView.classList.toggle('hidden', App.currentView !== 'dashboard');
    if (App.currentView === 'board') renderBoard();
    else if (App.currentView === 'gantt') renderGantt();
    else if (App.currentView === 'calendar') renderCalendar();
    else if (App.currentView === 'dashboard') renderDashboard();
}