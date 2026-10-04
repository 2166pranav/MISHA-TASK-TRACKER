(() => {
  document.addEventListener('DOMContentLoaded', async () => {
  if (window.TrackerData && window.TrackerData.init) await window.TrackerData.init();
    const button = document.getElementById('profileMenuButton');
    const menu = document.getElementById('profileMenu');
    if (!button || !menu) return;

    const photoButton = document.getElementById('takeProfilePhotoBtn');
    const browseButton = document.getElementById('browseProfilePhotoBtn');
    const removeButton = document.getElementById('removeProfilePhotoBtn');
    const signOutButton = document.getElementById('profileSignOutBtn');
    const fileInput = document.getElementById('profilePhotoInput');
    const status = document.getElementById('profileMenuStatus');
    const authHint = document.getElementById('profileAuthHint');
    const cameraModal = document.getElementById('cameraModal');
    const video = document.getElementById('profileCameraVideo');
    const cameraStatus = document.getElementById('cameraStatus');
    const captureButton = document.getElementById('captureProfilePhotoBtn');
    const photoImages = [document.getElementById('dashboardProfilePhoto'), document.getElementById('profileMenuPhoto')];
    const placeholders = [document.getElementById('profileButtonPlaceholder'), document.getElementById('profileMenuPlaceholder')];
    const nameLabel = document.getElementById('profileMenuName');
    const emailLabel = document.getElementById('profileMenuEmail');
    let profile = null;
    let cameraStream = null;

    function currentLocalName() {
      try { return localStorage.getItem('authDisplayName') || window.TrackerData?.user || 'Guest'; }
      catch (_) { return window.TrackerData?.user || 'Guest'; }
    }
    function setStatus(message = '', kind = '') {
      status.textContent = message;
      status.hidden = !message;
      status.classList.toggle('error', kind === 'error');
      status.classList.toggle('success', kind === 'success');
    }
    function setAvatar(profileData = profile) {
      const name = profileData?.name || currentLocalName();
      nameLabel.textContent = name;
      emailLabel.textContent = profileData?.email || 'Guest profile';
      button.setAttribute('aria-label', `Open profile menu for ${name}`);

      const rawUrl = profileData?.avatarUrl || '';
      const hasPhoto = rawUrl.startsWith('/uploads/avatars/');
      photoImages.forEach(image => {
        image.hidden = !hasPhoto;
        if (hasPhoto) image.src = `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
      });
      placeholders.forEach(item => { item.hidden = hasPhoto; });
      removeButton.disabled = !profileData || !hasPhoto;
    }
    function setAuthenticated(isAuthenticated) {
      photoButton.disabled = !isAuthenticated;
      browseButton.disabled = !isAuthenticated;
      removeButton.disabled = !isAuthenticated || !profile?.avatarUrl?.startsWith('/uploads/avatars/');
      authHint.hidden = isAuthenticated;
    }
    function setMenu(open, focusFirst = false) {
      menu.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      if (open && focusFirst) {
        const first = menu.querySelector('[role="menuitem"]:not(:disabled)');
        first?.focus();
      }
    }
    function menuItems() {
      return [...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    }
    function closeCamera() {
      if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
      video.srcObject = null;
      cameraModal.hidden = true;
      captureButton.disabled = false;
      button.focus();
    }
    function requireAccount() {
      if (profile) return true;
      setMenu(true);
      setStatus('Sign in to your account before saving a profile photo.', 'error');
      return false;
    }
    async function loadProfile() {
      try {
        const response = await fetch('/api/profile', { credentials: 'same-origin' });
        if (response.status === 401) {
          profile = null;
          setAuthenticated(false);
          setAvatar(null);
          return;
        }
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.profile) throw new Error(result.error || 'Could not load profile.');
        profile = result.profile;
        try { localStorage.setItem('authDisplayName', profile.name); } catch (_) {}
        setAuthenticated(true);
        setAvatar(profile);
      } catch (_) {
        profile = null;
        setAuthenticated(false);
        setAvatar(null);
      }
    }
    // Both camera captures and file-picker selections end up here. The browser
    // sends the image as multipart/form-data to the authenticated API, which
    // stores the validated image and returns the new profile URL.
    async function uploadPhoto(file, filename = file?.name || 'profile-photo.jpg') {
      if (!requireAccount()) return;
      if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        setStatus('Choose a PNG, JPEG, or WebP image.', 'error');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setStatus('Choose an image smaller than 5 MB.', 'error');
        return;
      }
      const formData = new FormData();
      formData.append('avatar', file, filename);
      setStatus('Uploading profile photo…');
      try {
        const response = await fetch('/api/profile/avatar', { method: 'POST', credentials: 'same-origin', body: formData });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.profile) throw new Error(result.error || `Upload failed (${response.status}).`);
        profile = result.profile;
        setAvatar(profile);
        setAuthenticated(true);
        setStatus('Profile photo updated.', 'success');
      } catch (error) {
        setStatus(error.message || 'Could not upload the profile photo.', 'error');
      }
    }
    // Camera flow: request permission only after the user clicks "Take a photo",
    // preview the stream in the modal, draw the captured frame to a canvas, and
    // convert it to a JPEG Blob before reusing uploadPhoto(). HTTPS (or localhost)
    // is required by browsers for getUserMedia().
    async function startCamera() {
      if (!requireAccount()) return;
      setMenu(false);
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('Camera access needs a supported browser on localhost or HTTPS. You can use Browse files instead.', 'error');
        setMenu(true);
        return;
      }
      cameraStatus.textContent = 'Requesting camera access…';
      captureButton.disabled = true;
      cameraModal.hidden = false;
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        video.srcObject = cameraStream;
        await video.play();
        captureButton.disabled = false;
        cameraStatus.textContent = 'Position your face in the frame, then capture.';
        document.getElementById('closeCameraBtn').focus();
      } catch (error) {
        cameraStatus.textContent = error.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access or choose Browse files.'
          : 'Could not open the camera. Choose Browse files instead.';
        captureButton.disabled = true;
      }
    }

    button.addEventListener('click', () => setMenu(menu.hidden, menu.hidden));
    button.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setMenu(true, true); }
    });
    document.addEventListener('click', event => {
      if (!menu.contains(event.target) && !button.contains(event.target)) setMenu(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (!cameraModal.hidden) closeCamera();
        else if (!menu.hidden) { setMenu(false); button.focus(); }
      }
    });
    menu.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const items = menuItems();
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + delta + items.length) % items.length].focus();
    });
    photoButton.addEventListener('click', startCamera);
    browseButton.addEventListener('click', () => { if (requireAccount()) { setMenu(false); fileInput.click(); } });
    // File flow: the hidden input opens the native file picker. Reset its value
    // after each selection so choosing the same file again still fires change.
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (file) { setMenu(true); await uploadPhoto(file); }
      fileInput.value = '';
    });
    removeButton.addEventListener('click', async () => {
      if (!requireAccount() || removeButton.disabled) return;
      setStatus('Removing profile photo…');
      try {
        const response = await fetch('/api/profile/avatar', { method: 'DELETE', credentials: 'same-origin' });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.profile) throw new Error(result.error || `Could not remove photo (${response.status}).`);
        profile = result.profile;
        setAvatar(profile);
        setAuthenticated(true);
        setStatus('Profile photo removed.', 'success');
      } catch (error) {
        setStatus(error.message || 'Could not remove the profile photo.', 'error');
      }
    });
    signOutButton.addEventListener('click', async () => {
      setMenu(false);
      try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch (_) {}
      try { localStorage.removeItem('authDisplayName'); } catch (_) {}
      // login.html is the stable login entry point; it forwards to the sign-in UI.
      window.location.assign('login.html');
    });
    document.getElementById('closeCameraBtn').addEventListener('click', closeCamera);
    document.getElementById('cancelCameraBtn').addEventListener('click', closeCamera);
    cameraModal.addEventListener('click', event => { if (event.target === cameraModal) closeCamera(); });
    captureButton.addEventListener('click', () => {
      if (!video.videoWidth || !video.videoHeight) { cameraStatus.textContent = 'The camera is still starting. Try again in a moment.'; return; }
      captureButton.disabled = true;
      cameraStatus.textContent = 'Preparing your photo…';
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(async blob => {
        if (!blob) { cameraStatus.textContent = 'Could not capture the photo. Please try again.'; captureButton.disabled = false; return; }
        closeCamera();
        setMenu(true);
        await uploadPhoto(blob, 'profile-camera.jpg');
      }, 'image/jpeg', .9);
    });
    window.addEventListener('pagehide', () => { if (cameraStream) cameraStream.getTracks().forEach(track => track.stop()); });

    setAvatar(null);
    setAuthenticated(false);
    loadProfile();
  });
})();
