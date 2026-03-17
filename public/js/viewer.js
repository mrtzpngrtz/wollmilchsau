/* === FILE VIEWER === */
const FileViewer = {
  _modal: null,
  _body: null,
  _activeMedia: null,

  init() {
    this._modal = document.getElementById('file-viewer');
    this._body  = document.getElementById('file-viewer-body');

    document.getElementById('file-viewer-close').addEventListener('click', () => this.close());
    this._modal.addEventListener('click', e => { if (e.target === this._modal) this.close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
  },

  open(data) {
    const mime = data.mimetype || '';
    const url  = data.url || '';
    const name = data.originalName || 'file';

    // Header
    document.getElementById('file-viewer-title').textContent = name;
    const dl   = document.getElementById('file-viewer-download');
    const view = document.getElementById('file-viewer-open');
    dl.href       = url;
    dl.download   = name;
    view.href     = url;

    // Body
    this._stopMedia();
    this._body.innerHTML = '';
    this._body.className = 'file-viewer-body';

    if (mime.startsWith('video/')) {
      this._body.classList.add('fv-media');
      const video = document.createElement('video');
      video.src = url;
      video.controls = true;
      video.autoplay = true;
      this._body.appendChild(video);
      this._activeMedia = video;

    } else if (mime.startsWith('audio/')) {
      this._body.classList.add('fv-audio');
      const wrap = document.createElement('div');
      wrap.className = 'fv-audio-wrap';
      const icon = document.createElement('div');
      icon.className = 'fv-audio-icon';
      icon.textContent = '▶';
      const audio = document.createElement('audio');
      audio.src = url;
      audio.controls = true;
      wrap.appendChild(icon);
      wrap.appendChild(audio);
      this._body.appendChild(wrap);
      this._activeMedia = audio;

    } else if (mime === 'application/pdf') {
      this._body.classList.add('fv-embed');
      const iframe = document.createElement('iframe');
      iframe.src = url;
      this._body.appendChild(iframe);

    } else if (mime.startsWith('image/')) {
      this._body.classList.add('fv-media');
      const img = document.createElement('img');
      img.src = url;
      img.style.cssText = 'max-width:100%;max-height:75vh;object-fit:contain;display:block;margin:auto;';
      this._body.appendChild(img);

    } else if (mime.startsWith('text/') || this._isTextExt(name)) {
      this._body.classList.add('fv-text');
      const pre = document.createElement('pre');
      pre.textContent = 'Loading…';
      this._body.appendChild(pre);
      fetch(url).then(r => r.text()).then(t => { pre.textContent = t; }).catch(() => { pre.textContent = '(Could not load file)'; });

    } else {
      this._body.classList.add('fv-generic');
      this._body.innerHTML = `
        <div class="fv-generic-icon">${Utils.getFileIcon(mime, name)}</div>
        <div class="fv-generic-name">${Utils.escapeHtml(name)}</div>
        <div class="fv-generic-size">${Utils.formatFileSize(data.fileSize || 0)}</div>
        <p class="fv-generic-hint">No preview available — use the buttons above to download or open.</p>
      `;
    }

    this._modal.classList.remove('hidden');
  },

  close() {
    this._stopMedia();
    this._body.innerHTML = '';
    this._modal.classList.add('hidden');
  },

  _stopMedia() {
    if (this._activeMedia) {
      this._activeMedia.pause();
      this._activeMedia.src = '';
      this._activeMedia = null;
    }
  },

  _isTextExt(name) {
    const ext = name.split('.').pop().toLowerCase();
    return ['txt','md','json','js','ts','py','html','css','csv','xml','yaml','yml','sh','log'].includes(ext);
  },
};
