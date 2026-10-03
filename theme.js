(() => {
  function readThemeCookie() {
    const pair = document.cookie.split('; ').find(item => item.startsWith('misha-theme='));
    return pair ? decodeURIComponent(pair.split('=').slice(1).join('=')) : 'light';
  }
  function applyTheme(theme, announce = false) {
    const selected = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', selected);
    document.cookie = `misha-theme=${selected}; Max-Age=31536000; Path=/; SameSite=Lax`;
    if (announce) window.dispatchEvent(new CustomEvent('tracker:theme-changed', { detail: { theme: selected } }));
  }
  applyTheme(readThemeCookie());
  window.toggleTrackerTheme = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#themeToggle, #toggleThemeBtn, .theme-toggle').forEach(button => {
      button.addEventListener('click', event => { event.preventDefault(); window.toggleTrackerTheme(); });
    });
    const navLoader = document.createElement('script');
    navLoader.src = 'nav.js';
    document.body.appendChild(navLoader);
  });
})();
