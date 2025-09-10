const LocalStorageDB = {
    _data: {},
    _storageKey: 'ProjectManagerData_v13',

    _load: function() {
        const rawData = localStorage.getItem(this._storageKey);
        let parsedData = null;
        if (rawData) {
            try { parsedData = JSON.parse(rawData); } catch (e) { console.error("Error parsing localStorage data, resetting database.", e); }
        }
        this._data = {
            projects: parsedData?.projects || [], items: parsedData?.items || [], columns: parsedData?.columns || [], automations: parsedData?.automations || [], links: parsedData?.links || [], templates: parsedData?.templates || [], tags: parsedData?.tags || [], users: parsedData?.users || [], activity: parsedData?.activity || [], checklistTemplates: parsedData?.checklistTemplates || [], _nextProjectId: parsedData?._nextProjectId || 1
        };
        if (!parsedData) {
             this._data.checklistTemplates = [
                { id: Date.now() + 1, name: 'Bug Report', items: [{text: 'Steps to reproduce'}, {text: 'Expected behavior'}, {text: 'Actual behavior'}, {text: 'Screenshots/Logs'}] },
                { id: Date.now() + 2, name: 'New Feature Workflow', items: [{text: 'Specification defined'}, {text: 'Design mockups created'}, {text: 'Backend implementation'}, {text: 'Frontend implementation'}, {text: 'Unit tests written'}, {text: 'QA passed'}] },
            ];
            this._save();
        }
    },
    _save: function() { try { localStorage.setItem(this._storageKey, JSON.stringify(this._data)); } catch (e) { console.error("Failed to save to localStorage", e); } },
    table: function(name) {
        const self = this;
        if (!self._data[name]) { console.error(`Table "${name}" does not exist.`); return {}; }
        return {
            add: item => { if (name === 'projects') item.id = self._data._nextProjectId++; if (['automations', 'checklistTemplates'].includes(name)) item.id = Date.now(); self._data[name].push(item); self._save(); return Promise.resolve(item.id); },
            get: id => { const findId = (['projects', 'links', 'automations', 'users', 'checklistTemplates'].includes(name)) ? parseInt(id) : id; return Promise.resolve(self._data[name].find(row => row.id == findId)); },
            update: (id, changes) => { const findId = (['projects', 'links', 'automations', 'users', 'checklistTemplates'].includes(name)) ? parseInt(id) : id; let item = self._data[name].find(row => row.id == findId); if (item) Object.assign(item, changes); self._save(); return Promise.resolve(1); },
            delete: id => { const findId = (['projects', 'links', 'automations', 'users', 'checklistTemplates'].includes(name)) ? parseInt(id) : id; self._data[name] = self._data[name].filter(row => row.id != findId); self._save(); return Promise.resolve(); },
            bulkDelete: ids => { const idSet = new Set(ids); self._data[name] = self._data[name].filter(row => !idSet.has(row.id)); self._save(); return Promise.resolve(); },
            toArray: () => Promise.resolve([...self._data[name]]),
            bulkAdd: items => { self._data[name].push(...items); self._save(); return Promise.resolve(); },
            bulkUpdate: updates => { updates.forEach(update => { let item = self._data[name].find(row => row.id === update.key); if(item) Object.assign(item, update.changes); }); self._save(); return Promise.resolve(); },
            where: query => { const results = self._data[name].filter(row => Object.keys(query).every(key => row[key] == query[key])); return { toArray: () => Promise.resolve(results), primaryKeys: () => Promise.resolve(results.map(r => r.id)), sortBy: sortKey => Promise.resolve([...results].sort((a, b) => a[sortKey] < b[sortKey] ? -1 : 1)) }; },
            sortBy: key => Promise.resolve([...self._data[name]].sort((a, b) => a[key] < b[key] ? -1 : 1))
        };
    },
    transaction: (mode, tables, callback) => Promise.resolve(callback())
};

LocalStorageDB._load();
export const db = {
    projects: LocalStorageDB.table('projects'), items: LocalStorageDB.table('items'), columns: LocalStorageDB.table('columns'), automations: LocalStorageDB.table('automations'), links: LocalStorageDB.table('links'), templates: LocalStorageDB.table('templates'), tags: LocalStorageDB.table('tags'), users: LocalStorageDB.table('users'), activity: LocalStorageDB.table('activity'), checklistTemplates: LocalStorageDB.table('checklistTemplates'), transaction: LocalStorageDB.transaction
};