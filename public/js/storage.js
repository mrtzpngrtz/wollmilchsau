/* === STORAGE (Save/Load/Board Switcher) === */
const Storage = {
  autoSaveInterval: null,
  currentBoard: 'default',
  dropdownOpen: false,

  init() {
    this.autoSaveInterval = setInterval(() => this.autoSave(), 30000);

    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.modal').classList.add('hidden'));
    });
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
    });

    document.getElementById('save-confirm').addEventListener('click', () => {
      const name = document.getElementById('board-name-input').value.trim();
      if (name) { this.save(name); document.getElementById('save-modal').classList.add('hidden'); }
    });
    document.getElementById('board-name-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('save-confirm').click();
    });

    this.initBoardSwitcher();
  },

  initBoardSwitcher() {
    const btn = document.getElementById('board-switcher-btn');
    const newBtn = document.getElementById('new-board-btn');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dropdownOpen ? this.closeDropdown() : this.openDropdown();
    });

    document.addEventListener('click', (e) => {
      if (this.dropdownOpen && !e.target.closest('#board-switcher')) this.closeDropdown();
    });

    newBtn.addEventListener('click', (e) => { e.stopPropagation(); this.createNewBoard(); });
  },

  openDropdown() {
    document.getElementById('board-dropdown').classList.remove('hidden');
    this.dropdownOpen = true;
    this.refreshDropdownList();
  },

  closeDropdown() {
    document.getElementById('board-dropdown').classList.add('hidden');
    this.dropdownOpen = false;
  },

  formatTimeAgo(isoStr) {
    if (!isoStr) return '—';
    const now = Date.now();
    const diff = now - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(isoStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  },

  async refreshDropdownList() {
    const list = document.getElementById('board-dropdown-list');
    try {
      const res = await fetch('/api/boards');
      const boards = await res.json();
      list.innerHTML = '';

      if (boards.length === 0) {
        list.innerHTML = '<div style="padding:12px;font-family:var(--font-mono);font-size:10px;color:var(--dark-grey)">No boards yet</div>';
        return;
      }

      boards.forEach(board => {
        const item = document.createElement('div');
        item.className = 'board-dropdown-item' + (board.name === this.currentBoard ? ' active' : '');

        const left = document.createElement('div');
        left.className = 'board-item-left';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'board-name';
        nameSpan.textContent = board.name;

        const info = document.createElement('div');
        info.className = 'board-info';
        info.innerHTML = `<span>${board.elementCount || 0} items</span><span>·</span><span>${this.formatTimeAgo(board.lastEdit)}</span>`;

        left.appendChild(nameSpan);
        left.appendChild(info);

        const actions = document.createElement('div');
        actions.className = 'board-actions';

        const renameBtn = document.createElement('button');
        renameBtn.className = 'board-action-btn';
        renameBtn.textContent = '✎';
        renameBtn.title = 'Rename';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'board-action-btn board-action-delete';
        deleteBtn.textContent = '✕';
        deleteBtn.title = 'Delete';

        actions.appendChild(renameBtn);
        actions.appendChild(deleteBtn);

        item.appendChild(left);
        item.appendChild(actions);

        // Click to switch
        left.addEventListener('click', (e) => {
          e.stopPropagation();
          if (App.elements.length > 0) this.save(this.currentBoard);
          this.load(board.name);
          this.closeDropdown();
        });

        // Rename
        renameBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.renameBoard(board.name);
        });

        // Delete
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Delete board "${board.name}"?`)) this.deleteBoard(board.name);
        });

        list.appendChild(item);
      });
    } catch (err) {
      console.error('Failed to list boards:', err);
    }
  },

  async renameBoard(oldName) {
    const newName = prompt('Rename board:', oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;

    const cleanName = newName.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    try {
      const res = await fetch(`/api/boards/${encodeURIComponent(oldName)}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: cleanName }),
      });
      const data = await res.json();
      if (data.success) {
        if (this.currentBoard === oldName) {
          this.currentBoard = cleanName;
          this.updateBoardName();
        }
        this.refreshDropdownList();
        console.log(`Board renamed: "${oldName}" → "${cleanName}"`);
      } else {
        alert(data.error || 'Rename failed');
      }
    } catch (err) {
      console.error('Rename failed:', err);
    }
  },

  async createNewBoard() {
    const name = prompt('Board name:');
    if (!name || !name.trim()) return;
    const cleanName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');

    if (App.elements.length > 0) await this.save(this.currentBoard);

    App.elements = [];
    App.connections = [];
    this.currentBoard = cleanName;
    this.updateBoardName();

    Elements.clearSelection();
    Elements.renderAll();
    Connections.render();
    Canvas.panX = window.innerWidth / 2;
    Canvas.panY = (window.innerHeight - 40) / 2;
    Canvas.zoom = 1;
    Canvas.updateTransform();
    Canvas.drawGrid();
    Canvas.updateMinimap();
    History.clear();
    History.push({ elements: [], connections: [] });

    await this.save(cleanName);
    this.closeDropdown();
    console.log(`New board "${cleanName}" created`);
  },

  async deleteBoard(name) {
    try {
      await fetch(`/api/boards/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (name === this.currentBoard) {
        const res = await fetch('/api/boards');
        const boards = await res.json();
        const remaining = boards.filter(b => b.name !== name);
        if (remaining.length > 0) {
          this.load(remaining[0].name);
        } else {
          App.elements = [];
          App.connections = [];
          this.currentBoard = 'default';
          this.updateBoardName();
          Elements.clearSelection();
          Elements.renderAll();
          Connections.render();
          Canvas.updateMinimap();
          History.clear();
          History.push({ elements: [], connections: [] });
        }
      }
      this.refreshDropdownList();
      console.log(`Board "${name}" deleted`);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  },

  updateBoardName() {
    document.getElementById('current-board-name').textContent = this.currentBoard;
    document.title = `WOLLMILCHSAU — ${this.currentBoard}`;
  },

  async save(name) {
    this.currentBoard = name;
    this.updateBoardName();
    const data = {
      elements: App.elements,
      connections: App.connections,
      viewport: { panX: Canvas.panX, panY: Canvas.panY, zoom: Canvas.zoom },
    };
    try {
      await fetch(`/api/boards/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (err) {
      console.error('Save failed:', err);
    }
  },

  async load(name) {
    try {
      const res = await fetch(`/api/boards/${encodeURIComponent(name)}`);
      const data = await res.json();

      App.elements = data.elements || [];
      App.connections = data.connections || [];
      this.currentBoard = name;
      this.updateBoardName();

      if (data.viewport) {
        Canvas.panX = data.viewport.panX;
        Canvas.panY = data.viewport.panY;
        Canvas.zoom = data.viewport.zoom;
        Canvas.updateTransform();
        Canvas.drawGrid();
      }

      Elements.maxZIndex = App.elements.reduce((max, el) => Math.max(max, el.zIndex || 0), 1);
      Elements.clearSelection();
      Elements.renderAll();
      Connections.render();
      Canvas.updateMinimap();
      History.clear();
      History.push({ elements: App.elements, connections: App.connections });

      console.log(`Board "${name}" loaded`);
    } catch (err) {
      console.error('Load failed:', err);
    }
  },

  autoSave() {
    if (App.elements.length > 0) this.save(this.currentBoard);
  },

  showSaveModal() {
    const modal = document.getElementById('save-modal');
    document.getElementById('save-modal-title').textContent = 'SAVE BOARD';
    const confirm = document.getElementById('save-confirm');
    const input = document.getElementById('board-name-input');
    confirm.textContent = 'SAVE →';
    confirm.classList.remove('hidden');
    input.classList.remove('hidden');
    input.value = this.currentBoard;
    modal.classList.remove('hidden');
    input.focus();
    input.select();
    this.loadBoardList(document.getElementById('board-list'), false);
  },

  showLoadModal() {
    const modal = document.getElementById('save-modal');
    document.getElementById('save-modal-title').textContent = 'LOAD BOARD';
    document.getElementById('save-confirm').classList.add('hidden');
    document.getElementById('board-name-input').classList.add('hidden');
    modal.classList.remove('hidden');
    this.loadBoardList(document.getElementById('board-list'), true);
  },

  async loadBoardList(container, clickToLoad) {
    try {
      const res = await fetch('/api/boards');
      const boards = await res.json();
      container.innerHTML = '';

      if (boards.length === 0) {
        container.innerHTML = '<div style="color:var(--dark-grey);font-family:var(--font-mono);font-size:10px;padding:10px;">No saved boards yet</div>';
        return;
      }

      boards.forEach(board => {
        const item = document.createElement('div');
        item.className = 'board-item';
        item.innerHTML = `<span>${board.name}</span><span style="font-size:9px;color:var(--dark-grey)">${board.elementCount} items · ${this.formatTimeAgo(board.lastEdit)}</span>`;
        if (board.name === this.currentBoard) {
          item.style.borderLeftColor = 'var(--accent)';
          item.style.borderLeftWidth = '3px';
        }
        item.addEventListener('click', () => {
          if (clickToLoad) {
            this.load(board.name);
            document.getElementById('save-modal').classList.add('hidden');
          } else {
            document.getElementById('board-name-input').value = board.name;
          }
        });
        container.appendChild(item);
      });
    } catch (err) {
      console.error('Failed to list boards:', err);
    }
  },
};
