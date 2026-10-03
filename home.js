document.addEventListener('DOMContentLoaded', () => {
  const data = window.TrackerData;
  const tasks = data.loadTasks();
  const user = data.user;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const today = data.todayKey();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  document.getElementById('greetingText').textContent = `Good ${greeting}, ${user}!`;
  const profile = document.querySelector('.user-profile span'); if (profile) profile.textContent = user;
  const avatar = document.querySelector('.user-profile img'); if (avatar) avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user)}&background=6366f1&color=fff`;
  const themeToggle = document.getElementById('themeToggle');
  themeToggle?.addEventListener('click', event => { event.preventDefault(); const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; localStorage.setItem('theme', next); updateChartTheme(); });

  const completed = tasks.filter(task => task.completed || task.status === 'done').length;
  const overdue = tasks.filter(task => !(task.completed || task.status === 'done') && task.dueDate && task.dueDate < today).length;
  document.getElementById('statTotal').textContent = tasks.length;
  document.getElementById('statCompleted').textContent = completed;
  document.getElementById('statInProgress').textContent = tasks.length - completed;
  document.getElementById('statOverdue').textContent = overdue;

  const dueToday = tasks.filter(task => task.dueDate === today);
  const doneToday = dueToday.filter(task => task.completed || task.status === 'done').length;
  const percent = dueToday.length ? Math.round(doneToday / dueToday.length * 100) : 0;
  const ring = document.getElementById('dailyProgressRing');
  if (ring) ring.style.setProperty('--progress', `${percent * 3.6}deg`);
  const percentEl = document.getElementById('dailyProgressPercent'); if (percentEl) percentEl.textContent = `${percent}%`;
  const summary = document.getElementById('dailyProgressSummary'); if (summary) summary.textContent = `${doneToday} of ${dueToday.length} due today completed`;
  const left = document.getElementById('dailyTasksLeft'); if (left) { const remaining = dueToday.length - doneToday; left.textContent = remaining ? `${remaining} task${remaining === 1 ? '' : 's'} left today` : (dueToday.length ? 'You are all caught up for today' : 'No tasks due today'); }
  const karma = document.getElementById('karmaTotal');
  const refreshKarma = () => { if (karma) karma.textContent = data.getKarma().toLocaleString(); };
  refreshKarma();
  window.addEventListener('tracker:karma-updated', refreshKarma);
  window.addEventListener('storage', event => { if (!event.key || event.key === data.keys.rewards) refreshKarma(); });

  const recentList = document.getElementById('recentTasksList');
  const pending = tasks.filter(task => !(task.completed || task.status === 'done')).sort((a, b) => {
    const weight = { high: 3, medium: 2, low: 1 };
    return Number(b.pinned) - Number(a.pinned) || (weight[b.priority] || 0) - (weight[a.priority] || 0) || (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99');
  });
  if (!pending.length) recentList.innerHTML = '<li class="empty-state"><span class="material-icons">task_alt</span><strong>No pending tasks</strong></li>';
  else pending.slice(0, 5).forEach(task => {
    const li = document.createElement('li');
    const date = task.dueDate ? new Date(`${task.dueDate}T00:00:00`) : null;
    const dateText = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No due date';
    li.innerHTML = `<div class="task-item-left"><div class="task-dot ${esc(task.priority)}"></div><div class="task-info"><h4 class="activity-task-title"><span class="activity-title-icon" aria-hidden="true">${data.activityIcon(task.task)}</span><span class="activity-title-text">${esc(task.task)}</span></h4><p>Due: ${esc(dateText)}</p></div></div><div class="task-status">${esc(task.folder || task.category || 'Task')}</div>`;
    recentList.appendChild(li);
  });
  try { if (window.Chart) renderChart(tasks); } catch (error) { console.error('Chart failed to render', error); }
});

let activityChartInstance = null;
function renderChart(tasks) {
  const canvas = document.getElementById('activityChart'); if (!canvas) return;
  const labels = [], totalDue = [], completed = [];
  for (let offset = -3; offset <= 3; offset++) {
    const date = new Date(); date.setDate(date.getDate() + offset);
    const key = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    const onDate = tasks.filter(task => task.dueDate === key);
    labels.push(offset === 0 ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short' }));
    totalDue.push(onDate.length); completed.push(onDate.filter(task => task.completed || task.status === 'done').length);
  }
  const isDark = document.documentElement.dataset.theme === 'dark';
  activityChartInstance = new Chart(canvas.getContext('2d'), { type: 'bar', data: { labels, datasets: [
    { label: 'Completed', data: completed, backgroundColor: '#10b981', borderRadius: 4 },
    { label: 'Total due', data: totalDue, backgroundColor: '#6366f1', borderRadius: 4 }
  ] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: isDark ? '#9ca3af' : '#6b7280' } } }, scales: {
    y: { beginAtZero: true, grid: { color: isDark ? '#374151' : '#e5e7eb' }, ticks: { color: isDark ? '#9ca3af' : '#6b7280', precision: 0 } },
    x: { grid: { display: false }, ticks: { color: isDark ? '#9ca3af' : '#6b7280' } }
  } } });
}
function updateChartTheme() {
  if (!activityChartInstance) return;
  const isDark = document.documentElement.dataset.theme === 'dark';
  const text = isDark ? '#9ca3af' : '#6b7280';
  activityChartInstance.options.plugins.legend.labels.color = text;
  activityChartInstance.options.scales.x.ticks.color = text;
  activityChartInstance.options.scales.y.ticks.color = text;
  activityChartInstance.options.scales.y.grid.color = isDark ? '#374151' : '#e5e7eb';
  activityChartInstance.update();
}
