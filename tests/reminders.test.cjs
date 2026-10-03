'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFixture, agentFor, register } = require('./helpers.cjs');

async function reminderFixture(dateTime, tasks) {
  const fixture = makeFixture({ now: () => new Date(dateTime) });
  const agent = agentFor(fixture.app); await register(agent);
  await agent.put('/api/tasks').send({ tasks });
  return { ...fixture, agent };
}

test('scheduled-time event is returned once per task occurrence and persisted', async t => {
  const fixture = await reminderFixture('2026-10-05T09:00:00', [{ id: 51, task: 'Reminder test', dueDate: '2026-10-05', scheduleStart: '2026-10-05T09:00', remindersSent: [] }]); t.after(fixture.cleanup);
  const first = await fixture.agent.post('/api/reminders/check').send({});
  assert.ok(first.body.events.some(event => event.kind === 'scheduled' && event.task === 'Reminder test'));
  const stored = (await fixture.agent.get('/api/tasks')).body.tasks[0];
  assert.ok(stored.remindersSent.includes('scheduled:2026-10-05T09:00'));
  const second = await fixture.agent.post('/api/reminders/check').send({});
  assert.equal(second.body.events.filter(event => event.kind === 'scheduled').length, 0);
});

test('lead-time reminder is raised ahead of the scheduled start', async t => {
  const fixture = await reminderFixture('2026-10-05T08:30:00', [{ id: 52, task: 'Upcoming call', dueDate: '2026-10-05', scheduleStart: '2026-10-05T09:00', reminderMinutes: 30 }]); t.after(fixture.cleanup);
  const result = await fixture.agent.post('/api/reminders/check').send({});
  assert.ok(result.body.events.some(event => event.kind === 'lead' && /Starting in 30 minutes: Upcoming call/.test(event.message)));
});

test('stale start alerts are not replayed and completed tasks do not receive reminders', async t => {
  const fixture = await reminderFixture('2026-10-05T09:20:00', [
    { id: 53, task: 'Stale start', dueDate: '2026-10-05', scheduleStart: '2026-10-05T09:00' },
    { id: 54, task: 'Done task', dueDate: '2026-10-05', scheduleStart: '2026-10-05T09:20', completed: true, status: 'done', reminderMinutes: 30 }
  ]); t.after(fixture.cleanup);
  const result = await fixture.agent.post('/api/reminders/check').send({});
  assert.equal(result.body.events.filter(event => event.kind === 'scheduled' || event.kind === 'lead').length, 0);
});
