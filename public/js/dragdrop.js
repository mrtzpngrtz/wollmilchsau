/* === DRAG & DROP + FILE INPUT === */
const DragDrop = {
  init() {
    this.initDragDrop();
    this.initFileInput();
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

  async addFileToCanvas(file, x, y) {
    try {
      const result = await Utils.uploadFile(file);

      if (file.type.startsWith('image/')) {
        const img = new Image();
        img.src = result.url;
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });

        const maxW = 400;
        const ratio = img.naturalWidth / img.naturalHeight;
        const width = Math.min(img.naturalWidth, maxW);
        const height = width / ratio;

        const data = Elements.create('image', x, y, {
          url: result.url,
          originalName: result.originalName,
          width, height,
        });
        App.elements.push(data);
        Elements.renderElement(data);
        Elements.select(data.id);
      } else {
        const data = Elements.create('file', x, y, {
          url: result.url,
          originalName: result.originalName,
          fileSize: result.size,
          mimetype: result.mimetype,
        });
        App.elements.push(data);
        Elements.renderElement(data);
        Elements.select(data.id);
      }

      App.saveState();
      Canvas.updateMinimap();
    } catch (err) {
      console.error('Upload failed:', err);
    }
  },
};
