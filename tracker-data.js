/* Shared per-user storage and calendar helpers. Legacy tasks remain compatible. */
(function () {
  const user = localStorage.getItem('currentUser') || 'Guest';
  const encoded = encodeURIComponent(user);
  const prefix = `tp-${encoded}`;
  const keys = { tasks: `tp-tasks:${encoded}`, folders: `${prefix}:folders`, history: `${prefix}:history`, rewards: `${prefix}:rewards` };
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
    for (const rule of activityIconRules) {
      for (const word of rule.words) {
        const pattern = word.split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s_-]+');
        const match = new RegExp(`(^|[^a-z0-9])(${pattern})(?=$|[^a-z0-9])`, 'i').exec(text);
        if (!match) continue;
        const candidate = { icon: rule.icon, index: match.index + match[1].length, length: match[2].length };
        if (!best || candidate.index < best.index || (candidate.index === best.index && candidate.length > best.length)) best = candidate;
      }
    }
    return best ? best.icon : '✅';
  }

  function todayKey(date = new Date()) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }
  function read(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key)); return value == null ? fallback : value; }
    catch (_) { return fallback; }
  }
  function normalizeRecurrence(value, dueDate) {
    if (!value || typeof value !== 'object') return null;
    if (value.kind === 'weekdays') return { kind: 'weekdays', startDate: value.startDate || dueDate || todayKey() };
    const intervalDays = Math.max(1, Math.min(365, Number(value.intervalDays) || 0));
    return intervalDays ? { kind: 'interval', intervalDays, startDate: value.startDate || dueDate || todayKey(), phrase: String(value.phrase || '') } : null;
  }
  function loadTasks() {
    const saved = read(keys.tasks, []);
    if (!Array.isArray(saved)) return [];
    return saved.map((task, index) => {
      const dueDate = task.dueDate || '';
      const scheduleStart = typeof task.scheduleStart === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(task.scheduleStart) ? task.scheduleStart : '';
      return {
        ...task,
        id: task.id ?? Date.now() + index,
        task: String(task.task || 'Untitled task'),
        priority: task.priority || 'medium',
        category: task.category || 'Other',
        description: task.description || '',
        dueDate,
        folder: task.folder || '',
        pinned: Boolean(task.pinned),
        completed: Boolean(task.completed || task.status === 'done'),
        status: (task.completed || task.status === 'done') ? 'done' : (task.status === 'in-progress' ? 'in-progress' : 'todo'),
        subtasks: Array.isArray(task.subtasks) ? task.subtasks.map(sub => typeof sub === 'string' ? { title: sub, completed: false } : ({ title: String(sub.title || ''), completed: Boolean(sub.completed) })) : [],
        timerSeconds: Number(task.timerSeconds) || 0,
        timerStartedAt: Number(task.timerStartedAt) || null,
        scheduleStart,
        scheduleText: String(task.scheduleText || ''),
        allDay: task.allDay === true || !scheduleStart,
        durationMinutes: Math.max(15, Math.min(1440, Number(task.durationMinutes) || 60)),
        recurrence: normalizeRecurrence(task.recurrence, dueDate),
        reminderMinutes: [0, 5, 10, 15, 30, 60].includes(Number(task.reminderMinutes)) ? Number(task.reminderMinutes) : 0,
        remindersSent: Array.isArray(task.remindersSent) ? task.remindersSent : []
      };
    });
  }
  function saveTasks(tasks) { localStorage.setItem(keys.tasks, JSON.stringify(tasks)); }
  function loadFolders() {
    const value = read(keys.folders, []);
    return Array.isArray(value) ? [...new Set(value.map(String).map(item => item.trim()).filter(Boolean))] : [];
  }
  function saveFolders(folders) { localStorage.setItem(keys.folders, JSON.stringify([...new Set(folders)])); }
  function addHistory(action, text) {
    const entries = read(keys.history, []);
    entries.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), action, text: String(text) });
    localStorage.setItem(keys.history, JSON.stringify(entries.slice(0, 500)));
  }
  function loadHistory() { const entries = read(keys.history, []); return Array.isArray(entries) ? entries : []; }
  function saveHistory(entries) { localStorage.setItem(keys.history, JSON.stringify(Array.isArray(entries) ? entries.slice(0, 500) : [])); }
  function deleteHistoryEntries(ids) {
    const selected = new Set(Array.from(ids || [], String));
    const remaining = loadHistory().filter((entry, index) => !selected.has(String(entry.id || `${entry.at || 'unknown'}-${index}`)));
    saveHistory(remaining); return remaining.length;
  }
  function clearHistory() { localStorage.removeItem(keys.history); }
  function getRewards() { const value = read(keys.rewards, {}); return value && typeof value === 'object' ? value : {}; }
  function getKarma() { return Number(getRewards().points) || 0; }
  function applyMissedTaskPenalties(tasks, now = new Date()) {
    const rewards = getRewards();
    rewards.missedOccurrences = rewards.missedOccurrences && typeof rewards.missedOccurrences === 'object' ? rewards.missedOccurrences : {};
    rewards.penaltyCheckedThrough = rewards.penaltyCheckedThrough && typeof rewards.penaltyCheckedThrough === 'object' ? rewards.penaltyCheckedThrough : {};
    const today = todayKey(now), penalties = [];
    let rewardsChanged = false;
    const nextDateKey = dateKey => { const date = new Date(`${dateKey}T12:00:00`); date.setDate(date.getDate() + 1); return todayKey(date); };
    for (const task of tasks || []) {
      if (!task.dueDate) continue;
      const recurrence = normalizeRecurrence(task.recurrence, task.dueDate);
      const firstDate = recurrence ? recurrence.startDate : task.dueDate;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDate) || firstDate > today) continue;
      const completedAt = task.completedAt ? new Date(task.completedAt) : null;
      const canUseCompletionTime = completedAt && !Number.isNaN(completedAt.getTime());
      const ruleSignature = recurrence ? `${recurrence.kind}:${recurrence.startDate}:${recurrence.intervalDays || ''}` : 'once';
      const scanKey = `${task.id}|${task.dueDate}|${task.scheduleStart || 'all-day'}|${ruleSignature}`;
      const yesterdayDate = new Date(`${today}T12:00:00`); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterday = todayKey(yesterdayDate);
      let dateToScan = firstDate;
      const checkedThrough = rewards.penaltyCheckedThrough[scanKey];
      if (checkedThrough && checkedThrough >= dateToScan) dateToScan = nextDateKey(checkedThrough);

      const evaluateOccurrence = occurrenceDate => {
        if (!occursOn({ ...task, recurrence }, occurrenceDate)) return;
        const occurrenceId = `${task.id}@${occurrenceDate}`;
        if (rewards.missedOccurrences[occurrenceId]) return;
        let deadline;
        if (task.scheduleStart && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(task.scheduleStart)) deadline = new Date(`${occurrenceDate}T${task.scheduleStart.slice(11, 16)}:00`);
        else deadline = new Date(`${occurrenceDate}T23:59:59.999`);
        const dueNow = now.getTime() >= deadline.getTime();
        const missedBeforeCompletion = Boolean(task.completed && canUseCompletionTime && completedAt.getTime() > deadline.getTime());
        const missed = task.completed ? missedBeforeCompletion : dueNow;
        if (!dueNow || !missed) return;
        const before = Math.max(0, Number(rewards.points) || 0);
        const after = Math.max(0, before - 5);
        const deducted = before - after;
        rewards.points = after;
        rewards.missedOccurrences[occurrenceId] = { at: now.toISOString(), deducted };
        penalties.push({ taskId: task.id, task: task.task, date: occurrenceDate, deducted });
        addHistory('karma', `Missed “${task.task}” on ${occurrenceDate}: −${deducted} Karma`);
        rewardsChanged = true;
      };

      while (dateToScan <= yesterday) {
        evaluateOccurrence(dateToScan);
        dateToScan = nextDateKey(dateToScan);
      }
      if (yesterday >= firstDate && (!checkedThrough || checkedThrough < yesterday)) {
        rewards.penaltyCheckedThrough[scanKey] = yesterday;
        rewardsChanged = true;
      }
      if (today >= firstDate) evaluateOccurrence(today);
    }
    if (rewardsChanged) localStorage.setItem(keys.rewards, JSON.stringify(rewards));
    return penalties;
  }
  function awardCompletion(task, tasks) {
    if (task.karmaAwarded) return 0;
    const today = todayKey();
    const onTime = Boolean(task.dueDate && task.dueDate >= today);
    let earned = 10 + (onTime ? 5 : 0);
    task.karmaAwarded = true; task.karmaPoints = earned;
    const rewards = getRewards(); rewards.points = (Number(rewards.points) || 0) + earned;
    rewards.milestones = Array.isArray(rewards.milestones) ? rewards.milestones : [];
    const doneToday = tasks.filter(item => item.completed && item.completedAt && item.completedAt.slice(0, 10) === today).length;
    const milestone = `${today}:${doneToday}`;
    if (doneToday > 0 && doneToday % 5 === 0 && !rewards.milestones.includes(milestone)) { rewards.milestones.push(milestone); rewards.points += 15; earned += 15; }
    localStorage.setItem(keys.rewards, JSON.stringify(rewards));
    return earned;
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
  function dateKey(date) { return todayKey(date); }
  function timePart(task) { return task.scheduleStart ? task.scheduleStart.slice(11, 16) : ''; }

  window.TrackerData = { user, keys, todayKey, dateKey, loadTasks, saveTasks, loadFolders, saveFolders, addHistory, loadHistory, saveHistory, deleteHistoryEntries, clearHistory, getKarma, applyMissedTaskPenalties, awardCompletion, occursOn, timePart, activityIcon };
})();
