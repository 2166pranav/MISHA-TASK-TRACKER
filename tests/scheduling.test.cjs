const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function fakeStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
function loadTrackerData(seed) {
  const window = {};
  const localStorage = fakeStorage(seed);
  const context = { window, localStorage, Date, Math, Number, String, Boolean, Array, encodeURIComponent };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'tracker-data.js'), 'utf8'), context);
  return { data: window.TrackerData, localStorage };
}
function loadParser() {
  const window = {};
  const context = { window, Date, Math, Number, String, Boolean, Array, RegExp, Promise, setTimeout, clearTimeout, console };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'schedule-parser.js'), 'utf8'), context);
  return window.TaskScheduleParser;
}

test('legacy tasks remain all-day and receive safe scheduling defaults', () => {
  const { data } = loadTrackerData({ 'tp-tasks:Guest': JSON.stringify([{ id: 4, task: 'Legacy', dueDate: '2026-10-03' }]) });
  const task = data.loadTasks()[0];
  assert.equal(task.task, 'Legacy');
  assert.equal(task.scheduleStart, '');
  assert.equal(task.allDay, true);
  assert.equal(task.durationMinutes, 60);
  assert.equal(task.reminderMinutes, 0);
  assert.equal(task.recurrence, null);
});

test('occurrence helper supports every-N-day and weekday rules', () => {
  const { data } = loadTrackerData();
  const alternate = { dueDate: '2026-10-03', recurrence: { kind: 'interval', intervalDays: 2, startDate: '2026-10-03' } };
  assert.equal(data.occursOn(alternate, '2026-10-03'), true);
  assert.equal(data.occursOn(alternate, '2026-10-04'), false);
  assert.equal(data.occursOn(alternate, '2026-10-05'), true);
  const weekdays = { dueDate: '2026-10-02', recurrence: { kind: 'weekdays', startDate: '2026-10-02' } };
  assert.equal(data.occursOn(weekdays, '2026-10-02'), true);
  assert.equal(data.occursOn(weekdays, '2026-10-03'), false);
});

test('duration shortcuts are removed from the title and parsed', () => {
  const parser = loadParser();
  assert.deepEqual({ ...parser.parseDuration('Design review !30m') }, { title: 'Design review', minutes: 30, shortcut: true });
  assert.equal(parser.parseDuration('Write report !1h30m').minutes, 90);
  assert.equal(parser.parseDuration('Read', 45).minutes, 45);
});

test('natural language parses a single upcoming time in the local timezone', async () => {
  const parser = loadParser();
  const now = new Date(2026, 9, 2, 12, 0, 0);
  const result = await parser.parse('tomorrow at 7:30', now);
  assert.equal(result.date, '2026-10-03');
  assert.equal(result.time, '07:30');
  assert.equal(result.allDay, false);
});

test('every other day creates a recurrence beginning tomorrow at the parsed time', async () => {
  const parser = loadParser();
  const now = new Date(2026, 9, 2, 12, 0, 0);
  const result = await parser.parse('every other day at 7:30', now);
  assert.equal(result.date, '2026-10-03');
  assert.equal(result.time, '07:30');
  assert.equal(result.recurrence.intervalDays, 2);
  assert.equal(result.recurrence.startDate, '2026-10-03');
});

test('activity icons match title keywords only and use a generic fallback', () => {
  const { data } = loadTrackerData();
  assert.equal(data.activityIcon('Buy GROCERIES'), '🛒');
  assert.equal(data.activityIcon('Dentist appointment'), '🦷');
  assert.equal(data.activityIcon('Do yoga then buy groceries'), '🧘');
  assert.equal(data.activityIcon('Code review meeting'), '💻');
  assert.equal(data.activityIcon('Read 20 pages'), '📚');
  assert.equal(data.activityIcon('Ready for anything'), '✅');
  assert.equal(data.activityIcon('Quarterly planning'), '✅');
});
