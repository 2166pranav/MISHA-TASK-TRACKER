'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFixture, agentFor, register } = require('./helpers.cjs');

async function accountAt(now) {
  let current = new Date(now);
  const fixture = makeFixture({ now: () => new Date(current) });
  const agent = agentFor(fixture.app); await register(agent);
  return { ...fixture, agent, setNow: value => { current = new Date(value); } };
}

test('a missed timed occurrence deducts five Karma once and writes an audit history entry', async t => {
  const fixture = await accountAt('2026-10-05T12:00:00'); t.after(fixture.cleanup);
  await fixture.agent.put('/api/rewards').send({ rewards: { points: 12 } });
  await fixture.agent.put('/api/tasks').send({ tasks: [{ id: 101, task: 'Overdue meeting', dueDate: '2026-10-05', scheduleStart: '2026-10-05T09:00', completed: false, status: 'todo' }] });
  const first = await fixture.agent.post('/api/reminders/check').send({});
  assert.equal(first.status, 200);
  assert.equal(first.body.karma, 7);
  assert.equal(first.body.events.filter(event => event.kind === 'penalty').length, 1);
  assert.match((await fixture.agent.get('/api/history')).body.history[0].text, /−5 Karma/);
  const second = await fixture.agent.post('/api/reminders/check').send({});
  assert.equal(second.body.karma, 7);
  assert.equal(second.body.events.filter(event => event.kind === 'penalty').length, 0);
});

test('recurring missed occurrences are charged separately and the total never becomes negative', async t => {
  const fixture = await accountAt('2026-10-05T12:00:00'); t.after(fixture.cleanup);
  await fixture.agent.put('/api/rewards').send({ rewards: { points: 6 } });
  await fixture.agent.put('/api/tasks').send({ tasks: [{ id: 104, task: 'Every other day', dueDate: '2026-10-03', scheduleStart: '2026-10-03T08:00', recurrence: { kind: 'interval', intervalDays: 2, startDate: '2026-10-03' } }] });
  const result = await fixture.agent.post('/api/reminders/check').send({});
  const missed = result.body.events.filter(event => event.kind === 'penalty');
  assert.deepEqual(missed.map(event => event.date), ['2026-10-03', '2026-10-05']);
  assert.deepEqual(missed.map(event => event.deducted), [5, 1]);
  assert.equal(result.body.karma, 0);
  assert.equal((await fixture.agent.get('/api/history')).body.history.filter(item => item.action === 'karma').length, 2);
});

test('late completion is penalized, on-time completion is not, and all-day tasks wait until date end', async t => {
  const fixture = await accountAt('2026-10-05T12:00:00'); t.after(fixture.cleanup);
  await fixture.agent.put('/api/rewards').send({ rewards: { points: 20 } });
  await fixture.agent.put('/api/tasks').send({ tasks: [
    { id: 102, task: 'Completed late', dueDate: '2026-10-05', scheduleStart: '2026-10-05T09:00', completed: true, status: 'done', completedAt: '2026-10-05T09:05:00' },
    { id: 103, task: 'Completed on time', dueDate: '2026-10-05', scheduleStart: '2026-10-05T10:00', completed: true, status: 'done', completedAt: '2026-10-05T09:59:00' },
    { id: 105, task: 'All-day task', dueDate: '2026-10-05', allDay: true }
  ] });
  const today = await fixture.agent.post('/api/reminders/check').send({});
  assert.equal(today.body.karma, 15);
  assert.deepEqual(today.body.events.filter(event => event.kind === 'penalty').map(event => event.task), ['Completed late']);
  fixture.setNow('2026-10-06T00:01:00');
  const nextDay = await fixture.agent.post('/api/reminders/check').send({});
  assert.equal(nextDay.body.karma, 10);
  assert.ok(nextDay.body.events.some(event => event.kind === 'penalty' && event.task === 'All-day task'));
});
