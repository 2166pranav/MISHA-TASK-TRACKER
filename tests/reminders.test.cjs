const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'reminders.js'), 'utf8');
function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function reminderFixture(tasks) {
  const notices = [];
  const container = { appendChild(child) { notices.push(child); } };
  const makeElement = tag => ({ tag, className: '', textContent: '', children: [], attrs: {}, listeners: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, fn) { this.listeners[k] = fn; }, append(...nodes) { this.children.push(...nodes); }, remove() { this.removed = true; } });
  const document = { hidden: false, getElementById: id => id === 'toast-container' ? container : null, createElement: makeElement, body: { appendChild() {} }, addEventListener() {} };
  const data = { loadTasks: () => tasks, saveTasks: next => { tasks.splice(0, tasks.length, ...next); }, todayKey: dateKey, occursOn: (task, date) => task.dueDate === date, applyMissedTaskPenalties: () => [] };
  let tick = () => {};
  let tones = 0;
  class AudioMock {
    constructor() { this.currentTime = 0; this.destination = {}; }
    createOscillator() { return { frequency: {}, connect() {}, start() { tones += 1; }, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    close() { return Promise.resolve(); }
  }
  const window = { TrackerData: data, AudioContext: AudioMock, setInterval(callback) { tick = callback; return 1; }, setTimeout() {}, addEventListener() {}, focus() {} };
  vm.runInNewContext(source, { window, document, setTimeout() {}, Date, String, Number, Array });
  return { tasks, notices, tick, toneCount: () => tones };
}
function baseTask(overrides = {}) {
  const now = new Date();
  return { id: 51, task: 'Reminder test', dueDate: dateKey(now), scheduleStart: `${dateKey(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, reminderMinutes: 0, remindersSent: [], completed: false, status: 'todo', recurrence: null, ...overrides };
}

test('scheduled-time alert is prominent and persisted once per task occurrence', () => {
  const fixture = reminderFixture([baseTask()]);
  assert.equal(fixture.notices.length, 1);
  assert.equal(fixture.notices[0].className, 'toast task-reminder-toast');
  assert.equal(fixture.notices[0].attrs.role, 'alert');
  assert.equal(fixture.notices[0].children[0].textContent, 'Task scheduled now');
  assert.equal(fixture.notices[0].children[1].textContent, 'Reminder test');
  assert.equal(fixture.tasks[0].remindersSent.length, 1);
  assert.equal(fixture.toneCount(), 2);
  fixture.tick();
  assert.equal(fixture.notices.length, 1);
});

test('lead-time reminder remains supported with an in-app notification', () => {
  const future = new Date(Date.now() + 20 * 60000);
  const task = baseTask({ dueDate: dateKey(future), scheduleStart: `${dateKey(future)}T${String(future.getHours()).padStart(2, '0')}:${String(future.getMinutes()).padStart(2, '0')}`, reminderMinutes: 30, remindersSent: [] });
  const fixture = reminderFixture([task]);
  assert.equal(fixture.notices.length, 1);
  assert.match(fixture.notices[0].textContent, /Starting in 30 minutes: Reminder test/);
  assert.equal(task.remindersSent.length, 1);
});

test('old scheduled events outside the catch-up window and completed tasks do not alert', () => {
  const old = new Date(Date.now() - 20 * 60000);
  const stale = baseTask({ scheduleStart: `${dateKey(old)}T${String(old.getHours()).padStart(2, '0')}:${String(old.getMinutes()).padStart(2, '0')}` });
  const done = baseTask({ id: 52, task: 'Done task', completed: true });
  const fixture = reminderFixture([stale, done]);
  assert.equal(fixture.notices.length, 0);
});
