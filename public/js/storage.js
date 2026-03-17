/* === STORAGE (Save/Load/Board Switcher) === */
const Storage = {
  autoSaveInterval: null,
  currentBoard: 'default',
  currentBoardOwner: null,  // null = own board, string = shared board owner
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
        const isShared = board.shared;
        const isCurrent = board.name === this.currentBoard && (isShared ? this.currentBoardOwner === board.owner : !this.currentBoardOwner);
        const item = document.createElement('div');
        item.className = 'board-dropdown-item' + (isCurrent ? ' active' : '');

        const left = document.createElement('div');
        left.className = 'board-item-left';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'board-name';
        nameSpan.textContent = isShared ? `${board.name} (${board.owner})` : board.name;

        const info = document.createElement('div');
        info.className = 'board-info';
        info.innerHTML = `<span>${board.elementCount || 0} items</span><span>·</span><span>${this.formatTimeAgo(board.lastEdit)}</span>${isShared ? '<span>·</span><span style="color:var(--accent)">SHARED</span>' : ''}`;

        left.appendChild(nameSpan);
        left.appendChild(info);

        const actions = document.createElement('div');
        actions.className = 'board-actions';

        if (!isShared) {
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

          renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.renameBoard(board.name);
          });

          deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (await Dialog.confirm(`Delete board "${board.name}"?`)) this.deleteBoard(board.name);
          });
        }

        item.appendChild(left);
        item.appendChild(actions);

        // Click to switch
        left.addEventListener('click', (e) => {
          e.stopPropagation();
          Collab.leaveBoard();
          if (App.elements.length > 0) this.save(this.currentBoard);
          this.load(board.name, isShared ? board.owner : null);
          this.closeDropdown();
        });

        list.appendChild(item);
      });
    } catch (err) {
      console.error('Failed to list boards:', err);
    }
  },

  async renameBoard(oldName) {
    const newName = await Dialog.prompt('Rename board:', oldName, 'RENAME BOARD');
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
        await Dialog.alert(data.error || 'Rename failed', 'ERROR');
      }
    } catch (err) {
      console.error('Rename failed:', err);
    }
  },

  async createNewBoard() {
    const name = await Dialog.prompt('Board name:', '', 'NEW BOARD');
    if (!name || !name.trim()) return;
    const cleanName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');

    Collab.leaveBoard();
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

  getBoardApiPath(name, owner) {
    if (owner) return `/api/boards/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    return `/api/boards/${encodeURIComponent(name)}`;
  },

  generateThumbnail() {
    const elements = App.elements;
    if (elements.length === 0) return null;

    const W = 320, H = 200;
    const offscreen = document.createElement('canvas');
    offscreen.width = W;
    offscreen.height = H;
    const ctx = offscreen.getContext('2d');
    const isDark = document.body.classList.contains('dark');

    ctx.fillStyle = isDark ? '#1A1A1A' : '#F2F2F2';
    ctx.fillRect(0, 0, W, H);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    elements.forEach(el => {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + (el.width || 100));
      maxY = Math.max(maxY, el.y + (el.height || 60));
    });

    const pad = 40;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const cw = maxX - minX, ch = maxY - minY;
    const scale = Math.min(W / cw, H / ch);
    const offsetX = (W - cw * scale) / 2;
    const offsetY = (H - ch * scale) / 2;

    const NOTE_COLORS = { blue: '#0066FF', green: '#00AA44', pink: '#FF0066', purple: '#7700FF', orange: '#FF4500' };

    elements.forEach(el => {
      const ex = (el.x - minX) * scale + offsetX;
      const ey = (el.y - minY) * scale + offsetY;
      const ew = Math.max((el.width || 100) * scale, 2);
      const eh = Math.max((el.height || 60) * scale, 2);
      ctx.save();

      if (el.type === 'note') {
        ctx.fillStyle = isDark ? '#2A2A2A' : '#FFFEF0';
        ctx.fillRect(ex, ey, ew, eh);
        const accent = NOTE_COLORS[el.noteColor] || (isDark ? '#555' : '#CCC');
        ctx.fillStyle = accent;
        ctx.fillRect(ex, ey, Math.max(2, 3 * scale), eh);
      } else if (el.type === 'image') {
        ctx.fillStyle = isDark ? '#333' : '#DDD';
        ctx.fillRect(ex, ey, ew, eh);
        ctx.strokeStyle = isDark ? '#444' : '#BBB';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(ex, ey, ew, eh);
        // small photo icon lines
        if (ew > 8 && eh > 6) {
          ctx.strokeStyle = isDark ? '#555' : '#AAA';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          const mx = ex + ew * 0.5, my = ey + eh * 0.6;
          ctx.moveTo(ex + ew * 0.15, ey + eh * 0.75);
          ctx.lineTo(mx - ew * 0.15, my - eh * 0.2);
          ctx.lineTo(mx + ew * 0.15, my);
          ctx.lineTo(ex + ew * 0.85, ey + eh * 0.55);
          ctx.stroke();
        }
      } else if (el.type === 'rect') {
        ctx.fillStyle = el.fillColor && el.fillColor !== 'transparent' ? el.fillColor : (isDark ? '#2A2A2A' : '#E8E8E8');
        ctx.fillRect(ex, ey, ew, eh);
        ctx.strokeStyle = el.borderColor || (isDark ? '#666' : '#444');
        ctx.lineWidth = 0.5;
        ctx.strokeRect(ex, ey, ew, eh);
      } else if (el.type === 'circle') {
        ctx.fillStyle = el.fillColor && el.fillColor !== 'transparent' ? el.fillColor : (isDark ? '#2A2A2A' : '#E8E8E8');
        ctx.strokeStyle = el.borderColor || (isDark ? '#666' : '#444');
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.ellipse(ex + ew / 2, ey + eh / 2, ew / 2, eh / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (el.type === 'text') {
        ctx.fillStyle = isDark ? '#CCC' : '#333';
        const fs = Math.max(5, Math.min(9, eh * 0.7));
        ctx.font = `${fs}px sans-serif`;
        ctx.fillText((el.content || '').slice(0, 30), ex, ey + fs);
      } else if (el.type === 'icon') {
        ctx.font = `${Math.max(8, Math.min(eh, ew) * 0.8)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(el.content || '●', ex + ew / 2, ey + eh / 2);
      } else {
        ctx.fillStyle = isDark ? '#2A2A2A' : '#E0E0E0';
        ctx.fillRect(ex, ey, ew, eh);
        ctx.strokeStyle = isDark ? '#444' : '#CCC';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(ex, ey, ew, eh);
      }
      ctx.restore();
    });

    return offscreen.toDataURL('image/jpeg', 0.75);
  },

  async save(name) {
    this.currentBoard = name;
    this.updateBoardName();
    const thumbnail = this.generateThumbnail();
    const data = {
      elements: App.elements,
      connections: App.connections,
      viewport: { panX: Canvas.panX, panY: Canvas.panY, zoom: Canvas.zoom },
      ...(thumbnail ? { thumbnail } : {}),
    };
    try {
      const url = this.getBoardApiPath(name, this.currentBoardOwner);
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (err) {
      console.error('Save failed:', err);
    }
  },

  async load(name, owner) {
    try {
      this.currentBoardOwner = owner || null;
      const url = this.getBoardApiPath(name, owner);
      const res = await fetch(url);
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
      Collab.joinBoard(name, owner || null);

      console.log(`Board "${name}" loaded${owner ? ` (shared by ${owner})` : ''}`);
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

  // ═══ DASHBOARD ═══
  showDashboard() {
    const dash = document.getElementById('boards-dashboard');
    dash.classList.remove('hidden');
    this.refreshDashboard();
  },

  hideDashboard() {
    document.getElementById('boards-dashboard').classList.add('hidden');
  },

  async refreshDashboard() {
    const grid = document.getElementById('dashboard-grid');
    try {
      const res = await fetch('/api/boards');
      const boards = await res.json();
      grid.innerHTML = '';

      if (boards.length === 0) {
        grid.innerHTML = '<div style="padding:20px;font-family:var(--font-mono);font-size:11px;color:var(--dark-grey);letter-spacing:1px;grid-column:1/-1">No boards yet. Create your first board above.</div>';
        return;
      }

      boards.forEach(board => {
        const isShared = board.shared;
        const card = document.createElement('div');
        card.className = 'dash-card';

        // Thumbnail
        const thumbUrl = isShared
          ? `/api/boards/${encodeURIComponent(board.owner)}/${encodeURIComponent(board.name)}/thumb`
          : `/api/boards/${encodeURIComponent(board.name)}/thumb`;
        const thumb = document.createElement('div');
        thumb.className = 'dash-card-thumb';
        const img = document.createElement('img');
        img.src = thumbUrl;
        img.alt = '';
        img.onerror = () => { thumb.classList.add('no-thumb'); };
        thumb.appendChild(img);
        card.appendChild(thumb);

        const body = document.createElement('div');
        body.className = 'dash-card-body';

        const name = document.createElement('div');
        name.className = 'dash-card-name';
        name.textContent = board.name;

        const meta = document.createElement('div');
        meta.className = 'dash-card-meta';
        meta.innerHTML = `
          <span>${board.elementCount || 0} elements</span>
          <span>edited ${this.formatTimeAgo(board.lastEdit)}</span>
          ${board.created ? `<span>created ${this.formatTimeAgo(board.created)}</span>` : ''}
        `;

        if (isShared) {
          const badge = document.createElement('div');
          badge.className = 'dash-card-badge';
          badge.textContent = `SHARED BY ${board.owner.toUpperCase()}`;
          body.appendChild(badge);
        }

        body.appendChild(name);
        body.appendChild(meta);
        card.appendChild(body);

        const actions = document.createElement('div');
        actions.className = 'dash-card-actions';

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'dash-card-action';
        downloadBtn.textContent = '↓';
        downloadBtn.title = 'Download as JSON';
        downloadBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.downloadBoardByName(board.name, isShared ? board.owner : null, downloadBtn);
        });
        actions.appendChild(downloadBtn);

        if (!isShared) {
          const renameBtn = document.createElement('button');
          renameBtn.className = 'dash-card-action';
          renameBtn.textContent = '✎';
          renameBtn.title = 'Rename';
          renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.renameBoard(board.name).then(() => this.refreshDashboard());
          });

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'dash-card-action danger';
          deleteBtn.textContent = '✕';
          deleteBtn.title = 'Delete';
          deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (await Dialog.confirm(`Delete board "${board.name}"?`)) {
              await this.deleteBoardOnly(board.name);
              this.refreshDashboard();
            }
          });

          actions.appendChild(renameBtn);
          actions.appendChild(deleteBtn);
        }

        card.appendChild(actions);

        card.addEventListener('click', () => {
          this.load(board.name, isShared ? board.owner : null);
          this.hideDashboard();
        });

        grid.appendChild(card);
      });
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    }
  },

  async deleteBoardOnly(name) {
    try {
      await fetch(`/api/boards/${encodeURIComponent(name)}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Delete failed:', err);
    }
  },

  initDashboard() {
    const importInput = document.getElementById('dashboard-import-input');
    document.getElementById('dashboard-import-board').addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', (e) => {
      if (e.target.files[0]) {
        this.importBoardFromJson(e.target.files[0]);
        e.target.value = '';
      }
    });

    document.getElementById('dashboard-new-board').addEventListener('click', async () => {
      const name = await Dialog.prompt('Board name:', '', 'NEW BOARD');
      if (!name || !name.trim()) return;
      const cleanName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');

      Collab.leaveBoard();
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
      this.save(cleanName);
      this.hideDashboard();
    });
  },

  async _embedFiles(elements) {
    await Promise.all(elements.map(async el => {
      if ((el.type === 'image' || el.type === 'file') && el.url && el.url.startsWith('/uploads/')) {
        try {
          const res = await fetch(el.url);
          const blob = await res.blob();
          el._embedded = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (err) {
          console.warn('Could not embed file:', el.url, err);
        }
      }
    }));
  },

  async _reuploadEmbedded(elements) {
    await Promise.all(elements.map(async el => {
      if (el._embedded) {
        try {
          const res = await fetch(el._embedded);
          const blob = await res.blob();
          const formData = new FormData();
          formData.append('file', blob, el.originalName || `file_${el.id}`);
          const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
          const uploadData = await uploadRes.json();
          if (uploadData.url) el.url = uploadData.url;
        } catch (err) {
          console.warn('Could not re-upload embedded file:', err);
        }
        delete el._embedded;
      }
    }));
  },

  async downloadBoardByName(name, owner, btn) {
    const orig = btn ? btn.textContent : null;
    if (btn) { btn.textContent = '…'; btn.disabled = true; }
    try {
      const url = this.getBoardApiPath(name, owner);
      const res = await fetch(url);
      const data = await res.json();
      const elements = JSON.parse(JSON.stringify(data.elements || []));
      await this._embedFiles(elements);
      const out = { elements, connections: data.connections || [], viewport: data.viewport || {} };
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${name}.json`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } finally {
      if (btn) { btn.textContent = orig; btn.disabled = false; }
    }
  },

  async importBoardFromJson(file) {
    let data;
    try {
      data = JSON.parse(await file.text());
      if (!Array.isArray(data.elements)) throw new Error('Missing elements array');
    } catch (err) {
      await Dialog.alert('Invalid board file: ' + err.message, 'ERROR');
      return;
    }

    const defaultName = file.name.replace(/\.json$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const name = await Dialog.prompt('Import as board name:', defaultName, 'IMPORT BOARD');
    if (!name || !name.trim()) return;
    const cleanName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');

    const elements = data.elements;
    await this._reuploadEmbedded(elements);

    await fetch(`/api/boards/${encodeURIComponent(cleanName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        elements,
        connections: data.connections || [],
        viewport: data.viewport || { panX: 0, panY: 0, zoom: 1 },
      }),
    });

    this.refreshDashboard();
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
