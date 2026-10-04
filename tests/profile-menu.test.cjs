'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('round profile control and dropdown are dashboard-only', () => {
  const dashboard = read('home.html');
  assert.match(dashboard, /id="profileMenuButton" class="profile-menu-button"/);
  assert.match(dashboard, /aria-haspopup="menu"/);
  assert.match(dashboard, /id="profileMenu" class="profile-menu" role="menu"/);
  for (const page of ['tasks.html', 'calendar.html', 'history.html', 'settings.html']) {
    assert.doesNotMatch(read(page), /class="user-profile"|id="profileMenuButton"/);
  }
});

test('profile dropdown offers camera capture, file browsing, photo removal, and sign-out', () => {
  const html = read('home.html');
  const js = read('profile-menu.js');
  const css = read('profile-menu.css');
  assert.match(html, /id="takeProfilePhotoBtn"/);
  assert.match(html, /id="browseProfilePhotoBtn"/);
  assert.match(html, /id="removeProfilePhotoBtn"/);
  assert.match(html, /id="profileSignOutBtn"/);
  assert.match(html, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(html, /id="cameraModal"/);
  assert.match(html, /id="profileButtonPlaceholder" class="profile-placeholder material-icons"/);
  assert.match(js, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(js, /method: 'POST'.*body: formData/);
  assert.match(js, /method: 'DELETE'/);
  assert.match(js, /api\/auth\/logout/);
  assert.match(js, /window\.location\.assign\('login\.html'\)/);
  assert.match(css, /\.profile-menu-button\s*\{[^}]*border-radius:\s*50%/s);
});
