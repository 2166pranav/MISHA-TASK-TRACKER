'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'home.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'landing.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'landing.css'), 'utf8');
const breadSvg = fs.readFileSync(path.join(root, 'assets/task-bread-logo.svg'), 'utf8');

test('login and signup forms collect server-authenticated account credentials', () => {
  assert.match(html, /id="loginForm"/); assert.match(html, /id="signupForm"/);
  assert.match(html, /id="signupName"/); assert.match(html, /id="signupEmail"/); assert.match(html, /id="signupPassword"/);
  assert.match(html, /minlength="10"/); assert.match(html, /type="email"/);
  assert.match(js, /\/api\/auth\/login/); assert.match(js, /\/api\/auth\/register/);
  assert.match(js, /location\.assign\('tasks\.html'\)/);
  assert.doesNotMatch(js, /localStorage|sessionStorage/);
});

test('landing header uses bread with a printed checklist beside the Task Tracker wordmark', () => {
  assert.match(html, /class="brand-lockup" href="home\.html" aria-label="Task Tracker home"/);
  assert.match(html, /class="brand-mark" src="assets\/task-bread-logo\.svg"/);
  assert.match(html, /<span class="brand-word">Task Tracker<\/span>/);
  assert.doesNotMatch(html, />LOGO<\/a>/);
  assert.match(breadSvg, /#TASK/);
  assert.equal((breadSvg.match(/class="task-line"/g) || []).length, 3);
  assert.equal((breadSvg.match(/class="task-check"/g) || []).length, 2);
  assert.doesNotMatch(breadSvg, /<rect\b/);
  assert.match(css, /\.brand-lockup\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /\.brand-lockup\s*\{[^}]*align-items:\s*center/s);
  assert.match(css, /\.brand-mark\s*\{[^}]*width:\s*48px;[^}]*height:\s*auto/s);
  assert.match(css, /\.brand-word\s*\{[^}]*font-weight:\s*800/s);
});

test('login page communicates unsupported password recovery without claiming a real reset flow', () => {
  assert.match(html, /id="forgotPassword"/);
  assert.match(js, /Self-service password recovery is not configured/);
});
