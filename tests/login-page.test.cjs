'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'welcome.html'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const legacyLogin = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'landing.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'landing.css'), 'utf8');
const breadSvg = fs.readFileSync(path.join(root, 'assets/task-bread-logo.svg'), 'utf8');

test('login and signup forms collect server-authenticated account credentials', () => {
  assert.match(html, /id="loginForm"/); assert.match(html, /id="signupForm"/);
  assert.match(html, /id="signupName"/); assert.match(html, /id="signupEmail"/); assert.match(html, /id="signupPassword"/);
  assert.match(html, /minlength="10"/); assert.match(html, /type="email"/);
  assert.equal((html.match(/data-password-toggle=/g) || []).length, 3);
  assert.match(js, /\/api\/auth\/login/); assert.match(js, /\/api\/auth\/register/);
  assert.match(js, /input\.type = reveal \? 'text' : 'password'/);
  assert.match(js, /Accounts need the Node server/);
  assert.match(js, /location\.assign\('home\.html'\)/);
  assert.match(js, /rememberProfile\(result\.profile\)/);
  assert.match(js, /localStorage\.setItem\('authDisplayName'/);
  assert.doesNotMatch(js, /localStorage\.setItem\('currentUser'/);
  assert.doesNotMatch(js, /localStorage\.setItem\([^,]*password/i);
  assert.match(index, /href="welcome\.html" class="btn-primary">Get Started/);
  assert.match(legacyLogin, /url=welcome\.html/);
});

test('landing header uses bread with a printed checklist beside the Task Tracker wordmark', () => {
  assert.match(html, /class="brand-lockup" href="index\.html" aria-label="Task Tracker home"/);
  assert.match(html, /class="brand-mark" src="assets\/task-bread-logo\.svg"/);
  assert.match(html, /<span class="brand-word">Task Tracker<\/span>/);
  assert.doesNotMatch(html, />LOGO<\/a>/);
  assert.match(breadSvg, /#TASK/);
  assert.equal((breadSvg.match(/class="task-line"/g) || []).length, 3);
  assert.equal((breadSvg.match(/class="task-check"/g) || []).length, 2);
  assert.doesNotMatch(breadSvg, /<rect\b/);
  assert.match(css, /\.brand-lockup\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /\.brand-word\s*\{[^}]*font-weight:\s*800/s);
});

test('landing navigation only keeps Home and Get Started', () => {
  assert.match(index, /href="index\.html" class="active">Home/);
  assert.match(index, /href="welcome\.html" class="btn-primary">Get Started/);
  assert.doesNotMatch(index, /href="pricing\.html"/);
  assert.doesNotMatch(index, /href="contact\.html"/);
  assert.doesNotMatch(index, /href="faq\.html"/);
});

test('login page communicates unsupported password recovery without claiming a real reset flow', () => {
  assert.match(html, /id="forgotPassword"/);
  assert.match(js, /Self-service password recovery is not configured/);
});

test('Home page includes the six FAQs and login page has no guest access link', () => {
  assert.match(index, /id="homeFaqHeading">FAQs/);
  assert.equal((index.match(/<details>/g) || []).length, 6);
  assert.match(index, /What is Task Tracker\?/);
  assert.match(index, /Can I organize my tasks by deadlines\?/);
  assert.match(index, /Can I create tasks with my friends\?/);
  assert.match(index, /Can I see my completed tasks\?/);
  assert.match(index, /Can I edit or delete a task after creating it\?/);
  assert.match(index, /Is my account and task information secure\?/);
  assert.doesNotMatch(html, /FAQs/);
  assert.doesNotMatch(html, /Continue as Guest/);
  assert.doesNotMatch(js, /continueAsGuest/);
});
