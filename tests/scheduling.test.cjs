'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { makeFixture, agentFor, register } = require('./helpers.cjs');
const root = path.resolve(__dirname, '..');

function loadParser() {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'schedule-parser.js'), 'utf8'), { window, Date, Math, Number, String, Boolean, Array, RegExp, Promise, setTimeout, clearTimeout, console });
  return window.TaskScheduleParser;
}
function loadActivityIcon() {
  const source = fs.readFileSync(path.join(root, 'tracker-data.js'), 'utf8');
  const rules = source.indexOf('  const activityIconRules = [');
  const start = source.indexOf('  function activityIcon(title) {');
  const end = source.indexOf('\n  function todayKey', start);
  if (rules < 0 || start < 0 || end < 0) throw new Error('Could not locate activity icon rules/helper');
  const context = {};
  vm.runInNewContext(`${source.slice(rules, start)}\n${source.slice(start, end)}\nthis.activityIcon = activityIcon;`, context);
  return context.activityIcon;
}

test('backend keeps legacy tasks all-day and clamps scheduling defaults', async t => {
  const fixture = makeFixture(); t.after(fixture.cleanup);
  const agent = agentFor(fixture.app); await register(agent);
  const response = await agent.put('/api/tasks').send({ tasks: [{ id: 'legacy', task: 'Legacy task', dueDate: '2026-10-03', timerSeconds: -5, durationMinutes: 0, ignoredPrivateField: 'not allowed' }] });
  assert.equal(response.status, 200);
  const task = response.body.tasks[0];
  assert.equal(task.task, 'Legacy task'); assert.equal(task.allDay, true); assert.equal(task.scheduleStart, '');
  assert.equal(task.durationMinutes, 60); assert.equal(task.reminderMinutes, 0); assert.equal(task.recurrence, null);
  assert.equal('ignoredPrivateField' in task, false);
});

test('server occurrence helper supports every-N-day and weekday rules', () => {
  const { occursOn } = require('../server');
  const alternate = { dueDate: '2026-10-03', recurrence: { kind: 'interval', intervalDays: 2, startDate: '2026-10-03' } };
  assert.equal(occursOn(alternate, '2026-10-03'), true); assert.equal(occursOn(alternate, '2026-10-04'), false); assert.equal(occursOn(alternate, '2026-10-05'), true);
  const weekdays = { dueDate: '2026-10-02', recurrence: { kind: 'weekdays', startDate: '2026-10-02' } };
  assert.equal(occursOn(weekdays, '2026-10-02'), true); assert.equal(occursOn(weekdays, '2026-10-03'), false);
});

test('duration shortcuts are removed from titles and parsed', () => {
  const parser = loadParser();
  assert.deepEqual({ ...parser.parseDuration('Design review !30m') }, { title: 'Design review', minutes: 30, shortcut: true });
  assert.equal(parser.parseDuration('Write report !1h30m').minutes, 90); assert.equal(parser.parseDuration('Read', 45).minutes, 45);
});

test('natural-language date parsing uses local calendar time', async () => {
  const parser = loadParser(); const now = new Date(2026, 9, 2, 12, 0, 0);
  const result = await parser.parse('tomorrow at 7:30', now);
  assert.equal(result.date, '2026-10-03'); assert.equal(result.time, '07:30'); assert.equal(result.allDay, false);
});

test('every-other-day phrase creates a two-day recurrence beginning tomorrow', async () => {
  const parser = loadParser(); const now = new Date(2026, 9, 2, 12, 0, 0);
  const result = await parser.parse('every other day at 7:30', now);
  assert.equal(result.date, '2026-10-03'); assert.equal(result.time, '07:30');
  assert.equal(result.recurrence.intervalDays, 2); assert.equal(result.recurrence.startDate, '2026-10-03');
});

test('activity title icons match case-insensitively, use earliest keyword and a generic fallback', () => {
  const icon = loadActivityIcon();
  assert.equal(icon('Buy GROCERIES'), '🛒'); assert.equal(icon('Dentist appointment'), '🦷');
  assert.equal(icon('Do yoga then buy groceries'), '🧘'); assert.equal(icon('Code review meeting'), '💻');
  assert.equal(icon('Read 20 pages'), '📚'); assert.equal(icon('Ready for anything'), '✅'); assert.equal(icon('Quarterly planning'), '✅');
});
