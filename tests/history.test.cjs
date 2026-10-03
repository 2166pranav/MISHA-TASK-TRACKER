'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFixture, agentFor, register } = require('./helpers.cjs');

test('selective history deletion preserves unselected entries and active tasks', async t => {
  const fixture = makeFixture(); t.after(fixture.cleanup);
  const agent = agentFor(fixture.app); await register(agent);
  const tasks = [{ id: 'keep-task', task: 'Keep this task', dueDate: '2026-10-03' }];
  const history = [
    { id: 'h1', at: '2026-10-01T10:00:00.000Z', action: 'created', text: 'Keep log' },
    { id: 'h2', at: '2026-10-02T10:00:00.000Z', action: 'deleted', text: 'Delete log' }
  ];
  await agent.put('/api/tasks').send({ tasks }); await agent.put('/api/history').send({ history });
  const deleted = await agent.delete('/api/history').send({ ids: ['h2'] });
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body.history.map(item => item.id), ['h1']);
  assert.deepEqual((await agent.get('/api/tasks')).body.tasks.map(item => item.id), ['keep-task']);
});

test('clear history removes only the signed-in user activity log', async t => {
  const fixture = makeFixture(); t.after(fixture.cleanup);
  const alice = agentFor(fixture.app), bob = agentFor(fixture.app);
  await register(alice, 'alice@example.com', 'Alice'); await register(bob, 'bob@example.com', 'Bob');
  await alice.put('/api/tasks').send({ tasks: [{ id: 1, task: 'Preserved task' }] });
  await alice.put('/api/history').send({ history: [{ id: 'alice-history', action: 'created', text: 'Alice log' }] });
  await bob.put('/api/history').send({ history: [{ id: 'bob-history', action: 'created', text: 'Bob log' }] });
  assert.equal((await alice.delete('/api/history').send({})).status, 200);
  assert.deepEqual((await alice.get('/api/history')).body.history, []);
  assert.equal((await alice.get('/api/tasks')).body.tasks[0].task, 'Preserved task');
  assert.deepEqual((await bob.get('/api/history')).body.history.map(item => item.id), ['bob-history']);
});
