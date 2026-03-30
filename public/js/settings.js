/* === SETTINGS PAGE === */
const Settings = {
  async init() {
    await this.loadUser();
    this.initNav();
    this.initDarkMode();
    this.initLogout();
    this.initProfileSave();
    this.initLLMSave();
    this.initCalendar();
    document.querySelector('[data-section="stats"]').addEventListener('click', () => this.loadStats());

    // Handle redirect back from Google OAuth
    const params = new URLSearchParams(window.location.search);
    const gcal = params.get('gcal');
    if (gcal === 'connected') { this.toast('Google Calendar connected!'); this._activateSection('calendar'); }
    if (gcal === 'error')     { this.toast('Google Calendar connection failed.', true); this._activateSection('calendar'); }
    if (gcal) history.replaceState(null, '', '/settings');
  },

  _activateSection(name) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
    document.querySelector(`[data-section="${name}"]`)?.classList.add('active');
    document.getElementById(`section-${name}`)?.classList.add('active');
  },

  async loadUser() {
    const res = await fetch('/api/auth/me');
    if (res.status === 401) { window.location.href = '/login'; return; }
    const { user } = await res.json();
    this.user = user;

    document.getElementById('s-username').textContent = user.username;
    document.getElementById('topbar-username').textContent = user.displayName || user.username;
    document.getElementById('s-display-name').value = user.displayName || '';
    document.getElementById('s-email').value = user.email || '';
    document.getElementById('s-llm-provider').value = user.llmProvider || '';
    document.getElementById('s-llm-model').value = user.llmModel || '';
    document.getElementById('s-llm-system').value = user.llmSystemPrompt || '';
    const cfgEl = document.getElementById('s-llm-configured');
    if (cfgEl) cfgEl.textContent = user.llmConfigured ? '✓ API key is saved' : 'No API key saved yet.';
    if (user.role === 'admin') document.getElementById('btn-admin')?.classList.remove('hidden');
  },

  initNav() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const target = item.dataset.section;
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
        item.classList.add('active');
        document.getElementById('section-' + target)?.classList.add('active');
      });
    });
  },

  initDarkMode() {
    if (localStorage.getItem('wms-darkmode') === 'true') document.body.classList.add('dark');
    document.getElementById('btn-darkmode')?.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      localStorage.setItem('wms-darkmode', document.body.classList.contains('dark'));
    });
  },

  initLogout() {
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    });
  },

  initProfileSave() {
    document.getElementById('profile-save').addEventListener('click', async () => {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: document.getElementById('s-display-name').value.trim(),
          email: document.getElementById('s-email').value.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { this.toast(data.error || 'Save failed', true); return; }
      document.getElementById('topbar-username').textContent = data.displayName;
      this.toast('Profile saved.');
    });

    document.getElementById('pw-save').addEventListener('click', async () => {
      const newPw = document.getElementById('s-new-pw').value;
      const confirm = document.getElementById('s-new-pw2').value;
      if (newPw !== confirm) { this.toast('Passwords do not match.', true); return; }
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: document.getElementById('s-cur-pw').value,
          newPassword: newPw,
        }),
      });
      const data = await res.json();
      if (!res.ok) { this.toast(data.error || 'Password update failed', true); return; }
      document.getElementById('s-cur-pw').value = '';
      document.getElementById('s-new-pw').value = '';
      document.getElementById('s-new-pw2').value = '';
      this.toast('Password updated.');
    });
  },

  initLLMSave() {
    document.getElementById('llm-save').addEventListener('click', async () => {
      const llmProvider = document.getElementById('s-llm-provider').value;
      const llmModel = document.getElementById('s-llm-model').value.trim();
      const llmSystemPrompt = document.getElementById('s-llm-system').value;
      const llmApiKey = document.getElementById('s-llm-apikey').value;
      const body = { llmProvider, llmModel, llmSystemPrompt };
      if (llmApiKey) body.llmApiKey = llmApiKey;
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); this.toast(d.error || 'Save failed', true); return; }
      if (llmApiKey) {
        document.getElementById('s-llm-apikey').value = '';
        document.getElementById('s-llm-configured').textContent = '✓ API key is saved';
      }
      this.toast('LLM settings saved.');
    });
  },

  async initCalendar() {
    // Show redirect URI hint
    const hint = document.getElementById('gcal-redirect-hint');
    if (hint) hint.textContent = window.location.origin + '/api/oauth/google/callback';

    // Save credentials
    document.getElementById('gcal-creds-save')?.addEventListener('click', async () => {
      const clientId     = document.getElementById('gcal-client-id').value.trim();
      const clientSecret = document.getElementById('gcal-client-secret').value.trim();
      if (!clientId || !clientSecret) { this.toast('Both fields are required.', true); return; }
      const r = await fetch('/api/oauth/google/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleClientId: clientId, googleClientSecret: clientSecret }),
      });
      if (!r.ok) { const d = await r.json(); this.toast(d.error || 'Save failed', true); return; }
      document.getElementById('gcal-client-secret').value = '';
      this.toast('Credentials saved. Now connect your account below.');
      await this._refreshCalendarStatus();
    });

    await this._refreshCalendarStatus();

    document.getElementById('gcal-disconnect')?.addEventListener('click', async () => {
      const r = await fetch('/api/oauth/google/disconnect', { method: 'POST' });
      if (r.ok) {
        this.toast('Disconnected from Google Calendar.');
        await this._refreshCalendarStatus();
      } else {
        this.toast('Disconnect failed.', true);
      }
    });
  },

  async _refreshCalendarStatus() {
    const res = await fetch('/api/oauth/google/status');
    if (!res.ok) return;
    const { connected, configured } = await res.json();

    document.getElementById('gcal-connected-ui')?.classList.toggle('hidden', !connected);
    document.getElementById('gcal-disconnected-ui')?.classList.toggle('hidden', connected || !configured);
    document.getElementById('gcal-needs-creds')?.classList.toggle('hidden', configured || connected);
  },

  async loadStats() {
    const summaryEl = document.getElementById('stats-summary');
    const boardsEl = document.getElementById('stats-boards');
    summaryEl.textContent = 'Loading…';
    boardsEl.innerHTML = '';

    const res = await fetch('/api/stats');
    if (!res.ok) { summaryEl.textContent = 'Failed to load statistics.'; return; }
    const { boards, totalBoards, totalElements, totalConnections, allTypes } = await res.json();

    const typeOrder = ['text','heading','note','image','file','rect','circle','icon','todo','draw','pin','llmchat','arrow'];
    const typeLabel = { text:'Text', heading:'Heading', note:'Note', image:'Image', file:'File', rect:'Rect', circle:'Circle', icon:'Icon', todo:'Todo', draw:'Draw', pin:'Pin', llmchat:'Chat', arrow:'Arrow' };

    summaryEl.innerHTML = `
      <div class="stat-cards">
        <div class="stat-card"><div class="stat-num">${totalBoards}</div><div class="stat-lbl">BOARDS</div></div>
        <div class="stat-card"><div class="stat-num">${totalElements}</div><div class="stat-lbl">ELEMENTS</div></div>
        <div class="stat-card"><div class="stat-num">${totalConnections}</div><div class="stat-lbl">CONNECTIONS</div></div>
      </div>
      <div class="stat-types">
        ${typeOrder.filter(t => allTypes[t]).map(t =>
          `<div class="stat-type"><span class="stat-type-name">${typeLabel[t]||t}</span><span class="stat-type-count">${allTypes[t]}</span></div>`
        ).join('')}
      </div>`;

    if (boards.length === 0) {
      boardsEl.innerHTML = '<div class="stats-empty">No boards yet.</div>';
      return;
    }

    boardsEl.innerHTML = boards.map(b => {
      const types = typeOrder.filter(t => b.typeCounts[t])
        .map(t => `<span class="board-type-pill">${typeLabel[t]||t} ${b.typeCounts[t]}</span>`).join('');
      const lastEdit = b.lastEdit ? new Date(b.lastEdit).toLocaleDateString() : '—';
      return `
        <div class="stats-board-row">
          <div class="stats-board-name">
            <a href="/canvas?board=${encodeURIComponent(b.name)}">${b.name}</a>
          </div>
          <div class="stats-board-meta">
            <span>${b.elementCount} elements</span>
            <span>${b.connectionCount} connections</span>
            <span>${lastEdit}</span>
          </div>
          <div class="stats-board-types">${types}</div>
        </div>`;
    }).join('');
  },

  toast(msg, isError = false) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast toast--visible' + (isError ? ' toast--error' : '');
    setTimeout(() => { el.className = 'toast'; }, 3000);
  },
};

document.addEventListener('DOMContentLoaded', () => Settings.init());
