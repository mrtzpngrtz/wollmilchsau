/* === CALENDAR ELEMENT === */
const CalendarEl = {

  _cache:        {}, // elementId -> { events, year, month, fetchedAt }
  _calListCache: null,

  _MONTH_NAMES: ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'],
  _DAY_LABELS:  ['MO','TU','WE','TH','FR','SA','SU'],
  _DAY_FULL:    ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],

  // ─── Called once by elements.js on mount ─────────────
  // Binds listeners AND triggers first fetch
  bindEvents(el, data) {
    this._bindListeners(el, data);
    this._fetchAll(el, data);
  },

  // ─── Render ──────────────────────────────────────────

  renderInner(data) {
    const now = new Date();
    return this._buildShell(data, now.getFullYear(), now.getMonth() + 1, null, null, 'loading');
  },

  _buildShell(data, year, month, events, calList, state) {
    const mode    = data.viewMode || 'month';
    const calName = this._calName(data.calendarId, calList);
    const hasCalList = calList && calList.length > 1;

    const body = (state === 'loading' || state === 'error' || state === 'disconnected')
      ? this._statusHtml(state)
      : mode === 'agenda'
        ? this._buildAgenda(data, year, month, events)
        : this._buildGrid(year, month, events);

    return `
      <div class="cal-header">
        <button class="cal-nav cal-nav--prev" title="Previous month">‹</button>
        <span class="cal-title">${this._MONTH_NAMES[month - 1]} ${year}</span>
        <button class="cal-nav cal-nav--next" title="Next month">›</button>
        <button class="cal-view-toggle" data-mode="${mode}" title="Toggle view">${mode === 'agenda' ? '⊞' : '≡'}</button>
        <button class="cal-refresh" title="Refresh">↺</button>
      </div>
      <div class="cal-cal-row${hasCalList ? '' : ' hidden'}">
        <button class="cal-cal-btn" title="Switch calendar">
          <span class="cal-cal-dot" style="background:${this._calColor(data.calendarId, calList)}"></span>
          <span class="cal-cal-name">${Utils.escapeHtml(calName)}</span>
          <span class="cal-cal-arrow">▾</span>
        </button>
      </div>
      <div class="cal-body">${body}</div>
      <div class="cal-cal-dropdown hidden"></div>
      <div class="cal-popup hidden"></div>`;
  },

  _buildGrid(year, month, events) {
    const eventMap    = this._eventMap(year, month, events);
    const firstDow    = new Date(year, month - 1, 1).getDay();
    const startOffset = (firstDow + 6) % 7;
    const daysInMonth = new Date(year, month, 0).getDate();
    const today       = new Date();
    const isNow       = today.getFullYear() === year && today.getMonth() + 1 === month;
    const todayDate   = today.getDate();

    let cells = '';
    for (let i = 0; i < startOffset; i++) cells += '<div class="cal-day cal-day--empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const evs   = eventMap[d] || [];
      const dots  = Math.min(evs.length, 3);
      const isToday = isNow && d === todayDate;
      cells += `<div class="cal-day${isToday ? ' cal-day--today' : ''}${evs.length ? ' cal-day--has-events' : ''}" data-day="${d}" data-year="${year}" data-month="${month}"><span class="cal-day-num">${d}</span>${evs.length ? `<span class="cal-dots" data-dots="${dots}"></span>` : ''}</div>`;
    }
    return `<div class="cal-grid">${this._DAY_LABELS.map(l => `<div class="cal-dow">${l}</div>`).join('')}${cells}</div>`;
  },

  _buildAgenda(data, year, month, events) {
    if (!events || events.length === 0) return '<div class="cal-agenda-empty">No events this month</div>';

    const todayStr = new Date().toISOString().substring(0, 10);
    const byDay    = {};
    events.forEach(ev => {
      const dateStr = ev.start.substring(0, 10);
      if (!byDay[dateStr]) byDay[dateStr] = [];
      byDay[dateStr].push(ev);
    });

    return `<div class="cal-agenda">${Object.keys(byDay).sort().map(dateStr => {
      const [y, m, d]  = dateStr.split('-').map(Number);
      const dow        = new Date(y, m - 1, d).getDay();
      const isToday    = dateStr === todayStr;
      const dayLabel   = `${String(d).padStart(2, '0')} ${this._DAY_FULL[dow].substring(0, 3).toUpperCase()}`;
      const evRows     = byDay[dateStr].map(ev => {
        const timeStr = (!ev.allDay && ev.start.length > 10)
          ? new Date(ev.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : 'All day';
        return `<div class="cal-agenda-ev"><span class="cal-agenda-time">${timeStr}</span><span class="cal-agenda-title">${Utils.escapeHtml(ev.title)}</span></div>`;
      }).join('');
      const isPast = !isToday && dateStr < todayStr;
      return `<div class="cal-agenda-day${isToday ? ' cal-agenda-day--today' : ''}${isPast ? ' cal-agenda-day--past' : ''}"><div class="cal-agenda-date">${dayLabel}</div>${evRows}</div>`;
    }).join('')}</div>`;
  },

  _statusHtml(state) {
    if (state === 'loading')      return '<div class="cal-status">Loading…</div>';
    if (state === 'error')        return '<div class="cal-status cal-status--error">Could not load events</div>';
    if (state === 'disconnected') return `<div class="cal-status cal-status--info">Connect Google Calendar in <a href="/settings">Settings → Calendar</a></div>`;
    return '';
  },

  // ─── Event listeners (no fetch side-effects) ─────────

  _bindListeners(el, data) {
    const inner = el.querySelector('.el-calendar');
    if (!inner) return;

    // Remove old listener by replacing with a clone to avoid stacking
    const fresh = inner.cloneNode(true);
    inner.parentNode.replaceChild(fresh, inner);

    fresh.addEventListener('click', e => {
      e.stopPropagation();

      if (e.target.closest('.cal-nav--prev'))  { this._navigate(el, data, -1); return; }
      if (e.target.closest('.cal-nav--next'))  { this._navigate(el, data, +1); return; }
      if (e.target.closest('.cal-refresh'))    { this._hardRefresh(el, data); return; }

      if (e.target.closest('.cal-view-toggle')) {
        const d    = Elements.getData(data.id) || data;
        const next = (d.viewMode || 'month') === 'month' ? 'agenda' : 'month';
        d.viewMode = next;
        Elements.updateElement(data.id, { viewMode: next });
        App.saveState();
        this._rerenderDOM(el, d);
        return;
      }

      if (e.target.closest('.cal-cal-btn')) {
        this._toggleCalDropdown(el, data); return;
      }

      const calItem = e.target.closest('.cal-cal-item');
      if (calItem) {
        const d     = Elements.getData(data.id) || data;
        const newId = calItem.dataset.calId;
        this._hideCalDropdown(el);
        if (newId !== d.calendarId) {
          d.calendarId = newId;
          Elements.updateElement(data.id, { calendarId: newId });
          delete this._cache[data.id];
          App.saveState();
          this._fetchAll(el, d);
        }
        return;
      }

      const dayEl = e.target.closest('.cal-day--has-events');
      if (dayEl) { this._showPopup(el, dayEl, data); return; }

      this._hidePopup(el);
      this._hideCalDropdown(el);
    });
  },

  // ─── Navigation / actions ────────────────────────────

  _navigate(el, data, dir) {
    const d = Elements.getData(data.id) || data;
    const now = new Date();
    let y = d.viewYear  || now.getFullYear();
    let m = d.viewMonth || (now.getMonth() + 1);
    m += dir;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1;  y++; }
    d.viewYear = y; d.viewMonth = m;
    Elements.updateElement(data.id, { viewYear: y, viewMonth: m });
    App.saveState();
    this._fetchAll(el, d);
  },

  _hardRefresh(el, data) {
    delete this._cache[data.id];
    this._calListCache = null;
    this._fetchAll(el, Elements.getData(data.id) || data);
  },

  // ─── Fetch ───────────────────────────────────────────

  async _fetchAll(el, data) {
    const inner = el.querySelector('.el-calendar');
    if (!inner) return;

    const now   = new Date();
    const year  = data.viewYear  || now.getFullYear();
    const month = data.viewMonth || (now.getMonth() + 1);

    const cached      = this._cache[data.id];
    const calList     = this._calListCache?.calendars || null;
    const freshEnough = cached && cached.year === year && cached.month === month && Date.now() - cached.fetchedAt < 600000; // 10 min

    if (freshEnough && calList) {
      // Fully cached — just re-render and rebind
      inner.innerHTML = this._buildShell(data, year, month, cached.events, calList, 'ok');
      this._bindListeners(el, data);
      return;
    }

    // Show loading state while fetching
    inner.innerHTML = this._buildShell(data, year, month, freshEnough ? cached.events : null, calList, freshEnough ? 'ok' : 'loading');
    this._bindListeners(el, data);

    const calListAge    = this._calListCache ? Date.now() - this._calListCache.fetchedAt : Infinity;
    const calListFresh  = calListAge < (this._calListCache?.failed ? 600000 : 3600000); // failed: 10min, ok: 1hr

    const [evResult, calResult] = await Promise.allSettled([
      freshEnough  ? Promise.resolve(cached)            : this._fetchEvents(data, year, month),
      calListFresh ? Promise.resolve(this._calListCache) : this._fetchCalList(),
    ]);

    const newInner = el.querySelector('.el-calendar');
    if (!newInner) return; // element was removed

    if (evResult.status !== 'fulfilled') {
      const state = evResult.reason?.status === 401 ? 'disconnected' : 'error';
      newInner.innerHTML = this._buildShell(data, year, month, null, calResult.value?.calendars || null, state);
      this._bindListeners(el, data);
      return;
    }

    const events  = evResult.value?.events || [];
    const calData = calResult.status === 'fulfilled' ? calResult.value?.calendars : null;
    newInner.innerHTML = this._buildShell(data, year, month, events, calData, 'ok');
    this._bindListeners(el, data);
  },

  async _fetchEvents(data, year, month) {
    const calId = encodeURIComponent(data.calendarId || 'primary');
    const res   = await fetch(`/api/calendar/events?year=${year}&month=${month}&calendarId=${calId}`);
    if (res.status === 401) { const e = new Error('unauth'); e.status = 401; throw e; }
    if (!res.ok) throw new Error('fetch failed');
    const d = await res.json();
    this._cache[data.id] = { events: d.events, year, month, fetchedAt: Date.now() };
    return d;
  },

  async _fetchCalList() {
    const res = await fetch('/api/calendar/list');
    if (!res.ok) {
      // Cache the failure for 10 min so we don't keep hammering the API
      this._calListCache = { calendars: null, fetchedAt: Date.now(), failed: true };
      throw new Error('cal list failed');
    }
    const d = await res.json();
    this._calListCache = { calendars: d.calendars, fetchedAt: Date.now() };
    return this._calListCache;
  },

  _rerenderDOM(el, data) {
    const inner = el.querySelector('.el-calendar');
    if (!inner) return;
    const now   = new Date();
    const year  = data.viewYear  || now.getFullYear();
    const month = data.viewMonth || (now.getMonth() + 1);
    const cached  = this._cache[data.id];
    const calList = this._calListCache?.calendars || null;
    const isFresh = cached && cached.year === year && cached.month === month;
    inner.innerHTML = this._buildShell(data, year, month, isFresh ? cached.events : null, calList, isFresh ? 'ok' : 'loading');
    this._bindListeners(el, data);
    if (!isFresh) this._fetchAll(el, data);
  },

  // ─── Calendar dropdown ───────────────────────────────

  _toggleCalDropdown(el, data) {
    const inner    = el.querySelector('.el-calendar');
    const dropdown = inner?.querySelector('.cal-cal-dropdown');
    if (!dropdown) return;
    if (!dropdown.classList.contains('hidden')) { this._hideCalDropdown(el); return; }

    const calendars = this._calListCache?.calendars || [];
    dropdown.innerHTML = calendars.map(c => `
      <div class="cal-cal-item${c.id === (data.calendarId || 'primary') ? ' active' : ''}" data-cal-id="${Utils.escapeAttr(c.id)}">
        <span class="cal-cal-dot" style="background:${c.color || '#aaa'}"></span>
        <span>${Utils.escapeHtml(c.name)}</span>
      </div>`).join('');
    dropdown.classList.remove('hidden');
  },

  _hideCalDropdown(el) {
    el.querySelector('.el-calendar .cal-cal-dropdown')?.classList.add('hidden');
  },

  // ─── Day event popup ─────────────────────────────────

  _showPopup(el, dayEl, data) {
    const inner = el.querySelector('.el-calendar');
    const popup = inner?.querySelector('.cal-popup');
    if (!popup) return;

    const day   = parseInt(dayEl.dataset.day);
    const year  = parseInt(dayEl.dataset.year);
    const month = parseInt(dayEl.dataset.month);
    const cached = this._cache[data.id];
    if (!cached) return;

    const evs = (cached.events || []).filter(ev => {
      const [y, m, d] = ev.start.substring(0, 10).split('-').map(Number);
      return y === year && m === month && d === day;
    });

    popup.innerHTML = evs.map(ev => {
      const timeStr = (!ev.allDay && ev.start.length > 10)
        ? new Date(ev.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'All day';
      return `<div class="cal-popup-row"><span class="cal-popup-time">${timeStr}</span><span class="cal-popup-title">${Utils.escapeHtml(ev.title)}</span></div>`;
    }).join('');

    // Position popup, then clamp so it stays inside the element
    popup.style.top  = '0';
    popup.style.left = '0';
    popup.classList.remove('hidden');

    const innerRect = inner.getBoundingClientRect();
    const dayRect   = dayEl.getBoundingClientRect();
    const popupW    = popup.offsetWidth;
    const popupH    = popup.offsetHeight;

    let top  = dayRect.bottom - innerRect.top + 4;
    let left = dayRect.left   - innerRect.left - 12;

    // Clamp right edge
    if (left + popupW > innerRect.width - 4) left = innerRect.width - popupW - 4;
    left = Math.max(4, left);

    // Flip above the day if popup overflows bottom
    if (top + popupH > innerRect.height - 4) top = dayRect.top - innerRect.top - popupH - 4;
    top = Math.max(4, top);

    popup.style.top  = top + 'px';
    popup.style.left = left + 'px';
  },

  _hidePopup(el) {
    el.querySelector('.el-calendar .cal-popup')?.classList.add('hidden');
  },

  // ─── Helpers ─────────────────────────────────────────

  _eventMap(year, month, events) {
    const map = {};
    if (!events) return map;
    events.forEach(ev => {
      const [y, m, d] = ev.start.substring(0, 10).split('-').map(Number);
      if (y === year && m === month) {
        if (!map[d]) map[d] = [];
        map[d].push(ev);
      }
    });
    return map;
  },

  _calName(calendarId, calList) {
    if (!calList) return calendarId || 'primary';
    return calList.find(c => c.id === (calendarId || 'primary'))?.name || calendarId || 'primary';
  },

  _calColor(calendarId, calList) {
    if (!calList) return '#aaa';
    return calList.find(c => c.id === (calendarId || 'primary'))?.color || '#aaa';
  },
};
