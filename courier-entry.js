(() => {
  'use strict';
  const link = document.querySelector('#courier-entry');
  if (!link) return;
  let account = null, revision = 0, checking = false;
  async function api(action, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/api/courier?action=' + action, {
        method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin',
        headers: body ? {'Content-Type': 'application/json'} : {},
        body: body ? JSON.stringify(body) : undefined, signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo conectar con Canopia.');
      return data;
    } finally { clearTimeout(timeout); }
  }
  function updateButton() {
    const button = document.querySelector('#open-auth');
    if (!button) return;
    if (account) {
      button.classList.add('is-logged');
      button.setAttribute('aria-label', 'Mi cuenta, ' + account.name + ', repartidor');
      button.title = account.name;
    } else if (typeof updateAuthButton === 'function') updateAuthButton();
  }
  function setAccount(value) {
    account = value || null;
    link.hidden = !account; // A private-link cookie alone never reveals this shortcut.
    const name = document.querySelector('#courier-account-name');
    if (name) name.textContent = account ? account.name : '';
    updateButton();
    const view = document.querySelector('#auth-view-courier');
    if (!account && view && !view.hidden) showLoginView();
  }
  function showAccount() {
    if (!account) return;
    ['login', 'profile', 'recovery'].forEach(view => {
      document.querySelector('#auth-view-' + view).hidden = true;
    });
    document.querySelector('#auth-view-courier').hidden = false;
    document.querySelector('#courier-account-message').textContent = '';
  }
  async function check() {
    if (document.hidden || checking) return;
    checking = true;
    const started = revision;
    try {
      const data = await api('me');
      if (started === revision) setAccount(data.courier);
    } catch {
      if (started === revision) link.hidden = true;
    } finally { checking = false; }
  }
  window.CanopiaCourier = {
    get account() { return account; }, updateButton, showAccount,
    async login(username, password) {
      ++revision;
      const data = await api('login', {username, password});
      setAccount(data.courier);
    },
  };
  document.querySelector('#close-auth-panel-courier')?.addEventListener('click', () => {
    if (typeof closeAuthPanel === 'function') closeAuthPanel();
  });
  document.querySelector('#courier-account-logout')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    ++revision;
    try { await api('logout', {}); setAccount(null); showLoginView(); }
    catch (error) { document.querySelector('#courier-account-message').textContent = error.message; }
    finally { button.disabled = false; }
  });
  check();
  addEventListener('pageshow', check);
  addEventListener('online', check);
  document.addEventListener('visibilitychange', check);
  setInterval(check, 30000);
})();
