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
    root.HebCal.clearCache();
    App.model = Engine.buildModel({
      settings: S.settings, employers: S.employers, roles: S.roles, dayRules: S.dayRules,
      shifts: S.shifts, entries: S.entries,
    });
  };

  /* ---------------- theme ---------------- */
  const ACCENTS = {
    petrol: [186, 48, 'פטרול'], indigo: [238, 62, 'סגול-כחול'], blue: [212, 75, 'כחול'], teal: [178, 62, 'טורקיז'], green: [145, 45, 'ירוק'],
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
    const a = ACCENTS[st.accent] || ACCENTS.petrol;
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
    nav.innerHTML = `<div class="nav-inner">${TABS.map((t) => t.id === 'add'
      ? `<div><button class="fab" data-act="add-menu" aria-label="הוספה">${icon('plus')}</button></div>`
      : `<button class="${App.tab === t.id ? 'on' : ''}" data-act="tab" data-tab="${t.id}" aria-label="${t.label}"><span class="pill">${icon(t.icon)}${t.id === 'home' && unread ? `<span class="dot-badge">${unread > 9 ? '9+' : unread}</span>` : ''}</span>${t.label}</button>`).join('')}</div>`;
  };
  const TAB_ORDER = ['home', 'calendar', 'reports', 'settings'];
  App.go = function (tab, opts) {
    App.enterDir = TAB_ORDER.indexOf(tab) >= TAB_ORDER.indexOf(App.tab) ? 'enter-next' : 'enter-prev';
    if (tab === App.tab) App.enterDir = '';
    App.tab = tab;
    try { history.replaceState(history.state, '', '#' + tab); } catch (e) { /* ignore */ }
    App.render(opts);
    window.scrollTo(0, 0);
  };
  App.render = function (opts) {
    if (App.blocking) return; // a full-screen step (login / terms / setup wizard) owns the screen
    const v = document.getElementById('view');
    const fn = App.views[App.tab] || App.views.home;
    const y = opts && opts.keepScroll ? window.scrollY : 0;
    const fresh = !(opts && opts.keepScroll);
    const cls = fresh ? (App.enterDir || '') + ' fresh' : '';
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

  /* ---------------- data change pipeline ---------------- */
  let insightTimer = null;
  Store.on((ev) => {
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
    if (ops.some((o) => o.store === 'shifts' && o.put && o.put.status !== 'planned')) root.Fx.celebrate('coin');
    UI.toast(toastText || label, { label: 'ביטול', fn: App.undo });
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
  App.actions.tab = (el) => App.go(el.dataset.tab);
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

  App.startShift = async function (roleId) {
    const role = App.role(roleId) || App.roles()[0];
    if (!role) { UI.toast('הוסף תפקיד בהגדרות'); return; }
    await Store.setMeta({ lastRole: role.id });
    await Store.setActive({ start: Date.now(), roleId: role.id, employerId: role.employerId || S.employers[0].id, splits: [], breaks: [] });
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
    await Store.apply([{ store: 'shifts', put: sh }], 'סיום משמרת');
    await Store.setActive(null);
    if (S.shifts.filter((x) => x.status === 'done').length === 1) App.celebrateOnce('first-shift', () => UI.toast('המשמרת הראשונה שלך נשמרה! 🎉'));
    root.Fx.celebrate('big');
    const r = App.result(sh.id);
    UI.toast(`נשמר: ${U.hm(r ? r.paidMin : 0)} שעות · ${U.money(r ? r.wage : 0)}`, { label: 'ביטול', fn: App.undo });
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
  App.lock = function () {
    const L = S.settings.lock;
    if (!L.enabled || document.getElementById('lock')) return;
    const el = document.createElement('div');
    el.className = 'lock'; el.id = 'lock';
    let pin = '';
    const draw = () => {
      el.innerHTML = `<div class="empty" style="padding:0"><div class="art">${icon('lock')}</div><h3>האפליקציה נעולה</h3><div>הזן קוד</div></div>
        <div class="pin-dots">${[0, 1, 2, 3, 4, 5].slice(0, Math.max(4, (L.len || 4))).map((i) => `<i class="${i < pin.length ? 'f' : ''}"></i>`).join('')}</div>
        <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k) => k === '' ? '<span></span>' : `<button data-k="${k}">${k}</button>`).join('')}</div>`;
      el.querySelectorAll('[data-k]').forEach((b) => (b.onclick = async () => {
        const k = b.dataset.k;
        if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 8) pin += k;
        draw();
        if (pin.length >= (L.len || 4)) {
          if ((await App.hashPin(pin, L.salt)) === L.hash) { el.remove(); S.meta._unlockedAt = Date.now(); }
          else if (pin.length >= (L.len || 4)) { pin = ''; draw(); el.querySelector('.pin-dots').classList.add('shake'); UI.vibrate(80); }
        }
      }));
    };
    draw();
    document.body.appendChild(el);
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
    // one-time switch of the untouched default colour to the new design (user choices are kept)
    if (!S.meta.designV2) {
      if (S.settings.accent === 'indigo') await Store.setSettings((s) => { s.accent = 'petrol'; });
      await Store.setMeta({ designV2: true });
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

    // Google sign-in is required once it is set up for this address. Until then (or when it
    // can't be checked offline) the app keeps working locally, so nobody is ever locked out.
    const Cloud = root.Cloud;
    if (!S.meta.cloudUid && !S.meta.cloudReady) {
      const ready = await Promise.race([Cloud.probe(), new Promise((r) => setTimeout(() => r(null), 5000))]);
      if (!ready) { App.localOnly = true; App.afterLogin(); return; }
    }
    Cloud.onAuthChange = (u) => { if (!u && S.meta.cloudUid) App.showLogin('expired'); };
    let user = null, failed = false;
    try {
      user = await Promise.race([Cloud.start(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), S.meta.cloudUid ? 4000 : 20000))]);
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
    if (failed && S.meta.cloudUid) {
      App.afterLogin();
      Cloud.start().then((u) => { if (u) Cloud.connect(u).catch(() => {}); else App.showLogin('expired'); }).catch(() => {});
      return;
    }
    App.showLogin(failed ? (navigator.onLine ? 'error' : 'offline') : null);
  };
  /** Continue into the app once the user is signed in. */
  App.afterLogin = function () {
    if (App.ensureLegal && !App.legalAccepted()) { App.ensureLegal(App.afterLogin); return; }
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

  document.addEventListener('DOMContentLoaded', () => App.boot());
})(typeof window !== 'undefined' ? window : globalThis);
