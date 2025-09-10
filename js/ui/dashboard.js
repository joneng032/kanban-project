import { App } from '../main.js';

export function renderDashboard() {
    const taskDashboard = document.getElementById('task-dashboard'),
        reserveDashboard = document.getElementById('reserve-study-dashboard');

    if (App.activeProject.type === 'reserve-study') {
        taskDashboard.classList.add('hidden');
        reserveDashboard.classList.remove('hidden');
        const totalValue = App.items.reduce((sum, item) => sum + (parseFloat(item.replacementValue) || 0), 0);
        const fiveYearsFromNow = new Date();
        fiveYearsFromNow.setFullYear(fiveYearsFromNow.getFullYear() + 5);
        const dueSoonCount = App.items.filter(i => i.endDate && new Date(i.endDate) <= fiveYearsFromNow).length;
        document.getElementById('total-components-stat').textContent = App.items.length;
        document.getElementById('total-value-stat').textContent = `$${totalValue.toLocaleString()}`;
        document.getElementById('due-soon-stat').textContent = dueSoonCount;
        const conditionCounts = App.items.reduce((acc, item) => {
            const cond = item.condition || 'N/A';
            acc[cond] = (acc[cond] || 0) + 1;
            return acc;
        }, {});
        if (App.conditionChart) App.conditionChart.destroy();
        App.conditionChart = new Chart(document.getElementById('condition-chart'), {
            type: 'bar',
            data: {
                labels: Object.keys(conditionCounts),
                datasets: [{
                    label: 'Component Count',
                    data: Object.values(conditionCounts),
                    backgroundColor: ['#22c55e', '#84cc16', '#f59e0b', '#ef4444', '#7f1d1d', '#9ca3af']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    } else {
        taskDashboard.classList.remove('hidden');
        reserveDashboard.classList.add('hidden');
        const doneColumn = App.columns.find(c => c.title.toLowerCase() === 'done');
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const completedThisWeek = App.items.filter(i => i.completedAt && new Date(i.completedAt) > sevenDaysAgo).length;
        const today = new Date();
        today.setHours(0,0,0,0);
        const overdue = App.items.filter(i => i.endDate && new Date(i.endDate + 'T00:00:00') < today && (!doneColumn || i.status !== doneColumn.id)).length;
        document.getElementById('completed-week-stat').textContent = completedThisWeek;
        document.getElementById('overdue-stat').textContent = overdue;
        const activeTasks = App.items.filter(i => !doneColumn || i.status !== doneColumn.id);
        const priorityCounts = activeTasks.reduce((acc, task) => {
            acc[task.priority] = (acc[task.priority] || 0) + 1;
            return acc;
        }, { high: 0, medium: 0, low: 0 });
        if(App.priorityChart) App.priorityChart.destroy();
        App.priorityChart = new Chart(document.getElementById('priority-chart'), {
            type: 'doughnut',
            data: {
                labels: ['High', 'Medium', 'Low'],
                datasets: [{
                    data: [priorityCounts.high, priorityCounts.medium, priorityCounts.low],
                    backgroundColor: ['#ef4444', '#f59e0b', '#22c55e']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
}