/* LED BOARD — display only. Controlled from control.html (phone or laptop). */
(function () {
  'use strict';
  const { CONFIG, RACES, RACE, fmt, $, keepAwake } = window.RaceCore;
  const STATUS_TEXT = { waiting: 'Upcoming', running: 'Live', finished: 'Completed' };
  const app = $('#app');

  document.title = `${CONFIG.eventTitle} ${CONFIG.eventYear} — Race Clock`;
  document.documentElement.style.setProperty('--race-count', RACES.length);

  /* ---------------- build ---------------- */
  app.innerHTML = `
  <div class="board">
    <header class="b-header">
      <div class="brand">
        <div class="intel-badge">intel</div>
        <div class="brand-sep"></div>
        <div class="brand-title" id="brand-title"></div>
      </div>
      <div class="header-right">
        <div class="header-tag">Official Race Clock</div>
        <div class="event-chip" id="event-chip" data-mode="standby"><span class="dot"></span><span id="event-chip-text">Race Day</span></div>
      </div>
    </header>

    <main class="b-main">
      ${RACES.map(r => `
      <article class="card theme-${r.theme}" id="card-${r.id}" data-status="waiting">
        <div class="card-head">
          <span class="card-icon" aria-hidden="true">${r.icon}</span>
          <h2 class="card-title">${r.name}</h2>
        </div>
        <div class="status"><span class="status-dot"></span><span class="status-text">Upcoming</span></div>
        <div class="hero">
          <div class="hero-label" id="label-${r.id}" hidden>Race Time</div>
          <div class="waiting-text" data-fit id="waiting-${r.id}"><span>To Be</span><span>Started</span></div>
          <div class="timer" data-fit id="timer-${r.id}" hidden><span class="hms">00:00:00</span><span class="tenths"${CONFIG.showTenths ? '' : ' hidden'}>.0</span></div>
        </div>
        <div class="meta" id="meta-${r.id}"></div>
      </article>`).join('')}
    </main>

    <footer class="b-footer">
      <div class="f-left" id="f-left"></div>
      <div class="f-clock">
        <div class="clock-item"><span class="clock-label">Day</span><span class="clock-value" id="c-day">—</span></div>
        <div class="clock-sep"></div>
        <div class="clock-item"><span class="clock-label">Date</span><span class="clock-value" id="c-date">—</span></div>
        <div class="clock-sep"></div>
        <div class="clock-item"><span class="clock-label">Current Time</span><span class="clock-value" id="c-time">—</span></div>
      </div>
      <div class="f-right"><span class="sync" id="sync" hidden></span><span>Powered by <b>Intel®</b></span></div>
    </footer>
  </div>

  <div class="announce" id="announce" aria-live="assertive">
    <div class="announce-flash"></div>
    <div class="announce-inner">
      <div class="a-kicker">Flag-off</div>
      <div class="a-title" id="a-title"></div>
      <div class="a-sub">Has Started</div>
      <div class="a-timer" id="a-timer">00:00:00</div>
      <div class="a-time" id="a-time"></div>
    </div>
  </div>

  <div class="board-hint">Press <kbd>F</kbd> or double-click for full screen · controls are on <b>control.html</b></div>`;

  $('#brand-title').innerHTML = '';
  $('#brand-title').append(document.createTextNode(CONFIG.eventTitle + ' '), Object.assign(document.createElement('em'), { textContent: CONFIG.eventYear }));
  $('#f-left').textContent = CONFIG.footerText || `${CONFIG.eventTitle} ${CONFIG.eventYear}`;

  const els = {};
  for (const r of RACES) {
    const t = $(`#timer-${r.id}`);
    els[r.id] = { hms: $('.hms', t), tenths: $('.tenths', t), last: '' };
  }
  const aTimer = $('#a-timer'), cDay = $('#c-day'), cDate = $('#c-date'), cTime = $('#c-time');

  /* ---------------- state ---------------- */
  let store = null;
  let races = null;
  const now = () => (store ? store.now() : Date.now());

  function setTimer(id, ms) {
    const e = els[id], p = fmt.split(ms), key = p.hms + p.tenths;
    if (e.last === key) return;
    e.last = key; e.hms.textContent = p.hms; e.tenths.textContent = '.' + p.tenths;
  }

  function metaLine(dot, k, v) {
    return `<div class="meta-line">${dot ? `<span class="dot ${dot}"></span>` : ''}<span class="k">${k}</span>${v ? `<span class="v">${v}</span>` : ''}</div>`;
  }
  function metaHTML(id, st) {
    if (st.status === 'waiting') {
      return st.flagOff
        ? metaLine('accent', 'Flag-off', fmt.flagOff(st.flagOff)) + `<div class="meta-line" id="countdown-${id}"></div>`
        : metaLine('accent', 'Awaiting flag-off', '');
    }
    let html = metaLine('green', 'Started', fmt.wall(st.startedAt));
    if (st.status === 'finished') html += metaLine('red', 'Ended', fmt.wall(st.endedAt));
    return html;
  }

  function render() {
    let anyRunning = false, allDone = true;
    for (const r of RACES) {
      const st = races[r.id], card = $(`#card-${r.id}`);
      card.dataset.status = st.status;
      if (st.status === 'running') anyRunning = true;
      if (st.status !== 'finished') allDone = false;
      $('.status-text', card).textContent = STATUS_TEXT[st.status];
      $(`#waiting-${r.id}`).hidden = st.status !== 'waiting';
      $(`#timer-${r.id}`).hidden   = st.status === 'waiting';
      const label = $(`#label-${r.id}`);
      label.hidden = st.status === 'waiting';
      label.textContent = st.status === 'finished' ? 'Final Time' : 'Race Time';
      if (st.status === 'finished') setTimer(r.id, st.endedAt - st.startedAt);
      if (st.status === 'waiting')  setTimer(r.id, 0);
      const metaEl = $(`#meta-${r.id}`), html = metaHTML(r.id, st);
      if (metaEl.dataset.html !== html) { metaEl.innerHTML = html; metaEl.dataset.html = html; }
    }
    const mode = anyRunning ? 'live' : allDone ? 'done' : 'standby';
    $('#event-chip').dataset.mode = mode;
    $('#event-chip-text').textContent = mode === 'live' ? 'Live' : mode === 'done' ? 'All Races Completed' : 'Race Day';
    fitAll();
    fastTick(); slowTick();
  }

  function onRaces(next) {
    const before = races;
    races = next;
    render();
    if (before) detectStarts(before, next);
  }

  function renderSync(st) {
    const el = $('#sync');
    if (st.mode !== 'cloud') { el.hidden = true; return; }
    el.hidden = false;
    const ok = st.connected && st.loaded && !st.error;
    el.dataset.state = ok ? 'ok' : 'warn';
    el.textContent = ok ? 'Synced' : 'Reconnecting';
    el.title = st.error || '';
  }

  /* ---------------- fit safety net ---------------- */
  function fitEl(el) {
    if (el.offsetParent === null && !el.closest('.announce')) return;
    el.style.fontSize = '';
    const need = el.scrollWidth, avail = el.clientWidth;
    if (avail > 0 && need > avail + 1) {
      el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * avail / need * 0.96) + 'px';
    }
  }
  const fitAll = () => document.querySelectorAll('[data-fit]').forEach(fitEl);

  /* ---------------- start announcement ---------------- */
  const queue = [];
  let announcingId = null;
  function queueAnnounce(id) {
    if (!queue.includes(id) && announcingId !== id) queue.push(id);
    if (!announcingId) nextAnnounce();
  }
  function nextAnnounce() {
    const id = queue.shift(), el = $('#announce');
    if (!id) { announcingId = null; return; }
    const st = races[id];
    if (st.status !== 'running') { nextAnnounce(); return; }
    announcingId = id;
    const r = RACE[id];
    el.className = `announce theme-${r.theme}`;
    $('#a-title').textContent = `${r.icon} ${r.name}`;
    $('#a-time').textContent  = `Started at ${fmt.wall(st.startedAt)}`;
    void el.offsetWidth;
    el.classList.add('show');
    fitEl($('#a-title'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => { announcingId = null; nextAnnounce(); }, 450);
    }, CONFIG.announceMs);
  }
  function detectStarts(before, after) {
    for (const r of RACES) {
      const a = before[r.id], b = after[r.id];
      if (b.status !== 'running' || now() - b.startedAt > 20000) continue;
      if (a.status === 'waiting' || (a.status === 'finished' && a.startedAt !== b.startedAt)) queueAnnounce(r.id);
    }
  }

  /* ---------------- tickers ---------------- */
  function fastTick() {
    if (!races) return;
    const t = now();
    for (const r of RACES) if (races[r.id].status === 'running') setTimer(r.id, t - races[r.id].startedAt);
    if (announcingId && races[announcingId].status === 'running') {
      const s = fmt.split(t - races[announcingId].startedAt).hms;
      if (aTimer.textContent !== s) aTimer.textContent = s;
    }
  }
  function slowTick() {
    const d = new Date(now());
    const day  = d.toLocaleDateString('en-IN', { weekday: 'long' });
    const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const time = fmt.wall(d.getTime());
    if (cDay.textContent  !== day)  cDay.textContent  = day;
    if (cDate.textContent !== date) cDate.textContent = date;
    if (cTime.textContent !== time) cTime.textContent = time;
    if (!races) return;
    for (const r of RACES) {
      const st = races[r.id];
      if (st.status !== 'waiting' || !st.flagOff) continue;
      const el = document.getElementById(`countdown-${r.id}`);
      if (!el) continue;
      const left = fmt.flagOffEpoch(st.flagOff, now()) - now();
      const html = left > 0 ? `<span class="k">Starts in</span><span class="v">${fmt.countdown(left)}</span>`
                            : `<span class="k hot">Starting shortly</span>`;
      if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
    }
  }

  /* ---------------- operator conveniences (no race controls here) ---------------- */
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }
  let idleTimer = null;
  function wake() {
    document.body.classList.add('operator-active');
    document.body.classList.remove('board-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      document.body.classList.remove('operator-active');
      document.body.classList.add('board-idle');
    }, 3000);
  }
  ['mousemove', 'mousedown', 'touchstart'].forEach(ev => document.addEventListener(ev, wake, { passive: true }));
  document.addEventListener('dblclick', toggleFullscreen);
  document.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) toggleFullscreen(); });

  let fitQueued = false;
  window.addEventListener('resize', () => {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(() => { fitQueued = false; fitAll(); });
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);

  /* ---------------- boot ---------------- */
  setInterval(fastTick, 40);
  setInterval(slowTick, 250);
  keepAwake();

  window.RaceCore.createStore({ withAuth: false })
    .then(s => { store = s; s.onStatus(renderSync); s.subscribe(onRaces); })
    .catch(err => {
      // No internet / SDK blocked: show last known state, keep clocks running, retry.
      console.error(err);
      renderSync({ mode: 'cloud', connected: false, loaded: false, error: String(err.message || err) });
      onRaces(window.RaceCore.readCache() || Object.fromEntries(RACES.map(r => [r.id, window.RaceCore.normalizeRace(null)])));
      setTimeout(() => location.reload(), 20000);
    });
})();
