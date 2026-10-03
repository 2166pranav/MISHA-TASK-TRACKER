/* Client-side reminder engine. Alerts run only while a Tasker page is open. */
(() => {
  const data = window.TrackerData;
  if (!data) return;
  const SCHEDULE_GRACE_MS = 5 * 60 * 1000;

  function getContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div'); container.id = 'toast-container';
      container.setAttribute('aria-live', 'polite'); document.body.appendChild(container);
    }
    return container;
  }
  function chime() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext();
      const playTone = (frequency, start) => {
        const oscillator = context.createOscillator(); const gain = context.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.12, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(start); oscillator.stop(start + 0.34);
      };
      const start = context.currentTime;
      playTone(740, start); playTone(988, start + 0.17);
      window.setTimeout(() => context.close().catch(() => {}), 800);
    } catch (_) { /* Audio is best-effort; browser policy may block it. */ }
  }
  function showNotice(title, message, prominent = false) {
    const item = document.createElement('div');
    item.className = prominent ? 'toast task-reminder-toast' : 'toast';
    if (!prominent) { item.textContent = message; getContainer().appendChild(item); window.setTimeout(() => item.remove(), 6000); return; }
    item.setAttribute('role', 'alert'); item.setAttribute('aria-live', 'assertive');
    const heading = document.createElement('strong'); heading.className = 'task-reminder-heading'; heading.textContent = title;
    const body = document.createElement('span'); body.className = 'task-reminder-message'; body.textContent = message;
    const actions = document.createElement('div'); actions.className = 'task-reminder-actions';
    const open = document.createElement('a'); open.href = 'calendar.html'; open.textContent = 'Open calendar';
    const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.textContent = 'Dismiss'; dismiss.setAttribute('aria-label', 'Dismiss task reminder'); dismiss.addEventListener('click', () => item.remove());
    actions.append(open, dismiss); item.append(heading, body, actions); getContainer().appendChild(item);
    chime();
    window.setTimeout(() => item.remove(), 20000);
  }
  function dueAt(task, dateKey) {
    if (!task.scheduleStart) return null;
    const time = task.scheduleStart.slice(11, 16);
    const value = new Date(`${dateKey}T${time}:00`);
    return Number.isNaN(value.getTime()) ? null : value;
  }
  function checkReminders() {
    const now = new Date();
    const tasks = data.loadTasks(); let changed = false;
    const penalties = data.applyMissedTaskPenalties(tasks, now);
    if (penalties.length) {
      try { window.dispatchEvent(new Event('tracker:karma-updated')); } catch (_) { /* UI event is a best-effort same-tab refresh. */ }
    }
    const today = data.todayKey(now);
    const tomorrowDate = new Date(now); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = data.todayKey(tomorrowDate);
    for (const task of tasks) {
      if (task.completed || task.status === 'done') continue;
      task.remindersSent = Array.isArray(task.remindersSent) ? task.remindersSent : [];
      // Alert when the scheduled start crosses the checker interval. A five-minute
      // grace also handles a tab that the browser briefly throttles in the background.
      if (task.scheduleStart) {
        const scheduledAt = dueAt(task, today);
        const key = `scheduled:${today}T${task.scheduleStart.slice(11, 16)}`;
        if (scheduledAt && data.occursOn(task, today) && now >= scheduledAt && now - scheduledAt <= SCHEDULE_GRACE_MS && !task.remindersSent.includes(key)) {
          task.remindersSent.push(key); changed = true;
          showNotice('Task scheduled now', task.task, true);
        }
      }
      if (!task.reminderMinutes) continue;
      for (const date of [today, tomorrow]) {
        if (!data.occursOn(task, date)) continue;
        const startAt = dueAt(task, date) || new Date(`${date}T09:00:00`);
        const reminderAt = new Date(startAt.getTime() - task.reminderMinutes * 60000);
        const key = `${date}T${task.scheduleStart ? task.scheduleStart.slice(11, 16) : '09:00'}`;
        if (now < reminderAt || now >= startAt || task.remindersSent.includes(key)) continue;
        task.remindersSent.push(key); changed = true;
        const mins = task.reminderMinutes >= 60 ? `${task.reminderMinutes / 60} hour${task.reminderMinutes > 60 ? 's' : ''}` : `${task.reminderMinutes} minutes`;
        const message = `Starting in ${mins}: ${task.task}`;
        const NotificationApi = window.Notification;
        if (NotificationApi && NotificationApi.permission === 'granted') {
          try {
            const notification = new NotificationApi('Task reminder', { body: message, tag: `task-${task.id}-${key}` });
            notification.onclick = () => { window.focus(); window.location.href = 'calendar.html'; };
          } catch (_) { showNotice('Task reminder', message); }
        } else showNotice('Task reminder', message);
      }
    }
    if (changed) data.saveTasks(tasks);
  }
  checkReminders();
  window.setInterval(checkReminders, 15000);
  window.addEventListener('focus', checkReminders);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); });
})();
