'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFixture, agentFor, register, request } = require('./helpers.cjs');

test('profile name/email update and password change require the current password', async t => {
  const fixture = makeFixture(); t.after(fixture.cleanup);
  const agent = agentFor(fixture.app); await register(agent);
  const rejected = await agent.put('/api/profile').send({ name: 'Updated Planner', email: 'planner@example.com', currentPassword: 'wrong', newPassword: 'EvenSaferPassword456!' });
  assert.equal(rejected.status, 403);
  const changed = await agent.put('/api/profile').send({ name: 'Updated Planner', email: 'new@example.com', currentPassword: 'SafePassword123!', newPassword: 'EvenSaferPassword456!' });
  assert.equal(changed.status, 200); assert.equal(changed.body.profile.name, 'Updated Planner'); assert.equal(changed.body.profile.email, 'new@example.com');
  const login = agentFor(fixture.app);
  assert.equal((await login.post('/api/auth/login').send({ email: 'new@example.com', password: 'SafePassword123!' })).status, 401);
  assert.equal((await login.post('/api/auth/login').send({ email: 'new@example.com', password: 'EvenSaferPassword456!' })).status, 200);
});

test('profile email cannot be taken by another account', async t => {
  const fixture = makeFixture(); t.after(fixture.cleanup);
  const alice = agentFor(fixture.app), bob = agentFor(fixture.app);
  await register(alice, 'alice@example.com', 'Alice'); await register(bob, 'bob@example.com', 'Bob');
  const response = await bob.put('/api/profile').send({ name: 'Bob', email: 'alice@example.com' });
  assert.equal(response.status, 409);
});

test('multer avatar upload validates image signatures, stores the file and returns a local profile URL', async t => {
  const fixture = makeFixture(); t.after(fixture.cleanup);
  const agent = agentFor(fixture.app); await register(agent);
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const uploaded = await agent.post('/api/profile/avatar').attach('avatar', png, { filename: 'avatar.png', contentType: 'image/png' });
  assert.equal(uploaded.status, 200);
  assert.match(uploaded.body.profile.avatarUrl, /^\/uploads\/avatars\/.+\.png$/);
  const image = await request(fixture.app).get(uploaded.body.profile.avatarUrl);
  assert.equal(image.status, 200);
  const invalid = await agent.post('/api/profile/avatar').attach('avatar', Buffer.from('not an image'), { filename: 'fake.png', contentType: 'image/png' });
  assert.equal(invalid.status, 415);
});

test('authenticated users can remove their profile photo and delete its stored image', async t => {
  const fixture = makeFixture(); t.after(fixture.cleanup);
  assert.equal((await request(fixture.app).delete('/api/profile/avatar')).status, 401);
  const agent = agentFor(fixture.app); await register(agent);
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const uploaded = await agent.post('/api/profile/avatar').attach('avatar', png, { filename: 'avatar.png', contentType: 'image/png' });
  assert.equal(uploaded.status, 200);
  const oldUrl = uploaded.body.profile.avatarUrl;
  const removed = await agent.delete('/api/profile/avatar');
  assert.equal(removed.status, 200);
  assert.equal(removed.body.profile.avatarUrl, '/assets/default-avatar.svg');
  assert.equal((await request(fixture.app).get(oldUrl)).status, 404);
});
