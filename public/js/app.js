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
    this.initDragDrop();
    this.initFileInput();
    this.initIconPicker();

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

    // Suggestions box
    this.initSuggestions();

    // Dark mode
    this.initDarkMode();

    // Logout
    this.initLogout();

    console.log('WOLLMILCHSAU v1.0.0 — Ready');
    console.log('Keys: V=Select H=Pan T=Text N=Note R=Rect A=Arrow Space=Pan');
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
      const nameEl = document.getElementById('user-display-name');
      if (nameEl) nameEl.textContent = data.user.displayName || data.user.username;
      if (data.user.role === 'admin') {
        const adminBtn = document.getElementById('btn-admin');
        if (adminBtn) adminBtn.classList.remove('hidden');
      }
    } catch (err) {
      console.error('Auth check failed:', err);
    }
  },

  initLogout() {
    const btn = document.getElementById('btn-logout');
    if (btn) {
      btn.addEventListener('click', async () => {
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
      document.body.classList.toggle('dark');
      const isDark = document.body.classList.contains('dark');
      localStorage.setItem('wms-darkmode', isDark);
      // Redraw grid with correct colors
      Canvas.drawGrid();
      Canvas.updateMinimap();
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

    if (tool === 'icon') {
      const center = Canvas.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
      this.showIconPicker(center.x, center.y);
    }
  },

  saveState() {
    History.push({
      elements: JSON.parse(JSON.stringify(this.elements)),
      connections: JSON.parse(JSON.stringify(this.connections)),
    });
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

  initDragDrop() {
    const dropZone = document.getElementById('drop-zone');
    let dragCounter = 0;

    document.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      dropZone.classList.remove('hidden');
    });

    document.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dropZone.classList.add('hidden');
        dragCounter = 0;
      }
    });

    document.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    document.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.add('hidden');
      dragCounter = 0;

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      const canvasPos = Canvas.screenToCanvas(e.clientX, e.clientY);
      let offsetX = 0;

      for (const file of files) {
        await this.addFileToCanvas(file, canvasPos.x + offsetX, canvasPos.y);
        offsetX += 220;
      }
    });
  },

  initFileInput() {
    const fileInput = document.getElementById('file-input');
    fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      const pos = this._pendingImagePos || Canvas.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
      let offsetX = 0;

      for (const file of files) {
        await this.addFileToCanvas(file, pos.x + offsetX, pos.y);
        offsetX += 220;
      }

      this._pendingImagePos = null;
      fileInput.value = '';
      fileInput.accept = 'image/*,.pdf,.doc,.docx,.txt,.svg';
      this.setTool('select');
    });
  },

  async addFileToCanvas(file, x, y) {
    try {
      const result = await Utils.uploadFile(file);

      if (file.type.startsWith('image/')) {
        const img = new Image();
        img.src = result.url;
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });

        const maxW = 400;
        const ratio = img.naturalWidth / img.naturalHeight;
        const width = Math.min(img.naturalWidth, maxW);
        const height = width / ratio;

        const data = Elements.create('image', x, y, {
          url: result.url,
          originalName: result.originalName,
          width, height,
        });
        this.elements.push(data);
        Elements.renderElement(data);
        Elements.select(data.id);
      } else {
        const data = Elements.create('file', x, y, {
          url: result.url,
          originalName: result.originalName,
          fileSize: result.size,
          mimetype: result.mimetype,
        });
        this.elements.push(data);
        Elements.renderElement(data);
        Elements.select(data.id);
      }

      this.saveState();
      Canvas.updateMinimap();
    } catch (err) {
      console.error('Upload failed:', err);
    }
  },

  initIconPicker() {
    const modal = document.getElementById('icon-picker');
    const grid = document.getElementById('icon-grid');
    const search = document.getElementById('icon-search');

    this._iconPickerPos = { x: 0, y: 0 };

    const renderIcons = (filter = '') => {
      grid.innerHTML = '';
      Utils.ICONS.forEach(icon => {
        if (filter && !icon.includes(filter)) return;
        const div = document.createElement('div');
        div.className = 'icon-option';
        div.textContent = icon;
        div.addEventListener('click', () => {
          const data = Elements.create('icon', this._iconPickerPos.x, this._iconPickerPos.y, { icon });
          this.elements.push(data);
          Elements.renderElement(data);
          Elements.select(data.id);
          this.saveState();
          Canvas.updateMinimap();
          modal.classList.add('hidden');
          this.setTool('select');
        });
        grid.appendChild(div);
      });
    };

    search.addEventListener('input', () => renderIcons(search.value));
    renderIcons();
  },

  initSuggestions() {
    const lightbox = document.getElementById('suggestions-lightbox');
    const trigger = document.getElementById('suggestions-trigger');
    const closeBtn = document.getElementById('suggestions-close');
    const input = document.getElementById('suggestion-input');
    const submit = document.getElementById('suggestion-submit');

    // Open lightbox
    trigger.addEventListener('click', () => {
      lightbox.classList.remove('hidden');
      this.loadSuggestions();
      input.focus();
    });

    // Close lightbox
    closeBtn.addEventListener('click', () => lightbox.classList.add('hidden'));
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) lightbox.classList.add('hidden');
    });

    // Submit
    const doSubmit = async () => {
      const text = input.value.trim();
      if (!text) return;
      try {
        await fetch('/api/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        input.value = '';
        this.loadSuggestions();
      } catch (err) {
        console.error('Suggestion submit failed:', err);
      }
    };

    submit.addEventListener('click', doSubmit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSubmit();
    });
  },

  async loadSuggestions() {
    const list = document.getElementById('suggestions-list');
    try {
      const res = await fetch('/api/suggestions');
      const suggestions = await res.json();
      list.innerHTML = '';

      if (suggestions.length === 0) {
        list.innerHTML = '<div class="suggestions-empty">No requests yet. Be the first!</div>';
        return;
      }

      suggestions.forEach(s => {
        const item = document.createElement('div');
        item.className = 'suggestion-item-lb';
        const userLabel = s.user ? `<span class="suggestion-user">${this.escapeHtml(s.user)}</span>` : '';
        item.innerHTML = `
          <span class="suggestion-bullet">→</span>
          <div class="suggestion-content-lb">
            <div class="suggestion-text-lb">${this.escapeHtml(s.text)}</div>
            <div class="suggestion-meta-lb">${userLabel}<span class="suggestion-time-lb">${Storage.formatTimeAgo(s.time)}</span></div>
          </div>
        `;
        list.appendChild(item);
      });
    } catch (err) {
      console.error('Load suggestions failed:', err);
    }
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  showIconPicker(x, y) {
    this._iconPickerPos = { x, y };
    const modal = document.getElementById('icon-picker');
    modal.classList.remove('hidden');
    const search = document.getElementById('icon-search');
    search.value = '';
    search.focus();

    const grid = document.getElementById('icon-grid');
    grid.innerHTML = '';
    Utils.ICONS.forEach(icon => {
      const div = document.createElement('div');
      div.className = 'icon-option';
      div.textContent = icon;
      div.addEventListener('click', () => {
        const data = Elements.create('icon', this._iconPickerPos.x, this._iconPickerPos.y, { icon });
        this.elements.push(data);
        Elements.renderElement(data);
        Elements.select(data.id);
        this.saveState();
        Canvas.updateMinimap();
        modal.classList.add('hidden');
        this.setTool('select');
      });
      grid.appendChild(div);
    });
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
