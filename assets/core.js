/* ==================================================================
   RACE CLOCK CORE — shared by index.html (board) and control.html
   - race state model + transitions (single source of truth)
   - sync store: "cloud" (Firebase RTDB, cross-device) or "local"
     (localStorage + BroadcastChannel, same computer only)
   - formatting + small UI helpers (in-app confirm, toast)
   ================================================================== */
(function () {
  'use strict';

  const C = Object.assign({
    eventTitle: 'Race', eventYear: '', footerText: '', eventId: 'race-event',
    races: [], showTenths: true, announceMs: 6000,
    firebase: null, firebaseSdkVersion: '10.12.2',
  }, window.RACE_CONFIG || {});

  const params   = new URLSearchParams(location.search);
  const eventId  = String(params.get('event') || C.eventId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'race-event';
  const cloudConfigured = !!(C.firebase && C.firebase.apiKey && C.firebase.databaseURL);
  const useCloud = cloudConfigured && params.get('mode') !== 'local';

  const RACES = C.races;
  const RACE  = Object.fromEntries(RACES.map(r => [r.id, r]));
  const STATUSES = ['waiting', 'running', 'finished'];

  /* ---------------- helpers ---------------- */
  const $   = (sel, el = document) => el.querySelector(sel);
  const pad = n => String(n).padStart(2, '0');
  const withQuery = path => path + location.search;

  function splitElapsed(ms) {
    const t = Math.floor(Math.max(0, ms) / 100);
    const s = Math.floor(t / 10);
    return { hms: `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`, tenths: String(t % 10) };
  }
  const fmt = {
    split: splitElapsed,
    elapsed: ms => { const e = splitElapsed(ms); return `${e.hms}.${e.tenths}`; },
    wall: ms => new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
    flagOff(hhmm) { const [h, m] = hhmm.split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`; },
    flagOffEpoch(hhmm, nowMs) { const [h, m] = hhmm.split(':').map(Number); const d = new Date(nowMs); d.setHours(h, m, 0, 0); return d.getTime(); },
    countdown(ms) {
      const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
      return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
    },
  };

  /* ---------------- state model ---------------- */
  function normalizeRace(x) {
    const r = { status: 'waiting', startedAt: null, endedAt: null, flagOff: '' };
    if (!x || typeof x !== 'object') return r;
    if (STATUSES.includes(x.status)) r.status = x.status;
    if (Number.isFinite(x.startedAt)) r.startedAt = x.startedAt;
    if (Number.isFinite(x.endedAt))   r.endedAt   = x.endedAt;
    if (typeof x.flagOff === 'string' && /^\d{2}:\d{2}$/.test(x.flagOff)) r.flagOff = x.flagOff;
    if (r.status !== 'waiting' && r.startedAt === null) r.status = 'waiting';
    if (r.status === 'finished' && r.endedAt === null)  r.status = 'running';
    if (r.status !== 'finished') r.endedAt = null;
    if (r.status === 'waiting')  r.startedAt = null;
    return r;
  }
  const normalizeRaces = obj => Object.fromEntries(RACES.map(r => [r.id, normalizeRace(obj && obj[r.id])]));

  // Each transition returns the new race, or null if not allowed from the current state.
  const transitions = {
    start:      (r, t)    => r.status === 'waiting'  ? { ...r, status: 'running', startedAt: t, endedAt: null } : null,
    end:        (r, t)    => r.status === 'running'  ? { ...r, status: 'finished', endedAt: Math.max(t, r.startedAt) } : null,
    resume:     (r)       => r.status === 'finished' ? { ...r, status: 'running', endedAt: null } : null,
    reset:      (r)       => r.status !== 'waiting'  ? { status: 'waiting', startedAt: null, endedAt: null, flagOff: r.flagOff } : null,
    nudge:      (r, t, ms)=> r.status === 'running'  ? { ...r, startedAt: Math.min(t, r.startedAt - ms) } : null, // +ms = add time to clock
    setFlagOff: (r, t, v) => ({ ...r, flagOff: /^\d{2}:\d{2}$/.test(v) ? v : '' }),
  };
  function toDb(r) {
    const o = { status: r.status, flagOff: r.flagOff };
    if (r.startedAt !== null) o.startedAt = r.startedAt;
    if (r.endedAt   !== null) o.endedAt   = r.endedAt;
    return o;
  }
  const targetIds = id => (id === '*' ? RACES.map(r => r.id) : [id]);

  /* ---------------- local store (same computer) ---------------- */
  function createLocalStore() {
    const KEY = `race-clock:${eventId}`;
    const listeners = new Set();
    let channel = null;
    try { channel = new BroadcastChannel(KEY); } catch { /* optional */ }
    const read  = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
    const parse = raw => { try { return normalizeRaces(raw ? JSON.parse(raw).races : null); } catch { return normalizeRaces(null); } };

    let lastRaw = read();
    let races = parse(lastRaw);
    const emit = () => listeners.forEach(fn => fn(races));
    function sync() { const raw = read(); if (raw === lastRaw) return; lastRaw = raw; races = parse(raw); emit(); }

    window.addEventListener('storage', e => { if (e.key === KEY || e.key === null) sync(); });
    if (channel) channel.onmessage = sync;
    setInterval(sync, 1000);

    return {
      mode: 'local', eventId,
      now: () => Date.now(),
      get races() { return races; },
      subscribe(fn) { listeners.add(fn); fn(races); return () => listeners.delete(fn); },
      onStatus(fn) { fn({ mode: 'local', connected: true, loaded: true, canControl: true }); return () => {}; },
      run(name, id, arg) {
        sync();
        const t = Date.now(); const next = { ...races }; let changed = false;
        for (const rid of targetIds(id)) {
          const out = transitions[name](races[rid], t, arg);
          if (out) { next[rid] = normalizeRace(out); changed = true; }
        }
        if (changed) {
          races = next;
          lastRaw = JSON.stringify({ races, savedAt: t });
          try { localStorage.setItem(KEY, lastRaw); } catch { /* ignore */ }
          try { channel && channel.postMessage(1); } catch { /* ignore */ }
          emit();
        }
        return Promise.resolve(changed);
      },
      auth: null,
    };
  }

  /* ---------------- cloud store (Firebase RTDB) ---------------- */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = resolve; s.onerror = () => reject(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }
  const CACHE_KEY = `race-clock-cache:${eventId}`;
  function readCache() {
    try { const raw = localStorage.getItem(CACHE_KEY); return raw ? normalizeRaces(JSON.parse(raw)) : null; } catch { return null; }
  }

  async function createCloudStore({ withAuth }) {
    const base = `https://www.gstatic.com/firebasejs/${C.firebaseSdkVersion}`;
    await loadScript(`${base}/firebase-app-compat.js`);
    await loadScript(`${base}/firebase-database-compat.js`);
    if (withAuth) await loadScript(`${base}/firebase-auth-compat.js`);

    const fb = window.firebase;
    if (!fb.apps.length) fb.initializeApp(C.firebase);
    const db = fb.database();
    const racesRef = db.ref(`events/${eventId}/races`);

    const listeners = new Set(), statusListeners = new Set();
    let races = readCache() || normalizeRaces(null);
    let offset = 0;
    const status = { mode: 'cloud', connected: false, loaded: false, error: '', user: null, isOperator: false, canControl: false, authReady: !withAuth };
    const emit = () => listeners.forEach(fn => fn(races));
    const emitStatus = () => {
      status.canControl = !!(status.user && status.isOperator);
      statusListeners.forEach(fn => fn({ ...status }));
    };

    db.ref('.info/serverTimeOffset').on('value', s => { offset = Number(s.val()) || 0; });
    db.ref('.info/connected').on('value', s => { status.connected = !!s.val(); emitStatus(); });
    racesRef.on('value', snap => {
      races = normalizeRaces(snap.val());
      status.loaded = true; status.error = '';
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(races)); } catch { /* ignore */ }
      emit(); emitStatus();
    }, err => { status.error = err && err.message || 'Read failed'; emitStatus(); });

    let auth = null;
    if (withAuth) {
      const fa = fb.auth();
      fa.onAuthStateChanged(async u => {
        status.user = u ? { uid: u.uid, email: u.email || '' } : null;
        status.isOperator = false;
        if (u) {
          try { status.isOperator = (await db.ref(`operators/${u.uid}`).get()).val() === true; }
          catch { status.isOperator = false; }
        }
        status.authReady = true;
        emitStatus();
      });
      auth = {
        signIn: (email, pw) => fa.signInWithEmailAndPassword(email, pw),
        signOut: () => fa.signOut(),
      };
    }

    const now = () => Date.now() + offset;   // server-synced clock on every device

    return {
      mode: 'cloud', eventId, now,
      get races() { return races; },
      subscribe(fn) { listeners.add(fn); fn(races); return () => listeners.delete(fn); },
      onStatus(fn) { statusListeners.add(fn); fn({ ...status }); return () => statusListeners.delete(fn); },
      async run(name, id, arg) {
        const t = now();   // captured at the moment of the press (gun time)
        const results = await Promise.all(targetIds(id).map(rid =>
          racesRef.child(rid).transaction(cur => {
            const out = transitions[name](normalizeRace(cur), t, arg);
            return out ? toDb(normalizeRace(out)) : undefined;   // undefined = abort, no change
          })
        ));
        return results.some(r => r && r.committed);
      },
      auth,
    };
  }

  function createStore({ withAuth = false } = {}) {
    return useCloud ? createCloudStore({ withAuth }) : Promise.resolve(createLocalStore());
  }

  /* ---------------- UI helpers ---------------- */
  let modalOpen = false;
  function confirm({ title, message, confirmLabel, tone = 'primary' }) {
    return new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-backdrop';
      wrap.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
          <h3 id="m-title"></h3><p class="m-msg"></p>
          <div class="m-actions">
            <button type="button" class="btn btn-ghost" data-m="cancel">Cancel</button>
            <button type="button" class="btn btn-${tone}" data-m="ok"></button>
          </div>
        </div>`;
      $('#m-title', wrap).textContent = title;
      $('.m-msg', wrap).textContent = message;
      $('[data-m="ok"]', wrap).textContent = confirmLabel;
      const done = ok => { document.removeEventListener('keydown', onKey, true); wrap.remove(); modalOpen = false; resolve(ok); };
      const onKey = e => {
        if (e.key === 'Escape') { e.preventDefault(); done(false); }
        else if (e.key === 'Enter') { e.preventDefault(); done(true); }
        e.stopPropagation();
      };
      wrap.addEventListener('click', e => {
        const b = e.target.closest('[data-m]');
        if (b) done(b.dataset.m === 'ok'); else if (e.target === wrap) done(false);
      });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(wrap);
      modalOpen = true;
      $('[data-m="ok"]', wrap).focus();
    });
  }
  function toast(message, tone = 'ok') {
    let box = $('#toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = `toast toast-${tone}`; t.textContent = message;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, tone === 'error' ? 7000 : 3500);
  }

  let wakeLock = null;
  async function keepAwake() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch { /* unsupported → set OS power plan to never sleep */ }
  }
  document.addEventListener('visibilitychange', keepAwake);

  window.RaceCore = {
    CONFIG: C, RACES, RACE, eventId, cloudConfigured, useCloud,
    fmt, $, pad, withQuery, normalizeRace, readCache, createStore, keepAwake,
    ui: { confirm, toast, get modalOpen() { return modalOpen; } },
  };
})();
