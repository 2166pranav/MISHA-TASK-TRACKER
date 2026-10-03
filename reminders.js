/* Poll the local API while a tracker page is open; deadlines and penalties are recorded server-side. */
(() => {
  const data = window.TrackerData;
  if (!data) return;
  let checking = false;
  function container() {
    let root = document.getElementById('toast-container');
    if (!root) { root = document.createElement('div'); root.id = 'toast-container'; root.setAttribute('aria-live', 'polite'); document.body.appendChild(root); }
    return root;
  }
  function chime() {
    try {
      const Context = window.AudioContext || window.webkitAudioContext; if (!Context) return;
      const context = new Context();
      [740, 988].forEach((frequency, index) => {
        const start = context.currentTime + index * 0.17; const oscillator = context.createOscillator(); const gain = context.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(0.12, start + 0.025); gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
        oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(start + 0.34);
      });
      window.setTimeout(() => context.close().catch(() => {}), 800);
    } catch (_) { /* Audio is best-effort. */ }
  }
  function showNotice(title, message, prominent = false) {
    const item = document.createElement('div'); item.className = prominent ? 'toast task-reminder-toast' : 'toast';
    if (!prominent) { item.textContent = message; container().appendChild(item); window.setTimeout(() => item.remove(), 6000); return; }
    item.setAttribute('role', 'alert'); item.setAttribute('aria-live', 'assertive');
    const heading = document.createElement('strong'); heading.className = 'task-reminder-heading'; heading.textContent = title;
    const body = document.createElement('span'); body.className = 'task-reminder-message'; body.textContent = message;
    const actions = document.createElement('div'); actions.className = 'task-reminder-actions';
    const open = document.createElement('a'); open.href = 'calendar.html'; open.textContent = 'Open calendar';
    const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.textContent = 'Dismiss'; dismiss.addEventListener('click', () => item.remove());
    actions.append(open, dismiss); item.append(heading, body, actions); container().appendChild(item); chime();
    window.setTimeout(() => item.remove(), 20000);
  }
  async function checkReminders() {
    if (checking || document.visibilityState === 'hidden') return;
    checking = true;
    try {
      const result = await data.request('/api/reminders/check', { method: 'POST', body: '{}' });
      const rewards = data.getRewards();
      const oldKarma = Number(rewards.points) || 0;
      rewards.points = Number(result.karma) || 0;
      if (oldKarma !== rewards.points) window.dispatchEvent(new CustomEvent('tracker:karma-updated', { detail: { karma: rewards.points } }));
      for (const event of result.events || []) {
        const isPenalty = event.kind === 'penalty';
        const isScheduled = event.kind === 'scheduled';
        const title = isPenalty ? 'Karma update' : isScheduled ? 'Task scheduled now' : 'Task reminder';
        const message = event.message || event.task || 'You have a task coming up.';
        if (!isScheduled && window.Notification && window.Notification.permission === 'granted') {
          try {
            const notification = new window.Notification(title, { body: message, tag: `task-${event.task}-${event.date}-${event.kind}` });
            notification.onclick = () => { window.focus(); window.location.href = 'calendar.html'; };
          } catch (_) { showNotice(title, message, isScheduled || isPenalty); }
        } else showNotice(title, message, isScheduled || isPenalty);
      }
      if ((result.events || []).some(event => event.kind === 'penalty')) await data.refresh();
    } catch (error) {
      if (error.status !== 401) console.warn('Reminder check could not reach the local server:', error.message);
    } finally { checking = false; }
  }
  data.ready.then(connected => { if (connected) checkReminders(); });
  window.setInterval(checkReminders, 15000);
  window.addEventListener('focus', checkReminders);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); });
})();
