'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { createApp } = require('../server');

function makeFixture(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'misha-tracker-test-'));
  const app = createApp({ dataFile: path.join(directory, 'tracker.json'), avatarDir: path.join(directory, 'avatars'), now: options.now });
  return { app, store: app.locals.store, directory, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}
function agentFor(app) { return request.agent(app); }
async function register(agent, email = 'planner@example.com', name = 'Planner', password = 'SafePassword123!') {
  return agent.post('/api/auth/register').send({ name, email, password });
}
module.exports = { makeFixture, agentFor, register, request };
