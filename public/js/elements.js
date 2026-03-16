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
    el.style.height = (data.type === 'text') ? 'auto' : data.height + 'px';
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
          inner.appendChild(img);
        }
        el.appendChild(inner);
        break;

      case 'file':
        inner = document.createElement('div');
        inner.className = 'el-file';
        inner.style.width = '100%';
        inner.style.height = '100%';
        inner.innerHTML = `
          <div class="file-icon">${Utils.getFileIcon(data.mimetype, data.originalName)}</div>
          <div class="file-name">${data.originalName}</div>
          <div class="file-size">${Utils.formatFileSize(data.fileSize)}</div>
        `;
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
    if (!dom.querySelector('.resize-handle')) {
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
    if (props.height !== undefined && data.type !== 'text') dom.style.height = props.height + 'px';
    if (props.zIndex !== undefined) dom.style.zIndex = props.zIndex;

    if (data.type === 'text') {
      const textEl = dom.querySelector('.el-text');
      if (props.content !== undefined) textEl.textContent = props.content;
      if (props.fontSize !== undefined) textEl.style.fontSize = props.fontSize + 'px';
      if (props.color !== undefined) textEl.style.color = props.color;
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
  },

  bindCanvasEvents() {
    const container = Canvas.container;
    let marqueeStart = null;
    let marqueeActive = false;
    let drawingShape = null;
    let drawingStart = null;

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

      if (tool === 'icon') {
        App.showIconPicker(canvasPos.x, canvasPos.y);
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

      if (['rect', 'circle', 'note'].includes(tool)) {
        drawingStart = canvasPos;
        drawingShape = { type: tool, x: canvasPos.x, y: canvasPos.y };
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

      if (drawingShape && drawingStart) {
        const pos = Canvas.screenToCanvas(e.clientX, e.clientY);
        drawingShape.width = Math.abs(pos.x - drawingStart.x);
        drawingShape.height = Math.abs(pos.y - drawingStart.y);
        drawingShape.x = Math.min(pos.x, drawingStart.x);
        drawingShape.y = Math.min(pos.y, drawingStart.y);
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

      if (data.type === 'text' || data.type === 'note') {
        this.startEditing(data.id);
      }
      if (data.type === 'file' && data.url) {
        window.open(data.url, '_blank');
      }
    });

    container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const elementDom = e.target.closest('.canvas-element');
      if (elementDom) {
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

    const editable = dom.querySelector('.el-text, .el-note');
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
      if (data.type === 'text') {
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

/* === FLOATING PROPERTIES POPUP — Swiss Industrial Style === */
const Properties = {
  currentId: null,

  show(data) {
    if (!data) return;
    this.currentId = data.id;
    const panel = document.getElementById('properties-panel');
    const content = document.getElementById('props-content');
    panel.classList.remove('hidden');

    // Position popup next to the element
    this.positionPopup(data);

    let html = `
      <div class="prop-group">
        <div class="prop-label">01 — ${data.type.toUpperCase()}</div>
        <div class="prop-slider-row">
          <span class="prop-slider-label">W</span>
          <input class="prop-slider" type="range" data-prop="width" value="${Math.round(data.width)}" min="40" max="800" />
          <span class="prop-slider-value" data-display="width">${Math.round(data.width)}</span>
        </div>
        <div class="prop-slider-row">
          <span class="prop-slider-label">H</span>
          <input class="prop-slider" type="range" data-prop="height" value="${Math.round(data.height)}" min="20" max="800" />
          <span class="prop-slider-value" data-display="height">${Math.round(data.height)}</span>
        </div>
      </div>
    `;

    if (data.type === 'text') {
      html += `
        <div class="prop-group">
          <div class="prop-label">02 — SIZE</div>
          <div class="prop-slider-row">
            <span class="prop-slider-label">Aa</span>
            <input class="prop-slider" type="range" data-prop="fontSize" value="${data.fontSize || 14}" min="8" max="120" />
            <span class="prop-slider-value" data-display="fontSize">${data.fontSize || 14}</span>
          </div>
        </div>
        <div class="prop-group">
          <div class="prop-label">03 — COLOR</div>
          <div class="color-row">
            ${Utils.ELEMENT_COLORS.map(c => `<div class="color-option ${data.color === c ? 'active' : ''}" style="background:${c}" data-color="${c}" data-prop="color"></div>`).join('')}
          </div>
        </div>
      `;
    }

    if (data.type === 'note') {
      html += `
        <div class="prop-group">
          <div class="prop-label">02 — ACCENT</div>
          <div class="color-row">
            ${Utils.NOTE_COLORS.map(c => {
              const bg = c.name === 'default' ? '#FFFFFF' : c.name === 'blue' ? '#0066FF' : c.name === 'green' ? '#00AA44' : c.name === 'pink' ? '#FF0066' : c.name === 'purple' ? '#7700FF' : '#FF4500';
              return `<div class="color-option ${data.noteColor === c.name ? 'active' : ''}" style="background:${bg};border:1px solid #CCC" data-notecolor="${c.name}" data-prop="noteColor" title="${c.label}"></div>`;
            }).join('')}
          </div>
        </div>
      `;
    }

    if (data.type === 'rect' || data.type === 'circle') {
      html += `
        <div class="prop-group">
          <div class="prop-label">02 — BORDER</div>
          <div class="color-row">
            ${Utils.BORDER_COLORS.map(c => `<div class="color-option ${data.borderColor === c ? 'active' : ''}" style="background:${c}" data-bordercolor="${c}" data-prop="borderColor"></div>`).join('')}
          </div>
        </div>
        <div class="prop-group">
          <div class="prop-label">03 — FILL</div>
          <div class="color-row">
            <div class="color-option ${data.fillColor === 'transparent' ? 'active' : ''}" style="background:transparent;border:1px dashed #999" data-fillcolor="transparent" data-prop="fillColor"></div>
            ${Utils.ELEMENT_COLORS.map(c => `<div class="color-option ${data.fillColor === c + '22' ? 'active' : ''}" style="background:${c}22" data-fillcolor="${c}22" data-prop="fillColor"></div>`).join('')}
          </div>
        </div>
      `;
    }

    if (data.type === 'image') {
      html += `
        <div class="prop-group">
          <div class="prop-label">02 — SCALE</div>
          <div class="prop-slider-row">
            <span class="prop-slider-label">%</span>
            <input class="prop-slider" type="range" data-prop="scale" value="100" min="10" max="300" />
            <span class="prop-slider-value" data-display="scale">100</span>
          </div>
        </div>
      `;
    }

    content.innerHTML = html;

    // Bind sliders
    content.querySelectorAll('.prop-slider').forEach(slider => {
      const prop = slider.dataset.prop;
      const valueDisplay = content.querySelector(`[data-display="${prop}"]`);

      slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        if (valueDisplay) valueDisplay.textContent = Math.round(val);

        if (prop === 'scale') {
          // Scale calculates relative W/H from original
          const origData = Elements.getData(data.id);
          if (origData && origData._origW) {
            Elements.updateElement(data.id, {
              width: origData._origW * val / 100,
              height: origData._origH * val / 100,
            });
          }
        } else {
          Elements.updateElement(data.id, { [prop]: val });
        }
        Connections.render();
      });

      slider.addEventListener('change', () => {
        App.saveState();
      });

      // Store original dimensions for scale
      if (prop === 'scale' && data.type === 'image') {
        if (!data._origW) {
          data._origW = data.width;
          data._origH = data.height;
        }
      }
    });

    // Bind number inputs
    content.querySelectorAll('.prop-input').forEach(input => {
      input.addEventListener('change', () => {
        const prop = input.dataset.prop;
        let val = input.type === 'number' ? parseFloat(input.value) : input.value;
        Elements.updateElement(data.id, { [prop]: val });
        Connections.render();
        App.saveState();
      });
    });

    // Bind color options
    content.querySelectorAll('.color-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const prop = opt.dataset.prop;
        const val = opt.dataset.color || opt.dataset.notecolor || opt.dataset.bordercolor || opt.dataset.fillcolor;
        Elements.updateElement(data.id, { [prop]: val });
        this.show(Elements.getData(data.id));
        App.saveState();
      });
    });
  },

  positionPopup(data) {
    const panel = document.getElementById('properties-panel');
    const screenPos = Canvas.canvasToScreen(data.x + data.width, data.y);
    const panelW = 220;
    const gap = 12;

    let left = screenPos.x + gap;
    let top = screenPos.y;

    // Keep within viewport
    if (left + panelW > window.innerWidth - 16) {
      // Position to the left of element
      const leftPos = Canvas.canvasToScreen(data.x, data.y);
      left = leftPos.x - panelW - gap;
    }
    if (left < 70) left = 70;
    if (top < 50) top = 50;
    if (top + 300 > window.innerHeight) top = window.innerHeight - 320;

    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  },

  hide() {
    this.currentId = null;
    document.getElementById('properties-panel').classList.add('hidden');
  },

  // Update popup position when element moves
  updatePosition() {
    if (!this.currentId) return;
    const data = Elements.getData(this.currentId);
    if (data) this.positionPopup(data);
  },
};

document.getElementById('close-properties')?.addEventListener('click', () => Properties.hide());

/* === CONTEXT MENU === */
const ContextMenu = {
  show(x, y) {
    const menu = document.getElementById('context-menu');
    menu.classList.remove('hidden');
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';
  },

  hide() {
    document.getElementById('context-menu').classList.add('hidden');
  },

  init() {
    document.addEventListener('click', () => this.hide());

    document.querySelectorAll('.ctx-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        switch (action) {
          case 'duplicate': Elements.duplicateSelected(); break;
          case 'copy': Elements.copy(); break;
          case 'paste': Elements.paste(); break;
          case 'bring-front': Elements.bringToFront(); break;
          case 'send-back': Elements.sendToBack(); break;
          case 'lock': Elements.toggleLock(); break;
          case 'delete': Elements.deleteSelected(); break;
        }
        this.hide();
      });
    });
  },
};
