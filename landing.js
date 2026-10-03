(() => {
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const username = document.getElementById('loginUsername');
  const password = document.getElementById('loginPassword');
  const remember = document.getElementById('rememberMe');
  const status = document.getElementById('loginStatus');
  const heading = document.getElementById('loginHeading');
  const subtitle = document.querySelector('.form-subtitle');
  const signupPrompt = document.getElementById('signupPrompt');
  const loginPrompt = document.getElementById('loginPrompt');
  const menuButton = document.getElementById('brandMenuButton');
  const menu = document.getElementById('brandMenu');

  function setStatus(message, kind = '') {
    status.textContent = message;
    status.classList.toggle('error', kind === 'error');
    status.classList.toggle('success', kind === 'success');
  }
  function setMode(mode) {
    const signup = mode === 'signup';
    loginForm.hidden = signup;
    signupForm.hidden = !signup;
    signupPrompt.hidden = signup;
    loginPrompt.hidden = !signup;
    heading.textContent = signup ? 'Create your account' : 'Welcome back';
    subtitle.textContent = signup ? 'Start planning with your own private workspace.' : 'Sign in to pick up where you left off.';
    document.querySelector('.form-eyebrow').textContent = signup ? 'A LITTLE MORE FOCUS, EVERY DAY' : 'YOUR NEXT CHAPTER STARTS HERE';
    setStatus('');
    if (signup) document.getElementById('signupName').focus();
    else username.focus();
  }
  async function postJson(url, payload) {
    const response = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
    return result;
  }
  async function submit(form, url, payload, buttonLabel) {
    const button = form.querySelector('button[type="submit"]');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = buttonLabel;
    setStatus('Connecting securely to your local server…');
    try {
      await postJson(url, payload);
      setStatus('Signed in. Opening your tasks…', 'success');
      window.location.assign('tasks.html');
    } catch (error) {
      setStatus(error.message || 'Could not connect to the local server. Run `npm start` and retry.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  loginForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!loginForm.reportValidity()) return;
    submit(loginForm, '/api/auth/login', { email: username.value.trim(), password: password.value, remember: remember.checked }, 'SIGNING IN…');
  });
  signupForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!signupForm.reportValidity()) return;
    const signupPassword = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    if (signupPassword !== confirmPassword) {
      setStatus('The passwords do not match.', 'error');
      document.getElementById('signupConfirmPassword').focus();
      return;
    }
    submit(signupForm, '/api/auth/register', {
      name: document.getElementById('signupName').value.trim(),
      email: document.getElementById('signupEmail').value.trim(),
      password: signupPassword
    }, 'CREATING ACCOUNT…');
  });
  document.getElementById('createAccount').addEventListener('click', event => { event.preventDefault(); setMode('signup'); });
  document.getElementById('showLogin').addEventListener('click', event => { event.preventDefault(); setMode('login'); });
  document.getElementById('forgotPassword').addEventListener('click', event => {
    event.preventDefault();
    setStatus('Self-service password recovery is not configured. If you can sign in, change your password in Profile Settings; otherwise contact the local app owner.', 'error');
  });

  menuButton.addEventListener('click', () => {
    const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!isOpen));
    menu.hidden = isOpen;
  });
  menu.addEventListener('click', event => {
    if (event.target.closest('a')) { menu.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('click', event => {
    if (!menu.contains(event.target) && !menuButton.contains(event.target)) { menu.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { menu.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); menuButton.focus(); }
  });

  fetch('/api/auth/me', { credentials: 'same-origin' }).then(response => {
    if (response.ok) window.location.replace('tasks.html');
  }).catch(() => {
    // Keep the form usable; submitting while the server is down gives the exact startup hint.
  });
})();
