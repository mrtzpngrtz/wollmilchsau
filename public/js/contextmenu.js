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
