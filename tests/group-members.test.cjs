'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFixture, agentFor, register } = require('./helpers.cjs');

test('group members normalize email, reject invalid/self addresses, and persist only within their account', async t => {
  const fixture = makeFixture(); t.after(fixture.cleanup);
  const alice = agentFor(fixture.app), bob = agentFor(fixture.app);
  assert.equal((await register(alice, 'Alice@Example.com', 'Alice')).status, 201);
  assert.equal((await register(bob, 'bob@example.com', 'Bob')).status, 201);
  const created = await alice.post('/api/group-members').send({ email: '  Friend@Example.org ' });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.members, ['friend@example.org']);
  assert.match(created.body.message, /Email delivery is not configured/);
  assert.deepEqual((await alice.get('/api/group-members')).body.members, ['friend@example.org']);
  assert.deepEqual((await bob.get('/api/group-members')).body.members, []);
  assert.deepEqual((await alice.get('/api/bootstrap?view=group')).body.groupMembers, ['friend@example.org']);
  assert.equal((await alice.post('/api/group-members').send({ email: 'friend@example.org' })).body.members.length, 1);
  assert.equal((await alice.post('/api/group-members').send({ email: 'not-an-email' })).status, 400);
  assert.equal((await alice.post('/api/group-members').send({ email: 'alice@example.com' })).status, 400);
});

test('group member list can be safely replaced and a member removed', async t => {
  const fixture = makeFixture(); t.after(fixture.cleanup);
  const agent = agentFor(fixture.app); await register(agent);
  const response = await agent.put('/api/group-members').send({ members: ['One@Example.org', 'one@example.org', 'bad', 'two@example.org'] });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.members, ['one@example.org', 'two@example.org']);
  const removed = await agent.delete('/api/group-members/one%40example.org');
  assert.deepEqual(removed.body.members, ['two@example.org']);
});
