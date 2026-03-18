/* === DRAG & DROP + FILE INPUT === */
const DragDrop = {
  init() {
    this.initDragDrop();
    this.initFileInput();
    this.initClipboardPaste();
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

  initClipboardPaste() {
    document.addEventListener('paste', async (e) => {
      // Ignore when typing in an input or editable area
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.closest('[contenteditable]')) return;

      const items = Array.from(e.clipboardData?.items || []);
      const imageItem = items.find(item => item.type.startsWith('image/'));
      if (!imageItem) return;

      e.preventDefault();
      const file = imageItem.getAsFile();
      if (!file) return;

      // Place in center of current viewport
      const pos = Canvas.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
      await this.addFileToCanvas(file, pos.x - 200, pos.y - 150);
    });
  },

  initFileInput() {
    const fileInput = document.getElementById('file-input');
    fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      const pos = App._pendingImagePos || Canvas.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
      let offsetX = 0;

      for (const file of files) {
        await this.addFileToCanvas(file, pos.x + offsetX, pos.y);
        offsetX += 220;
      }

      App._pendingImagePos = null;
      fileInput.value = '';
      fileInput.accept = 'image/*,.pdf,.doc,.docx,.txt,.svg';
      App.setTool('select');
    });
  },

  _showToast(name) {
    const stack = document.getElementById('upload-progress-stack');
    const toast = document.createElement('div');
    toast.className = 'upload-toast';
    const shortName = name.length > 28 ? name.slice(0, 25) + '…' : name;
    toast.innerHTML = `
      <div class="upload-toast-name">${Utils.escapeHtml(shortName)}</div>
      <div class="upload-toast-bar-track"><div class="upload-toast-bar-fill" style="width:0%"></div></div>
      <div class="upload-toast-pct">0%</div>`;
    stack.appendChild(toast);
    return {
      update(pct) {
        toast.querySelector('.upload-toast-bar-fill').style.width = pct + '%';
        toast.querySelector('.upload-toast-pct').textContent = pct + '%';
      },
      done() {
        toast.querySelector('.upload-toast-bar-fill').style.width = '100%';
        toast.querySelector('.upload-toast-pct').textContent = '✓';
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 600);
      },
    };
  },

  async addFileToCanvas(file, x, y) {
    const toast = this._showToast(file.name);
    try {
      // Extract video thumbnail from local file before upload (instant)
      let thumbnailUrl = null;
      if (file.type.startsWith('video/')) {
        thumbnailUrl = await Utils.extractVideoThumbnail(file);
      }

      const result = await Utils.uploadFile(file, pct => toast.update(pct));
      toast.done();

      if (file.type.startsWith('image/')) {
        const img = new Image();
        img.src = result.url;
        await new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
        const maxW = 400;
        const ratio = img.naturalWidth / img.naturalHeight;
        const width = Math.min(img.naturalWidth, maxW);
        const height = width / ratio;
        const data = Elements.create('image', x, y, { url: result.url, originalName: result.originalName, width, height });
        App.elements.push(data);
        Elements.renderElement(data);
        Elements.select(data.id);
      } else {
        const data = Elements.create('file', x, y, {
          url: result.url,
          originalName: result.originalName,
          fileSize: result.size,
          mimetype: result.mimetype,
          thumbnailUrl,
        });
        App.elements.push(data);
        Elements.renderElement(data);
        Elements.select(data.id);
      }

      App.saveState();
      Canvas.updateMinimap();
    } catch (err) {
      console.error('Upload failed:', err);
      toast.done();
    }
  },
};
