const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('clearHistory removes activity log storage without modifying tasks or other user data', () => {
  const values = new Map([
    ['currentUser', 'Guest'],
    ['tp-tasks:Guest', JSON.stringify([{ id: 1, task: 'Keep this task' }])],
    ['tp-Guest:history', JSON.stringify([{ id: 'h1', action: 'created', text: 'Created test task' }])],
    ['tp-Guest:folders', JSON.stringify(['Work'])]
  ]);
  const localStorage = { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '..', 'tracker-data.js'), 'utf8'), { window, localStorage, Date, Math, Number, String, Boolean, Array, encodeURIComponent });
  const data = window.TrackerData;
  assert.equal(data.loadHistory().length, 1);
  data.clearHistory();
  assert.equal(values.has(data.keys.history), false);
  assert.equal(data.loadHistory().length, 0);
  assert.equal(data.loadTasks()[0].task, 'Keep this task');
  assert.deepEqual(Array.from(data.loadFolders()), ['Work']);
});

test('deleteHistoryEntries removes selected logs only and preserves tasks plus unselected history', () => {
  const values = new Map([
    ['currentUser', 'Guest'],
    ['tp-tasks:Guest', JSON.stringify([{ id: 1, task: 'Keep this task' }])],
    ['tp-Guest:history', JSON.stringify([{ id: 'h1', at: '2026-10-01T10:00:00.000Z', action: 'created', text: 'Keep log' }, { id: 'h2', at: '2026-10-02T10:00:00.000Z', action: 'deleted', text: 'Delete log' }])]
  ]);
  const localStorage = { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '..', 'tracker-data.js'), 'utf8'), { window, localStorage, Date, Math, Number, String, Boolean, Array, encodeURIComponent });
  const data = window.TrackerData;
  assert.equal(data.deleteHistoryEntries(['h2']), 1);
  assert.deepEqual(Array.from(data.loadHistory(), entry => entry.id), ['h1']);
  assert.equal(data.loadTasks()[0].task, 'Keep this task');
});
