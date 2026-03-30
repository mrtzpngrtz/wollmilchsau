/* === CALENDAR ELEMENT === */
const CalendarEl = {

  // Runtime cache: elementId -> { events, year, month, fetchedAt }
  _cache: {},

  _MONTH_NAMES: ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'],
  _DAY_LABELS: ['MO','TU','WE','TH','FR','SA','SU'],

  renderInner(data) {
    const now = new Date();
    const year = data.viewYear || now.getFullYear();
    const month = data.viewMonth || (now.getMonth() + 1);
    return this._buildHtml(data, year, month, null, 'loading');
  },

  _buildHtml(data, year, month, events, state) {
    // Build map of day -> events[]
    const eventMap = {};
    if (events) {
      events.forEach(ev => {
        // Handle both date-only ('2026-03-15') and datetime strings
        const dateStr = ev.start.substring(0, 10);
        const [evY, evM, evD] = dateStr.split('-').map(Number);
        if (evY === year && evM === month) {
          if (!eventMap[evD]) eventMap[evD] = [];
          eventMap[evD].push(ev);
        }
      });
    }

    // First weekday of month (Monday = 0)
    const firstDow = new Date(year, month - 1, 1).getDay();
    const startOffset = (firstDow + 6) % 7;
    const daysInMonth = new Date(year, month, 0).getDate();

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
    const todayDate = today.getDate();

    let daysHtml = '';
    for (let i = 0; i < startOffset; i++) {
      daysHtml += '<div class="cal-day cal-day--empty"></div>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const evs = eventMap[d] || [];
      const hasEvents = evs.length > 0;
      const isToday = isCurrentMonth && d === todayDate;
      const dots = Math.min(evs.length, 3);
      daysHtml += `<div class="cal-day${isToday ? ' cal-day--today' : ''}${hasEvents ? ' cal-day--has-events' : ''}" data-day="${d}" data-year="${year}" data-month="${month}"><span class="cal-day-num">${d}</span>${hasEvents ? `<span class="cal-dots" data-dots="${dots}"></span>` : ''}</div>`;
    }

    const statusHtml =
      state === 'loading'      ? '<div class="cal-status">Loading…</div>' :
      state === 'error'        ? '<div class="cal-status cal-status--error">Could not load events</div>' :
      state === 'disconnected' ? `<div class="cal-status cal-status--info">Connect Google Calendar in <a href="/settings">Settings → Calendar</a></div>` :
      '';

    return `
      <div class="cal-header">
        <button class="cal-nav cal-nav--prev" title="Previous month">‹</button>
        <span class="cal-title">${this._MONTH_NAMES[month - 1]} ${year}</span>
        <button class="cal-nav cal-nav--next" title="Next month">›</button>
        <button class="cal-refresh" title="Refresh">↺</button>
      </div>
      <div class="cal-grid">
        ${this._DAY_LABELS.map(l => `<div class="cal-dow">${l}</div>`).join('')}
        ${daysHtml}
      </div>
      ${statusHtml}
      <div class="cal-popup hidden"></div>`;
  },

  bindEvents(el, data) {
    const inner = el.querySelector('.el-calendar');
    if (!inner) return;

    // Fetch on first render
    this._fetchAndRender(el, data);

    inner.addEventListener('click', (e) => {
      // Prevent canvas drag handling
      e.stopPropagation();

      if (e.target.closest('.cal-nav--prev')) {
        this._navigate(el, data, -1); return;
      }
      if (e.target.closest('.cal-nav--next')) {
        this._navigate(el, data, +1); return;
      }
      if (e.target.closest('.cal-refresh')) {
        delete this._cache[data.id];
        const d = Elements.getData(data.id) || data;
        this._fetchAndRender(el, d); return;
      }

      const dayEl = e.target.closest('.cal-day--has-events');
      if (dayEl) {
        this._showPopup(inner, dayEl, data); return;
      }

      this._hidePopup(inner);
    });
  },

  _navigate(el, data, dir) {
    const d = Elements.getData(data.id);
    if (!d) return;
    const now = new Date();
    let y = d.viewYear || now.getFullYear();
    let m = d.viewMonth || (now.getMonth() + 1);
    m += dir;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    d.viewYear = y;
    d.viewMonth = m;
    Elements.updateElement(data.id, { viewYear: y, viewMonth: m });
    App.saveState();
    this._fetchAndRender(el, d);
  },

  async _fetchAndRender(el, data) {
    const inner = el.querySelector('.el-calendar');
    if (!inner) return;

    const now = new Date();
    const year = data.viewYear || now.getFullYear();
    const month = data.viewMonth || (now.getMonth() + 1);

    // Serve from cache if fresh (5 min)
    const cached = this._cache[data.id];
    if (cached && cached.year === year && cached.month === month && Date.now() - cached.fetchedAt < 300000) {
      inner.innerHTML = this._buildHtml(data, year, month, cached.events, 'ok');
      this._rebindInner(el, data);
      return;
    }

    // Show loading
    inner.innerHTML = this._buildHtml(data, year, month, null, 'loading');
    this._rebindInner(el, data);

    try {
      const calId = encodeURIComponent(data.calendarId || 'primary');
      const res = await fetch(`/api/calendar/events?year=${year}&month=${month}&calendarId=${calId}`);
      if (res.status === 401) {
        inner.innerHTML = this._buildHtml(data, year, month, null, 'disconnected');
        this._rebindInner(el, data);
        return;
      }
      if (!res.ok) throw new Error('fetch failed');
      const { events } = await res.json();
      this._cache[data.id] = { events, year, month, fetchedAt: Date.now() };
      inner.innerHTML = this._buildHtml(data, year, month, events, 'ok');
      this._rebindInner(el, data);
    } catch {
      inner.innerHTML = this._buildHtml(data, year, month, null, 'error');
      this._rebindInner(el, data);
    }
  },

  // Re-attach click handler after innerHTML replacement
  _rebindInner(el, data) {
    const inner = el.querySelector('.el-calendar');
    if (!inner) return;
    // Remove old listener by cloning — simpler: use event delegation on el (already bound)
    // Nothing extra needed since bindEvents is bound on `el` which persists
  },

  _showPopup(inner, dayEl, data) {
    const popup = inner.querySelector('.cal-popup');
    if (!popup) return;
    const day   = parseInt(dayEl.dataset.day);
    const year  = parseInt(dayEl.dataset.year);
    const month = parseInt(dayEl.dataset.month);

    const cached = this._cache[data.id];
    if (!cached) return;

    const evs = (cached.events || []).filter(ev => {
      const dateStr = ev.start.substring(0, 10);
      const [y, m, d] = dateStr.split('-').map(Number);
      return y === year && m === month && d === day;
    });

    popup.innerHTML = evs.map(ev => {
      let timeStr = 'All day';
      if (!ev.allDay && ev.start.length > 10) {
        timeStr = new Date(ev.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return `<div class="cal-popup-row"><span class="cal-popup-time">${timeStr}</span><span class="cal-popup-title">${Utils.escapeHtml(ev.title)}</span></div>`;
    }).join('');

    // Position below the day cell
    const innerRect = inner.getBoundingClientRect();
    const dayRect   = dayEl.getBoundingClientRect();
    popup.style.top  = (dayRect.bottom - innerRect.top + 4) + 'px';
    popup.style.left = Math.max(4, dayRect.left - innerRect.left - 12) + 'px';
    popup.classList.remove('hidden');
  },

  _hidePopup(inner) {
    inner.querySelector('.cal-popup')?.classList.add('hidden');
  },
};
