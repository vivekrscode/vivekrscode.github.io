/* CONTROL PANEL — operator page (phone or laptop). Drives the LED board. */
(function () {
  'use strict';
  const { CONFIG, RACES, RACE, fmt, $, withQuery, ui, eventId, useCloud, keepAwake } = window.RaceCore;
  const STATUS_TEXT = { waiting: 'To Be Started', running: 'Live', finished: 'Completed' };
  const app = $('#app');
  document.title = `Race Control — ${CONFIG.eventTitle} ${CONFIG.eventYear}`;

  /* ---------------- build ---------------- */
  app.innerHTML = `
  <div class="cp">
    <header class="cp-header">
      <div class="cp-brand">
        <div class="intel-badge">intel</div>
        <div><h1>Race Control</h1><p id="cp-sub"></p></div>
      </div>
      <div class="cp-actions">
        <a class="btn btn-primary" id="open-board" target="_blank" rel="noopener">Open LED Board</a>
        <button type="button" class="btn btn-ghost" data-act="reset-all">Reset All</button>
        <button type="button" class="btn btn-ghost" data-act="sign-out" hidden>Sign Out</button>
      </div>
    </header>

    <div class="cp-banner" id="banner" data-tone="info"><div id="banner-text">Connecting…</div></div>

    <form class="cp-login" id="login" hidden autocomplete="on">
      <h2>Operator sign-in</h2>
      <p>Only approved operator accounts can start or end races.</p>
      <label>Email <input type="email" id="login-email" autocomplete="username" required></label>
      <label>Password <input type="password" id="login-pw" autocomplete="current-password" required></label>
      <div class="err" id="login-err"></div>
      <button type="submit" class="btn btn-primary" id="login-btn">Sign In</button>
    </form>

    <section class="cp-races">
      ${RACES.map(r => `
      <article class="cp-race theme-${r.theme}" id="cp-${r.id}" data-status="waiting">
        <div class="cp-race-head">
          <span class="ic" aria-hidden="true">${r.icon}</span>
          <h2>${r.name}</h2>
          <span class="cp-status" id="cp-status-${r.id}">To Be Started</span>
        </div>
        <div class="cp-timer" id="cp-timer-${r.id}">00:00:00.0</div>
        <dl class="cp-times">
          <div><dt>Started</dt><dd id="cp-start-${r.id}">—</dd></div>
          <div><dt>Ended</dt><dd id="cp-end-${r.id}">—</dd></div>
        </dl>
        <label class="cp-flag">
          <span>Scheduled flag-off<small>Board shows it with a countdown. Optional.</small></span>
          <input type="time" id="cp-flag-${r.id}" data-id="${r.id}">
        </label>
        <div class="cp-buttons" id="cp-buttons-${r.id}"></div>
      </article>`).join('')}
    </section>

    <section class="cp-help">
      <div>
        <h3>At the gun</h3>
        Press <b>Start Race</b>. It's instant, with no confirmation, so the clock matches the gun.
        The LED board flips from “To Be Started” to the live clock and flashes “Has Started”.
        Pressed late? Tap <b>+1s</b> for each second you missed.
      </div>
      <div>
        <h3>Mistakes</h3>
        <b>End Race</b> by mistake → <b>Resume Race</b> continues from the original start.<br>
        Started the wrong race → <b>Reset</b> puts it back to “To Be Started”.<br>
        Practice run? Add <code>?event=rehearsal</code> to both page URLs.
      </div>
    </section>
    <div class="cp-foot" id="cp-foot"></div>
  </div>`;

  $('#cp-sub').textContent = `${CONFIG.eventTitle} ${CONFIG.eventYear} · event “${eventId}”`;
  $('#open-board').href = withQuery('index.html');

  const timerEls = Object.fromEntries(RACES.map(r => [r.id, { el: $(`#cp-timer-${r.id}`), last: '' }]));

  /* ---------------- state ---------------- */
  let store = null, races = null, status = { canControl: false };
  const now = () => (store ? store.now() : Date.now());

  function setTimer(id, ms) {
    const t = timerEls[id], s = fmt.elapsed(ms);
    if (t.last !== s) { t.last = s; t.el.textContent = s; }
  }

  function buttonsHTML(id, s, can) {
    const dis = can ? '' : ' disabled';
    if (s === 'waiting') return `<button type="button" class="btn btn-start btn-big" data-act="start" data-id="${id}"${dis}>▶ Start Race</button>`;
    if (s === 'running') return `
      <button type="button" class="btn btn-end btn-big" data-act="end" data-id="${id}"${dis}>■ End Race</button>
      <button type="button" class="btn btn-ghost btn-sm" data-act="nudge" data-ms="-1000" data-id="${id}"${dis} title="Remove 1 second from the race clock">−1s</button>
      <button type="button" class="btn btn-ghost btn-sm" data-act="nudge" data-ms="1000"  data-id="${id}"${dis} title="Add 1 second (start was pressed late)">+1s</button>
      <button type="button" class="btn btn-ghost btn-sm" data-act="reset" data-id="${id}"${dis}>Reset</button>`;
    return `
      <button type="button" class="btn btn-gold btn-big" data-act="resume" data-id="${id}"${dis}>↺ Resume Race</button>
      <button type="button" class="btn btn-ghost btn-sm" data-act="reset" data-id="${id}"${dis}>Reset</button>`;
  }

  function renderRaces() {
    if (!races) return;
    for (const r of RACES) {
      const st = races[r.id];
      $(`#cp-${r.id}`).dataset.status = st.status;
      $(`#cp-status-${r.id}`).textContent = STATUS_TEXT[st.status];
      $(`#cp-start-${r.id}`).textContent = st.startedAt ? fmt.wall(st.startedAt) : '—';
      $(`#cp-end-${r.id}`).textContent   = st.endedAt   ? fmt.wall(st.endedAt)   : '—';
      const input = $(`#cp-flag-${r.id}`);
      input.disabled = !status.canControl;
      if (document.activeElement !== input && input.value !== st.flagOff) input.value = st.flagOff;
      const box = $(`#cp-buttons-${r.id}`), key = `${st.status}|${status.canControl}`;
      if (box.dataset.key !== key) { box.innerHTML = buttonsHTML(r.id, st.status, status.canControl); box.dataset.key = key; }
      if (st.status === 'finished') setTimer(r.id, st.endedAt - st.startedAt);
      if (st.status === 'waiting')  setTimer(r.id, 0);
    }
    tick();
  }

  function setBanner(tone, html) {
    const b = $('#banner');
    b.dataset.tone = tone;
    $('#banner-text').innerHTML = html;
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function renderStatus(st) {
    status = st;
    app.classList.toggle('locked', !st.canControl);
    $('[data-act="reset-all"]').disabled = !st.canControl;
    $('[data-act="sign-out"]').hidden = !(st.mode === 'cloud' && st.user);
    $('#login').hidden = !(st.mode === 'cloud' && st.authReady && !st.user);

    if (st.mode === 'local') {
      setBanner('warn', `<b>Local mode.</b> This page only controls a board open in this same browser on this computer. To control the board from a phone, add your Firebase settings to <code>config.js</code> (see README).`);
    } else if (st.error) {
      setBanner('error', `<b>Sync error:</b> ${esc(st.error)}`);
    } else if (!st.authReady) {
      setBanner('info', 'Connecting to sync service…');
    } else if (!st.user) {
      setBanner('info', '<b>Sign in</b> to control the LED board.');
    } else if (!st.isOperator) {
      setBanner('error', `<b>${esc(st.user.email)}</b> is signed in but not approved as an operator. In Firebase → Realtime Database, add <code>operators/${esc(st.user.uid)}: true</code>`);
    } else if (!st.connected) {
      setBanner('warn', `<b>Offline.</b> The board will not update until this phone reconnects. Presses are time-stamped when you tap them.`);
    } else {
      setBanner('ok', `<b>Connected.</b> Signed in as ${esc(st.user.email)}. Changes reach the LED board instantly.`);
    }
    $('#cp-foot').textContent = st.mode === 'cloud' ? `Cloud sync · event “${eventId}”` : 'Local sync (same computer only)';
    renderRaces();
  }

  function tick() {
    if (!races) return;
    const t = now();
    for (const r of RACES) if (races[r.id].status === 'running') setTimer(r.id, t - races[r.id].startedAt);
  }

  /* ---------------- confirmations ---------------- */
  function confirmFor(act, id) {
    const r = RACE[id], st = races[id];
    if (act === 'end') return ui.confirm({
      title: `End ${r.name}?`,
      message: `The board clock freezes at the moment you confirm (now ${fmt.elapsed(now() - st.startedAt)}) and shows "Completed".\n\nEnded by mistake? Resume continues from the original start.`,
      confirmLabel: `End ${r.name}`, tone: 'danger' });
    if (act === 'resume') return ui.confirm({
      title: `Resume ${r.name}?`,
      message: `The board goes back to Live. The clock continues from the original start (${fmt.wall(st.startedAt)}), so the time since it was ended is included.`,
      confirmLabel: `Resume ${r.name}`, tone: 'primary' });
    if (act === 'reset') {
      const final = st.status === 'finished' ? ` and the final time ${fmt.elapsed(st.endedAt - st.startedAt)}` : '';
      return ui.confirm({
        title: `Reset ${r.name}?`,
        message: `The board goes back to "To Be Started". The start time ${fmt.wall(st.startedAt)}${final} will be cleared. This cannot be undone.`,
        confirmLabel: `Reset ${r.name}`, tone: 'danger' });
    }
    if (act === 'reset-all') {
      const active = RACES.filter(x => races[x.id].status !== 'waiting').map(x => x.name);
      if (!active.length) { ui.toast('All races are already “To Be Started”.', 'warn'); return Promise.resolve(false); }
      return ui.confirm({
        title: 'Reset all races?',
        message: `${active.join(', ')} will go back to "To Be Started" and their times will be cleared. Flag-off times are kept. This cannot be undone.`,
        confirmLabel: 'Reset All Races', tone: 'danger' });
    }
    return Promise.resolve(true);
  }

  const DONE_TEXT = { start: 'started', end: 'ended', resume: 'resumed', reset: 'reset' };
  async function run(act, id, arg) {
    if (!store || !status.canControl) return;
    try {
      const changed = await store.run(act, id, arg);
      if (!changed && act !== 'setFlagOff') ui.toast('No change: the race was already updated (maybe from another device).', 'warn');
      else if (DONE_TEXT[act]) ui.toast(`${id === '*' ? 'All races' : RACE[id].name} ${DONE_TEXT[act]} ✓`, 'ok');
    } catch (e) {
      const msg = /permission/i.test(String(e && (e.code || e.message))) ? 'Permission denied: this account is not an approved operator.' : `Could not update: ${e && e.message || e}`;
      ui.toast(msg, 'error');
    }
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', async e => {
    const b = e.target.closest('button[data-act]');
    if (!b || b.disabled) return;
    const { act, id } = b.dataset;
    if (act === 'sign-out') { store && store.auth && store.auth.signOut(); return; }
    if (act === 'start') { run('start', id); return; }                 // instant: gun time matters
    if (act === 'nudge') { run('nudge', id, Number(b.dataset.ms)); return; }
    if (act === 'reset-all') { if (await confirmFor('reset-all')) run('reset', '*'); return; }
    if (await confirmFor(act, id)) run(act, id);
  });

  app.addEventListener('change', e => {
    const input = e.target.closest('input[type="time"][data-id]');
    if (input) run('setFlagOff', input.dataset.id, input.value);
  });

  $('#login').addEventListener('submit', async e => {
    e.preventDefault();
    if (!store || !store.auth) return;
    const btn = $('#login-btn'), err = $('#login-err');
    btn.disabled = true; err.textContent = '';
    try { await store.auth.signIn($('#login-email').value.trim(), $('#login-pw').value); $('#login-pw').value = ''; }
    catch (ex) { err.textContent = /invalid|wrong|not-found|credential/i.test(ex.code || '') ? 'Email or password is incorrect.' : (ex.message || 'Sign-in failed.'); }
    finally { btn.disabled = false; }
  });

  /* ---------------- boot ---------------- */
  setInterval(tick, 50);
  keepAwake();
  if (useCloud) setBanner('info', 'Connecting to sync service…');

  window.RaceCore.createStore({ withAuth: true })
    .then(s => { store = s; s.subscribe(r => { races = r; renderRaces(); }); s.onStatus(renderStatus); })
    .catch(err => {
      console.error(err);
      setBanner('error', `<b>Cannot reach the sync service.</b> Check this device's internet connection, then reload. (${esc(err.message || err)})`);
    });
})();
