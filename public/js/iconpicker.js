/* === ICON PICKER === */
const IconPicker = {
  _pos: { x: 0, y: 0 },

  init() {
    const modal = document.getElementById('icon-picker');
    const search = document.getElementById('icon-search');

    search.addEventListener('input', () => this.renderGrid(search.value));
    this.renderGrid();
  },

  show(x, y) {
    this._pos = { x, y };
    const modal = document.getElementById('icon-picker');
    modal.classList.remove('hidden');
    const search = document.getElementById('icon-search');
    search.value = '';
    search.focus();
    this.renderGrid();
  },

  renderGrid(filter = '') {
    const grid = document.getElementById('icon-grid');
    const modal = document.getElementById('icon-picker');
    grid.innerHTML = '';

    Utils.ICONS.forEach(icon => {
      if (filter && !icon.includes(filter)) return;
      const div = document.createElement('div');
      div.className = 'icon-option';
      div.textContent = icon;
      div.addEventListener('click', () => {
        const data = Elements.create('icon', this._pos.x, this._pos.y, { icon });
        App.elements.push(data);
        Elements.renderElement(data);
        Elements.select(data.id);
        App.saveState();
        Canvas.updateMinimap();
        modal.classList.add('hidden');
        App.setTool('select');
      });
      grid.appendChild(div);
    });
  },
};
