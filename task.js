/* Task page interactions. Persistent records live in TrackerData (localStorage). */
(() => {
  const data = window.TrackerData;
  const tasks = data.loadTasks();
  let folders = data.loadFolders();
  let editingId = null;
  let deletingId = null;
  let editingSubtasks = [];
  let activeTab = 'all';
  let activeFolder = '';
  let timerInterval = null;
  let currentLayout = 'list';
  let calendarRange = 'month';
  let calendarCursor = new Date();
  let showFutureOccurrences = true;
  const $ = id => document.getElementById(id);
  const taskList = $('taskList');

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const dateLabel = value => {
    if (!value) return 'No due date';
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? 'No due date' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const isDone = task => Boolean(task.completed || task.status === 'done');
  const getStatus = (task, dueDate = task.dueDate) => isDone(task) ? 'completed' : (dueDate && dueDate < data.todayKey() ? 'past-due' : 'upcoming');
  const timeFor = task => {
    const seconds = task.timerSeconds + (task.timerStartedAt ? Math.max(0, Math.floor((Date.now() - task.timerStartedAt) / 1000)) : 0);
    return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };
  const durationLabel = minutes => minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`;
  const clockLabel = task => task.scheduleStart ? window.TaskScheduleParser.formatTime(task.scheduleStart.slice(11, 16)) : '';
  const recurrenceLabel = task => task.recurrence?.phrase || (task.recurrence?.kind === 'weekdays' ? 'Weekdays' : task.recurrence ? `Every ${task.recurrence.intervalDays} days` : '');
  const reminderLabel = minutes => Number(minutes) >= 60 ? `${minutes / 60}h before` : `${minutes}m before`;
  function updateDurationPreview(inputId, previewId, fallback = 60) {
    const result = window.TaskScheduleParser.parseDuration($(inputId).value, fallback);
    $(previewId).innerHTML = `<span class="schedule-pill"><span class="material-icons">timelapse</span>${durationLabel(result.minutes)}${result.shortcut ? ' duration' : ' default duration'}</span>`;
  }
  function updateActivityIconPreview(inputId, previewId) {
    const parsedTitle = window.TaskScheduleParser.parseDuration($(inputId).value).title;
    $(previewId).textContent = data.activityIcon(parsedTitle);
  }
  let addParseSequence = 0, editParseSequence = 0;
  async function updateSchedulePreview(inputId, previewId, sequenceName) {
    const input = $(inputId), root = $(previewId), raw = input.value.trim();
    const sequence = sequenceName === 'add' ? ++addParseSequence : ++editParseSequence;
    if (!raw) { root.innerHTML = ''; return null; }
    const parsed = await window.TaskScheduleParser.parse(raw);
    const current = sequenceName === 'add' ? addParseSequence : editParseSequence;
    if (sequence !== current) return null;
    if (!parsed) { root.innerHTML = '<span class="schedule-pill schedule-pill-warning"><span class="material-icons">help_outline</span>Could not parse schedule</span>'; return null; }
    root.innerHTML = `<span class="schedule-pill"><span class="material-icons">${parsed.recurrence ? 'sync' : 'event'}</span>${esc(parsed.label)}${parsed.recurrence ? ` · ${esc(parsed.recurrenceLabel)}` : ''}${parsed.allDay ? ' · All day' : ''}</span>`;
    return parsed;
  }
  function updateReminderPreview(selectId, previewId) {
    const minutes = Number($(selectId).value) || 0;
    $(previewId).innerHTML = minutes ? `<span class="schedule-pill reminder-pill"><span class="material-icons">alarm</span>${reminderLabel(minutes)}</span>` : '';
  }
  function requestReminderPermission(minutes) {
    if (!minutes || !('Notification' in window) || Notification.permission !== 'default') return Promise.resolve();
    return Notification.requestPermission().catch(() => 'denied');
  }
  function toast(message) {
    const container = $('toast-container');
    const item = document.createElement('div'); item.className = 'toast'; item.textContent = message; container.appendChild(item);
    setTimeout(() => item.remove(), 3200);
  }
  function save() { data.saveTasks(tasks); render(); }
  function showModal(id) { $(id).classList.add('active'); }
  function closeModal(id) { $(id).classList.remove('active'); }
  function syncFolders() {
    const filter = $('filterFolder');
    ['folder', 'editFolder'].forEach(id => {
      const select = $(id); if (!select) return;
      const current = select.value;
      select.innerHTML = '<option value="">No folder</option>' + folders.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('');
      if (current && folders.includes(current)) select.value = current;
    });
    if (filter) filter.innerHTML = '<option value="">All folders</option>' + folders.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('');
    const labelFilter = $('filterLabel');
    if (labelFilter) {
      const current = labelFilter.value;
      const categories = [...new Set(tasks.map(task => task.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      const labels = [...new Set(tasks.flatMap(task => Array.isArray(task.labels) ? task.labels : []).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      labelFilter.innerHTML = '<option value="">All labels</option>' + categories.map(value => `<option value="category:${esc(value)}">${esc(value)}</option>`).join('') + folders.map(value => `<option value="folder:${esc(value)}">📁 ${esc(value)}</option>`).join('') + labels.map(value => `<option value="label:${esc(value)}">${esc(value)}</option>`).join('');
      if ([...labelFilter.options].some(option => option.value === current)) labelFilter.value = current;
    }
    const assigneeFilter = $('filterAssignee');
    if (assigneeFilter) {
      const current = assigneeFilter.value;
      const assignees = [...new Set(tasks.map(task => String(task.assignee || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      assigneeFilter.innerHTML = '<option value="">All assignees</option><option value="unassigned">Unassigned</option>' + assignees.map(value => `<option value="assignee:${esc(value)}">${esc(value)}</option>`).join('');
      if ([...assigneeFilter.options].some(option => option.value === current)) assigneeFilter.value = current;
    }
  }
  function renderFolderChips() {
    const root = $('folderChips');
    root.innerHTML = `<button class="folder-chip ${activeFolder === '' ? 'active' : ''}" data-folder="">All folders</button>` + folders.map(f => `<button class="folder-chip ${activeFolder === f ? 'active' : ''}" data-folder="${esc(f)}"><span class="material-icons">folder</span>${esc(f)}</button>`).join('');
    root.querySelectorAll('[data-folder]').forEach(button => button.addEventListener('click', () => { activeFolder = button.dataset.folder; renderFolderChips(); render(); }));
  }
  function updateSummary() {
    const dueToday = tasks.filter(t => t.dueDate === data.todayKey());
    const doneToday = dueToday.filter(isDone).length;
    const left = Math.max(0, dueToday.length - doneToday);
    const percent = dueToday.length ? Math.round(doneToday / dueToday.length * 100) : 0;
    $('dailyProgressSummary').textContent = `${doneToday} of ${dueToday.length} due today completed`;
    $('dailyTasksLeft').textContent = left ? `${left} task${left === 1 ? '' : 's'} left today` : (dueToday.length ? 'You are all caught up for today' : 'No tasks due today');
    $('dailyProgressPercent').textContent = `${percent}%`;
    $('dailyProgressRing').style.setProperty('--progress', `${percent * 3.6}deg`);
    $('karmaTotal').textContent = data.getKarma().toLocaleString();
    $('count-all').textContent = tasks.length;
    $('count-upcoming').textContent = tasks.filter(t => getStatus(t) === 'upcoming').length;
    $('count-past-due').textContent = tasks.filter(t => getStatus(t) === 'past-due').length;
    $('count-completed').textContent = tasks.filter(t => getStatus(t) === 'completed').length;
  }
  function matchesFilters(task, dueDate = task.dueDate) {
    const query = $('filterTask').value.trim().toLowerCase();
    const assignee = $('filterAssignee').value;
    const label = $('filterLabel').value;
    const dueFilter = $('filterDueDate').value;
    const today = data.todayKey();
    const tomorrowDate = new Date(`${today}T12:00:00`); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = data.todayKey(tomorrowDate);
    const weekStart = new Date(`${today}T12:00:00`); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
    const customDate = $('filterDueDateCustom').value;
    const taskLabels = Array.isArray(task.labels) ? task.labels : [];
    const occurrenceTask = dueDate === task.dueDate ? task : { ...task, dueDate };
    const labelMatch = !label || (label.startsWith('category:') ? task.category === label.slice(9) : label.startsWith('folder:') ? task.folder === label.slice(7) : label.startsWith('label:') ? taskLabels.includes(label.slice(6)) : true);
    const dueMatch = !dueFilter || (dueFilter === 'today' ? dueDate === today : dueFilter === 'tomorrow' ? dueDate === tomorrow : dueFilter === 'this-week' ? Boolean(dueDate && dueDate >= data.todayKey(weekStart) && dueDate <= data.todayKey(weekEnd)) : dueFilter === 'overdue' ? Boolean(dueDate && dueDate < today && !isDone(task)) : dueFilter === 'none' ? !dueDate : dueFilter === 'custom' ? (!customDate || dueDate === customDate) : true);
    return (!query || `${task.task} ${task.description} ${task.category} ${task.folder} ${task.assignee || ''} ${taskLabels.join(' ')}`.toLowerCase().includes(query)) &&
      (!$('filterPriority').value || task.priority === $('filterPriority').value) &&
      (!assignee || (assignee === 'unassigned' ? !task.assignee : String(task.assignee || '') === assignee.slice(9))) &&
      labelMatch && dueMatch &&
      (!$('filterStatus').value || getStatus(occurrenceTask) === $('filterStatus').value) &&
      (!activeTab || activeTab === 'all' || getStatus(occurrenceTask) === activeTab) &&
      (!activeFolder || task.folder === activeFolder);
  }
  function render() {
    updateSummary(); syncFolders();
    const visible = tasks.filter(matchesFilters);
    const sorted = [...visible].sort((a, b) => Number(b.pinned) - Number(a.pinned));
    taskList.innerHTML = '';
    ['kanban-todo', 'kanban-in-progress', 'kanban-done'].forEach(id => { if ($(id)) $(id).innerHTML = ''; });
    if (!sorted.length) taskList.innerHTML = `<li class="empty-state"><span class="material-icons">task_alt</span><strong>No matching tasks</strong><span>Try clearing filters or add a task to get started.</span></li>`;
    sorted.forEach(task => {
      task.completed = isDone(task);
      task.status = task.completed ? 'done' : (task.status === 'in-progress' ? 'in-progress' : 'todo');
      const subDone = task.subtasks.filter(s => s.completed).length;
      const subCount = task.subtasks.length;
      const secondaryText = task.description || task.subtasks[0]?.title || '';
      const row = document.createElement('li');
      row.className = `task-row ${task.completed ? 'is-complete' : ''} ${task.pinned ? 'is-pinned' : ''}`;
      row.dataset.id = task.id;
      row.innerHTML = `
        <div class="task-row-main">
          <button class="complete-task task-check" data-id="${task.id}" aria-label="${task.completed ? 'Mark incomplete' : 'Complete task'}"><span class="material-icons">${task.completed ? 'check_circle' : 'radio_button_unchecked'}</span></button>
          <div class="task-content">
            <div class="task-row-top"><div class="task-title-line"><h4 class="activity-task-title"><span class="activity-title-icon" aria-hidden="true">${data.activityIcon(task.task)}</span><span class="activity-title-text">${esc(task.task)}</span></h4><span class="task-dot ${esc(task.priority)}" title="${esc(task.priority)} priority"></span>${task.folder ? `<span class="folder-label"><span class="material-icons">folder</span>${esc(task.folder)}</span>` : ''}${task.pinned ? '<span class="pinned-label">Pinned</span>' : ''}</div>
              <div class="task-actions"><button class="icon-btn pin-task ${task.pinned ? 'selected' : ''}" data-id="${task.id}" title="${task.pinned ? 'Unpin' : 'Pin'} task" aria-label="${task.pinned ? 'Unpin' : 'Pin'} task"><span class="material-icons">push_pin</span></button><button class="icon-btn timer-task ${task.timerStartedAt ? 'timer-running' : ''}" data-id="${task.id}" title="${task.timerStartedAt ? 'Pause timer' : 'Start timer'}"><span class="material-icons">${task.timerStartedAt ? 'pause' : 'play_arrow'}</span></button><span class="timer-readout" data-timer="${task.id}">${timeFor(task)}</span><button class="icon-btn edit-task" data-id="${task.id}" title="Edit task"><span class="material-icons">edit</span></button><button class="icon-btn delete-task" data-id="${task.id}" title="Delete task"><span class="material-icons">delete</span></button></div>
            </div>
            ${secondaryText ? `<p class="task-description task-secondary-text">${esc(secondaryText)}</p>` : ''}
            <div class="task-meta task-metadata-pills"><span class="category-badge">${esc(task.category)}</span><span class="task-date-control"><button type="button" class="metadata-pill date-pill" data-date-picker="${task.id}" aria-label="Reschedule ${esc(task.task)}, currently ${esc(dateLabel(task.dueDate))}" title="Click to reschedule"><span class="material-icons">event</span>${esc(dateLabel(task.dueDate))}</button><input class="task-date-native" type="date" value="${esc(task.dueDate)}" data-task-id="${task.id}" aria-label="Choose new due date for ${esc(task.task)}"></span>${task.scheduleStart ? `<span class="metadata-pill time-duration-pill"><span class="material-icons">schedule</span>${esc(clockLabel(task))} · ${esc(durationLabel(task.durationMinutes))}</span>` : '<span class="metadata-pill time-duration-pill"><span class="material-icons">today</span>All day</span>'}${task.recurrence ? `<span class="schedule-pill"><span class="material-icons">sync</span>${esc(recurrenceLabel(task))}</span>` : ''}${task.reminderMinutes ? `<span class="schedule-pill reminder-pill"><span class="material-icons">alarm</span>${esc(reminderLabel(task.reminderMinutes))}</span>` : ''}<span class="task-state ${getStatus(task)}">${getStatus(task) === 'past-due' ? 'Past due' : getStatus(task) === 'completed' ? 'Completed' : 'Upcoming'}</span>${subCount ? `<span class="subtask-progress">${subDone}/${subCount} sub-tasks</span>` : ''}</div>
            ${subCount ? `<div class="subtask-progress-track"><span style="width:${Math.round(subDone / subCount * 100)}%"></span></div><ul class="subtask-list">${task.subtasks.map((sub, index) => `<li><label><input type="checkbox" class="subtask-check" data-task="${task.id}" data-index="${index}" ${sub.completed ? 'checked' : ''}><span class="${sub.completed ? 'subtask-done' : ''}">${esc(sub.title)}</span></label></li>`).join('')}</ul>` : ''}
          </div>
        </div>`;
      taskList.appendChild(row);
      const card = document.createElement('article'); card.className = 'kanban-card'; card.dataset.id = task.id;
      card.innerHTML = `<div class="kanban-card-top"><span class="task-dot ${esc(task.priority)}"></span><button class="icon-btn edit-task" data-id="${task.id}" aria-label="Edit"><span class="material-icons">edit</span></button></div><h4 class="activity-task-title"><span class="activity-title-icon" aria-hidden="true">${data.activityIcon(task.task)}</span><span class="activity-title-text">${esc(task.task)}</span></h4><div class="kanban-card-meta"><span>${esc(dateLabel(task.dueDate))}${task.scheduleStart ? ` · ${esc(clockLabel(task))}` : ' · All day'}</span>${subCount ? `<span>${subDone}/${subCount} subtasks</span>` : ''}</div>${task.folder ? `<span class="folder-label"><span class="material-icons">folder</span>${esc(task.folder)}</span>` : ''}`;
      const column = task.status === 'done' ? 'kanban-done' : task.status === 'in-progress' ? 'kanban-in-progress' : 'kanban-todo';
      $(column).appendChild(card);
    });
    bindRowEvents();
    if (currentLayout === 'calendar') renderTaskCalendar();
    if (!timerInterval) timerInterval = setInterval(refreshTimers, 1000);
  }
  function renderTaskCalendar() {
    const grid = $('taskCalendarGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const rangeStart = new Date(calendarCursor);
    rangeStart.setHours(12, 0, 0, 0);
    if (calendarRange === 'month') { rangeStart.setDate(1); rangeStart.setDate(rangeStart.getDate() - rangeStart.getDay()); }
    else rangeStart.setDate(rangeStart.getDate() - rangeStart.getDay());
    const dayCount = calendarRange === 'month' ? 42 : 7;
    const rangeEnd = new Date(rangeStart); rangeEnd.setDate(rangeEnd.getDate() + dayCount - 1);
    $('taskCalendarRangeLabel').textContent = calendarRange === 'month'
      ? calendarCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : `${rangeStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${rangeEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    $('viewWeekBtn').classList.toggle('active', calendarRange === 'week'); $('viewWeekBtn').setAttribute('aria-pressed', String(calendarRange === 'week'));
    $('viewMonthBtn').classList.toggle('active', calendarRange === 'month'); $('viewMonthBtn').setAttribute('aria-pressed', String(calendarRange === 'month'));
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(name => { const heading = document.createElement('div'); heading.className = 'task-calendar-weekday'; heading.textContent = name; grid.appendChild(heading); });
    const today = data.todayKey();
    for (let offset = 0; offset < dayCount; offset++) {
      const day = new Date(rangeStart); day.setDate(day.getDate() + offset);
      const dateKey = data.dateKey(day);
      const cell = document.createElement('div');
      cell.className = `task-calendar-day ${dateKey === today ? 'is-today' : ''} ${calendarRange === 'month' && day.getMonth() !== calendarCursor.getMonth() ? 'other-month' : ''}`;
      cell.dataset.date = dateKey;
      const dateNumber = document.createElement('span'); dateNumber.className = 'task-calendar-day-number'; dateNumber.textContent = String(day.getDate()); dateNumber.setAttribute('aria-label', day.toLocaleDateString(undefined, { dateStyle: 'full' }));
      cell.appendChild(dateNumber);
      for (const task of tasks) {
        if (!data.occursOn(task, dateKey)) continue;
        if (!showFutureOccurrences && task.recurrence && dateKey > (task.recurrence.startDate || task.dueDate)) continue;
        const occurrence = { ...task, dueDate: dateKey };
        if (!matchesFilters(occurrence, dateKey)) continue;
        const chip = document.createElement('button'); chip.type = 'button'; chip.className = `task-calendar-chip ${esc(task.priority || 'medium')} ${isDone(task) ? 'completed' : ''}`;
        chip.draggable = true; chip.dataset.id = String(task.id); chip.title = `${task.task}${task.scheduleStart ? ` · ${window.TaskScheduleParser.formatTime(task.scheduleStart.slice(11, 16))}` : ''}`;
        const icon = document.createElement('span'); icon.className = 'activity-title-icon'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = data.activityIcon(task.task);
        const title = document.createElement('span'); title.className = 'activity-title-text'; title.textContent = task.task;
        chip.append(icon, title);
        if (task.scheduleStart) { const time = document.createElement('small'); time.textContent = window.TaskScheduleParser.formatTime(task.scheduleStart.slice(11, 16)); chip.appendChild(time); }
        chip.addEventListener('click', event => { event.stopPropagation(); openEdit(Number(task.id)); });
        chip.addEventListener('dragstart', event => { event.dataTransfer.setData('text/plain', String(task.id)); event.dataTransfer.setData('application/x-tasker-occurrence', dateKey); event.dataTransfer.effectAllowed = 'move'; chip.classList.add('dragging'); });
        chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
        cell.appendChild(chip);
      }
      cell.addEventListener('dragover', event => { event.preventDefault(); cell.classList.add('drop-target'); });
      cell.addEventListener('dragleave', event => { if (!cell.contains(event.relatedTarget)) cell.classList.remove('drop-target'); });
      cell.addEventListener('drop', event => {
        event.preventDefault(); cell.classList.remove('drop-target');
        const id = Number(event.dataTransfer.getData('text/plain'));
        const task = tasks.find(item => Number(item.id) === id); if (!task) return;
        const oldDate = task.dueDate, oldTime = task.scheduleStart ? task.scheduleStart.slice(11, 16) : '';
        if (oldDate === dateKey) return;
        task.dueDate = dateKey;
        if (task.scheduleStart) task.scheduleStart = `${dateKey}T${oldTime}`;
        if (task.recurrence) task.recurrence.startDate = dateKey;
        task.remindersSent = [];
        task.scheduleText = task.scheduleStart ? `${task.recurrence?.phrase ? `${task.recurrence.phrase} starting ` : ''}${dateKey} at ${oldTime}` : '';
        data.addHistory('rescheduled', `Rescheduled “${task.task}” from ${oldDate || 'unscheduled'} to ${dateKey}${oldTime ? ` at ${oldTime}` : ''}`);
        save(); toast(`Rescheduled “${task.task}”`);
      });
      grid.appendChild(cell);
    }
  }
  function setLayout(layout) {
    currentLayout = layout;
    $('listViewContainer').hidden = layout !== 'list';
    $('boardViewContainer').hidden = layout !== 'board';
    $('calendarViewContainer').hidden = layout !== 'calendar';
    $('clearTaskRow').hidden = layout === 'calendar';
    document.querySelectorAll('[data-layout]').forEach(button => { const active = button.dataset.layout === layout; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    $('activeLayoutLabel').textContent = `${layout.charAt(0).toUpperCase()}${layout.slice(1)} view`;
    if (layout === 'calendar') renderTaskCalendar();
  }
  function openTaskDatePicker(taskId, button) {
    const input = button.parentElement.querySelector('.task-date-native');
    if (!input) return;
    input.dataset.taskId = String(taskId);
    try { if (typeof input.showPicker === 'function') input.showPicker(); else { input.focus(); input.click(); } }
    catch (_) { input.focus(); input.click(); }
  }
  function updateTaskDate(taskId, newDate) {
    const task = tasks.find(item => String(item.id) === String(taskId));
    if (!task || !newDate || newDate === task.dueDate) return;
    const oldDate = task.dueDate || 'unscheduled';
    task.dueDate = newDate;
    if (task.scheduleStart) task.scheduleStart = `${newDate}T${task.scheduleStart.slice(11, 16)}`;
    if (task.recurrence) task.recurrence.startDate = newDate;
    task.remindersSent = [];
    task.scheduleText = task.scheduleStart ? `${task.recurrence?.phrase ? `${task.recurrence.phrase} starting ` : ''}${newDate} at ${task.scheduleStart.slice(11, 16)}` : '';
    data.addHistory('rescheduled', `Rescheduled “${task.task}” from ${oldDate} to ${newDate}`);
    save(); toast(`Rescheduled “${task.task}”`);
  }
  function refreshTimers() { document.querySelectorAll('[data-timer]').forEach(el => { const task = tasks.find(t => String(t.id) === el.dataset.timer); if (task) el.textContent = timeFor(task); }); }
  function bindRowEvents() {
    document.querySelectorAll('.complete-task').forEach(button => button.addEventListener('click', () => {
      const task = tasks.find(t => String(t.id) === button.dataset.id); if (!task) return;
      const wasDone = isDone(task); task.completed = !wasDone; task.status = task.completed ? 'done' : 'todo';
      if (!wasDone) {
        task.completedAt = new Date().toISOString(); const points = data.awardCompletion(task, tasks);
        data.addHistory('completed', `Completed “${task.task}” (+${points} Karma)`);
        if (window.confetti) window.confetti({ particleCount: 90, spread: 65, origin: { y: 0.72 } });
        toast(`Task completed! +${points} Karma`);
      } else { task.completedAt = null; data.addHistory('reopened', `Reopened “${task.task}”`); }
      save();
    }));
    document.querySelectorAll('.subtask-check').forEach(input => input.addEventListener('change', () => {
      const task = tasks.find(t => String(t.id) === input.dataset.task); const sub = task?.subtasks[Number(input.dataset.index)]; if (!sub) return;
      sub.completed = input.checked; data.addHistory('subtask', `${input.checked ? 'Completed' : 'Reopened'} sub-task “${sub.title}” in “${task.task}”`); save();
    }));
    document.querySelectorAll('.pin-task').forEach(button => button.addEventListener('click', () => {
      const task = tasks.find(t => String(t.id) === button.dataset.id); if (!task) return;
      task.pinned = !task.pinned; data.addHistory('pin', `${task.pinned ? 'Pinned' : 'Unpinned'} “${task.task}”`); save();
    }));
    document.querySelectorAll('.timer-task').forEach(button => button.addEventListener('click', () => toggleTimer(Number(button.dataset.id))));
    document.querySelectorAll('.edit-task').forEach(button => button.addEventListener('click', () => openEdit(Number(button.dataset.id))));
    document.querySelectorAll('.delete-task').forEach(button => button.addEventListener('click', () => { deletingId = Number(button.dataset.id); showModal('deleteModal'); }));
    document.querySelectorAll('[data-date-picker]').forEach(button => button.addEventListener('click', () => openTaskDatePicker(button.dataset.datePicker, button)));
    document.querySelectorAll('.task-date-native').forEach(input => input.addEventListener('change', () => updateTaskDate(input.dataset.taskId, input.value)));
  }
  function toggleTimer(id) {
    const task = tasks.find(t => t.id === id); if (!task) return;
    if (task.timerStartedAt) {
      task.timerSeconds += Math.max(0, Math.floor((Date.now() - task.timerStartedAt) / 1000)); task.timerStartedAt = null;
      data.addHistory('timer', `Paused timer for “${task.task}”`);
    } else {
      tasks.forEach(other => { if (other.timerStartedAt) { other.timerSeconds += Math.max(0, Math.floor((Date.now() - other.timerStartedAt) / 1000)); other.timerStartedAt = null; } });
      task.timerStartedAt = Date.now(); data.addHistory('timer', `Started timer for “${task.task}”`);
    }
    save();
  }
  function openEdit(id) {
    const task = tasks.find(t => t.id === id); if (!task) return;
    editingId = id; $('editTask').value = task.task; updateActivityIconPreview('editTask', 'editActivityIconPreview'); $('editPriority').value = task.priority; $('editCategory').value = task.category;
    $('editDueDate').value = task.dueDate; $('editDescription').value = task.description; syncFolders(); $('editFolder').value = task.folder || '';
    $('editSchedule').value = task.scheduleText || (task.scheduleStart ? `${task.scheduleStart.slice(0, 10)} at ${task.scheduleStart.slice(11, 16)}` : '');
    $('editReminder').value = String(task.reminderMinutes || 0); updateReminderPreview('editReminder', 'editReminderPreview');
    updateDurationPreview('editTask', 'editDurationPreview', task.durationMinutes); updateSchedulePreview('editSchedule', 'editSchedulePreview', 'edit');
    editingSubtasks = task.subtasks.map(sub => ({ ...sub })); renderSubtasks(); showModal('editModal');
  }
  function renderSubtasks() {
    const list = $('editSubtaskList');
    list.innerHTML = editingSubtasks.length ? editingSubtasks.map((sub, index) => `<li><span>${esc(sub.title)}</span><button type="button" class="icon-btn remove-subtask" data-index="${index}" aria-label="Remove sub-task"><span class="material-icons">close</span></button></li>`).join('') : '<li class="subtask-empty">No sub-tasks yet.</li>';
    list.querySelectorAll('.remove-subtask').forEach(button => button.addEventListener('click', () => { editingSubtasks.splice(Number(button.dataset.index), 1); renderSubtasks(); }));
  }

  $('taskForm').addEventListener('submit', async event => {
    event.preventDefault();
    const enteredTitle = $('task').value.trim();
    const parsedDuration = window.TaskScheduleParser.parseDuration(enteredTitle);
    const title = parsedDuration.title;
    if (!title) { toast('Enter a task name before the duration shortcut'); return; }
    const reminderMinutes = Number($('reminder').value) || 0;
    const permissionRequest = requestReminderPermission(reminderMinutes);
    const scheduleText = $('taskSchedule').value.trim();
    const parsed = await window.TaskScheduleParser.parse(scheduleText);
    await permissionRequest;
    if (scheduleText && !parsed) { toast('Could not read that schedule. Try “tomorrow at 7:30” or choose a due date.'); return; }
    const task = {
      id: Date.now(), task: title, priority: $('priority').value, category: $('category').value, description: $('description').value.trim(),
      dueDate: parsed?.date || $('dueDate').value, folder: $('folder').value, completed: false, status: 'todo', pinned: false,
      subtasks: [], timerSeconds: 0, timerStartedAt: null,
      scheduleStart: parsed?.startAt || '', scheduleText, allDay: parsed ? parsed.allDay : true,
      durationMinutes: parsedDuration.minutes, recurrence: parsed?.recurrence || null,
      reminderMinutes, remindersSent: []
    };
    tasks.unshift(task); data.addHistory('created', `Created task “${task.task}”`); save(); event.target.reset(); closeModal('addModal'); toast('Task added');
  });
  $('editForm').addEventListener('submit', async event => {
    event.preventDefault(); const task = tasks.find(t => t.id === editingId); if (!task) return;
    const parsedTitle = window.TaskScheduleParser.parseDuration($('editTask').value.trim(), task.durationMinutes);
    if (!parsedTitle.title) { toast('Task name cannot be empty'); return; }
    const reminderMinutes = Number($('editReminder').value) || 0;
    const permissionRequest = requestReminderPermission(reminderMinutes);
    const scheduleText = $('editSchedule').value.trim();
    const parsed = await window.TaskScheduleParser.parse(scheduleText);
    await permissionRequest;
    if (scheduleText && !parsed) { toast('Could not read that schedule. Try “tomorrow at 7:30” or clear the schedule.'); return; }
    task.task = parsedTitle.title; task.priority = $('editPriority').value; task.category = $('editCategory').value;
    task.dueDate = parsed?.date || $('editDueDate').value; task.description = $('editDescription').value.trim(); task.folder = $('editFolder').value; task.subtasks = editingSubtasks;
    task.scheduleStart = parsed?.startAt || ''; task.scheduleText = scheduleText; task.allDay = parsed ? parsed.allDay : true;
    task.durationMinutes = parsedTitle.minutes; task.recurrence = parsed?.recurrence || null; task.reminderMinutes = reminderMinutes; task.remindersSent = [];
    data.addHistory('edited', `Updated task “${task.task}”`); save(); closeModal('editModal'); toast('Task updated');
  });
  $('addSubtaskBtn').addEventListener('click', () => { const input = $('newSubtaskInput'); const title = input.value.trim(); if (!title) return; editingSubtasks.push({ title, completed: false }); input.value = ''; renderSubtasks(); input.focus(); });
  $('newSubtaskInput').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('addSubtaskBtn').click(); } });
  $('folderForm').addEventListener('submit', event => {
    event.preventDefault(); const input = $('newFolderName'); const name = input.value.trim();
    if (!name) return; if (folders.some(folder => folder.toLowerCase() === name.toLowerCase())) { toast('That folder already exists'); return; }
    folders.push(name); data.saveFolders(folders); data.addHistory('folder', `Created folder “${name}”`); input.value = ''; renderFolderChips(); syncFolders(); toast('Folder created');
  });
  $('modalAgreeBtn').addEventListener('click', () => {
    const index = tasks.findIndex(t => t.id === deletingId); if (index >= 0) { const [removed] = tasks.splice(index, 1); data.addHistory('deleted', `Deleted task “${removed.task}”`); }
    save(); closeModal('deleteModal'); toast('Task deleted');
  });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.close)));
  document.querySelectorAll('.modal-overlay').forEach(overlay => overlay.addEventListener('click', event => { if (event.target === overlay) closeModal(overlay.id); }));
  $('openAddModalBtn').addEventListener('click', () => { $('dueDate').value = data.todayKey(); showModal('addModal'); $('task').focus(); });
  $('task').addEventListener('input', () => { updateDurationPreview('task', 'addDurationPreview'); updateActivityIconPreview('task', 'addActivityIconPreview'); });
  $('editTask').addEventListener('input', () => { const task = tasks.find(t => t.id === editingId); updateDurationPreview('editTask', 'editDurationPreview', task?.durationMinutes || 60); updateActivityIconPreview('editTask', 'editActivityIconPreview'); });
  $('taskSchedule').addEventListener('input', () => updateSchedulePreview('taskSchedule', 'addSchedulePreview', 'add'));
  $('editSchedule').addEventListener('input', () => updateSchedulePreview('editSchedule', 'editSchedulePreview', 'edit'));
  $('reminder').addEventListener('change', () => updateReminderPreview('reminder', 'addReminderPreview'));
  $('editReminder').addEventListener('change', () => updateReminderPreview('editReminder', 'editReminderPreview'));
  $('filterTask').addEventListener('input', render);
  ['filterAssignee', 'filterPriority', 'filterLabel', 'filterStatus'].forEach(id => $(id).addEventListener('change', render));
  $('filterDueDate').addEventListener('change', () => { const custom = $('filterDueDate').value === 'custom'; $('filterDueDateCustom').hidden = !custom; if (custom) $('filterDueDateCustom').focus(); render(); });
  $('filterDueDateCustom').addEventListener('change', render);
  $('clearFilterBtn').addEventListener('click', () => { ['filterTask', 'filterAssignee', 'filterPriority', 'filterLabel', 'filterStatus', 'filterDueDate'].forEach(id => $(id).value = ''); $('filterDueDateCustom').value = ''; $('filterDueDateCustom').hidden = true; activeFolder = ''; activeTab = 'all'; document.querySelectorAll('.status-tab').forEach(b => b.classList.toggle('active', b.dataset.status === 'all')); renderFolderChips(); render(); });
  document.querySelectorAll('.status-tab').forEach(button => button.addEventListener('click', () => { activeTab = button.dataset.status; document.querySelectorAll('.status-tab').forEach(b => b.classList.toggle('active', b === button)); render(); }));
  const viewMenuButton = $('viewMenuBtn'), viewMenuPanel = $('viewMenuPanel');
  viewMenuButton.addEventListener('click', () => { const open = viewMenuButton.getAttribute('aria-expanded') !== 'true'; viewMenuButton.setAttribute('aria-expanded', String(open)); viewMenuPanel.hidden = !open; });
  document.addEventListener('click', event => { if (!event.target.closest('.view-menu-wrap')) { viewMenuPanel.hidden = true; viewMenuButton.setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { viewMenuPanel.hidden = true; viewMenuButton.setAttribute('aria-expanded', 'false'); } });
  document.querySelectorAll('[data-layout]').forEach(button => button.addEventListener('click', () => { setLayout(button.dataset.layout); viewMenuPanel.hidden = true; viewMenuButton.setAttribute('aria-expanded', 'false'); }));
  $('viewWeekBtn').addEventListener('click', () => { calendarRange = 'week'; setLayout('calendar'); viewMenuPanel.hidden = true; viewMenuButton.setAttribute('aria-expanded', 'false'); });
  $('viewMonthBtn').addEventListener('click', () => { calendarRange = 'month'; setLayout('calendar'); viewMenuPanel.hidden = true; viewMenuButton.setAttribute('aria-expanded', 'false'); });
  $('showFutureOccurrences').addEventListener('change', () => { showFutureOccurrences = $('showFutureOccurrences').checked; if (currentLayout === 'calendar') renderTaskCalendar(); });
  $('taskCalendarPrev').addEventListener('click', () => { if (calendarRange === 'month') { calendarCursor.setDate(1); calendarCursor.setMonth(calendarCursor.getMonth() - 1); } else calendarCursor.setDate(calendarCursor.getDate() - 7); renderTaskCalendar(); });
  $('taskCalendarNext').addEventListener('click', () => { if (calendarRange === 'month') { calendarCursor.setDate(1); calendarCursor.setMonth(calendarCursor.getMonth() + 1); } else calendarCursor.setDate(calendarCursor.getDate() + 7); renderTaskCalendar(); });
  $('taskCalendarToday').addEventListener('click', () => { calendarCursor = new Date(); renderTaskCalendar(); });
  if (window.Sortable) {
    new Sortable(taskList, { animation: 150, handle: '.task-row-main', filter: 'button,input', onEnd: event => {
      if (activeTab !== 'all' || activeFolder || $('filterTask').value || $('filterAssignee').value || $('filterPriority').value || $('filterLabel').value || $('filterDueDate').value || $('filterDueDateCustom').value || $('filterStatus').value) { toast('Clear filters to reorder tasks'); render(); return; }
      const ids = [...taskList.querySelectorAll('.task-row')].map(row => Number(row.dataset.id));
      const reordered = ids.map(id => tasks.find(t => t.id === id)).filter(Boolean); tasks.sort((a, b) => Number(b.pinned) - Number(a.pinned));
      const visibleIds = new Set(ids); const hidden = tasks.filter(t => !visibleIds.has(t.id)); tasks.splice(0, tasks.length, ...reordered, ...hidden); data.saveTasks(tasks);
      render();
    }});
    ['kanban-todo', 'kanban-in-progress', 'kanban-done'].forEach(id => new Sortable($(id), { group: 'task-board', animation: 150, onEnd: event => {
      const task = tasks.find(t => t.id === Number(event.item.dataset.id)); if (!task) return;
      task.status = event.to.dataset.status; task.completed = task.status === 'done';
      if (task.completed && !task.completedAt) { task.completedAt = new Date().toISOString(); const points = data.awardCompletion(task, tasks); data.addHistory('completed', `Completed “${task.task}” (+${points} Karma)`); if (window.confetti) window.confetti({ particleCount: 80, spread: 60 }); }
      if (!task.completed) task.completedAt = null; data.addHistory('status', `Moved “${task.task}” to ${task.status}`); save();
    }}));
  }
  $('clearTasks').addEventListener('click', () => {
    if (!tasks.length) { toast('No tasks to clear'); return; }
    if (!window.confirm('Delete all tasks? This cannot be undone.')) return;
    tasks.splice(0, tasks.length); data.saveTasks(tasks); data.addHistory('cleared', 'Cleared all tasks'); render(); toast('All tasks cleared');
  });
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  function attachDescriptionDictation(buttonId, fieldId, hintId) {
    const button = $(buttonId), hint = $(hintId), field = $(fieldId);
    button.addEventListener('click', () => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) { hint.textContent = 'Voice input is not supported in this browser. Type your description instead.'; return; }
      const recognition = new SpeechRecognition(); recognition.lang = navigator.language || 'en-US'; recognition.interimResults = false; recognition.maxAlternatives = 1;
      button.classList.add('recording'); hint.textContent = 'Listening… speak your description now.';
      recognition.onresult = event => {
        const spoken = event.results?.[0]?.[0]?.transcript?.trim();
        if (spoken) { field.value = `${field.value.trim()}${field.value.trim() ? ' ' : ''}${spoken}`; field.dispatchEvent(new Event('input', { bubbles: true })); field.focus(); }
      };
      recognition.onerror = () => { hint.textContent = 'Could not capture speech. Check microphone permission and try again.'; };
      recognition.onend = () => { button.classList.remove('recording'); if (hint.textContent.startsWith('Listening')) hint.textContent = 'Click the microphone to dictate description text.'; };
      try { recognition.start(); } catch (_) { button.classList.remove('recording'); hint.textContent = 'Could not start voice input. Check microphone permission and try again.'; }
    });
  }
  attachDescriptionDictation('descriptionVoiceBtn', 'description', 'descriptionVoiceHint');
  attachDescriptionDictation('editDescriptionVoiceBtn', 'editDescription', 'editDescriptionVoiceHint');
  $('voiceInputBtn').addEventListener('click', () => {
    if (!Recognition) { $('voiceHint').textContent = 'Voice input is not supported in this browser. Try Chrome or type your task.'; return; }
    const recognition = new Recognition(); recognition.lang = navigator.language || 'en-US'; recognition.interimResults = false; recognition.maxAlternatives = 1;
    $('voiceInputBtn').classList.add('recording'); $('voiceHint').textContent = 'Listening… speak your task now.';
    recognition.onresult = event => { $('task').value = `${$('task').value} ${event.results[0][0].transcript}`.trim(); $('task').dispatchEvent(new Event('input')); };
    recognition.onerror = () => { $('voiceHint').textContent = 'Could not capture speech. Check microphone permission and try again.'; };
    recognition.onend = () => { $('voiceInputBtn').classList.remove('recording'); $('voiceHint').textContent = 'Voice input works in supported browsers (usually Chrome).'; };
    recognition.start();
  });
  const theme = $('themeToggle'); theme?.addEventListener('click', event => { event.preventDefault(); const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; localStorage.setItem('theme', next); });
  window.addEventListener('tracker:karma-updated', updateSummary);
  window.addEventListener('storage', event => { if (!event.key || event.key === data.keys.rewards) updateSummary(); });
  const profile = document.querySelector('.user-profile span'); if (profile) profile.textContent = data.user;
  const avatar = document.querySelector('.user-profile img'); if (avatar) avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.user)}&background=6366f1&color=fff`;
  renderFolderChips(); syncFolders(); setLayout('list'); render();
  const requestedEdit = Number(new URLSearchParams(window.location.search).get('edit'));
  if (requestedEdit) openEdit(requestedEdit);
})();
