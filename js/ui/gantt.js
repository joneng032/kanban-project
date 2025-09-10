import { db } from '../db.js';
import { App } from '../main.js';

export function renderGantt() {
    if(typeof gantt === 'undefined') return;
    gantt.clearAll();
    const ganttData = {
        data: App.items.filter(i => i.startDate).map(item => ({
            id: item.id,
            text: item.title || item.name,
            start_date: item.startDate,
            end_date: item.endDate,
            duration: item.endDate ? undefined : 1
        })),
        links: App.links.map(l => ({ id: l.id, source: l.source, target: l.target, type: l.type }))
    };
    gantt.config.date_format = "%Y-%m-%d";
    gantt.init("gantt_here");
    gantt.parse(ganttData);
    const isDark = document.documentElement.classList.contains('dark');
    const ganttContainer = document.getElementById('gantt_here');
    if (ganttContainer) ganttContainer.classList.toggle('dark', isDark);
}

if(typeof gantt !== 'undefined') {
    gantt.attachEvent("onAfterLinkAdd", (id, link) => db.links.add({ id: parseInt(id), projectId: App.activeProjectId, source: link.source, target: link.target, type: l.type.toString() }));
    gantt.attachEvent("onAfterLinkDelete", (id) => db.links.delete(parseInt(id)));
}