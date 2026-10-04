'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const db = require('./db.js');

const ROOT = __dirname;
const SESSION_COOKIE = 'misha_tracker_session';
const SESSION_DEFAULT_MS = 8 * 60 * 60 * 1000;
const SESSION_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;
const MAX_TASKS = 5000;

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function addDateKey(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}
function occursOn(task, dateKey) {
  const rule = task.recurrence;
  if (!rule) return task.dueDate === dateKey;
  const startDate = rule.startDate || task.dueDate;
  if (dateKey < startDate) return false;
  if (rule.kind === 'weekdays') {
    const day = new Date(`${dateKey}T12:00:00`).getDay();
    return day >= 1 && day <= 5;
  }
  const interval = Math.max(1, Number(rule.intervalDays) || 1);
  const start = new Date(`${startDate}T12:00:00`);
  const current = new Date(`${dateKey}T12:00:00`);
  const days = Math.round((current - start) / 86400000);
  return days >= 0 && days % interval === 0;
}
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
}
function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
function emailValid(value) { return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function cleanText(value, max = 500) { return String(value == null ? '' : value).trim().slice(0, max); }
function safeArray(value, max = 1000) { return Array.isArray(value) ? value.slice(0, max) : []; }

function sanitizeTask(raw, usedIds) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  let id = raw.id;
  if (!(typeof id === 'string' || typeof id === 'number') || !String(id).trim() || String(id).length > 120 || usedIds.has(String(id))) id = crypto.randomUUID();
  usedIds.add(String(id));
  const dueDate = validDate(raw.dueDate) ? raw.dueDate : '';
  const scheduleStart = typeof raw.scheduleStart === 'string' && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(raw.scheduleStart) ? raw.scheduleStart : '';
  let recurrence = null;
  if (raw.recurrence && typeof raw.recurrence === 'object') {
    if (raw.recurrence.kind === 'weekdays') recurrence = { kind: 'weekdays', startDate: validDate(raw.recurrence.startDate) ? raw.recurrence.startDate : dueDate };
    else {
      const intervalDays = Math.max(1, Math.min(365, Number(raw.recurrence.intervalDays) || 1));
      recurrence = { kind: 'interval', intervalDays, startDate: validDate(raw.recurrence.startDate) ? raw.recurrence.startDate : dueDate, phrase: cleanText(raw.recurrence.phrase, 120) };
    }
  }
  const status = ['todo', 'in-progress', 'done'].includes(raw.status) ? raw.status : (raw.completed ? 'done' : 'todo');
  const subtasks = safeArray(raw.subtasks, 100).map(sub => typeof sub === 'string' ? { title: cleanText(sub, 250), completed: false } : ({ title: cleanText(sub && sub.title, 250), completed: Boolean(sub && sub.completed) })).filter(sub => sub.title);
  return {
    id,
    task: cleanText(raw.task, 300) || 'Untitled task',
    priority: ['high', 'medium', 'low'].includes(raw.priority) ? raw.priority : 'medium',
    category: cleanText(raw.category, 80) || 'Other',
    description: cleanText(raw.description, 10000),
    dueDate,
    folder: cleanText(raw.folder, 80),
    labels: safeArray(raw.labels, 30).map(label => cleanText(label, 60)).filter(Boolean),
    assignee: cleanText(raw.assignee, 254),
    completed: Boolean(raw.completed || status === 'done'),
    status: (raw.completed || status === 'done') ? 'done' : status,
    completedAt: raw.completedAt && !Number.isNaN(new Date(raw.completedAt).getTime()) ? new Date(raw.completedAt).toISOString() : null,
    pinned: Boolean(raw.pinned),
    subtasks,
    timerSeconds: Math.max(0, Math.min(100000000, Number(raw.timerSeconds) || 0)),
    timerStartedAt: Number(raw.timerStartedAt) > 0 ? Number(raw.timerStartedAt) : null,
    scheduleStart,
    scheduleText: cleanText(raw.scheduleText, 500),
    allDay: raw.allDay === true || !scheduleStart,
    durationMinutes: Math.max(15, Math.min(1440, Number(raw.durationMinutes) || 60)),
    recurrence,
    reminderMinutes: [0, 5, 10, 15, 30, 60].includes(Number(raw.reminderMinutes)) ? Number(raw.reminderMinutes) : 0,
    remindersSent: safeArray(raw.remindersSent, 200).map(value => cleanText(value, 100)),
    karmaAwarded: Boolean(raw.karmaAwarded),
    karmaPoints: Math.max(0, Number(raw.karmaPoints) || 0),
    createdAt: raw.createdAt && !Number.isNaN(new Date(raw.createdAt).getTime()) ? new Date(raw.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
function sanitizeHistory(entries) {
  return safeArray(entries, 500).map((entry, index) => ({
    id: cleanText(entry && entry.id, 140) || `history-${Date.now()}-${index}`,
    at: entry && entry.at && !Number.isNaN(new Date(entry.at).getTime()) ? new Date(entry.at).toISOString() : new Date().toISOString(),
    action: cleanText(entry && entry.action, 60) || 'activity',
    text: cleanText(entry && entry.text, 1000)
  }));
}
function sanitizeRewards(value) {
  const source = value && typeof value === 'object' ? value : {};
  const missed = source.missedOccurrences && typeof source.missedOccurrences === 'object' ? source.missedOccurrences : {};
  const checked = source.penaltyCheckedThrough && typeof source.penaltyCheckedThrough === 'object' ? source.penaltyCheckedThrough : {};
  return {
    points: Math.max(0, Math.min(1000000000, Math.floor(Number(source.points) || 0))),
    milestones: safeArray(source.milestones, 1000).map(item => cleanText(item, 100)),
    missedOccurrences: missed,
    penaltyCheckedThrough: checked
  };
}
function publicProfile(user) {
  return { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarPath || '/assets/default-avatar.svg', createdAt: user.createdAt };
}
function avatarType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { ext: 'png', mime: 'image/png' };
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}
function publicError(message, status = 400) { const error = new Error(message); error.status = status; return error; }
function asyncRoute(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }

async function getUserData(userId) {
  const pool = db.getPool();
  const [rows] = await pool.query('SELECT * FROM user_data WHERE userId = ?', [userId]);
  if (rows.length === 0) {
    const defaultData = { tasks: [], folders: [], history: [], groupMembers: [], rewards: sanitizeRewards({}) };
    await pool.query(
      'INSERT INTO user_data (userId, tasks, folders, history, groupMembers, rewards) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, JSON.stringify([]), JSON.stringify([]), JSON.stringify([]), JSON.stringify([]), JSON.stringify(defaultData.rewards)]
    );
    return defaultData;
  }
  return {
    tasks: rows[0].tasks || [],
    folders: rows[0].folders || [],
    history: rows[0].history || [],
    groupMembers: rows[0].groupMembers || [],
    rewards: rows[0].rewards || sanitizeRewards({})
  };
}

async function updateUserData(userId, field, value) {
  const pool = db.getPool();
  await pool.query(`UPDATE user_data SET ${field} = ? WHERE userId = ?`, [JSON.stringify(value), userId]);
}

async function appendHistory(userId, action, text, at = new Date().toISOString()) {
  const userData = await getUserData(userId);
  const history = userData.history;
  history.unshift({ id: crypto.randomUUID(), at, action: cleanText(action, 60), text: cleanText(text, 1000) });
  if (history.length > 500) history.length = 500;
  await updateUserData(userId, 'history', history);
}

async function createApp(options = {}) {
  await db.initDB();
  const pool = db.getPool();
  
  const avatarDir = options.avatarDir || process.env.AVATAR_DIR || process.env.VERCEL ? '/tmp/avatars' : path.join(ROOT, 'uploads', 'avatars');
  const clock = typeof options.now === 'function' ? options.now : () => new Date();
  fs.mkdirSync(avatarDir, { recursive: true });
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
  app.locals.avatarDir = avatarDir;
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors((req, callback) => {
    const origin = req.get('Origin');
    if (!origin) return callback(null, { credentials: true });
    try {
      const parsed = new URL(origin);
      const sameHost = parsed.host === req.get('host');
      const localDev = ['localhost:3000', '127.0.0.1:3000'].includes(parsed.host);
      return callback(null, { origin: sameHost || localDev ? origin : false, credentials: true });
    } catch (_) { return callback(null, { origin: false, credentials: true }); }
  }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.use('/api', (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const origin = req.get('Origin');
    if (!origin) return next();
    try {
      const parsed = new URL(origin);
      const sameHost = parsed.host === req.get('host');
      const localDev = ['localhost:3000', '127.0.0.1:3000'].includes(parsed.host);
      if (sameHost || localDev) return next();
    } catch (_) { /* Reject below. */ }
    return res.status(403).json({ error: 'Cross-origin request rejected.' });
  });

  app.use('/api', asyncRoute(async (req, _res, next) => {
    const token = req.cookies && req.cookies[SESSION_COOKIE];
    if (!token) return next();
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const [sessions] = await pool.query('SELECT * FROM sessions WHERE hash = ?', [hash]);
    const session = sessions[0];
    if (!session || session.expiresAt <= Date.now()) {
      if (session) await pool.query('DELETE FROM sessions WHERE hash = ?', [hash]);
      return next();
    }
    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [session.userId]);
    const user = users[0];
    if (user) { req.user = user; req.sessionHash = hash; }
    next();
  }));

  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Please wait and try again.' } });
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many authentication attempts. Please wait and try again.' } });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, callback) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) return callback(publicError('Upload a PNG, JPEG, or WebP image.', 415));
    callback(null, true);
  } });
  const requireAuth = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Please sign in to continue.', code: 'AUTH_REQUIRED' });
  function setSessionCookie(res, token, maxAge) {
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge });
  }
  async function createSession(userId, remember) {
    const token = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const maxAge = remember ? SESSION_REMEMBER_MS : SESSION_DEFAULT_MS;
    await pool.query('INSERT INTO sessions (hash, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)', [hash, userId, Date.now(), Date.now() + maxAge]);
    return { token, maxAge };
  }

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'misha-task-tracker', version: 1 }));
  app.post('/api/auth/register', authLimiter, asyncRoute(async (req, res) => {
    const name = cleanText(req.body && req.body.name, 80);
    const email = normalizeEmail(req.body && req.body.email);
    const password = String(req.body && req.body.password || '');
    if (name.length < 2) throw publicError('Please enter a name with at least 2 characters.');
    if (!emailValid(email)) throw publicError('Enter a valid email address.');
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) throw publicError(`Password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.`);
    
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) throw publicError('An account with that email already exists. Sign in instead.', 409);
    
    const passwordHash = await bcrypt.hash(password, 12);
    const user = { id: crypto.randomUUID(), name, email, passwordHash, avatarPath: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    
    await pool.query('INSERT INTO users (id, name, email, passwordHash, avatarPath, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user.id, user.name, user.email, user.passwordHash, user.avatarPath, user.createdAt, user.updatedAt]);
      
    await getUserData(user.id);
    await appendHistory(user.id, 'account', 'Created an account');

    const session = await createSession(user.id, true);
    setSessionCookie(res, session.token, session.maxAge);
    res.status(201).json({ profile: publicProfile(user), redirectTo: '/home.html' });
  }));
  
  app.post('/api/auth/login', authLimiter, asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body && req.body.email);
    const password = String(req.body && req.body.password || '');
    
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = users[0];
    
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw publicError('Email or password is incorrect.', 401);
    const session = await createSession(user.id, Boolean(req.body && req.body.remember));
    setSessionCookie(res, session.token, session.maxAge);
    res.json({ profile: publicProfile(user), redirectTo: '/home.html' });
  }));
  
  app.post('/api/auth/logout', requireAuth, asyncRoute(async (req, res) => {
    if (req.sessionHash) {
      await pool.query('DELETE FROM sessions WHERE hash = ?', [req.sessionHash]);
    }
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
    res.json({ ok: true });
  }));
  app.get('/api/auth/me', requireAuth, (req, res) => res.json({ profile: publicProfile(req.user) }));

  app.get('/api/bootstrap', requireAuth, asyncRoute(async (req, res) => {
    const userId = req.user.id;
    const view = cleanText(req.query.view, 30) || 'tasks';
    const today = localDateKey(clock());
    const userData = await getUserData(userId);
    const tasks = userData.tasks || [];
    const completed = task => Boolean(task.completed || task.status === 'done');
    const scoped = view === 'today' ? tasks.filter(task => task.dueDate === today && !completed(task))
      : view === 'upcoming' ? tasks.filter(task => task.dueDate >= today && !completed(task)) : tasks;
    const payload = { profile: publicProfile(req.user), view, viewTaskIds: scoped.map(task => String(task.id)) };
    if (['tasks', 'dashboard', 'calendar', 'history', 'settings', 'today', 'upcoming'].includes(view)) payload.tasks = tasks;
    if (['tasks', 'settings'].includes(view)) payload.folders = userData.folders || [];
    if (['history', 'settings'].includes(view)) payload.history = userData.history || [];
    if (['group', 'settings'].includes(view)) payload.groupMembers = userData.groupMembers || [];
    if (['tasks', 'dashboard', 'calendar', 'history', 'settings', 'today', 'upcoming'].includes(view)) payload.rewards = userData.rewards || sanitizeRewards({});
    res.json(payload);
  }));

  app.get('/api/tasks', requireAuth, asyncRoute(async (req, res) => {
    const userData = await getUserData(req.user.id);
    res.json({ tasks: userData.tasks || [] });
  }));
  app.put('/api/tasks', requireAuth, limiter, asyncRoute(async (req, res) => {
    if (!Array.isArray(req.body && req.body.tasks)) throw publicError('Tasks must be sent as a list.');
    if (req.body.tasks.length > MAX_TASKS) throw publicError(`A maximum of ${MAX_TASKS} tasks is supported.`);
    const ids = new Set();
    const tasks = req.body.tasks.map(item => sanitizeTask(item, ids)).filter(Boolean);
    await updateUserData(req.user.id, 'tasks', tasks);
    res.json({ tasks });
  }));
  app.delete('/api/tasks', requireAuth, asyncRoute(async (req, res) => {
    await updateUserData(req.user.id, 'tasks', []);
    res.json({ tasks: [] });
  }));

  app.get('/api/folders', requireAuth, asyncRoute(async (req, res) => {
    const userData = await getUserData(req.user.id);
    res.json({ folders: userData.folders || [] });
  }));
  app.put('/api/folders', requireAuth, asyncRoute(async (req, res) => {
    const folders = [...new Set(safeArray(req.body && req.body.folders, 250).map(value => cleanText(value, 80)).filter(Boolean))];
    await updateUserData(req.user.id, 'folders', folders);
    res.json({ folders });
  }));

  app.get('/api/history', requireAuth, asyncRoute(async (req, res) => {
    const userData = await getUserData(req.user.id);
    res.json({ history: userData.history || [] });
  }));
  app.put('/api/history', requireAuth, asyncRoute(async (req, res) => {
    if (!Array.isArray(req.body && req.body.history)) throw publicError('History must be sent as a list.');
    const history = sanitizeHistory(req.body.history);
    await updateUserData(req.user.id, 'history', history);
    res.json({ history });
  }));
  app.delete('/api/history', requireAuth, asyncRoute(async (req, res) => {
    const ids = Array.isArray(req.body && req.body.ids) ? new Set(req.body.ids.map(String)) : null;
    const userData = await getUserData(req.user.id);
    const history = ids ? (userData.history || []).filter(entry => !ids.has(String(entry.id))) : [];
    await updateUserData(req.user.id, 'history', history);
    res.json({ history });
  }));

  app.get('/api/group-members', requireAuth, asyncRoute(async (req, res) => {
    const userData = await getUserData(req.user.id);
    res.json({ members: userData.groupMembers || [] });
  }));
  app.post('/api/group-members', requireAuth, asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body && req.body.email);
    if (!emailValid(email)) throw publicError('Enter a valid email address.');
    if (email === req.user.email) throw publicError('You are already a member of this workspace.');
    const userData = await getUserData(req.user.id);
    const members = userData.groupMembers || [];
    if (!members.includes(email)) {
      members.push(email);
      await updateUserData(req.user.id, 'groupMembers', members);
    }
    res.status(201).json({ members, message: 'Member added to this workspace. Email delivery is not configured.' });
  }));
  app.put('/api/group-members', requireAuth, asyncRoute(async (req, res) => {
    const input = safeArray(req.body && req.body.members, 500).map(normalizeEmail);
    const members = [...new Set(input.filter(email => emailValid(email) && email !== req.user.email))];
    await updateUserData(req.user.id, 'groupMembers', members);
    res.json({ members });
  }));
  app.delete('/api/group-members/:email', requireAuth, asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.params.email);
    const userData = await getUserData(req.user.id);
    const members = (userData.groupMembers || []).filter(item => item !== email);
    await updateUserData(req.user.id, 'groupMembers', members);
    res.json({ members });
  }));

  app.get('/api/rewards', requireAuth, asyncRoute(async (req, res) => {
    const userData = await getUserData(req.user.id);
    res.json({ rewards: sanitizeRewards(userData.rewards) });
  }));
  app.put('/api/rewards', requireAuth, asyncRoute(async (req, res) => {
    const rewards = sanitizeRewards(req.body && req.body.rewards);
    await updateUserData(req.user.id, 'rewards', rewards);
    res.json({ rewards });
  }));

  app.get('/api/dashboard', requireAuth, asyncRoute(async (req, res) => {
    const userData = await getUserData(req.user.id);
    const tasks = userData.tasks || [];
    const today = localDateKey(clock());
    const done = task => Boolean(task.completed || task.status === 'done');
    const pending = tasks.filter(task => !done(task));
    const dueToday = tasks.filter(task => task.dueDate === today);
    const priorityScore = { high: 3, medium: 2, low: 1 };
    const recentTasks = pending.slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || priorityScore[b.priority] - priorityScore[a.priority] || (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99')).slice(0, 5);
    res.json({ total: tasks.length, completed: tasks.filter(done).length, inProgress: tasks.filter(task => task.status === 'in-progress').length, overdue: pending.filter(task => task.dueDate && task.dueDate < today).length, dueToday: dueToday.length, completedToday: dueToday.filter(done).length, recentTasks, karma: sanitizeRewards(userData.rewards).points });
  }));
  app.get('/api/calendar', requireAuth, asyncRoute(async (req, res) => {
    const userData = await getUserData(req.user.id);
    res.json({ tasks: userData.tasks || [] });
  }));

  app.get('/api/profile', requireAuth, (req, res) => res.json({ profile: publicProfile(req.user) }));
  app.put('/api/profile', requireAuth, asyncRoute(async (req, res) => {
    const name = cleanText(req.body && req.body.name, 80);
    const email = normalizeEmail(req.body && req.body.email);
    const currentPassword = String(req.body && req.body.currentPassword || '');
    const newPassword = String(req.body && req.body.newPassword || '');
    if (name.length < 2) throw publicError('Name must contain at least 2 characters.');
    if (!emailValid(email)) throw publicError('Enter a valid email address.');
    if (newPassword) {
      if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) throw publicError(`New password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.`);
      if (!currentPassword || !(await bcrypt.compare(currentPassword, req.user.passwordHash))) throw publicError('Current password is incorrect.', 403);
    }
    const newHash = newPassword ? await bcrypt.hash(newPassword, 12) : null;
    
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.user.id]);
    if (existing.length > 0) throw publicError('That email is already used by another account.', 409);
    
    req.user.name = name; 
    req.user.email = email; 
    req.user.updatedAt = new Date().toISOString();
    if (newHash) req.user.passwordHash = newHash;
    
    await pool.query('UPDATE users SET name = ?, email = ?, updatedAt = ?, passwordHash = ? WHERE id = ?', 
      [req.user.name, req.user.email, req.user.updatedAt, req.user.passwordHash, req.user.id]);
      
    res.json({ profile: publicProfile(req.user) });
  }));
  
  app.post('/api/profile/avatar', requireAuth, upload.single('avatar'), asyncRoute(async (req, res) => {
    if (!req.file) throw publicError('Choose an image to upload.');
    const type = avatarType(req.file.buffer);
    if (!type) throw publicError('The file is not a valid PNG, JPEG, or WebP image.', 415);
    const filename = `${req.user.id}-${crypto.randomUUID()}.${type.ext}`;
    const filePath = path.join(avatarDir, filename);
    await fs.promises.writeFile(filePath, req.file.buffer, { flag: 'wx', mode: 0o644 });
    let oldPath = '';
    let profile;
    try {
      oldPath = req.user.avatarPath || '';
      req.user.avatarPath = `/uploads/avatars/${filename}`;
      req.user.updatedAt = new Date().toISOString();
      await pool.query('UPDATE users SET avatarPath = ?, updatedAt = ? WHERE id = ?', [req.user.avatarPath, req.user.updatedAt, req.user.id]);
      profile = publicProfile(req.user);
    } catch (error) { await fs.promises.rm(filePath, { force: true }); throw error; }
    if (oldPath.startsWith('/uploads/avatars/')) await fs.promises.rm(path.join(avatarDir, path.basename(oldPath)), { force: true }).catch(() => {});
    res.json({ profile });
  }));

  app.delete('/api/profile/avatar', requireAuth, asyncRoute(async (req, res) => {
    let oldPath = req.user.avatarPath || '';
    req.user.avatarPath = '';
    req.user.updatedAt = new Date().toISOString();
    await pool.query('UPDATE users SET avatarPath = ?, updatedAt = ? WHERE id = ?', [req.user.avatarPath, req.user.updatedAt, req.user.id]);
    const profile = publicProfile(req.user);
    if (oldPath.startsWith('/uploads/avatars/')) await fs.promises.rm(path.join(avatarDir, path.basename(oldPath)), { force: true }).catch(() => {});
    res.json({ profile });
  }));

  app.post('/api/reminders/check', requireAuth, asyncRoute(async (req, res) => {
    const now = clock();
    const today = localDateKey(now);
    const tomorrow = addDateKey(today, 1);
    const grace = 5 * 60 * 1000;
    let events = [];
    let changed = false;
    
    const userData = await getUserData(req.user.id);
    const tasks = userData.tasks || [];
    const rewards = sanitizeRewards(userData.rewards);
    const history = userData.history || [];
    
    for (const task of tasks) {
      if (!Array.isArray(task.remindersSent)) task.remindersSent = [];
      const completed = Boolean(task.completed || task.status === 'done');
      const scheduleTime = task.scheduleStart && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(task.scheduleStart) ? task.scheduleStart.slice(11, 16) : '';
      if (!completed && scheduleTime && occursOn(task, today)) {
        const start = new Date(`${today}T${scheduleTime}:00`);
        const key = `scheduled:${today}T${scheduleTime}`;
        if (!Number.isNaN(start.getTime()) && now >= start && now.getTime() - start.getTime() <= grace && !task.remindersSent.includes(key)) {
          task.remindersSent.push(key); changed = true;
          events.push({ kind: 'scheduled', task: task.task, message: task.task, date: today });
        }
      }
      if (!completed && Number(task.reminderMinutes) > 0) {
        for (const date of [today, tomorrow]) {
          if (!occursOn(task, date)) continue;
          const start = scheduleTime ? new Date(`${date}T${scheduleTime}:00`) : new Date(`${date}T09:00:00`);
          const key = `lead:${date}T${scheduleTime || '09:00'}`;
          const remindAt = new Date(start.getTime() - Number(task.reminderMinutes) * 60000);
          if (now >= remindAt && now < start && !task.remindersSent.includes(key)) {
            task.remindersSent.push(key); changed = true;
            const amount = Number(task.reminderMinutes) >= 60 ? `${Number(task.reminderMinutes) / 60} hour${Number(task.reminderMinutes) > 60 ? 's' : ''}` : `${task.reminderMinutes} minutes`;
            events.push({ kind: 'lead', task: task.task, message: `Starting in ${amount}: ${task.task}`, date });
          }
        }
      }
    }
    const dateBeforeToday = addDateKey(today, -1);
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const recurrence = task.recurrence;
      const firstDate = recurrence && recurrence.startDate ? recurrence.startDate : task.dueDate;
      if (!validDate(firstDate) || firstDate > today) continue;
      const signature = recurrence ? `${recurrence.kind}:${recurrence.startDate}:${recurrence.intervalDays || ''}` : 'once';
      const scanKey = `${task.id}|${task.dueDate}|${task.scheduleStart || 'all-day'}|${signature}`;
      const checked = rewards.penaltyCheckedThrough[scanKey];
      let cursor = checked && checked >= firstDate ? addDateKey(checked, 1) : firstDate;
      const earliest = addDateKey(today, -3650);
      if (cursor < earliest) cursor = earliest;
      while (cursor <= dateBeforeToday) {
        if (occursOn(task, cursor) && applyPenalty(task, cursor, now, rewards, events, history)) changed = true;
        cursor = addDateKey(cursor, 1);
      }
      if (dateBeforeToday >= firstDate && (!checked || checked < dateBeforeToday)) {
        rewards.penaltyCheckedThrough[scanKey] = dateBeforeToday;
        changed = true;
      }
      if (today >= firstDate && occursOn(task, today) && applyPenalty(task, today, now, rewards, events, history)) changed = true;
    }
    if (changed) {
      await updateUserData(req.user.id, 'tasks', tasks);
      await updateUserData(req.user.id, 'rewards', rewards);
      await updateUserData(req.user.id, 'history', history.slice(0, 500));
    }
    res.json({ events, karma: sanitizeRewards(rewards).points });
  }));
  app.get('/api/export', requireAuth, asyncRoute(async (req, res) => {
    const userId = req.user.id;
    const userData = await getUserData(userId);
    const payload = { exportedAt: new Date().toISOString(), profile: publicProfile(req.user), tasks: userData.tasks || [], folders: userData.folders || [], history: userData.history || [], groupMembers: userData.groupMembers || [], rewards: sanitizeRewards(userData.rewards) };
    res.setHeader('Content-Disposition', 'attachment; filename="misha-task-tracker-backup.json"');
    res.json(payload);
  }));
  app.delete('/api/data', requireAuth, asyncRoute(async (req, res) => {
    await updateUserData(req.user.id, 'tasks', []);
    await updateUserData(req.user.id, 'folders', []);
    await updateUserData(req.user.id, 'history', []);
    await updateUserData(req.user.id, 'groupMembers', []);
    await updateUserData(req.user.id, 'rewards', sanitizeRewards({}));
    res.json({ ok: true });
  }));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use('/uploads/avatars', express.static(avatarDir, { dotfiles: 'deny', fallthrough: false, immutable: true, maxAge: '7d' }));
  app.use(express.static(ROOT, { index: 'index.html', dotfiles: 'ignore', fallthrough: true }));
  app.get('/', (_req, res) => res.sendFile(path.join(ROOT, 'home.html')));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    const status = Number(error.status || (error instanceof multer.MulterError ? 400 : 500));
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? 'Unexpected server error. Check the server terminal for details.' : error.message });
  });
  return app;
}

