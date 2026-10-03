const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture(points = 20) {
  const values = new Map([
    ['currentUser', 'Guest'],
    ['tp-Guest:rewards', JSON.stringify({ points })]
  ]);
  const localStorage = { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '..', 'tracker-data.js'), 'utf8'), { window, localStorage, Date, Math, Number, String, Boolean, Array, encodeURIComponent });
  return { data: window.TrackerData, localStorage };
}
const key = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

test('a timed task loses five Karma once after its scheduled start and is audited', () => {
  const { data } = fixture(12);
  const task = { id: 101, task: 'Overdue meeting', dueDate: '2026-10-02', scheduleStart: '2026-10-02T09:00', completed: false, status: 'todo' };
  const now = new Date(2026, 9, 2, 9, 1);
  assert.equal(data.applyMissedTaskPenalties([task], now).length, 1);
  assert.equal(data.getKarma(), 7);
  assert.equal(data.loadHistory().filter(entry => entry.action === 'karma').length, 1);
  assert.equal(data.applyMissedTaskPenalties([task], now).length, 0);
  assert.equal(data.getKarma(), 7);
});

test('late completion is penalized but completion before deadline is not', () => {
  const { data } = fixture(20);
  const late = { id: 102, task: 'Completed late', dueDate: '2026-10-02', scheduleStart: '2026-10-02T09:00', completed: true, status: 'done', completedAt: new Date(2026, 9, 2, 9, 5).toISOString() };
  const onTime = { id: 103, task: 'Completed on time', dueDate: '2026-10-02', scheduleStart: '2026-10-02T10:00', completed: true, status: 'done', completedAt: new Date(2026, 9, 2, 9, 59).toISOString() };
  const penalties = data.applyMissedTaskPenalties([late, onTime], new Date(2026, 9, 2, 12));
  assert.equal(penalties.length, 1);
  assert.equal(penalties[0].taskId, 102);
  assert.equal(data.getKarma(), 15);
});

test('recurring missed occurrences are charged separately and Karma cannot go below zero', () => {
  const { data } = fixture(6);
  const task = { id: 104, task: 'Every other day', dueDate: '2026-10-03', scheduleStart: '2026-10-03T08:00', completed: false, status: 'todo', recurrence: { kind: 'interval', intervalDays: 2, startDate: '2026-10-03' } };
  const penalties = data.applyMissedTaskPenalties([task], new Date(2026, 9, 5, 12));
  assert.deepEqual(Array.from(penalties, item => item.date), ['2026-10-03', '2026-10-05']);
  assert.equal(data.getKarma(), 0);
  assert.equal(data.applyMissedTaskPenalties([task], new Date(2026, 9, 5, 12)).length, 0);
  assert.equal(data.loadHistory().filter(entry => entry.action === 'karma').length, 2);
});

test('all-day tasks are not penalized until the local due date ends', () => {
  const { data } = fixture(10);
  const task = { id: 105, task: 'All day task', dueDate: '2026-10-03', scheduleStart: '', completed: false, status: 'todo' };
  assert.equal(data.applyMissedTaskPenalties([task], new Date(2026, 9, 3, 12)).length, 0);
  assert.equal(data.applyMissedTaskPenalties([task], new Date(2026, 9, 4, 0, 1)).length, 1);
  assert.equal(data.getKarma(), 5);
});
