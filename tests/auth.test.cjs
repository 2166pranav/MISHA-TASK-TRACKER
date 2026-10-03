'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { makeFixture, agentFor, register, request } = require('./helpers.cjs');

test('signup stores a bcrypt hash and establishes an HTTP-only session; logout invalidates it', async t => {
  const fixture = makeFixture(); t.after(fixture.cleanup);
  const agent = agentFor(fixture.app);
  const response = await register(agent, 'Planner@Example.com', 'Planner');
  assert.equal(response.status, 201);
  assert.equal(response.body.profile.email, 'planner@example.com');
  assert.equal('passwordHash' in response.body.profile, false);
  const stored = fixture.store.data.users[0];
  assert.notEqual(stored.passwordHash, 'SafePassword123!');
  assert.equal(await bcrypt.compare('SafePassword123!', stored.passwordHash), true);
  assert.match(response.headers['set-cookie'][0], /HttpOnly/i);
  assert.match(response.headers['set-cookie'][0], /SameSite=Lax/i);
  assert.equal((await agent.get('/api/tasks')).status, 200);
  assert.equal((await request(fixture.app).get('/api/tasks')).status, 401);
  assert.equal((await agent.post('/api/auth/logout').send({})).status, 200);
  assert.equal((await agent.get('/api/auth/me')).status, 401);
});

test('login verifies credentials and remember-me creates a longer-lived cookie', async t => {
  const fixture = makeFixture(); t.after(fixture.cleanup);
  const signup = agentFor(fixture.app); await register(signup);
  const wrong = await request(fixture.app).post('/api/auth/login').send({ email: 'planner@example.com', password: 'incorrect' });
  assert.equal(wrong.status, 401);
  const agent = agentFor(fixture.app);
  const response = await agent.post('/api/auth/login').send({ email: ' PLANNER@example.com ', password: 'SafePassword123!', remember: true });
  assert.equal(response.status, 200);
  assert.equal((await agent.get('/api/auth/me')).body.profile.name, 'Planner');
  assert.match(response.headers['set-cookie'][0], /Max-Age=2592000/);
});

test('registration validates name, email and password and blocks duplicate account email', async t => {
  const fixture = makeFixture(); t.after(fixture.cleanup);
  const agent = agentFor(fixture.app);
  assert.equal((await agent.post('/api/auth/register').send({ name: 'A', email: 'a@example.org', password: 'SafePassword123!' })).status, 400);
  assert.equal((await agent.post('/api/auth/register').send({ name: 'Alpha', email: 'bad', password: 'SafePassword123!' })).status, 400);
  assert.equal((await agent.post('/api/auth/register').send({ name: 'Alpha', email: 'alpha@example.org', password: 'short' })).status, 400);
  assert.equal((await register(agent, 'alpha@example.org', 'Alpha')).status, 201);
  const otherAgent = agentFor(fixture.app);
  const duplicate = await register(otherAgent, 'ALPHA@example.org', 'Another');
  assert.equal(duplicate.status, 409);
});

test('unauthenticated API requests do not disclose workspace data', async t => {
  const fixture = makeFixture(); t.after(fixture.cleanup);
  const response = await request(fixture.app).get('/api/bootstrap?view=settings');
  assert.equal(response.status, 401);
  assert.equal(response.body.code, 'AUTH_REQUIRED');
});
