(() => {
  const data = window.TrackerData;
  const $ = id => document.getElementById(id);
  const form = $('profileForm');
  const status = $('profileStatus');
  function showStatus(message, kind = '') {
    status.textContent = message;
    status.classList.toggle('error', kind === 'error');
    status.classList.toggle('success', kind === 'success');
  }
  function fillProfile(profile = data.profile) {
    if (!profile) return;
    $('profileName').value = profile.name || '';
    $('profileEmail').value = profile.email || '';
    $('profileDisplayName').textContent = profile.name || 'User';
    $('profileAvatarPreview').src = profile.avatarUrl || '/assets/default-avatar.svg';
    $('profileAvatarPreview').alt = `${profile.name || 'User'} profile picture`;
  }
  function toast(message, kind = 'success') {
    const root = $('toast-container'); const item = document.createElement('div');
    item.className = `toast ${kind}`; item.textContent = message; item.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    root.appendChild(item); window.setTimeout(() => item.remove(), 4500);
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const newPassword = $('newPassword').value;
    if (newPassword !== $('confirmNewPassword').value) { showStatus('The new passwords do not match.', 'error'); $('confirmNewPassword').focus(); return; }
    if (newPassword && !$('currentPassword').value) { showStatus('Enter your current password to change it.', 'error'); $('currentPassword').focus(); return; }
    const button = $('saveProfileBtn'); button.disabled = true;
    showStatus('Saving your profile…');
    try {
      const profile = await data.updateProfile({
        name: $('profileName').value.trim(),
        email: $('profileEmail').value.trim(),
        currentPassword: $('currentPassword').value,
        newPassword
      });
      fillProfile(profile); $('currentPassword').value = ''; $('newPassword').value = ''; $('confirmNewPassword').value = '';
      showStatus('Profile saved. Your dashboard will show these details.', 'success');
    } catch (error) { showStatus(error.message || 'Could not save profile.', 'error'); }
    finally { button.disabled = false; }
  });

  $('profileAvatarFile').addEventListener('change', async event => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      showStatus('Choose a PNG, JPEG or WebP image smaller than 5 MB.', 'error'); event.target.value = ''; return;
    }
    showStatus('Uploading your profile picture…');
    try {
      const profile = await data.uploadAvatar(file);
      const preview = $('profileAvatarPreview'); preview.src = `${profile.avatarUrl}?v=${Date.now()}`;
      showStatus('Profile picture updated across your open tracker pages.', 'success');
    } catch (error) { showStatus(error.message || 'Could not upload this image.', 'error'); }
    finally { event.target.value = ''; }
  });

  $('signOutBtn').addEventListener('click', async () => {
    const button = $('signOutBtn'); button.disabled = true;
    try { await data.logout(); }
    catch (error) { button.disabled = false; toast(error.message || 'Could not sign out from the server.', 'error'); }
  });
  $('exportDataBtn').addEventListener('click', async () => {
    const button = $('exportDataBtn'); button.disabled = true;
    try {
      const backup = await data.exportData();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `misha-task-tracker-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Workspace backup downloaded.');
    } catch (error) { toast(error.message || 'Could not export workspace data.', 'error'); }
    finally { button.disabled = false; }
  });
  $('clearDataBtn').addEventListener('click', async () => {
    if (!window.confirm('Clear all tasks, folders, history, group members, and Karma for this account? This cannot be undone. Your account and profile will remain.')) return;
    const button = $('clearDataBtn'); button.disabled = true;
    try { await data.clearAllData(); toast('Workspace data cleared. Your profile remains active.'); }
    catch (error) { toast(error.message || 'Could not clear workspace data.', 'error'); }
    finally { button.disabled = false; }
  });

  window.addEventListener('tracker:data-ready', event => { if (event.detail?.payload?.profile || data.profile) fillProfile(); });
  window.addEventListener('tracker:profile-updated', event => fillProfile(event.detail));
  data.ready.then(connected => { if (connected) fillProfile(); });
})();
