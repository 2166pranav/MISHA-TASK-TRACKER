(() => {
  const data = window.TrackerData;
  const list = document.getElementById('historyList');
  const count = document.getElementById('historyCount');
  const selectAllButton = document.getElementById('selectAllHistoryBtn');
  const deleteSelectedButton = document.getElementById('deleteSelectedHistoryBtn');
  const clearAllButton = document.getElementById('clearHistoryBtn');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const icons = { created: 'add_task', completed: 'task_alt', reopened: 'undo', edited: 'edit', deleted: 'delete', folder: 'create_new_folder', rescheduled: 'event', pin: 'push_pin', timer: 'timer', subtask: 'checklist', status: 'swap_horiz', cleared: 'delete_sweep', karma: 'stars', account: 'person' };
  const entryKey = (entry, index) => String(entry.id || `${entry.at || 'unknown'}-${index}`);
  function selectedIds() { return [...list.querySelectorAll('.history-select:checked')].map(input => input.value); }
  function syncActions(total) {
    const selected = selectedIds().length;
    deleteSelectedButton.disabled = selected === 0;
    selectAllButton.disabled = total === 0;
    selectAllButton.textContent = selected === total && total ? 'Deselect all' : 'Select all';
    clearAllButton.disabled = total === 0;
  }
  function render() {
    const entries = data.loadHistory();
    const selected = new Set(selectedIds());
    count.textContent = `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`;
    if (!entries.length) {
      list.innerHTML = '<li class="history-empty"><span class="material-icons">history</span><strong>No activity yet</strong><span>Task and folder actions will appear here.</span></li>';
      syncActions(0); return;
    }
    list.innerHTML = entries.map((entry, index) => {
      const key = entryKey(entry, index); const date = new Date(entry.at);
      const dateText = Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      return `<li class="history-entry"><label class="history-select-wrap" aria-label="Select history entry"><input class="history-select" type="checkbox" value="${esc(key)}" ${selected.has(key) ? 'checked' : ''}><span class="sr-only">Select history entry</span></label><span class="history-icon"><span class="material-icons">${icons[entry.action] || 'history'}</span></span><div class="history-entry-content"><p>${esc(entry.text)}</p><time datetime="${esc(entry.at)}">${esc(dateText)}</time></div></li>`;
    }).join('');
    syncActions(entries.length);
  }
  function toast(message, kind = 'success') {
    const container = document.getElementById('toast-container'); const item = document.createElement('div');
    item.className = `toast ${kind}`; item.textContent = message; item.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    container.appendChild(item); window.setTimeout(() => item.remove(), 4500);
  }

  list.addEventListener('change', event => { if (event.target.matches('.history-select')) syncActions(data.loadHistory().length); });
  selectAllButton.addEventListener('click', () => {
    const inputs = [...list.querySelectorAll('.history-select')]; const shouldSelect = inputs.some(input => !input.checked);
    inputs.forEach(input => { input.checked = shouldSelect; }); syncActions(data.loadHistory().length);
  });
  deleteSelectedButton.addEventListener('click', () => {
    const ids = selectedIds(); if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} selected history entr${ids.length === 1 ? 'y' : 'ies'}? Tasks will not be affected.`)) return;
    data.deleteHistoryEntries(ids); render(); toast(`${ids.length} history entr${ids.length === 1 ? 'y was' : 'ies were'} deleted.`);
  });
  clearAllButton.addEventListener('click', async () => {
    if (!window.confirm('Clear all task history? This will not delete or change any tasks. This cannot be undone.')) return;
    clearAllButton.disabled = true;
    try { await data.clearHistory(); render(); toast('Task history cleared. Your tasks were not changed.'); }
    catch (error) { toast(error.message || 'Could not clear history from the server.', 'error'); }
    finally { clearAllButton.disabled = data.loadHistory().length === 0; }
  });
  window.addEventListener('tracker:data-ready', render);
  data.ready.then(connected => { if (connected) render(); });
})();
