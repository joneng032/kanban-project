import { db } from '../db.js';
import { App } from '../main.js';
import { showToast } from '../ui/utils.js';

export const automationDefs = {
    triggers: {
        'move': 'Card is moved to column',
        'tag_add': 'Tag is added to card',
        'checklist_completed': 'Checklist is completed'
    },
    actions: {
        'move_to_column': 'Move card to column',
        'add_tag': 'Add tag to card',
        'assign_user': 'Assign user to card',
        'set_priority': 'Set priority for card'
    }
};

export function populateAutomationDropdown(select, options) {
    select.innerHTML = '';
    Object.entries(options).forEach(([value, text]) => select.add(new Option(text, value)));
}

export function updateAutomationValueDropdowns() {
    const triggerType = document.getElementById('automation-trigger-type').value,
        triggerValueSelect = document.getElementById('automation-trigger-value'),
        triggerContainer = document.getElementById('automation-trigger-value-container');
    triggerValueSelect.innerHTML = '';
    if (triggerType === 'move') {
        triggerContainer.style.display = 'block';
        App.columns.forEach(c => triggerValueSelect.add(new Option(c.title, c.id)));
    } else if (triggerType === 'tag_add') {
        triggerContainer.style.display = 'block';
        App.tags.forEach(t => triggerValueSelect.add(new Option(t.name, t.id)));
    } else {
        triggerContainer.style.display = 'none';
    }
    const actionType = document.getElementById('automation-action-type').value,
        actionValueSelect = document.getElementById('automation-action-value');
    actionValueSelect.innerHTML = '';
    if (actionType === 'move_to_column') {
        App.columns.forEach(c => actionValueSelect.add(new Option(c.title, c.id)));
    } else if (actionType === 'add_tag') {
        App.tags.forEach(t => actionValueSelect.add(new Option(t.name, t.id)));
    } else if (actionType === 'assign_user') {
        App.users.forEach(u => actionValueSelect.add(new Option(u.name, u.id)));
    } else if (actionType === 'set_priority') {
        ['low', 'medium', 'high'].forEach(p => actionValueSelect.add(new Option(p.charAt(0).toUpperCase() + p.slice(1), p)));
    }
}

export async function newAutomationSubmit(e) {
    e.preventDefault();
    const newRule = {
        projectId: App.activeProjectId,
        trigger_type: document.getElementById('automation-trigger-type').value,
        trigger_value: document.getElementById('automation-trigger-value').value,
        action_type: document.getElementById('automation-action-type').value,
        action_value: document.getElementById('automation-action-value').value
    };
    await db.automations.add(newRule);
    await App.fetchProjectData();
    renderAutomations();
}

export async function deleteAutomation(automationId) {
    await db.automations.delete(automationId);
    await App.fetchProjectData();
    renderAutomations();
}

export async function runAutomations(triggerType, triggerValue, task) {
    const rulesToRun = App.automations.filter(r => r.trigger_type === triggerType && (r.trigger_value == triggerValue || !r.trigger_value));
    if (rulesToRun.length === 0) return false;
    let taskData = { ...task }, changesMade = false;
    for (const rule of rulesToRun) {
        if (rule.action_type === 'move_to_column') {
            taskData.status = rule.action_value;
            changesMade = true;
        } else if (rule.action_type === 'add_tag' && !taskData.tags.includes(rule.action_value)) {
            taskData.tags.push(rule.action_value);
            changesMade = true;
        } else if (rule.action_type === 'assign_user' && !taskData.assignees.includes(parseInt(rule.action_value))) {
            taskData.assignees.push(parseInt(rule.action_value));
            changesMade = true;
        } else if (rule.action_type === 'set_priority') {
            taskData.priority = rule.action_value;
            changesMade = true;
        }
    }
    if(changesMade) {
        await db.items.update(task.id, taskData);
        showToast(`Automation ran for "${task.title}"`);
        return true;
    }
    return false;
}

function renderAutomations() {
    const container = document.getElementById('automation-list');
    container.innerHTML = App.automations.length === 0 ? '<p class="text-gray-500">No automation rules created yet.</p>' : '';
    App.automations.forEach(rule => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg';
        const triggerText = automationDefs.triggers[rule.trigger_type];
        const actionText = automationDefs.actions[rule.action_type];
        div.innerHTML = `
            <div>
                <p class="font-semibold">WHEN <span>${triggerText}</span></p>
                <p class="font-semibold">THEN <span>${actionText}</span></p>
            </div>
            <button onclick="App.deleteAutomation(${rule.id})" class="text-sm text-red-600 hover:underline">Delete</button>
        `;
        container.appendChild(div);
    });
}