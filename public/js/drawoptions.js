/* === DRAW OPTIONS BAR === */
const DrawOptions = {
  init() {
    const bar = document.getElementById('draw-options');

    // Populate color swatches
    const colorsEl = document.getElementById('draw-opt-colors');
    Utils.ELEMENT_COLORS.forEach(c => {
      const swatch = document.createElement('div');
      swatch.className = 'draw-opt-color';
      swatch.style.background = c;
      swatch.dataset.color = c;
      colorsEl.appendChild(swatch);
    });

    this._syncUI();

    // Color click
    colorsEl.addEventListener('click', e => {
      const swatch = e.target.closest('.draw-opt-color');
      if (!swatch) return;
      Elements.drawSettings.strokeColor = swatch.dataset.color;
      this._syncUI();
    });

    // Size click
    bar.querySelectorAll('.draw-opt-size').forEach(btn => {
      btn.addEventListener('click', () => {
        Elements.drawSettings.strokeWidth = parseFloat(btn.dataset.size);
        this._syncUI();
      });
    });

    // Style click
    bar.querySelectorAll('.draw-opt-style').forEach(btn => {
      btn.addEventListener('click', () => {
        Elements.drawSettings.strokeStyle = btn.dataset.style;
        this._syncUI();
      });
    });
  },

  toggle(show) {
    document.getElementById('draw-options').classList.toggle('hidden', !show);
    if (show) this._syncUI();
  },

  _syncUI() {
    const ds = Elements.drawSettings;
    const bar = document.getElementById('draw-options');

    // Sync color — also tint the bar's color indicator
    bar.querySelectorAll('.draw-opt-color').forEach(s => {
      s.classList.toggle('active', s.dataset.color === ds.strokeColor);
    });

    // Sync size
    bar.querySelectorAll('.draw-opt-size').forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.size) === ds.strokeWidth);
      // Tint SVG lines to current color
      const line = btn.querySelector('line');
      if (line) line.setAttribute('stroke', ds.strokeColor);
    });

    // Sync style — tint SVG lines to current color
    bar.querySelectorAll('.draw-opt-style').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.style === ds.strokeStyle);
      const line = btn.querySelector('line');
      if (line) line.setAttribute('stroke', ds.strokeColor);
    });
  },
};
