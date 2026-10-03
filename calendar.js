(() => {
  const data = window.TrackerData;
  const grid = document.getElementById('calendarGrid');
  const label = document.getElementById('rangeLabel');
  const todaySummary = document.getElementById('todaySummary');
  const HOUR_PX = 56;
  let mode = 'upcoming';
  let offsetDays = 0;
  let tasks = data.loadTasks();
  let resizeSession = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const keyOf = date => data.dateKey(date);
  const today = () => new Date();
  const addDays = (date, amount) => { const next = new Date(date); next.setDate(next.getDate() + amount); return next; };
  const localDateTime = (date, minutes) => `${keyOf(date)}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  const dayLabel = date => date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const dateCaption = date => date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const timeLabel = minutes => { const d = new Date(); d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0); return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: minutes % 60 ? '2-digit' : undefined }); };
  const durationLabel = minutes => minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`;
  function toast(message) {
    let container = document.getElementById('toast-container');
    if (!container) { container = document.createElement('div'); container.id = 'toast-container'; container.setAttribute('aria-live', 'polite'); document.body.appendChild(container); }
    const item = document.createElement('div'); item.className = 'toast'; item.textContent = message; container.appendChild(item); setTimeout(() => item.remove(), 3000);
  }
  function isTimed(task) { return Boolean(task.scheduleStart && !task.allDay); }
  function occurrencesFor(date) { return tasks.filter(task => data.occursOn(task, keyOf(date))); }
  function scheduleStartFor(task, date) {
    if (!isTimed(task)) return '';
    const time = data.timePart(task);
    return `${keyOf(date)}T${time}`;
  }
  function createBlock(task, date) {
    const start = scheduleStartFor(task, date);
    const [hour, minute] = start.slice(11, 16).split(':').map(Number);
    const startMinutes = hour * 60 + minute;
    const duration = Math.max(15, Number(task.durationMinutes) || 60);
    const visibleDuration = Math.max(15, Math.min(duration, 1440 - startMinutes));
    const block = document.createElement('article');
    block.className = `time-block priority-${esc(task.priority || 'medium')} ${task.completed || task.status === 'done' ? 'is-complete' : ''}`;
    block.draggable = true; block.dataset.taskId = String(task.id); block.dataset.occurrenceDate = keyOf(date);
    block.setAttribute('aria-label', `${task.task}, ${dateCaption(date)}, ${timeLabel(startMinutes)}, ${durationLabel(duration)}. Drag to reschedule; use resize handle to change duration.`);
    block.title = 'Drag to move; drag the bottom handle to resize; double-click to edit';
    block.style.top = `${startMinutes / 60 * HOUR_PX}px`;
    block.style.height = `${Math.max(24, visibleDuration / 60 * HOUR_PX)}px`;
    block.innerHTML = `<span class="time-block-time">${esc(timeLabel(startMinutes))} · ${esc(durationLabel(duration))}</span><strong class="time-block-title"><span class="activity-title-icon" aria-hidden="true">${data.activityIcon(task.task)}</span><span class="activity-title-text">${esc(task.task)}</span></strong>${task.recurrence ? '<span class="time-block-repeat material-icons" aria-label="Repeats">sync</span>' : ''}<button type="button" class="resize-handle" aria-label="Resize task duration"></button>`;
    block.addEventListener('dragstart', event => {
      if (event.target.closest('.resize-handle')) { event.preventDefault(); return; }
      event.dataTransfer.setData('application/x-tasker-schedule', JSON.stringify({ id: task.id, date: keyOf(date) }));
      event.dataTransfer.setData('text/plain', String(task.id)); event.dataTransfer.effectAllowed = 'move'; block.classList.add('is-dragging');
    });
    block.addEventListener('dragend', () => block.classList.remove('is-dragging'));
    block.addEventListener('dblclick', event => { if (!event.target.closest('.resize-handle')) window.location.href = `tasks.html?edit=${encodeURIComponent(task.id)}`; });
    block.querySelector('.resize-handle').addEventListener('pointerdown', event => beginResize(event, task, block));
    return { element: block, startMinutes, endMinutes: startMinutes + visibleDuration };
  }
  function assignOverlapLanes(blocks) {
    blocks.sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
    const groups = []; let group = null;
    for (const block of blocks) {
      if (!group || block.startMinutes >= group.maxEnd) { group = { blocks: [], maxEnd: block.endMinutes }; groups.push(group); }
      group.blocks.push(block); group.maxEnd = Math.max(group.maxEnd, block.endMinutes);
    }
    for (const cluster of groups) {
      const lanes = [];
      for (const block of cluster.blocks) {
        let lane = lanes.findIndex(end => end <= block.startMinutes);
        if (lane < 0) lane = lanes.length;
        lanes[lane] = block.endMinutes; block.element.style.left = `calc(${lane / lanes.length * 100}% + 4px)`;
        block.element.dataset.lane = String(lane); block._lane = lane;
      }
      const laneCount = lanes.length;
      cluster.blocks.forEach(block => { block.element.style.left = `calc(${block._lane / laneCount * 100}% + 4px)`; block.element.style.width = `calc(${100 / laneCount}% - 8px)`; });
    }
  }
  function createAllDayCell(date) {
    const cell = document.createElement('div'); cell.className = 'all-day-cell'; cell.dataset.date = keyOf(date);
    const list = document.createElement('div'); list.className = 'all-day-list';
    const items = occurrencesFor(date).filter(task => !isTimed(task));
    items.forEach((task, index) => {
      const chip = document.createElement('div'); chip.className = `all-day-task ${task.completed ? 'is-complete' : ''}`; chip.title = task.task; chip.draggable = true;
      const icon = document.createElement('span'); icon.className = 'activity-title-icon'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = data.activityIcon(task.task);
      const title = document.createElement('span'); title.className = 'activity-title-text'; title.textContent = task.task;
      chip.append(icon, title);
      chip.dataset.taskId = String(task.id); chip.dataset.occurrenceDate = keyOf(date); chip.setAttribute('aria-label', `${task.task}, all day, ${dateCaption(date)}. Drag into a time slot to schedule.`);
      chip.addEventListener('dragstart', event => { event.dataTransfer.setData('application/x-tasker-schedule', JSON.stringify({ id: task.id, date: keyOf(date) })); event.dataTransfer.setData('text/plain', String(task.id)); event.dataTransfer.effectAllowed = 'move'; chip.classList.add('is-dragging'); });
      chip.addEventListener('dragend', () => chip.classList.remove('is-dragging'));
      chip.addEventListener('dblclick', () => { window.location.href = `tasks.html?edit=${encodeURIComponent(task.id)}`; });
      if (index >= 2) chip.classList.add('all-day-overflow');
      list.appendChild(chip);
    });
    cell.appendChild(list);
    if (items.length > 2) {
      const more = document.createElement('button'); more.type = 'button'; more.className = 'all-day-more'; more.textContent = `${items.length - 2} more`;
      more.setAttribute('aria-expanded', 'false');
      more.addEventListener('click', () => { const expanded = cell.classList.toggle('expanded'); more.setAttribute('aria-expanded', String(expanded)); more.textContent = expanded ? 'Show less' : `${items.length - 2} more`; });
      cell.appendChild(more);
    }
    cell.addEventListener('dragover', event => { event.preventDefault(); cell.classList.add('drop-target'); });
    cell.addEventListener('dragleave', event => { if (!cell.contains(event.relatedTarget)) cell.classList.remove('drop-target'); });
    cell.addEventListener('drop', event => { event.preventDefault(); cell.classList.remove('drop-target'); handleDrop(event, keyOf(date), null); });
    return cell;
  }
  function createTimeColumn(date) {
    const column = document.createElement('div'); column.className = 'time-column'; column.dataset.date = keyOf(date); column.setAttribute('aria-label', `${dateCaption(date)} time grid`);
    const events = document.createElement('div'); events.className = 'time-events';
    const blocks = occurrencesFor(date).filter(isTimed).map(task => createBlock(task, date));
    assignOverlapLanes(blocks); blocks.forEach(block => events.appendChild(block.element)); column.appendChild(events);
    if (keyOf(date) === data.todayKey()) {
      const line = document.createElement('div'); line.className = 'current-time-indicator'; line.setAttribute('aria-label', 'Current time'); line.setAttribute('role', 'presentation');
      line.style.top = `${(today().getHours() * 60 + today().getMinutes()) / 60 * HOUR_PX}px`; column.appendChild(line);
    }
    column.addEventListener('dragover', event => { event.preventDefault(); column.classList.add('drop-target'); event.dataTransfer.dropEffect = 'move'; });
    column.addEventListener('dragleave', event => { if (!column.contains(event.relatedTarget)) column.classList.remove('drop-target'); });
    column.addEventListener('drop', event => {
      event.preventDefault(); column.classList.remove('drop-target'); const rect = column.getBoundingClientRect();
      const mins = Math.max(0, Math.min(1439, Math.round((event.clientY - rect.top) / HOUR_PX * 4) * 15)); handleDrop(event, keyOf(date), mins);
    });
    return column;
  }
  function beginResize(event, task, block) {
    event.preventDefault(); event.stopPropagation();
    resizeSession = { id: task.id, startY: event.clientY, original: task.durationMinutes || 60, block };
    block.classList.add('is-resizing'); document.body.classList.add('calendar-resizing');
    window.addEventListener('pointermove', onResizeMove); window.addEventListener('pointerup', onResizeEnd, { once: true });
  }
  function onResizeMove(event) {
    if (!resizeSession) return;
    const delta = event.clientY - resizeSession.startY;
    const duration = Math.max(15, Math.min(1440, Math.round((resizeSession.original + delta / HOUR_PX * 60) / 15) * 15));
    resizeSession.preview = duration;
    const date = resizeSession.block.dataset.occurrenceDate;
    const task = tasks.find(item => String(item.id) === String(resizeSession.id));
    const start = task?.scheduleStart ? Number(task.scheduleStart.slice(11, 13)) * 60 + Number(task.scheduleStart.slice(14, 16)) : 0;
    resizeSession.block.style.height = `${Math.max(24, Math.min(duration, 1440 - start) / 60 * HOUR_PX)}px`;
    resizeSession.block.querySelector('.time-block-time').textContent = `${timeLabel(start)} · ${durationLabel(duration)}`;
  }
  function onResizeEnd() {
    if (!resizeSession) return;
    const { id, preview, block } = resizeSession; block.classList.remove('is-resizing'); document.body.classList.remove('calendar-resizing');
    window.removeEventListener('pointermove', onResizeMove);
    if (preview) {
      tasks = data.loadTasks(); const task = tasks.find(item => String(item.id) === String(id));
      if (task) { task.durationMinutes = preview; data.saveTasks(tasks); data.addHistory('schedule', `Resized “${task.task}” to ${durationLabel(preview)}`); }
    }
    resizeSession = null; render();
  }
  function handleDrop(event, targetDate, targetMinutes) {
    let payload;
    try { payload = JSON.parse(event.dataTransfer.getData('application/x-tasker-schedule') || '{}'); } catch (_) { payload = {}; }
    const id = Number(payload.id || event.dataTransfer.getData('text/plain'));
    tasks = data.loadTasks(); const task = tasks.find(item => Number(item.id) === id); if (!task) return;
    const oldDate = task.dueDate; const oldStart = task.scheduleStart || '';
    task.dueDate = targetDate;
    if (task.recurrence) task.recurrence.startDate = targetDate;
    if (targetMinutes == null) {
      task.scheduleStart = ''; task.allDay = true;
      task.scheduleText = task.recurrence ? `${task.recurrence.phrase || 'Every day'} starting ${targetDate}` : '';
    } else {
      task.scheduleStart = localDateTime(new Date(`${targetDate}T12:00:00`), targetMinutes); task.allDay = false;
      task.scheduleText = `${task.recurrence ? `${task.recurrence.phrase || 'Every day'} starting ` : ''}${targetDate} at ${task.scheduleStart.slice(11, 16)}`;
    }
    if (oldDate === task.dueDate && oldStart === task.scheduleStart) { render(); return; }
    task.remindersSent = [];
    data.saveTasks(tasks);
    const detail = task.scheduleStart ? `to ${targetDate} at ${task.scheduleStart.slice(11, 16)}` : `to all day on ${targetDate}`;
    data.addHistory('rescheduled', `Rescheduled “${task.task}” from ${oldStart || oldDate || 'unscheduled'} ${detail}`);
    toast(`Rescheduled “${task.task}”`); render();
  }
  function updateTodaySummary(date) {
    const tasksToday = occurrencesFor(date);
    const timed = tasksToday.filter(isTimed);
    const totalMinutes = timed.reduce((sum, task) => sum + (Number(task.durationMinutes) || 60), 0);
    const hours = totalMinutes / 60;
    document.getElementById('todayTaskCount').textContent = `${tasksToday.length} task${tasksToday.length === 1 ? '' : 's'}`;
    document.getElementById('todayScheduledHours').textContent = `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h scheduled`;
  }
  function render() {
    tasks = data.loadTasks(); grid.innerHTML = '';
    const base = addDays(today(), offsetDays); base.setHours(12, 0, 0, 0);
    const count = mode === 'today' ? 1 : 5;
    const dates = Array.from({ length: count }, (_, i) => addDays(base, i));
    const first = dates[0], last = dates[dates.length - 1];
    label.textContent = mode === 'today' ? dateCaption(first) : `${dayLabel(first)} – ${dayLabel(last)}`;
    todaySummary.hidden = mode !== 'today';
    if (mode === 'today') updateTodaySummary(first);
    document.getElementById('viewUpcoming').classList.toggle('active', mode === 'upcoming');
    document.getElementById('viewToday').classList.toggle('active', mode === 'today');
    document.getElementById('viewUpcoming').setAttribute('aria-pressed', String(mode === 'upcoming'));
    document.getElementById('viewToday').setAttribute('aria-pressed', String(mode === 'today'));
    grid.style.setProperty('--day-count', count);
    const corner = document.createElement('div'); corner.className = 'schedule-time-heading'; corner.textContent = 'Local time'; grid.appendChild(corner);
    dates.forEach(date => {
      const head = document.createElement('div'); head.className = `schedule-day-heading ${keyOf(date) === data.todayKey() ? 'is-today' : ''}`;
      head.innerHTML = `<strong>${esc(dayLabel(date))}</strong>${keyOf(date) === data.todayKey() ? '<span>Today</span>' : ''}`; grid.appendChild(head);
    });
    const allDayLabel = document.createElement('div'); allDayLabel.className = 'all-day-label'; allDayLabel.textContent = 'All day'; grid.appendChild(allDayLabel);
    dates.forEach(date => grid.appendChild(createAllDayCell(date)));
    const axis = document.createElement('div'); axis.className = 'time-axis';
    for (let hour = 0; hour < 24; hour++) { const tick = document.createElement('span'); tick.style.top = `${hour * HOUR_PX - 8}px`; tick.textContent = timeLabel(hour * 60); axis.appendChild(tick); }
    grid.appendChild(axis); dates.forEach(date => grid.appendChild(createTimeColumn(date)));
  }
  document.getElementById('viewUpcoming').addEventListener('click', () => { mode = 'upcoming'; offsetDays = 0; render(); });
  document.getElementById('viewToday').addEventListener('click', () => { mode = 'today'; offsetDays = 0; render(); });
  document.getElementById('prevRange').addEventListener('click', () => { offsetDays -= mode === 'today' ? 1 : 5; render(); });
  document.getElementById('nextRange').addEventListener('click', () => { offsetDays += mode === 'today' ? 1 : 5; render(); });
  document.getElementById('todayBtn').addEventListener('click', () => { offsetDays = 0; render(); });
  document.getElementById('themeToggle')?.addEventListener('click', event => { event.preventDefault(); const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; localStorage.setItem('theme', next); });
  const profile = document.querySelector('.user-profile span'); if (profile) profile.textContent = data.user;
  const avatar = document.querySelector('.user-profile img'); if (avatar) avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.user)}&background=6366f1&color=fff`;
  let trackedToday = data.todayKey();
  setInterval(() => {
    const currentDay = data.todayKey();
    if (currentDay !== trackedToday) { trackedToday = currentDay; if (offsetDays === 0) render(); }
    document.querySelectorAll('.current-time-indicator').forEach(line => { const now = today(); line.style.top = `${(now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_PX}px`; });
  }, 60000);
  render();
})();
