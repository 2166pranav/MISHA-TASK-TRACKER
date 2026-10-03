/* Shared API-backed state and calendar helpers. The server is the persistence source of truth. */
(() => {
  const state = {
    profile: null,
    tasks: [],
    folders: [],
    history: [],
    groupMembers: [],
    rewards: { points: 0, milestones: [], missedOccurrences: {}, penaltyCheckedThrough: {} },
    scopeTaskIds: null,
    view: 'tasks'
  };
  const queues = new Map();
  const search = new URLSearchParams(window.location.search || '');
  const view = search.get('scope') || search.get('view') || document.body?.dataset.trackerView || 'tasks';
  state.view = view;

  const activityIconRules = [
    { icon: '🛒', words: ['groceries', 'grocery', 'supermarket', 'food shopping'] },
    { icon: '🦷', words: ['dentist', 'dental', 'tooth', 'teeth'] },
    { icon: '🧘', words: ['yoga', 'meditation', 'meditate', 'mindfulness', 'breathing'] },
    { icon: '💻', words: ['coding', 'code', 'programming', 'debug', 'software development'] },
    { icon: '📚', words: ['reading', 'read', 'book', 'novel'] },
    { icon: '🤝', words: ['meeting', 'standup', '1:1', 'appointment'] },
    { icon: '🏃', words: ['running', 'run', 'jog', 'exercise', 'workout', 'gym', 'fitness'] },
    { icon: '🩺', words: ['doctor', 'physician', 'clinic', 'medical'] },
    { icon: '🍳', words: ['cooking', 'cook', 'recipe', 'baking', 'bake', 'meal prep'] },
    { icon: '📧', words: ['email', 'inbox', 'emails'] },
    { icon: '🧹', words: ['cleaning', 'clean', 'vacuum', 'tidy'] },
    { icon: '🧺', words: ['laundry', 'wash clothes'] },
    { icon: '💳', words: ['bill', 'bills', 'payment', 'bank', 'budget'] },
    { icon: '📖', words: ['study', 'studying', 'learn', 'learning', 'exam', 'homework'] },
    { icon: '✍️', words: ['writing', 'write', 'essay', 'journal', 'draft'] },
    { icon: '🌱', words: ['plant', 'plants', 'gardening', 'garden', 'water plants'] },
    { icon: '✈️', words: ['travel', 'trip', 'flight', 'airport', 'vacation'] },
    { icon: '🎵', words: ['music', 'guitar', 'piano', 'singing', 'practice instrument'] },
    { icon: '🐕', words: ['dog', 'puppy', 'walk the dog'] },
    { icon: '🎨', words: ['design', 'drawing', 'draw', 'painting', 'art'] },
    { icon: '🔧', words: ['repair', 'fix', 'maintenance'] },
    { icon: '📞', words: ['phone call', 'call', 'phone'] },
    { icon: '🛍️', words: ['shopping', 'shop', 'purchase'] }
  ];
  function activityIcon(title) {
    const text = String(title ?? '').normalize('NFKC').toLowerCase();
    let best = null;
    for (const rule of activityIconRules) for (const word of rule.words) {
      const pattern = word.split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s_-]+');
      const match = new RegExp(`(^|[^a-z0-9])(${pattern})(?=$|[^a-z0-9])`, 'i').exec(text);
      if (!match) continue;
      const candidate = { icon: rule.icon, index: match.index + match[1].length, length: match[2].length };
      if (!best || candidate.index < best.index || (candidate.index === best.index && candidate.length > best.length)) best = candidate;
    }
    return best ? best.icon : '✅';
  }
  function todayKey(date = new Date()) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }
  function normalizeRecurrence(value, dueDate) {
    if (!value || typeof value !== 'object') return null;
    if (value.kind === 'weekdays') return { kind: 'weekdays', startDate: value.startDate || dueDate || todayKey() };
    const intervalDays = Math.max(1, Math.min(365, Number(value.intervalDays) || 1));
    return { kind: 'interval', intervalDays, startDate: value.startDate || dueDate || todayKey(), phrase: String(value.phrase || '') };
  }
  function normalizeTask(task, index = 0) {
    task = task && typeof task === 'object' ? task : {};
    const dueDate = String(task.dueDate || '');
    const scheduleStart = typeof task.scheduleStart === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(task.scheduleStart) ? task.scheduleStart : '';
    const complete = Boolean(task.completed || task.status === 'done');
    return {
      ...task,
      id: task.id ?? `task-${index}`,
      task: String(task.task || 'Untitled task'),
      priority: ['high', 'medium', 'low'].includes(task.priority) ? task.priority : 'medium',
      category: String(task.category || 'Other'),
      description: String(task.description || ''),
      dueDate,
      folder: String(task.folder || ''),
      labels: Array.isArray(task.labels) ? task.labels.map(String) : [],
      assignee: String(task.assignee || ''),
      pinned: Boolean(task.pinned),
      completed: complete,
      status: complete ? 'done' : (task.status === 'in-progress' ? 'in-progress' : 'todo'),
      completedAt: task.completedAt || null,
      subtasks: Array.isArray(task.subtasks) ? task.subtasks.map(sub => typeof sub === 'string' ? { title: sub, completed: false } : ({ title: String(sub.title || ''), completed: Boolean(sub.completed) })) : [],
      timerSeconds: Number(task.timerSeconds) || 0,
      timerStartedAt: Number(task.timerStartedAt) || null,
      scheduleStart,
      scheduleText: String(task.scheduleText || ''),
      allDay: task.allDay === true || !scheduleStart,
      durationMinutes: Math.max(15, Math.min(1440, Number(task.durationMinutes) || 60)),
      recurrence: normalizeRecurrence(task.recurrence, dueDate),
      reminderMinutes: [0, 5, 10, 15, 30, 60].includes(Number(task.reminderMinutes)) ? Number(task.reminderMinutes) : 0,
      remindersSent: Array.isArray(task.remindersSent) ? task.remindersSent : [],
      karmaAwarded: Boolean(task.karmaAwarded),
      karmaPoints: Number(task.karmaPoints) || 0
    };
  }
  function replaceArray(target, source, map = value => value) {
    const next = Array.isArray(source) ? source.map(map) : [];
    target.splice(0, target.length, ...next);
  }
  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail })); }
    catch (_) { try { window.dispatchEvent(new Event(name)); } catch (_) { /* Optional UI synchronization event. */ } }
  }
  function showConnectionIssue(message, loading = false) {
    let panel = document.getElementById('trackerConnectionState');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'trackerConnectionState';
      panel.className = 'tracker-connection-state';
      panel.setAttribute('role', 'alert');
      document.body.appendChild(panel);
    }
    panel.innerHTML = `<span class="material-icons" aria-hidden="true">${loading ? 'sync' : 'cloud_off'}</span><strong>${loading ? 'Connecting to your local server…' : 'Server connection unavailable'}</strong><p>${String(message).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))}</p>${loading ? '' : '<button type="button" class="btn-secondary" onclick="location.reload()">Retry connection</button>'}`;
    panel.hidden = false;
  }
  function hideConnectionIssue() {
    const panel = document.getElementById('trackerConnectionState');
    if (panel) panel.remove();
  }
  async function request(url, options = {}) {
    const headers = new Headers(options.headers || {});
    const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
    if (options.body && !isForm && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) {
      const error = new Error(payload?.error || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }
  function applyProfile(profile) {
    if (!profile) return;
    state.profile = profile;
    document.querySelectorAll('.user-profile span').forEach(el => { el.textContent = profile.name || 'User'; });
    document.querySelectorAll('.user-profile img').forEach(image => {
      image.src = profile.avatarUrl || '/assets/default-avatar.svg';
      image.alt = `${profile.name || 'User'} profile picture`;
    });
    document.querySelectorAll('[data-profile-name]').forEach(el => { el.textContent = profile.name || 'User'; });
    emit('tracker:profile-updated', profile);
  }
  async function hydrate({ quiet = false } = {}) {
    if (!quiet) showConnectionIssue('Loading your saved workspace data.', true);
    try {
      const payload = await request(`/api/bootstrap?view=${encodeURIComponent(view)}`);
      applyProfile(payload.profile);
      replaceArray(state.tasks, payload.tasks, normalizeTask);
      replaceArray(state.folders, payload.folders, value => String(value));
      replaceArray(state.history, payload.history);
      replaceArray(state.groupMembers, payload.groupMembers, value => String(value).toLowerCase());
      state.rewards = payload.rewards && typeof payload.rewards === 'object' ? payload.rewards : { points: 0, milestones: [], missedOccurrences: {}, penaltyCheckedThrough: {} };
      state.scopeTaskIds = Array.isArray(payload.viewTaskIds) ? new Set(payload.viewTaskIds.map(String)) : null;
      hideConnectionIssue();
      emit('tracker:data-ready', { view, payload });
      return true;
    } catch (error) {
      if (error.status === 401) {
        showConnectionIssue('Your sign-in is required. Returning to the login page…');
        const returnTo = `${window.location.pathname}${window.location.search}`;
        window.setTimeout(() => window.location.replace(`home.html?returnTo=${encodeURIComponent(returnTo)}`), 250);
      } else showConnectionIssue(error.message || 'Start the local Node.js server, then retry this page.');
      return false;
    }
  }
  const ready = hydrate();
  let channel = null;
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel('misha-task-tracker-sync');
    channel.addEventListener('message', event => {
      if (event.data && event.data.source !== window.__trackerTabId) hydrate({ quiet: true });
    });
  }
  const tabId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  window.__trackerTabId = tabId;
  function announce(resource) {
    if (channel) channel.postMessage({ resource, source: tabId, at: Date.now() });
    emit('tracker:resource-saved', { resource });
  }
  function persist(resource, url, body) {
    const snapshot = JSON.stringify(body);
    const previous = queues.get(resource) || Promise.resolve();
    const operation = previous.catch(() => {}).then(() => request(url, { method: 'PUT', body: snapshot }));
    queues.set(resource, operation);
    operation.then(() => announce(resource)).catch(error => emit('tracker:api-error', { message: error.message, resource }));
    return operation;
  }
  function occursOn(task, dateKey) {
    const rule = task.recurrence;
    if (!rule) return task.dueDate === dateKey;
    if (dateKey < rule.startDate) return false;
    if (rule.kind === 'weekdays') {
      const day = new Date(`${dateKey}T12:00:00`).getDay();
      return day >= 1 && day <= 5;
    }
    const from = new Date(`${rule.startDate}T12:00:00`);
    const to = new Date(`${dateKey}T12:00:00`);
    const diff = Math.round((to - from) / 86400000);
    return diff >= 0 && diff % rule.intervalDays === 0;
  }
  function getRewards() { return state.rewards && typeof state.rewards === 'object' ? state.rewards : (state.rewards = { points: 0 }); }
  function saveRewards() { return persist('rewards', '/api/rewards', { rewards: getRewards() }); }
  function addHistory(action, text) {
    state.history.unshift({ id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), action, text: String(text) });
    state.history.length = Math.min(state.history.length, 500);
    persist('history', '/api/history', { history: state.history });
  }
  function applyMissedTaskPenalties(tasks, now = new Date()) {
    const rewards = getRewards();
    rewards.missedOccurrences = rewards.missedOccurrences && typeof rewards.missedOccurrences === 'object' ? rewards.missedOccurrences : {};
    rewards.penaltyCheckedThrough = rewards.penaltyCheckedThrough && typeof rewards.penaltyCheckedThrough === 'object' ? rewards.penaltyCheckedThrough : {};
    const today = todayKey(now), penalties = [];
    const nextDateKey = key => { const date = new Date(`${key}T12:00:00`); date.setDate(date.getDate() + 1); return todayKey(date); };
    for (const task of tasks || []) {
      if (!task.dueDate) continue;
      const recurrence = normalizeRecurrence(task.recurrence, task.dueDate);
      const firstDate = recurrence ? recurrence.startDate : task.dueDate;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDate) || firstDate > today) continue;
      const completion = task.completedAt ? new Date(task.completedAt) : null;
      const signature = recurrence ? `${recurrence.kind}:${recurrence.startDate}:${recurrence.intervalDays || ''}` : 'once';
      const scanKey = `${task.id}|${task.dueDate}|${task.scheduleStart || 'all-day'}|${signature}`;
      const yesterdayDate = new Date(`${today}T12:00:00`); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterday = todayKey(yesterdayDate);
      let cursor = rewards.penaltyCheckedThrough[scanKey] ? nextDateKey(rewards.penaltyCheckedThrough[scanKey]) : firstDate;
      const earliest = nextDateKey(addDays(today, -3651));
      if (cursor < earliest) cursor = earliest;
      const evaluate = occurrenceDate => {
        if (!occursOn({ ...task, recurrence }, occurrenceDate)) return;
        const key = `${task.id}@${occurrenceDate}`;
        if (rewards.missedOccurrences[key]) return;
        const deadline = task.scheduleStart ? new Date(`${occurrenceDate}T${task.scheduleStart.slice(11, 16)}:00`) : new Date(`${occurrenceDate}T23:59:59.999`);
        const dueNow = now >= deadline;
        const completedLate = task.completed && completion && !Number.isNaN(completion.getTime()) && completion > deadline;
        if (!dueNow || (task.completed && !completedLate)) return;
        const deducted = Math.min(5, Math.max(0, Number(rewards.points) || 0));
        rewards.points = Math.max(0, (Number(rewards.points) || 0) - 5);
        rewards.missedOccurrences[key] = { at: now.toISOString(), deducted };
        penalties.push({ taskId: task.id, task: task.task, date: occurrenceDate, deducted });
        addHistory('karma', `Missed “${task.task}” on ${occurrenceDate}: −${deducted} Karma`);
      };
      while (cursor <= yesterday) { evaluate(cursor); cursor = nextDateKey(cursor); }
      if (yesterday >= firstDate) rewards.penaltyCheckedThrough[scanKey] = yesterday;
      if (today >= firstDate) evaluate(today);
    }
    if (penalties.length) saveRewards();
    return penalties;
  }
  function addDays(dateKey, days) { const date = new Date(`${dateKey}T12:00:00`); date.setDate(date.getDate() + days); return todayKey(date); }
  function awardCompletion(task, tasks) {
    if (task.karmaAwarded) return 0;
    const today = todayKey();
    const onTime = Boolean(task.dueDate && task.dueDate >= today);
    let earned = 10 + (onTime ? 5 : 0);
    task.karmaAwarded = true; task.karmaPoints = earned;
    const rewards = getRewards(); rewards.points = (Number(rewards.points) || 0) + earned;
    rewards.milestones = Array.isArray(rewards.milestones) ? rewards.milestones : [];
    const doneToday = (tasks || []).filter(item => item.completed && item.completedAt && item.completedAt.slice(0, 10) === today).length;
    const milestone = `${today}:${doneToday}`;
    if (doneToday > 0 && doneToday % 5 === 0 && !rewards.milestones.includes(milestone)) { rewards.milestones.push(milestone); rewards.points += 15; earned += 15; }
    saveRewards();
    emit('tracker:karma-updated', { karma: rewards.points });
    return earned;
  }
  function loadTasks() { return state.tasks; }
  function saveTasks(tasks) { replaceArray(state.tasks, tasks, normalizeTask); return persist('tasks', '/api/tasks', { tasks: state.tasks }); }
  function loadFolders() { return state.folders; }
  function saveFolders(folders) {
    replaceArray(state.folders, [...new Set((folders || []).map(String).map(value => value.trim()).filter(Boolean))]);
    return persist('folders', '/api/folders', { folders: state.folders });
  }
  function loadHistory() { return state.history; }
  function saveHistory(entries) { replaceArray(state.history, Array.isArray(entries) ? entries.slice(0, 500) : []); return persist('history', '/api/history', { history: state.history }); }
  function deleteHistoryEntries(ids) {
    const selected = new Set(Array.from(ids || [], String));
    const remaining = state.history.filter((entry, index) => !selected.has(String(entry.id || `${entry.at || 'unknown'}-${index}`)));
    saveHistory(remaining); return state.history.length;
  }
  async function clearHistory() {
    replaceArray(state.history, []);
    const result = await request('/api/history', { method: 'DELETE' });
    announce('history'); return result;
  }
  function normalizeEmails(values) {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    return values.map(value => String(value || '').trim().toLowerCase()).filter(email => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) return false;
      seen.add(email); return true;
    });
  }
  function loadGroupMembers() { return state.groupMembers; }
  function saveGroupMembers(members) {
    replaceArray(state.groupMembers, normalizeEmails(members));
    return persist('groupMembers', '/api/group-members', { members: state.groupMembers });
  }
  function getKarma() { return Number(getRewards().points) || 0; }
  function timePart(task) { return task.scheduleStart ? task.scheduleStart.slice(11, 16) : ''; }
  async function updateProfile(payload) {
    const result = await request('/api/profile', { method: 'PUT', body: JSON.stringify(payload) });
    applyProfile(result.profile); announce('profile'); return result.profile;
  }
  async function uploadAvatar(file) {
    const form = new FormData(); form.append('avatar', file);
    const result = await request('/api/profile/avatar', { method: 'POST', body: form });
    applyProfile(result.profile); announce('profile'); return result.profile;
  }
  async function logout() { await request('/api/auth/logout', { method: 'POST', body: '{}' }); window.location.assign('home.html'); }
  async function exportData() { return request('/api/export'); }
  async function clearAllData() {
    await request('/api/data', { method: 'DELETE', body: '{}' });
    replaceArray(state.tasks, []); replaceArray(state.folders, []); replaceArray(state.history, []); replaceArray(state.groupMembers, []);
    state.rewards = { points: 0, milestones: [], missedOccurrences: {}, penaltyCheckedThrough: {} };
    emit('tracker:data-ready', { view, payload: {} }); announce('all');
  }

  const api = {
    ready, view, todayKey, dateKey: todayKey, loadTasks, saveTasks, loadFolders, saveFolders, addHistory, loadHistory, saveHistory,
    deleteHistoryEntries, clearHistory, loadGroupMembers, saveGroupMembers, getKarma, getRewards, saveRewards,
    applyMissedTaskPenalties, awardCompletion, occursOn, timePart, activityIcon, normalizeTask, request, refresh: () => hydrate({ quiet: true }),
    updateProfile, uploadAvatar, logout, exportData, clearAllData, applyProfile, showConnectionIssue
  };
  Object.defineProperty(api, 'user', { get: () => state.profile?.name || 'User' });
  Object.defineProperty(api, 'profile', { get: () => state.profile });
  Object.defineProperty(api, 'scopeTaskIds', { get: () => state.scopeTaskIds });
  window.TrackerData = api;
  window.addEventListener('focus', () => { if (document.visibilityState !== 'hidden') hydrate({ quiet: true }); });
  window.addEventListener('tracker:api-error', event => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const item = document.createElement('div'); item.className = 'toast error'; item.setAttribute('role', 'alert'); item.textContent = event.detail?.message || 'Could not save changes to the server.'; container.appendChild(item); window.setTimeout(() => item.remove(), 5000);
  });
})();
