(() => {
  const sidebar = document.querySelector('.sidebar-nav');
  if (!sidebar) return;
  const taskLink = sidebar.querySelector('a[href="tasks.html"], a[href^="tasks.html?"]');
  if (taskLink && !sidebar.querySelector('[data-nav-scope="today"]')) {
    const makeItem = (scope, icon, label) => {
      const item = document.createElement('li'); const link = document.createElement('a');
      link.href = `tasks.html?scope=${scope}`; link.dataset.navScope = scope;
      link.innerHTML = `<span class="material-icons">${icon}</span> ${label}`;
      item.appendChild(link); return item;
    };
    taskLink.parentElement.after(makeItem('today', 'today', 'Today'), makeItem('upcoming', 'upcoming', 'Upcoming'));
  }
  document.querySelectorAll('.user-profile').forEach(link => {
    link.href = 'settings.html'; link.title = 'Profile settings';
  });
  const params = new URLSearchParams(window.location.search);
  const scope = params.get('scope');
  if (scope === 'today' || scope === 'upcoming') {
    sidebar.querySelectorAll('a.active').forEach(link => { link.classList.remove('active'); link.removeAttribute('aria-current'); });
    const current = sidebar.querySelector(`[data-nav-scope="${scope}"]`);
    current?.classList.add('active'); current?.setAttribute('aria-current', 'page');
  }
})();
