/* === ELEMENTS === */
const Elements = {
  selected: [],
  dragging: null,
  resizing: null,
  dragStart: null,
  resizeStart: null,
  clipboard: [],
  maxZIndex: 1,

  init() {
    this.bindCanvasEvents();
  },

  create(type, x, y, extra = {}) {
    const defaults = {
      id: Utils.id(),
      type,
      x, y,
      width: 200,
      height: 120,
      zIndex: ++this.maxZIndex,
      locked: false,
      color: '#111111',
      borderColor: '#111111',
      ...extra,
    };

    switch (type) {
      case 'text':
        defaults.width = 200;
        defaults.height = 30;
        defaults.content = extra.content || 'Double-click to edit';
        defaults.fontSize = 14;
        break;
      case 'heading':
        defaults.width = 500;
        defaults.height = 70;
        defaults.content = extra.content || 'Headline';
        defaults.fontSize = 50;
        break;
      case 'note':
        defaults.width = 220;
        defaults.height = 160;
        defaults.content = extra.content || '';
        defaults.noteColor = extra.noteColor || 'default';
        break;
      case 'image':
        defaults.width = extra.width || 300;
        defaults.height = extra.height || 200;
        defaults.url = extra.url || '';
        defaults.originalName = extra.originalName || '';
        defaults.imageZoom = extra.imageZoom || 100;
        break;
      case 'file':
        defaults.width = 160;
        defaults.height = 120;
        defaults.url = extra.url || '';
        defaults.originalName = extra.originalName || 'file';
        defaults.fileSize = extra.fileSize || 0;
        defaults.mimetype = extra.mimetype || '';
        break;
      case 'rect':
        defaults.width = extra.width || 200;
        defaults.height = extra.height || 150;
        defaults.fillColor = 'transparent';
        break;
      case 'circle':
        defaults.width = extra.width || 150;
        defaults.height = extra.height || 150;
        defaults.fillColor = 'transparent';
        break;
      case 'icon':
        defaults.width = 48;
        defaults.height = 48;
        defaults.icon = extra.icon || '●';
        break;
      case 'todo':
        defaults.width = 260;
        defaults.height = 200;
        defaults.title = extra.title || 'Tasks';
        defaults.items = extra.items || [];
        break;
      case 'draw':
        defaults.points = extra.points || [];
        defaults.strokeColor = extra.strokeColor || (document.body.classList.contains('dark') ? '#E0E0E0' : '#111111');
        defaults.strokeWidth = extra.strokeWidth || 2;
        defaults.width = extra.width || 100;
        defaults.height = extra.height || 100;
        break;
      case 'pin':
        defaults.width = 28;
        defaults.height = 28;
        break;
    }

    return defaults;
  },

  renderElement(data) {
    const el = document.createElement('div');
    el.className = 'canvas-element';
    el.dataset.id = data.id;
    el.style.left = data.x + 'px';
    el.style.top = data.y + 'px';
    el.style.width = data.width + 'px';
    el.style.height = (data.type === 'text' || data.type === 'heading') ? 'auto' : data.height + 'px';
    el.style.zIndex = data.zIndex;

    if (data.locked) el.classList.add('locked');

    let inner;
    switch (data.type) {
      case 'text':
        inner = document.createElement('div');
        inner.className = 'el-text';
        inner.textContent = data.content;
        inner.style.fontSize = (data.fontSize || 14) + 'px';
        inner.style.color = data.color || '#111111';
        el.appendChild(inner);
        break;

      case 'heading':
        inner = document.createElement('div');
        inner.className = 'el-heading';
        inner.textContent = data.content;
        inner.style.fontSize = (data.fontSize || 50) + 'px';
        inner.style.color = data.color || '#111111';
        el.appendChild(inner);
        break;

      case 'note':
        inner = document.createElement('div');
        inner.className = 'el-note';
        if (data.noteColor && data.noteColor !== 'default') {
          inner.classList.add('note-' + data.noteColor);
        }
        inner.textContent = data.content;
        inner.style.width = '100%';
        inner.style.height = '100%';
        el.appendChild(inner);
        break;

      case 'image':
        inner = document.createElement('div');
        inner.className = 'el-image';
        inner.style.width = '100%';
        inner.style.height = '100%';
        if (data.url) {
          const img = document.createElement('img');
          img.src = data.url;
          img.alt = data.originalName || '';
          img.draggable = false;
          img.style.transform = `scale(${(data.imageZoom || 100) / 100})`;
          img.style.transformOrigin = 'center center';
          inner.appendChild(img);
        }
        el.appendChild(inner);
        break;

      case 'file':
        inner = document.createElement('div');
        inner.className = 'el-file';
        inner.style.width = '100%';
        inner.style.height = '100%';
        if (data.thumbnailUrl) {
          inner.classList.add('el-file--video');
          inner.innerHTML = `
            <img class="file-thumb" src="${data.thumbnailUrl}" alt="">
            <div class="file-play">▶</div>
            <div class="file-overlay">
              <div class="file-name">${Utils.escapeHtml(data.originalName)}</div>
              <div class="file-size">${Utils.formatFileSize(data.fileSize)}</div>
            </div>`;
        } else {
          inner.innerHTML = `
            <div class="file-icon">${Utils.getFileIcon(data.mimetype, data.originalName)}</div>
            <div class="file-name">${Utils.escapeHtml(data.originalName)}</div>
            <div class="file-size">${Utils.formatFileSize(data.fileSize)}</div>`;
        }
        el.appendChild(inner);
        break;

      case 'rect':
        inner = document.createElement('div');
        inner.className = 'el-rect';
        inner.style.width = '100%';
        inner.style.height = '100%';
        inner.style.borderColor = data.borderColor || '#111111';
        inner.style.backgroundColor = data.fillColor || 'transparent';
        el.appendChild(inner);
        break;

      case 'circle':
        inner = document.createElement('div');
        inner.className = 'el-circle';
        inner.style.width = '100%';
        inner.style.height = '100%';
        inner.style.borderColor = data.borderColor || '#111111';
        inner.style.backgroundColor = data.fillColor || 'transparent';
        el.appendChild(inner);
        break;

      case 'icon':
        inner = document.createElement('div');
        inner.className = 'el-icon';
        inner.textContent = data.icon;
        el.appendChild(inner);
        el.style.width = 'auto';
        el.style.height = 'auto';
        break;

      case 'todo':
        inner = document.createElement('div');
        inner.className = 'el-todo';
        inner.style.width = '100%';
        inner.style.height = '100%';
        inner.innerHTML = Todos.renderInner(data);
        el.appendChild(inner);
        // Bind todo-specific events after appending to DOM
        setTimeout(() => Todos.bindEvents(el, data), 0);
        break;

      case 'pin':
        inner = document.createElement('div');
        inner.className = 'el-pin';
        el.appendChild(inner);
        el.style.overflow = 'visible';
        break;

      case 'draw':
        inner = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        inner.setAttribute('class', 'el-draw');
        inner.setAttribute('width', data.width);
        inner.setAttribute('height', data.height);
        inner.setAttribute('viewBox', `0 0 ${data.width} ${data.height}`);
        inner.style.width = '100%';
        inner.style.height = '100%';
        if (data.points && data.points.length > 1) {
          const pathD = data.points.map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : `L${p.x} ${p.y}`)).join(' ');
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', pathD);
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', data.strokeColor || '#111111');
          path.setAttribute('stroke-width', data.strokeWidth || 2);
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('stroke-linejoin', 'round');
          inner.appendChild(path);
        }
        el.appendChild(inner);
        break;
    }

    // Connection anchors
    ['top', 'bottom', 'left', 'right'].forEach(pos => {
      const anchor = document.createElement('div');
      anchor.className = 'connection-anchor ' + pos;
      anchor.dataset.anchor = pos;
      el.appendChild(anchor);
    });

    Canvas.canvasEl.appendChild(el);
    return el;
  },

  renderAll() {
    Canvas.canvasEl.innerHTML = '';
    App.elements.forEach(data => this.renderElement(data));
    this.selected.forEach(id => {
      const dom = this.getDom(id);
      if (dom) this.showSelected(dom);
    });
  },

  getDom(id) {
    return Canvas.canvasEl.querySelector(`[data-id="${id}"]`);
  },

  getData(id) {
    return App.elements.find(el => el.id === id);
  },

  showSelected(dom) {
    dom.classList.add('selected');
    const data = this.getData(dom.dataset.id);
    if (data?.type !== 'pin' && !dom.querySelector('.resize-handle')) {
      ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'].forEach(dir => {
        const handle = document.createElement('div');
        handle.className = 'resize-handle ' + dir;
        handle.dataset.resize = dir;
        dom.appendChild(handle);
      });
    }
  },

  clearSelection() {
    this.selected = [];
    document.querySelectorAll('.canvas-element.selected').forEach(el => {
      el.classList.remove('selected');
      el.querySelectorAll('.resize-handle').forEach(h => h.remove());
    });
    document.getElementById('properties-panel').classList.add('hidden');
  },

  select(id, additive = false) {
    if (!additive) this.clearSelection();
    if (!this.selected.includes(id)) {
      this.selected.push(id);
    }
    const dom = this.getDom(id);
    if (dom) this.showSelected(dom);
    if (this.selected.length === 1) {
      Properties.show(this.getData(id));
    }
  },

  deleteSelected() {
    if (this.selected.length === 0) return;
    this.selected.forEach(id => {
      App.connections = App.connections.filter(c => c.from !== id && c.to !== id);
      App.elements = App.elements.filter(el => el.id !== id);
      const dom = this.getDom(id);
      if (dom) dom.remove();
    });
    this.clearSelection();
    App.saveState();
    Connections.render();
    Canvas.updateMinimap();
  },

  duplicateSelected() {
    const newIds = [];
    this.selected.forEach(id => {
      const data = this.getData(id);
      if (!data) return;
      const clone = { ...JSON.parse(JSON.stringify(data)), id: Utils.id(), x: data.x + 20, y: data.y + 20, zIndex: ++this.maxZIndex };
      App.elements.push(clone);
      this.renderElement(clone);
      newIds.push(clone.id);
    });
    this.clearSelection();
    newIds.forEach(id => this.select(id, true));
    App.saveState();
    Canvas.updateMinimap();
  },

  copy() {
    this.clipboard = this.selected.map(id => JSON.parse(JSON.stringify(this.getData(id)))).filter(Boolean);
  },

  paste() {
    if (this.clipboard.length === 0) return;
    const newIds = [];
    this.clipboard.forEach(data => {
      const clone = { ...data, id: Utils.id(), x: data.x + 40, y: data.y + 40, zIndex: ++this.maxZIndex };
      App.elements.push(clone);
      this.renderElement(clone);
      newIds.push(clone.id);
    });
    this.clearSelection();
    newIds.forEach(id => this.select(id, true));
    this.clipboard = this.clipboard.map(d => ({ ...d, x: d.x + 40, y: d.y + 40 }));
    App.saveState();
  },

  bringToFront() {
    this.selected.forEach(id => {
      const data = this.getData(id);
      if (data) {
        data.zIndex = ++this.maxZIndex;
        const dom = this.getDom(id);
        if (dom) dom.style.zIndex = data.zIndex;
      }
    });
    App.saveState();
  },

  sendToBack() {
    this.selected.forEach(id => {
      const data = this.getData(id);
      if (data) {
        data.zIndex = 0;
        const dom = this.getDom(id);
        if (dom) dom.style.zIndex = 0;
      }
    });
    App.saveState();
  },

  toggleLock() {
    this.selected.forEach(id => {
      const data = this.getData(id);
      if (data) {
        data.locked = !data.locked;
        const dom = this.getDom(id);
        if (dom) dom.classList.toggle('locked', data.locked);
      }
    });
    App.saveState();
  },

  updateElement(id, props) {
    const data = this.getData(id);
    if (!data) return;
    Object.assign(data, props);
    const dom = this.getDom(id);
    if (!dom) return;

    if (props.x !== undefined) dom.style.left = props.x + 'px';
    if (props.y !== undefined) dom.style.top = props.y + 'px';
    if (props.width !== undefined) dom.style.width = props.width + 'px';
    if (props.height !== undefined && data.type !== 'text' && data.type !== 'heading') dom.style.height = props.height + 'px';
    if (props.zIndex !== undefined) dom.style.zIndex = props.zIndex;

    if (data.type === 'text') {
      const textEl = dom.querySelector('.el-text');
      if (props.content !== undefined) textEl.textContent = props.content;
      if (props.fontSize !== undefined) textEl.style.fontSize = props.fontSize + 'px';
      if (props.color !== undefined) textEl.style.color = props.color;
    }
    if (data.type === 'heading') {
      const headingEl = dom.querySelector('.el-heading');
      if (props.content !== undefined) headingEl.textContent = props.content;
      if (props.fontSize !== undefined) headingEl.style.fontSize = props.fontSize + 'px';
      if (props.color !== undefined) headingEl.style.color = props.color;
    }
    if (data.type === 'note') {
      const noteEl = dom.querySelector('.el-note');
      if (props.content !== undefined) noteEl.textContent = props.content;
      if (props.noteColor !== undefined) {
        noteEl.className = 'el-note';
        if (props.noteColor !== 'default') noteEl.classList.add('note-' + props.noteColor);
      }
    }
    if (data.type === 'rect') {
      const rectEl = dom.querySelector('.el-rect');
      if (props.borderColor !== undefined) rectEl.style.borderColor = props.borderColor;
      if (props.fillColor !== undefined) rectEl.style.backgroundColor = props.fillColor;
    }
    if (data.type === 'circle') {
      const circleEl = dom.querySelector('.el-circle');
      if (props.borderColor !== undefined) circleEl.style.borderColor = props.borderColor;
      if (props.fillColor !== undefined) circleEl.style.backgroundColor = props.fillColor;
    }
    if (data.type === 'icon' && props.icon !== undefined) {
      dom.querySelector('.el-icon').textContent = props.icon;
    }
    if (data.type === 'image') {
      const imgEl = dom.querySelector('.el-image img');
      if (imgEl && props.imageZoom !== undefined) {
        imgEl.style.transform = `scale(${props.imageZoom / 100})`;
      }
    }
    if (data.type === 'todo') {
      if (props.title !== undefined) {
        Todos.refresh(dom, data);
      }
    }
  },

  bindCanvasEvents() {
    const container = Canvas.container;
    let marqueeStart = null;
    let marqueeActive = false;
    let drawingShape = null;
    let drawingStart = null;
    let drawingPath = null; // freehand draw

    container.addEventListener('mousedown', (e) => {
      if (Canvas.isPanning || Canvas.spaceDown) return;
      if (e.button !== 0) return;

      const target = e.target;
      const elementDom = target.closest('.canvas-element');
      const tool = App.currentTool;

      if (target.classList.contains('connection-anchor')) {
        const parentEl = target.closest('.canvas-element');
        const anchor = target.dataset.anchor;
        Connections.startDrawing(parentEl.dataset.id, anchor, e);
        return;
      }

      if (target.classList.contains('resize-handle')) {
        const parentEl = target.closest('.canvas-element');
        const data = this.getData(parentEl.dataset.id);
        if (data && !data.locked) {
          this.resizing = {
            id: data.id,
            dir: target.dataset.resize,
            startX: e.clientX,
            startY: e.clientY,
            origX: data.x,
            origY: data.y,
            origW: data.width,
            origH: data.height,
          };
        }
        return;
      }

      // Don't start dragging if interacting with todo elements
      if (target.closest('.todo-check') || target.closest('.todo-add-btn') ||
          target.closest('.todo-add-row') || target.closest('.todo-edit-input')) {
        return;
      }

      if (tool === 'select') {
        if (elementDom) {
          const id = elementDom.dataset.id;
          const data = this.getData(id);
          if (data && data.locked) return;

          if (e.shiftKey) {
            this.select(id, true);
          } else if (!this.selected.includes(id)) {
            this.select(id);
          }

          const pos = Canvas.screenToCanvas(e.clientX, e.clientY);
          this.dragging = true;
          this.dragStart = {
            mx: pos.x, my: pos.y,
            origins: this.selected.map(sid => {
              const d = this.getData(sid);
              return { id: sid, x: d.x, y: d.y };
            }),
          };
        } else {
          this.clearSelection();
          marqueeStart = { x: e.clientX, y: e.clientY };
          marqueeActive = true;
        }
        return;
      }

      const canvasPos = Canvas.screenToCanvas(e.clientX, e.clientY);

      if (tool === 'text') {
        const data = this.create('text', canvasPos.x, canvasPos.y);
        App.elements.push(data);
        this.renderElement(data);
        this.select(data.id);
        setTimeout(() => this.startEditing(data.id), 50);
        App.setTool('select');
        App.saveState();
        return;
      }

      if (tool === 'heading') {
        const data = this.create('heading', canvasPos.x, canvasPos.y);
        App.elements.push(data);
        this.renderElement(data);
        this.select(data.id);
        setTimeout(() => this.startEditing(data.id), 50);
        App.setTool('select');
        App.saveState();
        return;
      }

      if (tool === 'icon') {
        IconPicker.show(canvasPos.x, canvasPos.y);
        return;
      }

      if (tool === 'image') {
        document.getElementById('file-input').click();
        App._pendingImagePos = canvasPos;
        return;
      }

      if (tool === 'file') {
        const fi = document.getElementById('file-input');
        fi.accept = '*';
        fi.click();
        App._pendingImagePos = canvasPos;
        return;
      }

      if (tool === 'todo') {
        const data = this.create('todo', canvasPos.x, canvasPos.y);
        App.elements.push(data);
        this.renderElement(data);
        this.select(data.id);
        App.setTool('select');
        App.saveState();
        Canvas.updateMinimap();
        return;
      }

      if (tool === 'pin') {
        const data = this.create('pin', canvasPos.x - 14, canvasPos.y - 14);
        App.elements.push(data);
        this.renderElement(data);
        this.select(data.id);
        App.setTool('select');
        App.saveState();
        Canvas.updateMinimap();
        return;
      }

      if (tool === 'draw') {
        drawingPath = { points: [canvasPos], startPos: canvasPos };
        const pvg = document.getElementById('preview-svg');
        const isDark = document.body.classList.contains('dark');
        pvg.innerHTML = `<path id="draw-preview-path" fill="none" stroke="${isDark ? '#E0E0E0' : '#111111'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
        return;
      }

      if (['rect', 'circle', 'note'].includes(tool)) {
        drawingStart = canvasPos;
        drawingShape = { type: tool, x: canvasPos.x, y: canvasPos.y, width: 0, height: 0 };
        return;
      }

      if (tool === 'arrow') {
        if (elementDom) {
          Connections.startDrawing(elementDom.dataset.id, 'center', e);
        }
        return;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.dragging && this.dragStart) {
        const pos = Canvas.screenToCanvas(e.clientX, e.clientY);
        const dx = pos.x - this.dragStart.mx;
        const dy = pos.y - this.dragStart.my;
        this.dragStart.origins.forEach(({ id, x, y }) => {
          this.updateElement(id, { x: x + dx, y: y + dy });
        });
        Connections.render();
        return;
      }

      if (this.resizing) {
        const r = this.resizing;
        const dx = (e.clientX - r.startX) / Canvas.zoom;
        const dy = (e.clientY - r.startY) / Canvas.zoom;

        let newX = r.origX, newY = r.origY, newW = r.origW, newH = r.origH;

        if (r.dir.includes('e')) newW = Math.max(40, r.origW + dx);
        if (r.dir.includes('w')) { newW = Math.max(40, r.origW - dx); newX = r.origX + (r.origW - newW); }
        if (r.dir.includes('s')) newH = Math.max(30, r.origH + dy);
        if (r.dir.includes('n')) { newH = Math.max(30, r.origH - dy); newY = r.origY + (r.origH - newH); }

        this.updateElement(r.id, { x: newX, y: newY, width: newW, height: newH });
        Connections.render();
        return;
      }

      if (marqueeActive && marqueeStart) {
        const box = document.getElementById('selection-box');
        const x = Math.min(marqueeStart.x, e.clientX);
        const y = Math.min(marqueeStart.y, e.clientY);
        const w = Math.abs(e.clientX - marqueeStart.x);
        const h = Math.abs(e.clientY - marqueeStart.y);
        box.classList.remove('hidden');
        box.style.left = x + 'px';
        box.style.top = y + 'px';
        box.style.width = w + 'px';
        box.style.height = h + 'px';
        return;
      }

      // Freehand draw live preview
      if (drawingPath) {
        const pos = Canvas.screenToCanvas(e.clientX, e.clientY);
        drawingPath.points.push(pos);
        const path = document.getElementById('draw-preview-path');
        if (path) {
          const cRect = Canvas.container.getBoundingClientRect();
          const d = drawingPath.points.map((p, i) => {
            const s = Canvas.canvasToScreen(p.x, p.y);
            return (i === 0 ? 'M' : 'L') + (s.x - cRect.left).toFixed(1) + ' ' + (s.y - cRect.top).toFixed(1);
          }).join(' ');
          path.setAttribute('d', d);
        }
        return;
      }

      if (drawingShape && drawingStart) {
        const pos = Canvas.screenToCanvas(e.clientX, e.clientY);
        drawingShape.width = Math.abs(pos.x - drawingStart.x);
        drawingShape.height = Math.abs(pos.y - drawingStart.y);
        drawingShape.x = Math.min(pos.x, drawingStart.x);
        drawingShape.y = Math.min(pos.y, drawingStart.y);

        // Live shape preview in screen space
        const pvg = document.getElementById('preview-svg');
        const cRect = Canvas.container.getBoundingClientRect();
        const tl = Canvas.canvasToScreen(drawingShape.x, drawingShape.y);
        const br = Canvas.canvasToScreen(drawingShape.x + drawingShape.width, drawingShape.y + drawingShape.height);
        const px = tl.x - cRect.left, py = tl.y - cRect.top;
        const pw = br.x - tl.x, ph = br.y - tl.y;
        const stroke = `stroke="${document.body.classList.contains('dark') ? '#E0E0E0' : '#111111'}" stroke-width="1" stroke-dasharray="5,3" fill="none"`;
        if (drawingShape.type === 'circle') {
          pvg.innerHTML = `<ellipse cx="${px + pw/2}" cy="${py + ph/2}" rx="${pw/2}" ry="${ph/2}" ${stroke}/>`;
        } else {
          pvg.innerHTML = `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" ${stroke}/>`;
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.dragging) {
        this.dragging = false;
        this.dragStart = null;
        App.saveState();
        Canvas.updateMinimap();
      }

      if (this.resizing) {
        this.resizing = null;
        App.saveState();
        Canvas.updateMinimap();
      }

      if (marqueeActive) {
        const box = document.getElementById('selection-box');
        if (!box.classList.contains('hidden')) {
          const bx = parseFloat(box.style.left);
          const by = parseFloat(box.style.top);
          const bw = parseFloat(box.style.width);
          const bh = parseFloat(box.style.height);

          App.elements.forEach(data => {
            const sp = Canvas.canvasToScreen(data.x, data.y);
            const ep = Canvas.canvasToScreen(data.x + (data.width || 50), data.y + (data.height || 50));
            if (sp.x < bx + bw && ep.x > bx && sp.y < by + bh && ep.y > by) {
              this.select(data.id, true);
            }
          });
        }
        box.classList.add('hidden');
        marqueeActive = false;
        marqueeStart = null;
      }

      // Finalize freehand drawing
      if (drawingPath) {
        const pts = drawingPath.points;
        document.getElementById('preview-svg').innerHTML = '';

        if (pts.length > 2) {
          // Calculate bounding box
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          pts.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
          });
          const pad = 4;
          minX -= pad; minY -= pad; maxX += pad; maxY += pad;
          const w = maxX - minX;
          const h = maxY - minY;
          // Normalize points relative to origin
          const normalized = pts.map(p => ({ x: p.x - minX, y: p.y - minY }));
          const data = this.create('draw', minX, minY, {
            points: normalized,
            width: Math.max(w, 10),
            height: Math.max(h, 10),
          });
          App.elements.push(data);
          this.renderElement(data);
          this.select(data.id);
          App.saveState();
          Canvas.updateMinimap();
        }
        drawingPath = null;
        // Stay in draw tool for continuous drawing
      }

      if (drawingShape && drawingStart) {
        if (drawingShape.width > 10 || drawingShape.height > 10) {
          const data = this.create(drawingShape.type, drawingShape.x, drawingShape.y, {
            width: Math.max(drawingShape.width, 40),
            height: Math.max(drawingShape.height, 30),
          });
          App.elements.push(data);
          this.renderElement(data);
          this.select(data.id);
          App.saveState();
          Canvas.updateMinimap();
        }
        document.getElementById('preview-svg').innerHTML = '';
        drawingShape = null;
        drawingStart = null;
        App.setTool('select');
      }
    });

    container.addEventListener('dblclick', (e) => {
      const elementDom = e.target.closest('.canvas-element');
      if (!elementDom) return;
      const data = this.getData(elementDom.dataset.id);
      if (!data || data.locked) return;

      if (data.type === 'text' || data.type === 'note' || data.type === 'heading') {
        this.startEditing(data.id);
      }
      if (data.type === 'file' && data.url) {
        FileViewer.open(data);
      }
      // todo double-click is handled by Todos.bindEvents
    });

    container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const elementDom = e.target.closest('.canvas-element');
      if (elementDom) {
        // Don't show main context menu if right-clicking a todo item
        if (e.target.closest('.todo-item')) return;
        const id = elementDom.dataset.id;
        if (!this.selected.includes(id)) this.select(id);
      }
      ContextMenu.show(e.clientX, e.clientY);
    });
  },

  startEditing(id) {
    const dom = this.getDom(id);
    const data = this.getData(id);
    if (!dom || !data) return;

    const editable = dom.querySelector('.el-text, .el-note, .el-heading');
    if (!editable) return;

    editable.setAttribute('contenteditable', 'true');
    editable.focus();

    const range = document.createRange();
    range.selectNodeContents(editable);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const stopEditing = () => {
      editable.removeAttribute('contenteditable');
      data.content = editable.textContent;
      if (data.type === 'text' || data.type === 'heading') {
        data.height = editable.offsetHeight;
      }
      App.saveState();
      editable.removeEventListener('blur', stopEditing);
    };

    editable.addEventListener('blur', stopEditing);
    editable.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') editable.blur();
      e.stopPropagation();
    });
  },
};
