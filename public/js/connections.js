/* === CONNECTIONS / ARROWS === */
const Connections = {
  svg: null,
  drawing: null, // { fromId, fromAnchor, tempLine }

  init() {
    this.svg = document.getElementById('connections-svg');
    this.bindEvents();
  },

  startDrawing(fromId, fromAnchor, event) {
    const fromData = Elements.getData(fromId);
    if (!fromData) return;

    const point = this.getAnchorPoint(fromData, fromAnchor);
    const screenPoint = Canvas.canvasToScreen(point.x, point.y);

    // Create temp line
    const line = Utils.createSVGElement('line', {
      x1: screenPoint.x - Canvas.container.getBoundingClientRect().left,
      y1: screenPoint.y - Canvas.container.getBoundingClientRect().top,
      x2: screenPoint.x - Canvas.container.getBoundingClientRect().left,
      y2: screenPoint.y - Canvas.container.getBoundingClientRect().top,
      stroke: '#4a9eff',
      'stroke-width': 2,
      'stroke-dasharray': '6,3',
    });
    this.svg.appendChild(line);

    this.drawing = { fromId, fromAnchor, tempLine: line };
  },

  bindEvents() {
    window.addEventListener('mousemove', (e) => {
      if (!this.drawing) return;
      const rect = Canvas.container.getBoundingClientRect();
      this.drawing.tempLine.setAttribute('x2', e.clientX - rect.left);
      this.drawing.tempLine.setAttribute('y2', e.clientY - rect.top);
    });

    window.addEventListener('mouseup', (e) => {
      if (!this.drawing) return;

      // Check if we ended on an element
      const target = e.target.closest('.canvas-element');
      if (target && target.dataset.id !== this.drawing.fromId) {
        const toId = target.dataset.id;
        // Determine closest anchor
        const toData = Elements.getData(toId);
        const canvasPos = Canvas.screenToCanvas(e.clientX, e.clientY);
        const toAnchor = this.closestAnchor(toData, canvasPos.x, canvasPos.y);

        // Check for duplicate connection
        const exists = App.connections.some(c =>
          (c.from === this.drawing.fromId && c.to === toId) ||
          (c.from === toId && c.to === this.drawing.fromId)
        );

        if (!exists) {
          App.connections.push({
            id: Utils.id(),
            from: this.drawing.fromId,
            fromAnchor: this.drawing.fromAnchor,
            to: toId,
            toAnchor: toAnchor,
            style: 'arrow', // arrow, line, curve
            label: '',
          });
          App.saveState();
        }
      }

      // Clean up
      if (this.drawing.tempLine) {
        this.drawing.tempLine.remove();
      }
      this.drawing = null;
      this.render();
    });
  },

  getAnchorPoint(data, anchor) {
    const cx = data.x + data.width / 2;
    const cy = data.y + data.height / 2;

    switch (anchor) {
      case 'top': return { x: cx, y: data.y };
      case 'bottom': return { x: cx, y: data.y + data.height };
      case 'left': return { x: data.x, y: cy };
      case 'right': return { x: data.x + data.width, y: cy };
      case 'center': return { x: cx, y: cy };
      default: return { x: cx, y: cy };
    }
  },

  closestAnchor(data, px, py) {
    const anchors = ['top', 'bottom', 'left', 'right'];
    let closest = 'top';
    let minDist = Infinity;

    anchors.forEach(a => {
      const p = this.getAnchorPoint(data, a);
      const dist = Math.hypot(p.x - px, p.y - py);
      if (dist < minDist) {
        minDist = dist;
        closest = a;
      }
    });

    return closest;
  },

  render() {
    // Clear all except temp drawing line
    const tempLine = this.drawing?.tempLine;
    this.svg.innerHTML = '';
    if (tempLine) this.svg.appendChild(tempLine);

    const rect = Canvas.container.getBoundingClientRect();

    // Add arrowhead marker
    const defs = Utils.createSVGElement('defs');
    const marker = Utils.createSVGElement('marker', {
      id: 'arrowhead',
      markerWidth: 10,
      markerHeight: 7,
      refX: 10,
      refY: 3.5,
      orient: 'auto',
    });
    const polygon = Utils.createSVGElement('polygon', {
      points: '0 0, 10 3.5, 0 7',
      class: 'connection-arrow',
    });
    marker.appendChild(polygon);
    defs.appendChild(marker);
    this.svg.appendChild(defs);

    // Draw connections
    App.connections.forEach(conn => {
      const fromData = Elements.getData(conn.from);
      const toData = Elements.getData(conn.to);
      if (!fromData || !toData) return;

      const fromPt = this.getAnchorPoint(fromData, conn.fromAnchor);
      const toPt = this.getAnchorPoint(toData, conn.toAnchor);

      const fromScreen = Canvas.canvasToScreen(fromPt.x, fromPt.y);
      const toScreen = Canvas.canvasToScreen(toPt.x, toPt.y);

      const x1 = fromScreen.x - rect.left;
      const y1 = fromScreen.y - rect.top;
      const x2 = toScreen.x - rect.left;
      const y2 = toScreen.y - rect.top;

      if (conn.style === 'curve') {
        // Bezier curve
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const dx = Math.abs(x2 - x1) * 0.5;
        const cp1x = conn.fromAnchor === 'right' ? x1 + dx : conn.fromAnchor === 'left' ? x1 - dx : x1;
        const cp1y = conn.fromAnchor === 'bottom' ? y1 + dx : conn.fromAnchor === 'top' ? y1 - dx : y1;
        const cp2x = conn.toAnchor === 'right' ? x2 + dx : conn.toAnchor === 'left' ? x2 - dx : x2;
        const cp2y = conn.toAnchor === 'bottom' ? y2 + dx : conn.toAnchor === 'top' ? y2 - dx : y2;

        const path = Utils.createSVGElement('path', {
          d: `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`,
          class: 'connection-line',
          'marker-end': 'url(#arrowhead)',
          'data-connection-id': conn.id,
        });
        path.style.pointerEvents = 'stroke';
        this.svg.appendChild(path);
      } else {
        // Straight line
        const line = Utils.createSVGElement('line', {
          x1, y1, x2, y2,
          class: 'connection-line',
          'marker-end': conn.style === 'arrow' ? 'url(#arrowhead)' : '',
          'data-connection-id': conn.id,
        });
        line.style.pointerEvents = 'stroke';
        this.svg.appendChild(line);
      }

      // Label
      if (conn.label) {
        const lx = (x1 + x2) / 2;
        const ly = (y1 + y2) / 2 - 8;
        const text = Utils.createSVGElement('text', {
          x: lx, y: ly,
          class: 'connection-label',
        });
        text.textContent = conn.label;
        this.svg.appendChild(text);
      }
    });

    // Bind click to delete connections
    this.svg.querySelectorAll('.connection-line').forEach(line => {
      line.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const id = line.getAttribute('data-connection-id');
        App.connections = App.connections.filter(c => c.id !== id);
        this.render();
        App.saveState();
      });
      line.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = line.getAttribute('data-connection-id');
        const conn = App.connections.find(c => c.id === id);
        if (conn) {
          // Toggle between styles
          const styles = ['arrow', 'line', 'curve'];
          const idx = styles.indexOf(conn.style);
          conn.style = styles[(idx + 1) % styles.length];
          this.render();
          App.saveState();
        }
      });
    });

    // Update SVG size
    this.svg.setAttribute('width', Canvas.container.clientWidth);
    this.svg.setAttribute('height', Canvas.container.clientHeight);
  },

  // Remove all connections for an element
  removeForElement(id) {
    App.connections = App.connections.filter(c => c.from !== id && c.to !== id);
    this.render();
  },
};
