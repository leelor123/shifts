/* ============================================================
 * app.js — application core: model, navigation, actions, timer,
 * notifications, theming, lock and boot.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Engine, Insights, Store, UI } = root;
  const S = Store.S;
  const { icon, esc } = UI;

  const App = {
    tab: 'home',
    model: null,
    views: {}, // tab renderers: home, calendar, reports, settings
    actions: {}, // data-act handlers
    sheetsApi: {}, // functions that open sheets (shift editor etc.)
    insights: null,
  };
  root.App = App;

  /* ---------------- lookups ---------------- */
  App.role = (id) => S.roles.find((r) => r.id === id);
  App.roles = (empId) => S.roles.filter((r) => !r.archived && (!empId || r.employerId === empId));
  App.roleName = (id) => (App.role(id) || {}).name || 'תפקיד';
  App.employer = (id) => S.employers.find((e) => e.id === id) || S.employers[0];
  App.multiEmp = () => S.employers.length > 1;
  App.result = (id) => App.model && App.model.results.get(id);
  App.shift = (id) => S.shifts.find((s) => s.id === id);

  /* ---------------- model ---------------- */
  App.recompute = function () {
    // Shabbat/holiday windows are cached under a key made of every rest setting (city, holidays,
    // day rules…), so they stay valid across recalculations: only the shifts are recomputed
    App.model = Engine.buildModel({
      settings: S.settings, employers: S.employers, roles: S.roles, dayRules: S.dayRules,
      shifts: S.shifts, entries: S.entries,
    });
  };

  /* ---------------- theme ---------------- */
  const ACCENTS = {
    candy: [258, 72, 'סגול-ורוד'], petrol: [186, 48, 'פטרול'], indigo: [238, 62, 'סגול-כחול'], blue: [212, 75, 'כחול'], teal: [178, 62, 'טורקיז'], green: [145, 45, 'ירוק'],
    orange: [24, 80, 'כתום'], pink: [330, 62, 'ורוד'], purple: [275, 52, 'סגול'], red: [2, 68, 'אדום'],
  };
  App.ACCENTS = ACCENTS;
  // Hebrew-capable families from Google Fonts (SIL Open Font License)
  const FONTS = {
    rubik: ['Rubik', 'Rubik:wght@300..800', 'מודרני ורך'],
    miriam: ['Miriam Libre', 'Miriam+Libre:wght@400..700', 'נקי וחד'],
    noto: ['Noto Sans Hebrew', 'Noto+Sans+Hebrew:wght@300..800', 'ניטרלי ומאוזן'],
    assistant: ['Assistant', 'Assistant:wght@300..800', 'קליל וצר'],
    heebo: ['Heebo', 'Heebo:wght@300..800', 'הקלאסי של הגרסה הראשונה'],
    varela: ['Varela Round', 'Varela+Round', 'עגול וידידותי'],
  };
  App.FONTS = FONTS;
  App.fontCss = (key) => 'https://fonts.googleapis.com/css2?family=' + (FONTS[key] || FONTS.rubik)[1] + '&display=swap';
  App.applyTheme = function () {
    const st = S.settings;
    const de = document.documentElement;
    if (st.theme === 'light' || st.theme === 'dark') de.dataset.theme = st.theme; else delete de.dataset.theme;
    const a = ACCENTS[st.accent] || ACCENTS.candy;
    de.style.setProperty('--h', a[0]);
    de.style.setProperty('--s', a[1] + '%');
    de.style.setProperty('--fs', st.fontScale || 1);
    const font = FONTS[st.font] ? st.font : 'rubik';
    de.style.setProperty('--app-font', "'" + FONTS[font][0] + "'");
    const link = document.getElementById('font-link');
    if (link && link.dataset.font !== font) { link.href = App.fontCss(font); link.dataset.font = font; }
    const dark = st.theme === 'dark' || (st.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = document.getElementById('intro') ? '#0d2b6b' : dark ? '#0f1413' : '#f6f4ee';
    if (root.Fx) root.Fx.apply();
  };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => App.applyTheme());

  /* ---------------- navigation ---------------- */
  const TABS = [
    { id: 'home', label: 'בית', icon: 'home' },
    { id: 'calendar', label: 'לוח שנה', icon: 'calendar' },
    { id: 'add', label: 'הוספה', icon: 'plus' },
    { id: 'reports', label: 'דוחות', icon: 'chart' },
    { id: 'settings', label: 'הגדרות', icon: 'settings' },
  ];
  App.renderNav = function () {
    const nav = document.getElementById('nav');
    const unread = S.notifications.filter((n) => !n.read && n.cat !== 'summary').length;
    try { if (navigator.setAppBadge) { if (unread) navigator.setAppBadge(unread).catch(() => {}); else navigator.clearAppBadge().catch(() => {}); } } catch (e) { /* not supported */ }
    if (nav.firstChild && nav.dataset.built === '1') {
      nav.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === App.tab));
      const pill = nav.querySelector('[data-tab="home"] .pill');
      const badge = pill && pill.querySelector('.dot-badge');
      const text = unread && App.tab !== 'home' ? (unread > 9 ? '9+' : String(unread)) : '';
      if (!text && badge) badge.remove();
      else if (text && badge) badge.textContent = text;
      else if (text && pill) pill.insertAdjacentHTML('beforeend', `<span class="dot-badge">${text}</span>`);
      return;
    }
    nav.dataset.built = '1';
    nav.innerHTML = `<div class="nav-inner">${TABS.map((t) => t.id === 'add'
      ? `<div><button class="fab" data-act="add-menu" aria-label="הוספה">${icon('plus')}</button></div>`
      : `<button class="${App.tab === t.id ? 'on' : ''}" data-act="tab" data-tab="${t.id}" aria-label="${t.label}"><span class="pill">${icon(t.icon)}${t.id === 'home' && unread && App.tab !== 'home' ? `<span class="dot-badge">${unread > 9 ? '9+' : unread}</span>` : ''}</span>${t.label}</button>`).join('')}</div>`;
  };
  const TAB_ORDER = ['home', 'calendar', 'reports', 'settings'];
  App.go = function (tab, opts) {
    App.enterDir = TAB_ORDER.indexOf(tab) >= TAB_ORDER.indexOf(App.tab) ? 'enter-next' : 'enter-prev';
    if (tab === App.tab) App.enterDir = '';
    App.tab = tab;
    try { history.replaceState(history.state, '', '#' + tab); } catch (e) { /* ignore */ }
    const dir = App.enterDir;
    const swap = () => { App.render(opts); window.scrollTo(0, 0); };
    if (opts && opts.fromNav && dir && document.startViewTransition && root.Fx && root.Fx.motion() && !document.querySelector('.sheet')) {
      App.enterDir = ''; // the transition animates; no extra CSS entry animation
      const de = document.documentElement;
      de.dataset.nav = dir === 'enter-next' ? 'next' : 'prev';
      const t = document.startViewTransition(swap);
      t.finished.catch(() => {}).then(() => { delete de.dataset.nav; });
    } else swap();
  };
  const seenTabs = new Set();
  App.render = function (opts) {
    if (App.blocking) return; // a full-screen step (login / terms / setup wizard) owns the screen
    const v = document.getElementById('view');
    const fn = App.views[App.tab] || App.views.home;
    const y = opts && opts.keepScroll ? window.scrollY : 0;
    const fresh = !(opts && opts.keepScroll);
    const first = fresh && !seenTabs.has(App.tab);
    if (first) seenTabs.add(App.tab);
    const cls = fresh ? (App.enterDir || '') + ' fresh' + (first ? ' first' : '') : '';
    App.enterDir = '';
    v.innerHTML = `<div class="view ${cls}" id="view-inner">${fn()}</div>`;
    if (App.views[App.tab + '_mount']) App.views[App.tab + '_mount'](v);
    App.renderNav();
    if (opts && opts.keepScroll) window.scrollTo(0, y);
    App.tickTimer();
    if (root.Fx) root.Fx.countUps(v, App.tab, fresh);
  };

  /** Pull-to-refresh: sync with the cloud, look for a new version, recalculate. */
  App.refresh = async function () {
    const jobs = [];
    if (root.Cloud && root.Cloud.user) jobs.push(root.Cloud.syncNow().catch(() => {}));
    if ('serviceWorker' in navigator) jobs.push(navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {}));
    await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 5000))]);
    App.recompute();
    await App.runInsights();
    App.rerender();
  };

  /** A celebration that happens once per key on this phone (goal reached, payday, birthday). */
  App.celebrateOnce = function (key, fn) {
    const done = Object.assign({}, S.meta.celebrated);
    if (done[key]) return;
    done[key] = Date.now();
    const keys = Object.keys(done);
    if (keys.length > 40) delete done[keys[0]];
    Store.setMeta({ celebrated: done });
    const run = () => (document.getElementById('intro') || App.blocking ? setTimeout(run, 300) : fn());
    setTimeout(run, 700);
  };
  App.rerender = () => App.render({ keepScroll: true });

  /* ---------------- milestones ----------------
   * 10, 25, 50… shifts and 1,000, 5,000… shekels earned get a small medal at the top of the
   * screen (it never covers the save message and its undo button at the bottom). The first
   * time this runs it only notes where the user already is, so nobody gets a burst of old
   * medals after an update; deleting shifts never brings a medal back. */
  const MS_SHIFTS = [10, 25, 50, 100, 200, 300, 500, 1000];
  const MS_EARNED = [1000, 5000, 10000, 25000, 50000, 100000, 250000];
  App.milestones = function () {
    if (S.settings.demo || !App.model) return;
    const done = [...App.model.results.values()].filter((r) => r.status === 'done');
    const top = (list, v) => list.filter((x) => v >= x).pop() || 0;
    const cur = { shifts: top(MS_SHIFTS, done.length), earned: top(MS_EARNED, done.reduce((s, r) => s + (r.total || 0), 0)) };
    const was = S.meta.ms;
    if (!was) { Store.setMeta({ ms: cur }).catch(() => {}); return; }
    let pop = null;
    if (cur.shifts > (was.shifts || 0)) pop = [`${cur.shifts} משמרות!`, 'כל הכבוד על ההתמדה'];
    else if (cur.earned > (was.earned || 0)) pop = [`עברת ${U.money(cur.earned, 0)}`, 'שהרווחת מאז שהתחלת לרשום'];
    if (cur.shifts > (was.shifts || 0) || cur.earned > (was.earned || 0)) Store.setMeta({ ms: { shifts: Math.max(cur.shifts, was.shifts || 0), earned: Math.max(cur.earned, was.earned || 0) } }).catch(() => {});
    if (pop) setTimeout(() => App.medal(pop[0], pop[1]), 900);
  };
  /** A medal that drops in at the top for a few seconds (never blocks taps). */
  App.medal = function (title, sub) {
    const el = document.createElement('div');
    el.className = 'medal-pop';
    el.setAttribute('role', 'status');
    el.innerHTML = `${App.mascot ? App.mascot('party', { size: 46 }) : ''}<div><b>${UI.esc(title)}</b><small>${UI.esc(sub)}</small></div><span class="medal-ic" aria-hidden="true">🏅</span>`;
    document.body.appendChild(el);
    if (root.Fx) root.Fx.celebrate('big');
    setTimeout(() => el.classList.add('out'), 3600);
    setTimeout(() => el.remove(), 4100);
  };

  /* ---------------- data change pipeline ---------------- */
  let insightTimer = null;
  Store.on((ev) => {
    if (ev.type === 'storage-lost') {
      UI.toast('השמירה בטלפון לא עובדת כרגע. ' + (root.Cloud && root.Cloud.user ? 'הנתונים נשמרים בחשבון שלך ☁️' : 'כדאי להתחבר לחשבון כדי לא לאבד נתונים.'));
      App.rerender();
      return;
    }
    if (ev.type === 'active') { App.rerender(); return; }
    App.recompute();
    if (ev.type === 'settings') App.applyTheme();
    App.rerender();
    clearTimeout(insightTimer);
    insightTimer = setTimeout(() => App.runInsights(), 800);
  });
  /** Save with an Undo snackbar. */
  App.saveOps = async function (ops, label, toastText) {
    await Store.apply(ops, label);
    const doneShift = ops.some((o) => o.store === 'shifts' && o.put && o.put.status !== 'planned');
    if (doneShift) root.Fx.celebrate('coin');
    UI.toast(toastText || label, { label: 'ביטול', fn: App.undo }, { ok: true });
    if (doneShift) App.milestones();
  };
  App.undo = async function () {
    const l = await Store.undo();
    UI.toast(l ? 'בוטל: ' + l : 'אין מה לבטל');
  };

  /* ---------------- event delegation ---------------- */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = App.actions[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  App.actions.tab = (el) => App.go(el.dataset.tab, { fromNav: true });
  App.actions.undo = () => App.undo();

  /* ---------------- live timer ---------------- */
  App.tickTimer = function () {
    const a = S.activeShift;
    document.querySelectorAll('[data-clock]').forEach((el) => {
      if (!a) return;
      const now = Date.now();
      const brk = (a.breaks || []).reduce((s, b) => s + ((b.to || now) - b.from), 0);
      const ms = now - a.start - (el.dataset.clock === 'net' ? brk : 0);
      const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
      el.textContent = `${h}:${U.pad(m)}:${U.pad(s)}`;
    });
    document.querySelectorAll('[data-live-pay]').forEach((el) => {
      if (!a) return;
      const r = App.previewActive();
      el.textContent = r ? U.money(r.wage) : '';
      if (r && root.Fx && document.visibilityState === 'visible') {
        const step = Math.floor(r.wage / 10);
        if (coinStep != null && step > coinStep) {
          root.Fx.coinPop(el);
          if (Math.floor(step / 10) > Math.floor(coinStep / 10)) { root.Fx.play('coin'); const r2 = el.getBoundingClientRect(); root.Fx.coins(r2.left + r2.width / 2, r2.top, 10); }
        }
        coinStep = step;
      }
    });
    if (!a) coinStep = null;
  };
  let coinStep = null;
  setInterval(App.tickTimer, 1000);

  /** Shift object for the running timer (for previews and saving). */
  App.activeAsShift = function (end) {
    const a = S.activeShift;
    if (!a) return null;
    const now = end || Date.now();
    const brkMs = (a.breaks || []).reduce((s, b) => s + ((b.to || now) - b.from), 0);
    return {
      id: '__active', kind: 'shift', employerId: a.employerId, roleId: a.roleId, status: 'done',
      start: a.start, end: now, splits: a.splits || [], breakMin: Math.round(brkMs / 60000), breakPaid: false,
      items: [], note: a.note || '',
    };
  };
  let previewCache = { t: 0, r: null };
  App.previewActive = function () {
    if (Date.now() - previewCache.t < 15000 && previewCache.r) return previewCache.r;
    const sh = App.activeAsShift();
    if (!sh) return null;
    const r = Engine.computeShift(sh, App.model.ctx, { priorMin: priorMinutes(sh) });
    previewCache = { t: Date.now(), r };
    return r;
  };
  function priorMinutes(sh) {
    const k = U.epochKey(sh.start);
    let m = 0;
    for (const r of App.model.results.values()) if (r.status === 'done' && r.dateKey === k && r.employerId === sh.employerId && r.start < sh.start) m += r.paidMin;
    return m;
  }

  App.startShift = async function (roleId, opts) {
    const role = App.role(roleId) || App.roles()[0];
    if (!role) { UI.toast('הוסף תפקיד בהגדרות'); return; }
    // a planned shift around now becomes this shift (no leftover duplicate when it is saved)
    const now = Date.now();
    const planned = (opts && opts.fromPlanned && App.shift(opts.fromPlanned))
      || S.shifts.filter((s) => s.status === 'planned' && Math.abs(s.start - now) < 90 * 60000).sort((a, b) => Math.abs(a.start - now) - Math.abs(b.start - now))[0];
    await Store.setMeta({ lastRole: role.id });
    await Store.setActive({ start: now, roleId: role.id, employerId: role.employerId || S.employers[0].id, splits: [], breaks: [], fromPlanned: planned ? planned.id : null });
    root.Fx.celebrate('start');
    UI.toast('המשמרת התחילה — בהצלחה!');
    App.askNotifyPermission();
  };
  App.stopShift = async function () {
    const a = S.activeShift;
    if (!a) return;
    if (a.breaks && a.breaks.length && !a.breaks[a.breaks.length - 1].to) a.breaks[a.breaks.length - 1].to = Date.now();
    const sh = App.activeAsShift(Date.now());
    sh.id = U.uid();
    if ((sh.end - sh.start) < 60000) {
      const ok = await UI.confirm('משמרת קצרה מאוד', 'המשמרת נמשכה פחות מדקה. לשמור בכל זאת?', 'שמור');
      if (!ok) { await Store.setActive(null); return; }
    }
    const ops = [{ store: 'shifts', put: sh }];
    const planned = a.fromPlanned && App.shift(a.fromPlanned);
    if (planned && planned.status === 'planned') ops.push({ store: 'shifts', del: planned.id });
    await Store.apply(ops, 'סיום משמרת');
    await Store.setActive(null);
    if (S.shifts.filter((x) => x.status === 'done').length === 1) App.celebrateOnce('first-shift', () => UI.toast('המשמרת הראשונה שלך נשמרה! 🎉'));
    root.Fx.celebrate('big');
    App.milestones();
    const r = App.result(sh.id);
    UI.toast(`נשמר: ${U.hm(r ? r.paidMin : 0)} שעות · ${U.money(r ? r.wage : 0)}`, { label: 'ביטול', fn: App.undo }, { ok: true });
    App.sheetsApi.shiftDetail && App.sheetsApi.shiftDetail(sh.id);
  };
  App.toggleBreak = async function () {
    const a = Object.assign({}, S.activeShift);
    a.breaks = (a.breaks || []).slice();
    const last = a.breaks[a.breaks.length - 1];
    if (last && !last.to) { last.to = Date.now(); UI.toast('חזרת מהפסקה'); }
    else { a.breaks.push({ from: Date.now() }); UI.toast('הפסקה — הזמן לא נספר'); }
    await Store.setActive(a);
  };
  App.switchRole = async function (roleId) {
    const a = Object.assign({}, S.activeShift);
    a.splits = (a.splits || []).concat([{ at: Date.now(), roleId }]);
    await Store.setActive(a);
    UI.toast('עברת ל' + App.roleName(roleId));
  };
  App.onBreak = () => { const a = S.activeShift; const l = a && a.breaks && a.breaks[a.breaks.length - 1]; return !!(l && !l.to); };
  App.currentRole = () => { const a = S.activeShift; if (!a) return null; const sp = a.splits || []; return sp.length ? sp[sp.length - 1].roleId : a.roleId; };

  /* ---------------- notifications ---------------- */
  App.askNotifyPermission = async function () {
    if (!('Notification' in window) || Notification.permission !== 'default' || !S.settings.alerts.push) return;
    try { await Notification.requestPermission(); } catch (e) { /* ignore */ }
  };
  async function push(n) {
    if (!S.settings.alerts.push || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const opt = { body: n.body, tag: n.key, icon: 'icon-192.png', badge: 'badge-96.png', lang: 'he', dir: 'rtl', data: { url: './#home' } };
      if (reg) await reg.showNotification(n.title, opt); else new Notification(n.title, opt);
    } catch (e) { console.warn(e); }
  }
  App.runInsights = async function () {
    if (!App.model || !S.settings.onboarded) return;
    const res = Insights.run(App.model, {
      now: Date.now(), activeShift: S.activeShift, payslips: S.payslips, gaps: S.gaps,
      // with cloud sync the data is already safe; the backup reminder only applies to local-only use
      lastBackup: S.meta.cloudUid ? Date.now() : S.settings.backup.lastBackup, roleName: App.roleName,
    });
    App.insights = res;
    const known = new Set(S.notifications.map((n) => n.key));
    const fresh = res.alerts.filter((a) => !known.has(a.key));
    const record = fresh.find((a) => a.type === 'record');
    if (record) App.celebrateOnce('record-' + record.key, () => { root.Fx.celebrate('money'); UI.toast(record.title || 'שיא אישי חדש!'); });
    if (fresh.length) {
      const ops = fresh.map((a) => ({ store: 'notifications', put: Object.assign({ id: a.key, createdAt: Date.now(), read: false }, a) }));
      // keep history bounded
      const all = S.notifications.slice().sort((x, y) => y.createdAt - x.createdAt);
      all.slice(400).forEach((n) => ops.push({ store: 'notifications', del: n.id }));
      await Store.apply(ops, null);
      // push: critical separately; at most one anomaly per day
      for (const a of fresh.filter((x) => x.push === 'critical')) await push(a);
      const today = U.todayKey();
      if (S.meta.lastAnomalyPush !== today) {
        const order = { warn: 0, good: 1, info: 2 };
        const anomaly = fresh.filter((x) => x.push === 'anomaly').sort((a, b) => (order[a.severity] || 3) - (order[b.severity] || 3))[0];
        if (anomaly) { await push(anomaly); await Store.setMeta({ lastAnomalyPush: today }); }
      }
    }
    if (App.tab === 'home') App.rerender();
  };
  setInterval(() => App.runInsights(), 5 * 60 * 1000);

  /* ---------------- PIN lock ---------------- */
  async function sha(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  App.hashPin = async (pin, salt) => sha(salt + ':' + pin);
  /* Fingerprint / face unlock through the phone's own screen lock (WebAuthn, platform authenticator).
   * There is no server: the phone only answers after the fingerprint matched, which is all this local
   * privacy lock needs. The credential id stays on this phone (lock settings never sync). */
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/[+]/g, '-').replace(/[/]/g, '_').replace(/=+$/, '');
  const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  App.bio = {
    async available() {
      try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch (e) { return false; }
    },
    async enroll() {
      const cred = await navigator.credentials.create({ publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Shaati' },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'Shaati', displayName: 'נעילת Shaati' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60000, attestation: 'none',
      } });
      return b64(cred.rawId);
    },
    async verify(id) {
      const a = await navigator.credentials.get({ publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: unb64(id), transports: ['internal'] }],
        userVerification: 'required', timeout: 60000,
      } });
      return !!a;
    },
  };
  // after 5 wrong codes each further mistake makes you wait longer (30 s, 1 min, 2 min…)
  let pinFails = 0, pinWaitUntil = 0;
  App.lock = function () {
    const L = S.settings.lock;
    if (!L.enabled || document.getElementById('lock')) return;
    const el = document.createElement('div');
    el.className = 'lock'; el.id = 'lock';
    let pin = '';
    const unlock = () => { el.remove(); S.meta._unlockedAt = Date.now(); pinFails = 0; };
    const tryBio = async () => { try { if (await App.bio.verify(L.bioId)) unlock(); } catch (e) { /* cancelled: the code still works */ } };
    const draw = () => {
      const wait = Math.ceil((pinWaitUntil - Date.now()) / 1000);
      el.innerHTML = `<div class="empty" style="padding:0"><div class="art">${icon('lock')}</div><h3>האפליקציה נעולה</h3><div>${wait > 0 ? `יותר מדי ניסיונות. נסה שוב בעוד ${wait} שניות` : 'הזן קוד'}</div></div>
        <div class="pin-dots">${[0, 1, 2, 3, 4, 5, 6, 7].slice(0, Math.max(4, (L.len || 4))).map((i) => `<i class="${i < pin.length ? 'f' : ''}"></i>`).join('')}</div>
        <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, L.bioId ? 'bio' : '', 0, '⌫'].map((k) => k === '' ? '<span></span>' : k === 'bio' ? `<button data-bio aria-label="פתח בטביעת אצבע">${icon('finger')}</button>` : `<button data-k="${k}" ${wait > 0 ? 'disabled' : ''}>${k}</button>`).join('')}</div>`;
      if (wait > 0) setTimeout(() => { if (el.isConnected) draw(); }, 1000);
      const bio = el.querySelector('[data-bio]');
      if (bio) bio.onclick = tryBio;
      el.querySelectorAll('[data-k]').forEach((b) => (b.onclick = async () => {
        if (Date.now() < pinWaitUntil) return;
        const k = b.dataset.k;
        if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 8) pin += k;
        draw();
        if (pin.length >= (L.len || 4)) {
          if ((await App.hashPin(pin, L.salt)) === L.hash) unlock();
          else {
            pin = ''; pinFails++;
            if (pinFails >= 5) pinWaitUntil = Date.now() + 30000 * Math.pow(2, Math.min(pinFails - 5, 5));
            draw(); el.querySelector('.pin-dots').classList.add('shake'); UI.vibrate(80);
          }
        }
      }));
    };
    draw();
    document.body.appendChild(el);
    if (L.bioId) setTimeout(tryBio, 300);
  };
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else {
      const L = S.settings && S.settings.lock;
      if (L && L.enabled && Date.now() - hiddenAt > (+L.timeoutMin || 1) * 60000) App.lock();
      if (App.model) { App.tickTimer(); App.runInsights(); }
    }
  });

  /* ---------------- auto backup ---------------- */
  App.autoBackupCheck = async function () {
    const B = S.settings.backup;
    if (!B.autoEvery || B.autoEvery === 'off' || !S.shifts.length) return;
    const days = B.autoEvery === 'monthly' ? 30 : 7;
    const last = Math.max(B.lastBackup || 0, B.lastAuto || 0);
    if (Date.now() - last < days * U.DAY) return;
    await App.doBackup(false, true);
  };
  App.doBackup = async function (includeFiles, auto) {
    const data = await Store.exportBackup(includeFiles);
    const name = `shiftpay-backup-${U.todayKey()}.json`;
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    UI.download(name, blob);
    await Store.setSettings((s) => { s.backup.lastBackup = Date.now(); if (auto) s.backup.lastAuto = Date.now(); });
    UI.toast(auto ? 'גיבוי אוטומטי נשמר בהורדות' : 'קובץ הגיבוי נשמר', { label: 'שתף ל-Drive', fn: () => UI.shareFile(name, blob, 'גיבוי משמרות') });
  };

  /* ---------------- boot ---------------- */
  App.boot = async function () {
    try {
      await Store.load();
    } catch (e) {
      document.getElementById('view').innerHTML = `<div class="view">${UI.emptyState('alert', 'לא ניתן לפתוח את מסד הנתונים', esc(e.message || e))}</div>`;
      return;
    }
    // the minimum wage now follows the law (by date and age): stored copies of old defaults are dropped
    if (!S.meta.minWageAuto) {
      if ([32.3, 34.32, 34.33].includes(+S.settings.minWageHourly)) await Store.setSettings((s) => { s.minWageHourly = null; });
      await Store.setMeta({ minWageAuto: true });
    }
    // one-time switch of the untouched default colour to the new design (user choices are kept)
    if (!S.meta.designV2) {
      if (S.settings.accent === 'indigo') await Store.setSettings((s) => { s.accent = 'petrol'; });
      await Store.setMeta({ designV2: true });
    }
    // the brighter design (v3): the untouched default colour moves to the new default, once
    if (!S.meta.designV3) {
      if (S.settings.accent === 'petrol') await Store.setSettings((s) => { s.accent = 'candy'; });
      await Store.setMeta({ designV3: true });
    }
    App.applyTheme();
    App.recompute();
    registerSW(); // offline support from the very first visit, before onboarding
    if (S.settings.lock.enabled) App.lock();
    const params = new URLSearchParams(location.search);
    // opened from the Android app (Trusted Web Activity): remembered for this session
    try { if (params.get('source') === 'twa' || document.referrer.startsWith('android-app://')) sessionStorage.setItem('androidApp', '1'); } catch (e) { /* ignore */ }
    try { App.androidApp = sessionStorage.getItem('androidApp') === '1'; } catch (e) { App.androidApp = false; }
    App.pendingAction = params.get('action');
    if (App.pendingAction) history.replaceState(null, '', location.pathname + location.hash);

    // Google sign-in is required. Nothing on screen waits for Google to load: a returning user goes
    // straight in (the account reconnects in the background), a new user starts the setup questions
    // right away while Google loads behind them (it's needed only at the last step).
    const Cloud = root.Cloud;
    if (!root.FIREBASE_CONFIG) { App.localOnly = true; App.afterLogin(); return; } // a copy without sign-in (tests)
    Cloud.onAuthChange = (u) => { if (!u && S.meta.cloudUid) App.showLogin('expired'); };
    if (S.meta.cloudUid) {
      let user = null, failed = false;
      try {
        user = await Promise.race([Cloud.start(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);
      } catch (e) { failed = true; }
      if (user) {
        if (S.meta.cloudUid === user.uid) {
          App.afterLogin();
          Cloud.connect(user).catch((e) => console.warn('sync', e));
          return;
        }
        try { await Cloud.connect(user); } catch (e) { console.error(e); App.showLogin(navigator.onLine ? 'error' : 'offline'); return; }
        App.afterLogin();
        return;
      }
      if (failed) {
        // slow or no network: the app opens with what's on the phone and connects when it can
        App.afterLogin();
        Cloud.start().then((u) => { if (u) Cloud.connect(u).catch(() => {}); else App.showLogin('expired'); }).catch(() => {});
        return;
      }
      App.showLogin('expired');
      return;
    }
    // nobody has signed in on this phone yet
    const starting = Cloud.start().catch((e) => { console.warn('sign-in not available yet', e); return null; });
    if (!S.settings.onboarded) App.sheetsApi.onboarding({ preLogin: true });
    else App.showLogin();
    // back from a full-page Google sign-in, or a sign-in that was already in the browser: finish it
    starting.then(async (user) => {
      if (!user || S.meta.cloudUid || App.blocking === 'onboarding') return; // the questions connect at their last step
      try { await Cloud.connect(user); } catch (e) { console.error(e); App.showLogin(navigator.onLine ? 'error' : 'offline'); return; }
      App.blocking = null;
      App.afterLogin();
    });
  };
  /** Continue into the app once the user is signed in. */
  App.afterLogin = function () {
    if (App.ensureLegal && !App.legalAccepted()) { App.ensureLegal(App.afterLogin); return; }
    if (root.Stats) { root.Stats.markActive().then(() => root.Stats.report()); }
    document.getElementById('nav').style.display = '';
    if (!S.settings.onboarded) { App.sheetsApi.onboarding(); return; }
    const hash = (location.hash || '').replace('#', '');
    if (['home', 'calendar', 'reports', 'settings'].includes(hash)) App.tab = hash;
    App.render();
    const action = App.pendingAction;
    App.pendingAction = null;
    if (action === 'start' && !S.activeShift) App.actions['timer-start']();
    if (action === 'add') App.sheetsApi.shiftEditor();
    setTimeout(() => { App.runInsights(); App.autoBackupCheck(); }, 1200);
    if (App.whatsNew) App.whatsNew();
  };

  function registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // A new version downloads quietly in the background and switches in when it can't disturb:
      // right after the app opens, or when the app goes to the background with nothing half-filled.
      const quietUpdate = (w) => {
        const busy = () => !!App.blocking || !!document.querySelector('.sheet, .dialog');
        const apply = () => w.postMessage('skipWaiting');
        if (performance.now() < 5000 && !busy()) { apply(); return; }
        const onHide = () => {
          if (document.visibilityState !== 'hidden' || busy()) return;
          document.removeEventListener('visibilitychange', onHide);
          apply();
        };
        document.addEventListener('visibilitychange', onHide);
      };
      if (reg.waiting && navigator.serviceWorker.controller) quietUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) quietUpdate(nw);
        });
      });
      // an app that stays open for days still looks for a new version (a tiny file) once an hour
      let lastCheck = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - lastCheck > 60 * 60 * 1000) { lastCheck = Date.now(); reg.update().catch(() => {}); }
      });
      if ('periodicSync' in reg) {
        navigator.permissions.query({ name: 'periodic-background-sync' }).then((p) => {
          if (p.state === 'granted') reg.periodicSync.register('shiftpay-check', { minInterval: 60 * 60 * 1000 }).catch(() => {});
        }).catch(() => {});
      }
    }).catch((e) => console.warn('SW', e));
    // reload only when an update replaced a previous version (not on the very first install)
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloading) { reloading = true; location.reload(); } });
  }

  // a storage hiccup inside a background save is already handled by the store; never let it surface as a crash
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    if (r && ['UnknownError', 'InvalidStateError', 'QuotaExceededError', 'AbortError', 'TransactionInactiveError'].includes(r.name)) { e.preventDefault(); console.warn('storage', r); }
  });
  document.addEventListener('DOMContentLoaded', () => App.boot());
})(typeof window !== 'undefined' ? window : globalThis);
