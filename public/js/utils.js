/* === UTILS === */
const Utils = {
  id: () => 'el_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),

  clamp: (val, min, max) => Math.min(Math.max(val, min), max),

  formatFileSize: (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  getFileIcon: (mimetype, name) => {
    if (mimetype && mimetype.startsWith('image/')) return '◻';
    const ext = name ? name.split('.').pop().toLowerCase() : '';
    const icons = {
      pdf: '▤', doc: '▤', docx: '▤', txt: '▤',
      xls: '▦', xlsx: '▦', csv: '▦',
      zip: '▣', rar: '▣',
      mp3: '▶', wav: '▶', mp4: '▶', mov: '▶',
      svg: '◈', ai: '◈', psd: '◈', fig: '◈',
      js: '◇', ts: '◇', py: '◇', html: '◇', css: '◇',
      json: '◇', md: '▤',
    };
    return icons[ext] || '◻';
  },

  throttle: (fn, delay) => {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= delay) {
        last = now;
        fn(...args);
      }
    };
  },

  debounce: (fn, delay) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  uploadFile: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    return res.json();
  },

  SVG_NS: 'http://www.w3.org/2000/svg',

  createSVGElement: (tag, attrs = {}) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  },

  // Icons — geometric/emoji set
  ICONS: [
    '⭐', '❤️', '🔥', '💡', '🎯', '🚀', '💎', '🏆', '🎨', '🎭',
    '📌', '📍', '🔖', '🏷️', '💬', '💭', '🗨️', '📢', '🔔', '💰',
    '✅', '❌', '⚠️', '❓', '❗', '💯', '●', '○', '◆', '◇',
    '■', '□', '▲', '△', '▼', '▽', '◀', '▶', '★', '☆',
    '👤', '👥', '🤝', '👍', '👎', '👀', '🧠', '💪', '✍️', '→',
    '←', '↑', '↓', '↗', '↘', '↙', '↖', '↔', '↕', '⟶',
    '📁', '📂', '📄', '📝', '📊', '📈', '📉', '📋', '📎', '🔗',
    '⚙️', '🔧', '🔨', '🛠️', '🧪', '🔬', '🧩', '🗝️', '🔒', '🔓',
    '●', '◐', '◑', '◒', '◓', '◔', '◕', '⊕', '⊖', '⊗',
    '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
  ],

  NOTE_COLORS: [
    { name: 'default', class: '', label: 'DEFAULT' },
    { name: 'blue', class: 'note-blue', label: 'BLUE' },
    { name: 'green', class: 'note-green', label: 'GREEN' },
    { name: 'pink', class: 'note-pink', label: 'PINK' },
    { name: 'purple', class: 'note-purple', label: 'PURPLE' },
    { name: 'orange', class: 'note-orange', label: 'ORANGE' },
  ],

  ELEMENT_COLORS: [
    '#111111', '#333333', '#555555', '#999999', '#CCCCCC',
    '#FF4500', '#FF0066', '#0066FF', '#00AA44', '#7700FF',
  ],

  BORDER_COLORS: [
    '#111111', '#333333', '#555555', '#999999', '#CCCCCC',
    '#FF4500', '#FF0066', '#0066FF', '#00AA44', '#7700FF',
  ],

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },

  escapeAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },
};
