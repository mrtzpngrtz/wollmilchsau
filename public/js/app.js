/* === WOLLMILCHSAU — Main App === */
const App = {
  elements: [],
  connections: [],
  currentTool: 'select',
  _pendingImagePos: null,
  currentUser: null,

  async init() {
    // Load current user
    await this.loadCurrentUser();

    Canvas.init();
    Elements.init();
    Connections.init();
    Toolbar.init();
    ContextMenu.init();
    Storage.init();
    DragDrop.init();
    IconPicker.init();
    Suggestions.init();

    // Push initial empty state
    History.push({ elements: [], connections: [] });
    History.updateButtons();

    // Dashboard
    Storage.initDashboard();
    Storage.showDashboard();

    // Click brand name to open dashboard
    document.querySelector('.brand-name').style.cursor = 'pointer';
    document.querySelector('.brand-name').addEventListener('click', () => {
      if (App.elements.length > 0) Storage.save(Storage.currentBoard);
      Storage.showDashboard();
    });

    // Dark mode
    this.initDarkMode();

    // Logout
    this.initLogout();

    // Profile
    this.initProfile();

    console.log('WOLLMILCHSAU v0.8.1 — Ready');
    console.log('Keys: V=Select H=Pan T=Text N=Note R=Rect A=Arrow D=Todo P=Draw K=Pin Space=Pan');
  },

  async loadCurrentUser() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const data = await res.json();
      this.currentUser = data.user;
      const nameBtn = document.getElementById('btn-profile');
      if (nameBtn) nameBtn.textContent = data.user.displayName || data.user.username;
      if (data.user.role === 'admin') {
        const adminBtn = document.getElementById('btn-admin');
        if (adminBtn) adminBtn.classList.remove('hidden');
      }
    } catch (err) {
      console.error('Auth check failed:', err);
    }
  },

  initProfile() {
    const modal = document.getElementById('profile-modal');
    if (!modal) return;

    const openModal = async () => {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      const u = data.user;
      document.getElementById('profile-username').textContent = u.username;
      document.getElementById('profile-display-name').value = u.displayName || '';
      document.getElementById('profile-email').value = u.email || '';
      document.getElementById('profile-cur-pw').value = '';
      document.getElementById('profile-new-pw').value = '';
      document.getElementById('profile-new-pw2').value = '';
      modal.classList.remove('hidden');
    };

    document.getElementById('btn-profile').addEventListener('click', openModal);

    const closeModal = () => modal.classList.add('hidden');
    document.getElementById('profile-close').addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    document.getElementById('profile-save').addEventListener('click', async () => {
      const displayName = document.getElementById('profile-display-name').value.trim();
      const email = document.getElementById('profile-email').value.trim();
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, email }),
      });
      const data = await res.json();
      if (!res.ok) { await Dialog.alert(data.error || 'Save failed', 'ERROR'); return; }
      this.currentUser.displayName = data.displayName;
      document.getElementById('btn-profile').textContent = data.displayName;
      await Dialog.alert('Profile saved.', 'SAVED');
    });

    document.getElementById('profile-pw-save').addEventListener('click', async () => {
      const currentPassword = document.getElementById('profile-cur-pw').value;
      const newPassword = document.getElementById('profile-new-pw').value;
      const confirm = document.getElementById('profile-new-pw2').value;
      if (!currentPassword || !newPassword) { await Dialog.alert('Fill in current and new password.', 'ERROR'); return; }
      if (newPassword !== confirm) { await Dialog.alert('New passwords do not match.', 'ERROR'); return; }
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { await Dialog.alert(data.error || 'Password update failed', 'ERROR'); return; }
      document.getElementById('profile-cur-pw').value = '';
      document.getElementById('profile-new-pw').value = '';
      document.getElementById('profile-new-pw2').value = '';
      await Dialog.alert('Password updated.', 'SAVED');
    });
  },

  initLogout() {
    const btn = document.getElementById('btn-logout');
    if (btn) {
      btn.addEventListener('click', async () => {
        Collab.leaveBoard();
        if (this.elements.length > 0) await Storage.save(Storage.currentBoard);
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login';
      });
    }
  },

  initDarkMode() {
    const saved = localStorage.getItem('wms-darkmode');
    if (saved === 'true') {
      document.body.classList.add('dark');
    }
    document.getElementById('btn-darkmode').addEventListener('click', () => {
      const wasDark = document.body.classList.contains('dark');
      document.body.classList.toggle('dark');
      const isDark = document.body.classList.contains('dark');
      localStorage.setItem('wms-darkmode', isDark);
      // Swap element colors for dark/light
      this.swapElementColors(wasDark, isDark);
      Elements.renderAll();
      Canvas.drawGrid();
      Connections.render();
      Canvas.updateMinimap();
    });
  },

  /** Swap hardcoded black/white colors on elements when toggling dark mode */
  swapElementColors(wasDark, isDark) {
    const lightDarks = ['#111111', '#000000', '#222222', '#333333'];
    const lightLights = ['#FFFFFF', '#F2F2F2', '#E8E8E8', '#EEEEEE'];

    this.elements.forEach(el => {
      if (isDark && !wasDark) {
        // Light → Dark: flip dark colors to light
        if (el.color && lightDarks.includes(el.color.toUpperCase())) {
          el.color = '#E0E0E0';
        }
        if (el.borderColor && lightDarks.includes(el.borderColor.toUpperCase())) {
          el.borderColor = '#E8E8E8';
        }
      } else if (!isDark && wasDark) {
        // Dark → Light: flip light colors to dark
        if (el.color && lightLights.includes(el.color.toUpperCase())) {
          el.color = '#111111';
        }
        if (el.color === '#E0E0E0') {
          el.color = '#111111';
        }
        if (el.borderColor && (lightLights.includes(el.borderColor.toUpperCase()) || el.borderColor === '#E8E8E8')) {
          el.borderColor = '#111111';
        }
      }
      // Also swap stroke color for draw elements
      if (el.type === 'draw') {
        if (isDark && !wasDark && lightDarks.includes((el.strokeColor || '').toUpperCase())) {
          el.strokeColor = '#E0E0E0';
        } else if (!isDark && wasDark && (lightLights.includes((el.strokeColor || '').toUpperCase()) || el.strokeColor === '#E0E0E0')) {
          el.strokeColor = '#111111';
        }
      }
    });
  },

  setTool(tool) {
    this.currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    const container = Canvas.container;
    container.className = '';
    if (tool === 'pan') container.classList.add('panning');
    else if (['text'].includes(tool)) container.classList.add('tool-text');
    else if (['rect', 'circle', 'note'].includes(tool)) container.classList.add('tool-rect');
    else if (tool === 'arrow') container.classList.add('tool-arrow');
    else if (tool === 'draw') container.classList.add('tool-draw');

    if (tool === 'icon') {
      const center = Canvas.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
      IconPicker.show(center.x, center.y);
    }
  },

  saveState() {
    History.push({
      elements: JSON.parse(JSON.stringify(this.elements)),
      connections: JSON.parse(JSON.stringify(this.connections)),
    });
    Collab.broadcastState();
  },

  undo() {
    const state = History.undo();
    if (state) {
      this.elements = state.elements;
      this.connections = state.connections;
      Elements.clearSelection();
      Elements.renderAll();
      Connections.render();
      Canvas.updateMinimap();
    }
  },

  redo() {
    const state = History.redo();
    if (state) {
      this.elements = state.elements;
      this.connections = state.connections;
      Elements.clearSelection();
      Elements.renderAll();
      Connections.render();
      Canvas.updateMinimap();
    }
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
