/* === SUGGESTIONS — Feature Requests Lightbox === */
const Suggestions = {
  init() {
    const lightbox = document.getElementById('suggestions-lightbox');
    const trigger = document.getElementById('suggestions-trigger');
    const closeBtn = document.getElementById('suggestions-close');
    const input = document.getElementById('suggestion-input');
    const submit = document.getElementById('suggestion-submit');

    // Open lightbox
    trigger.addEventListener('click', () => {
      lightbox.classList.remove('hidden');
      this.load();
      input.focus();
    });

    // Close lightbox
    closeBtn.addEventListener('click', () => lightbox.classList.add('hidden'));
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) lightbox.classList.add('hidden');
    });

    // Submit
    const doSubmit = async () => {
      const text = input.value.trim();
      if (!text) return;
      try {
        await fetch('/api/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        input.value = '';
        this.load();
      } catch (err) {
        console.error('Suggestion submit failed:', err);
      }
    };

    submit.addEventListener('click', doSubmit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSubmit();
    });
  },

  async load() {
    const list = document.getElementById('suggestions-list');
    try {
      const res = await fetch('/api/suggestions');
      const suggestions = await res.json();
      list.innerHTML = '';

      if (suggestions.length === 0) {
        list.innerHTML = '<div class="suggestions-empty">No requests yet. Be the first!</div>';
        return;
      }

      const currentUser = App.currentUser;
      const isAdmin = currentUser && currentUser.role === 'admin';

      suggestions.forEach((s, idx) => {
        const item = document.createElement('div');
        item.className = 'suggestion-item-lb' + (s.done ? ' done' : '');
        const userLabel = s.user ? `<span class="suggestion-user">${this.escapeHtml(s.user)}</span>` : '';
        const editedLabel = s.edited ? '<span class="suggestion-edited">edited</span>' : '';
        const doneLabel = s.done ? '<span class="suggestion-done-badge">✓ DONE</span>' : '';
        const canEdit = isAdmin || (currentUser && s.user === currentUser.username);
        const bullet = s.done ? '✓' : '→';
        const bulletClass = s.done ? 'suggestion-bullet done' : 'suggestion-bullet';

        item.innerHTML = `
          <span class="${bulletClass}">${bullet}</span>
          <div class="suggestion-content-lb">
            <div class="suggestion-text-lb">${this.escapeHtml(s.text)}</div>
            <div class="suggestion-meta-lb">${userLabel}${editedLabel}${doneLabel}<span class="suggestion-time-lb">${Storage.formatTimeAgo(s.time)}</span></div>
          </div>
          ${canEdit ? `<div class="suggestion-actions">
            <button class="sug-btn sug-edit" data-idx="${idx}" title="Edit">✎</button>
            <button class="sug-btn sug-del" data-idx="${idx}" title="Delete">✕</button>
          </div>` : ''}
        `;
        list.appendChild(item);
      });

      // Attach edit handlers
      list.querySelectorAll('.sug-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.idx);
          this.edit(idx, suggestions[idx].text);
        });
      });

      // Attach delete handlers
      list.querySelectorAll('.sug-del').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.idx);
          if (!await Dialog.confirm('Delete this suggestion?')) return;
          try {
            await fetch(`/api/suggestions/${idx}`, { method: 'DELETE' });
            this.load();
          } catch (err) {
            console.error('Delete suggestion failed:', err);
          }
        });
      });
    } catch (err) {
      console.error('Load suggestions failed:', err);
    }
  },

  edit(idx, currentText) {
    const list = document.getElementById('suggestions-list');
    const items = list.querySelectorAll('.suggestion-item-lb');
    const item = items[idx];
    if (!item) return;

    const textEl = item.querySelector('.suggestion-text-lb');
    const actionsEl = item.querySelector('.suggestion-actions');

    // Replace text with input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'sug-edit-input';
    input.value = currentText;

    const saveBtn = document.createElement('button');
    saveBtn.className = 'sug-btn sug-save';
    saveBtn.textContent = '✓';
    saveBtn.title = 'Save';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'sug-btn sug-cancel';
    cancelBtn.textContent = '✕';
    cancelBtn.title = 'Cancel';

    textEl.replaceWith(input);
    if (actionsEl) {
      actionsEl.innerHTML = '';
      actionsEl.appendChild(saveBtn);
      actionsEl.appendChild(cancelBtn);
    }
    input.focus();
    input.select();

    const doSave = async () => {
      const newText = input.value.trim();
      if (!newText) return;
      try {
        await fetch(`/api/suggestions/${idx}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: newText }),
        });
        this.load();
      } catch (err) {
        console.error('Edit suggestion failed:', err);
      }
    };

    saveBtn.addEventListener('click', (e) => { e.stopPropagation(); doSave(); });
    cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); this.load(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSave();
      if (e.key === 'Escape') this.load();
    });
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },
};
