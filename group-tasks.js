(() => {
  const data = window.TrackerData;
  const $ = id => document.getElementById(id);
  const modal = $('inviteModal');
  const form = $('inviteForm');
  const emailInput = $('inviteEmail');
  let returnFocus = null;

  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function toast(message, kind = 'success') {
    const container = $('toast-container');
    const item = document.createElement('div'); item.className = `toast group-toast ${kind}`; item.setAttribute('role', kind === 'error' ? 'alert' : 'status'); item.textContent = message;
    container.appendChild(item); window.setTimeout(() => item.remove(), 4200);
  }
  function renderMembers() {
    const members = data.loadGroupMembers();
    $('groupMemberCount').textContent = String(members.length);
    $('groupMembersSummary').textContent = members.length ? `${members.length} ${members.length === 1 ? 'person' : 'people'} added to this account's workspace.` : 'Invitees are saved to this account on the local server.';
    const list = $('groupMembersList');
    if (!members.length) {
      list.innerHTML = '<li class="group-members-empty"><span class="material-icons" aria-hidden="true">group_add</span><strong>No group members yet</strong><span>Use Add Friends to save an invitee to this account.</span></li>';
      return;
    }
    list.innerHTML = members.map(email => {
      const initial = email.charAt(0).toUpperCase();
      return `<li class="group-member-item"><span class="group-member-avatar" aria-hidden="true">${escapeHtml(initial)}</span><span class="group-member-details"><strong>${escapeHtml(email)}</strong><small>Saved to this workspace</small></span><span class="group-local-badge">Member</span><button type="button" class="icon-btn remove-group-member" data-email="${escapeHtml(email)}" aria-label="Remove ${escapeHtml(email)}"><span class="material-icons">close</span></button></li>`;
    }).join('');
    list.querySelectorAll('.remove-group-member').forEach(button => button.addEventListener('click', async () => {
      const email = button.dataset.email;
      try { await data.saveGroupMembers(data.loadGroupMembers().filter(item => item !== email)); renderMembers(); toast(`${email} removed from the workspace.`); }
      catch (error) { toast(error.message || 'Could not update the member list.', 'error'); }
    }));
  }
  function openInviteModal() { returnFocus = document.activeElement; modal.classList.add('active'); emailInput.focus(); }
  function closeInviteModal() { modal.classList.remove('active'); form.reset(); if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus(); }
  function inviteUrl() {
    const url = new URL('group-tasks.html', window.location.href);
    url.searchParams.set('invite', 'workspace');
    return url.href;
  }
  async function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try { await navigator.clipboard.writeText(text); return true; } catch (_) { /* Try the legacy path. */ }
    }
    const helper = document.createElement('textarea'); helper.value = text; helper.setAttribute('readonly', '');
    helper.style.position = 'fixed'; helper.style.opacity = '0'; helper.style.pointerEvents = 'none';
    document.body.appendChild(helper); helper.select(); helper.setSelectionRange(0, helper.value.length);
    let copied = false; try { copied = Boolean(document.execCommand && document.execCommand('copy')); } catch (_) { copied = false; }
    helper.remove(); return copied;
  }

  $('addFriendsBtn').addEventListener('click', openInviteModal);
  $('closeInviteModalBtn').addEventListener('click', closeInviteModal);
  modal.addEventListener('click', event => { if (event.target === modal) closeInviteModal(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && modal.classList.contains('active')) closeInviteModal(); });
  $('shareInviteLinkBtn').addEventListener('click', async () => {
    const link = inviteUrl();
    if (await copyText(link)) toast('Workspace link copied. Recipients still need an account; email delivery is not configured.');
    else { $('inviteModalNote').textContent = `Clipboard access was blocked. Copy this link: ${link}`; toast('Could not access the clipboard. The link is shown in the dialog.', 'error'); }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    if (!emailInput.checkValidity()) { emailInput.reportValidity(); return; }
    if (data.loadGroupMembers().includes(email)) { toast('That email is already in Group Members.', 'error'); emailInput.focus(); return; }
    const button = $('sendInviteBtn'); button.disabled = true;
    try {
      await data.saveGroupMembers([...data.loadGroupMembers(), email]);
      renderMembers(); closeInviteModal(); toast(`${email} saved to Group Members. No email was sent.`);
    } catch (error) { toast(error.message || 'Could not save this member. Check the server connection.', 'error'); }
    finally { button.disabled = false; }
  });
  window.addEventListener('tracker:data-ready', renderMembers);
  data.ready.then(connected => { if (connected) renderMembers(); });
})();