function applyPenalty(task, date, now, rewards, events, history) {
  const occurrenceId = `${task.id}@${date}`;
  if (rewards.missedOccurrences[occurrenceId]) return false;
  const time = task.scheduleStart && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(task.scheduleStart) ? task.scheduleStart.slice(11, 16) : '';
  const deadline = time ? new Date(`${date}T${time}:00`) : new Date(`${date}T23:59:59.999`);
  const pastDeadline = now.getTime() >= deadline.getTime();
  const completed = Boolean(task.completed || task.status === 'done');
  const completedAt = task.completedAt && !Number.isNaN(new Date(task.completedAt).getTime()) ? new Date(task.completedAt) : null;
  const missed = completed ? Boolean(completedAt && completedAt.getTime() > deadline.getTime()) : pastDeadline;
  if (!pastDeadline || !missed) return false;
  const before = Math.max(0, Number(rewards.points) || 0);
  const deducted = Math.min(5, before);
  rewards.points = before - deducted;
  rewards.missedOccurrences[occurrenceId] = { at: now.toISOString(), deducted };
  history.unshift({ id: crypto.randomUUID(), at: now.toISOString(), action: 'karma', text: `Missed “${task.task}” on ${date}: −${deducted} Karma` });
  events.push({ kind: 'penalty', task: task.task, message: `Missed “${task.task}” — ${deducted} Karma deducted.`, date, deducted });
  return true;
}

if (require.main === module) {
  createApp().then(app => {
    const port = Number(process.env.PORT || 3000);
    const host = process.env.HOST || '127.0.0.1';
    const server = app.listen(port, host, () => {
      console.log(`Misha Task Tracker running at http://${host}:${port}`);
    });
    const shutdown = () => server.close(() => process.exit(0));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { createApp, occursOn, localDateKey };
