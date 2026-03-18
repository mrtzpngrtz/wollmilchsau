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

    if (data.type === 'text' || data.type === 'heading') {
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

    if (data.type === 'heading') {
      const currentWeight = data.fontWeight || '700';
      html += `
        <div class="prop-group">
          <div class="prop-label">04 — WEIGHT</div>
          <div class="weight-row">
            ${[['100','Thin'],['300','Light'],['500','Medium'],['700','Bold']].map(([w, label]) =>
              `<div class="weight-option ${currentWeight === w ? 'active' : ''}" data-weight="${w}">${label}</div>`
            ).join('')}
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
        <div class="prop-group">
          <div class="prop-label">03 — ZOOM</div>
          <div class="prop-slider-row">
            <span class="prop-slider-label">⌖</span>
            <input class="prop-slider" type="range" data-prop="imageZoom"
                   value="${data.imageZoom || 100}" min="100" max="300" step="1" />
            <span class="prop-slider-value" data-display="imageZoom">${data.imageZoom || 100}</span>
          </div>
        </div>
      `;
    }

    if (data.type === 'todo') {
      html += `
        <div class="prop-group">
          <div class="prop-label">02 — TITLE</div>
          <input class="prop-input prop-text-input" type="text" data-prop="title" value="${Utils.escapeAttr(data.title || 'Tasks')}" />
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

    // Bind weight options
    content.querySelectorAll('.weight-option').forEach(opt => {
      opt.addEventListener('click', () => {
        Elements.updateElement(data.id, { fontWeight: opt.dataset.weight });
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

    if (left + panelW > window.innerWidth - 16) {
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

  updatePosition() {
    if (!this.currentId) return;
    const data = Elements.getData(this.currentId);
    if (data) this.positionPopup(data);
  },
};

document.getElementById('close-properties')?.addEventListener('click', () => Properties.hide());
