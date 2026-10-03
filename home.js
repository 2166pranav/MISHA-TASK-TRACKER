let activityChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
  const data = window.TrackerData;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  let renderGeneration = 0;

  async function renderDashboard() {
    const generation = ++renderGeneration;
    const connected = await data.ready;
    if (!connected) return;
    let summary;
    try { summary = await data.request('/api/dashboard'); }
    catch (error) { data.showConnectionIssue(error.message); return; }
    if (generation !== renderGeneration) return;
    const tasks = data.loadTasks();
    const greeting = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening';
    document.getElementById('greetingText').textContent = `Good ${greeting}, ${data.user}!`;
    document.getElementById('statTotal').textContent = summary.total;
    document.getElementById('statCompleted').textContent = summary.completed;
    document.getElementById('statInProgress').textContent = summary.inProgress;
    document.getElementById('statOverdue').textContent = summary.overdue;
    const percent = summary.dueToday ? Math.round(summary.completedToday / summary.dueToday * 100) : 0;
    const ring = document.getElementById('dailyProgressRing');
    if (ring) ring.style.setProperty('--progress', `${percent * 3.6}deg`);
    const percentEl = document.getElementById('dailyProgressPercent'); if (percentEl) percentEl.textContent = `${percent}%`;
    const summaryEl = document.getElementById('dailyProgressSummary'); if (summaryEl) summaryEl.textContent = `${summary.completedToday} of ${summary.dueToday} due today completed`;
    const left = document.getElementById('dailyTasksLeft');
    if (left) { const remaining = summary.dueToday - summary.completedToday; left.textContent = remaining ? `${remaining} task${remaining === 1 ? '' : 's'} left today` : (summary.dueToday ? 'You are all caught up for today' : 'No tasks due today'); }
    refreshKarma();
    const recentList = document.getElementById('recentTasksList');
    recentList.innerHTML = '';
    const recent = Array.isArray(summary.recentTasks) ? summary.recentTasks : [];
    if (!recent.length) recentList.innerHTML = '<li class="empty-state"><span class="material-icons">task_alt</span><strong>No pending tasks</strong></li>';
    else recent.forEach(task => {
      const li = document.createElement('li');
      const date = task.dueDate ? new Date(`${task.dueDate}T00:00:00`) : null;
      const dateText = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No due date';
      li.innerHTML = `<div class="task-item-left"><div class="task-dot ${esc(task.priority)}"></div><div class="task-info"><h4 class="activity-task-title"><span class="activity-title-icon" aria-hidden="true">${data.activityIcon(task.task)}</span><span class="activity-title-text">${esc(task.task)}</span></h4><p>Due: ${esc(dateText)}</p></div></div><div class="task-status">${esc(task.folder || task.category || 'Task')}</div>`;
      recentList.appendChild(li);
    });
    try { if (window.Chart) renderChart(tasks); } catch (error) { console.error('Chart failed to render', error); }
  }

  function refreshKarma() {
    const node = document.getElementById('karmaTotal');
    if (node) node.textContent = data.getKarma().toLocaleString();
  }
  window.addEventListener('tracker:data-ready', renderDashboard);
  window.addEventListener('tracker:karma-updated', refreshKarma);
  window.addEventListener('tracker:theme-changed', updateChartTheme);
  data.ready.then(connected => { if (connected) renderDashboard(); });
});

function renderChart(tasks) {
  const canvas = document.getElementById('activityChart'); if (!canvas || !window.Chart) return;
  const labels = [], totalDue = [], completed = [];
  for (let offset = -3; offset <= 3; offset++) {
    const date = new Date(); date.setDate(date.getDate() + offset);
    const key = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    const onDate = tasks.filter(task => task.dueDate === key);
    labels.push(offset === 0 ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short' }));
    totalDue.push(onDate.length); completed.push(onDate.filter(task => task.completed || task.status === 'done').length);
  }
  const isDark = document.documentElement.dataset.theme === 'dark';
  if (activityChartInstance) activityChartInstance.destroy();
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
  const isDark = document.documentElement.dataset.theme === 'dark'; const text = isDark ? '#9ca3af' : '#6b7280';
  activityChartInstance.options.plugins.legend.labels.color = text;
  activityChartInstance.options.scales.x.ticks.color = text;
  activityChartInstance.options.scales.y.ticks.color = text;
  activityChartInstance.options.scales.y.grid.color = isDark ? '#374151' : '#e5e7eb';
  activityChartInstance.update();
}
