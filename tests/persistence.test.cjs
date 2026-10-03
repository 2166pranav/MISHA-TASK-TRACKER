'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../server');
const { makeFixture, agentFor, register, request } = require('./helpers.cjs');

test('JSON database survives app restart and persists the authenticated workspace', async t => {
  const fixture = makeFixture(); t.after(fixture.cleanup);
  const firstAgent = agentFor(fixture.app);
  const signup = await register(firstAgent);
  const cookie = signup.headers['set-cookie'][0].split(';')[0];
  await firstAgent.put('/api/tasks').send({ tasks: [{ id: 'persistent', task: 'Survive restart', dueDate: '2026-10-03' }] });
  const disk = JSON.parse(fs.readFileSync(fixture.store.filename, 'utf8'));
  assert.equal(disk.tasks[fixture.store.data.users[0].id][0].task, 'Survive restart');
  assert.ok(disk.users[0].passwordHash.startsWith('$2'));

  const secondApp = createApp({ dataFile: path.join(fixture.directory, 'tracker.json'), avatarDir: path.join(fixture.directory, 'avatars') });
  const response = await request(secondApp).get('/api/tasks').set('Cookie', cookie);
  assert.equal(response.status, 200);
  assert.equal(response.body.tasks[0].task, 'Survive restart');
});
