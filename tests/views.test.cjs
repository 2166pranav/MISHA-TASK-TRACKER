'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFixture, agentFor, register } = require('./helpers.cjs');

test('Today and Upcoming bootstrap views return view-specific IDs and dashboard stats from server data', async t => {
  const fixture = makeFixture({ now: () => new Date('2026-10-03T12:00:00') }); t.after(fixture.cleanup);
  const agent = agentFor(fixture.app); await register(agent);
  await agent.put('/api/tasks').send({ tasks: [
    { id: 'today', task: 'Today task', dueDate: '2026-10-03' },
    { id: 'future', task: 'Future task', dueDate: '2026-10-05' },
    { id: 'past', task: 'Past task', dueDate: '2026-10-02' },
    { id: 'done', task: 'Completed task', dueDate: '2026-10-03', completed: true, status: 'done' }
  ] });
  const today = await agent.get('/api/bootstrap?view=today');
  assert.deepEqual(today.body.viewTaskIds, ['today']);
  const upcoming = await agent.get('/api/bootstrap?view=upcoming');
  assert.deepEqual(upcoming.body.viewTaskIds, ['today', 'future']);
  const dashboard = await agent.get('/api/dashboard');
  assert.equal(dashboard.body.total, 4); assert.equal(dashboard.body.completed, 1);
  assert.equal(dashboard.body.dueToday, 2); assert.equal(dashboard.body.completedToday, 1);
});
