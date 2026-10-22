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
    try {
      App.model = Engine.buildModel({
        settings: S.settings, employers: S.employers, roles: S.roles, dayRules: S.dayRules,
        shifts: S.shifts, entries: S.entries,
      });
    } catch (e) {
      // never leave the app without numbers: keep the last good calculation (or an empty one)
      console.error('recalculation failed', e);
      if (!App.model) App.model = Engine.buildModel({ settings: S.settings, employers: S.employers, roles: S.roles, dayRules: [], shifts: [], entries: [] });
    }
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
    // a Shaati Plus skin for the pay card on home (only while Plus is on)
    const skin = root.Plus ? root.Plus.skin() : '';
    if (skin) de.dataset.skin = skin; else delete de.dataset.skin;
    if (root.Plus && root.Plus.paintPhoto) root.Plus.paintPhoto(de, skin);
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
    // The new screen slides in with a CSS animation (.view.enter-next/prev) that runs on the GPU. A View
    // Transition looked similar but froze the screen for ~50ms on every tab switch on a real phone
    // while the browser photographed the old screen.
    App.render(opts);
    window.scrollTo(0, 0);
  };
  /* ---------------- the phone's back button on the main screens ----------------
   * In the installed app, "back" with nothing open goes home from another tab; on home it asks
   * "press back again to exit" (a note at the bottom) and leaves only on a second press within two
   * seconds. Open sheets and dialogs still close first, as before. In a browser tab, back stays the
   * browser's.
   * The first press is held by a guard under every layer:
   *  - with CloseWatcher (Chrome, so the Android app): a close watcher. No history entry: Chrome's back
   *    button skips history entries a page adds without a fresh tap, which would have let a press after
   *    "back to home" leave the app with no note. A layer closed by the same press as the guard (Chrome
   *    groups watchers made without a tap) only puts the guard back;
   *  - without it: one history entry ({guard: true}) under the layers' own entries, added only with no
   *    layer open and only after the person has touched the app. */
  const Back = { on: false, armed: false, window: 2000 };
  App.back = Back;
  Back.enabled = () => !!(App.androidApp || (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches) || navigator.standalone);
  const BackCW = typeof root.CloseWatcher === 'function' ? root.CloseWatcher : null;
  let armTimer = 0, guardWatcher = null;
  Back.ensure = function () {
    if (Back.on || Back.armed || App.blocking || !Back.enabled() || (UI.sheets && UI.sheets.length)) return;
    if (BackCW) {
      try { guardWatcher = new BackCW(); } catch (e) { return; }
      Back.on = true;
      guardWatcher.onclose = () => { guardWatcher = null; Back.on = false; pressed(); };
      return;
    }
    const act = navigator.userActivation;
    if (act && !act.hasBeenActive) return;
    try { history.pushState({ guard: true }, '', location.href); Back.on = true; } catch (e) { /* not allowed here */ }
  };
  /** A back press reached the main screen. */
  function pressed() {
    // a layer that the same press closed (or one still open, or a full-screen step): only put the guard back
    if (App.blocking || (UI.sheets && UI.sheets.length) || performance.now() - (UI.lastLayerClose || -1e9) < 120) { setTimeout(Back.ensure, 0); return; }
    if (App.tab !== 'home') { App.go('home'); setTimeout(Back.ensure, 0); return; }
    Back.armed = true;
    UI.toast('לחצו שוב על "חזרה" כדי לצאת', null, { ms: Back.window });
    if (root.Fx) root.Fx.haptic(8);
    clearTimeout(armTimer);
    armTimer = setTimeout(() => { Back.armed = false; Back.ensure(); }, Back.window);
  }
  if (!BackCW) window.addEventListener('popstate', () => {
    if (!Back.on) return;
    const st = history.state;
    if (st && (st.guard || st.sheet)) return; // still on (or above) the guard: a layer's own step
    Back.on = false; // a back press took the guard
    pressed();
  });
  // every touch that ends puts the guard back if it is missing (a touch during the two seconds means "stay")
  document.addEventListener('pointerup', () => {
    if (Back.armed) { clearTimeout(armTimer); Back.armed = false; }
    setTimeout(Back.ensure, 0);
  }, true);
  const seenTabs = new Set();
  // the last screen drawn (its tab and its HTML, without the looping decorations' clock, which differs every
  // time, and without the one-time entrance classes: a redraw that only drops those would replace a card that
  // has just sprung in, for nothing)
  let drawn = { tab: '', sig: '' };
  const sigOf = (html) => html.replace(/--ph:-\d+ms/g, '').replace(/ (tc-enter|ha-enter)\b/g, '');
  App.render = function (opts) {
    if (App.blocking) return; // a full-screen step (login / terms / setup wizard) owns the screen
    const v = document.getElementById('view');
    const fn = App.views[App.tab] || App.views.home;
    const y = opts && opts.keepScroll ? window.scrollY : 0;
    const fresh = !(opts && opts.keepScroll);
    const first = fresh && !seenTabs.has(App.tab);
    if (first) seenTabs.add(App.tab);
    // under the opening show the screen is drawn still: the show's way out is its entrance (when the account
    // loaded late, the cards rose and the pay counted up right under the leaving show)
    const covered = !!document.getElementById('intro');
    const cls = fresh && !covered ? (App.enterDir || '') + ' fresh' + (first ? ' first' : '') : '';
    App.enterDir = '';
    // a screen that fails to draw shows a friendly card instead of a blank page
    let html;
    try { html = fn(); } catch (e) {
      console.error('render failed', App.tab, e);
      html = `<div class="empty render-err">${App.mascot ? App.mascot('think', { size: 96 }) : ''}<h3>משהו השתבש במסך הזה</h3>
        <div class="small muted">הנתונים שלך שמורים. אפשר לנסות שוב או לעבור למסך אחר.</div>
        <div class="btn-row" style="margin-top:14px;justify-content:center"><button class="btn" data-act="render-retry">נסה שוב</button><button class="btn tonal" data-act="support">דיווח על תקלה</button></div></div>`;
    }
    // a redraw that would draw exactly what is already there (a save that changed nothing on this screen, the
    // insights run a moment after every save, a refresh) leaves the screen alone: replacing it cut short what
    // was moving on it (a count, a tint) and reset sideways-scrolled rows
    const sig = sigOf(html);
    if (!fresh && drawn.tab === App.tab && drawn.sig === sig && v.firstElementChild) {
      App.renderNav();
      App.tickTimer();
      return;
    }
    drawn = { tab: App.tab, sig };
    v.innerHTML = `<div class="view ${cls}" id="view-inner">${html}</div>`;
    try { if (App.views[App.tab + '_mount']) App.views[App.tab + '_mount'](v); } catch (e) { console.error('mount failed', App.tab, e); }
    App.renderNav();
    if (opts && opts.keepScroll) window.scrollTo(0, y);
    App.tickTimer();
    if (root.Fx) root.Fx.countUps(v, App.tab, fresh && !covered);
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
  /** A word by the person's gender (settings): g('עובד', 'עובדת') → "עובד" / "עובדת", or "עובד/ת" when not said. */
  App.g = (m, f, x) => { const gd = S.settings.gender; if (gd === 'f') return f; if (gd === 'm' || m === f) return m; return x || (f.startsWith(m) ? m + '/' + f.slice(m.length) : m + '/' + f); };

  /* ---------------- clean language (core/clean.js) ----------------
   * Every name, job, workplace, note and reason passes through here before it is saved; while typing, a field
   * with an unfit word says so quietly under itself. */
  App.cleanText = (t) => !root.Clean || root.Clean.isClean(t);
  App.ensureClean = function (...texts) {
    if (texts.every((t) => App.cleanText(t))) return true;
    UI.invalid('בואו נשמור על שפה נקייה 🙂 יש כאן מילה שלא מתאימה');
    return false;
  };
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || !t.matches || !t.matches('textarea, input:not([type]), input[type="text"]') || t.matches('.pp-q, [data-no-clean]')) return;
    const bad = !App.cleanText(t.value);
    if (bad === t.classList.contains('unclean')) return;
    t.classList.toggle('unclean', bad);
    t.setAttribute('aria-invalid', String(bad));
    let hint = t.nextElementSibling && t.nextElementSibling.classList.contains('unclean-hint') ? t.nextElementSibling : null;
    if (bad && !hint) { hint = document.createElement('div'); hint.className = 'unclean-hint'; hint.setAttribute('role', 'status'); hint.textContent = 'בואו נשמור על שפה נקייה 🙂'; t.after(hint); }
    if (!bad && hint) hint.remove();
  }, true);
  /* Looping decorations (the glow on the pay card, the dial, the shine on the start button) are
   * redrawn with the screen after every save or sync. Each new copy gets an offset from one clock
   * that started with the page, so it carries on exactly where the old copy was instead of
   * starting over (which looked like a flicker). Use as style="${App.phase()}". */
  App.phase = () => `--ph:-${Math.round(performance.now())}ms`;
  App.actions['render-retry'] = () => { App.recompute(); App.render(); };

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
    // the "did you forget to end it?" question comes (and goes) on the timer card by itself
    const card = a && App.tab === 'home' && !App.blocking && document.querySelector('#view .timer-card');
    if (card && !!App.overdue() !== !!card.querySelector('.tc-overdue')) App.rerender();
  };
  let coinStep = null;
  setInterval(App.tickTimer, 1000);

  /* ---------------- "forgot to end the shift?" ----------------
   * A shift that runs well past its planned end, or well past how long this person's shifts in that role usually
   * last, gets a quiet question on the timer card with the likely end ready to tap ("end at 16:10"). Nothing
   * changes without a tap; "still working" puts it off for two hours. */
  const usualCache = new Map();
  /** How long this person's shifts in a role usually last (ms, the median of the last 12; any role when that
   * role has fewer than 4), or 0 when there are too few to tell. */
  App.usualShiftMs = function (roleId) {
    const hit = usualCache.get(roleId);
    if (hit && Date.now() - hit.t < 60000 && hit.n === S.shifts.length) return hit.v;
    const lens = (byRole) => S.shifts
      .filter((s) => s.status === 'done' && s.end > s.start && (!byRole || s.roleId === roleId))
      .sort((x, y) => y.start - x.start).slice(0, 12)
      .map((s) => s.end - s.start).filter((ms) => ms >= 30 * 60000 && ms <= 20 * U.HOUR)
      .sort((x, y) => x - y);
    let l = lens(true);
    if (l.length < 4) l = lens(false);
    const v = l.length >= 4 ? l[Math.floor(l.length / 2)] : 0;
    usualCache.set(roleId, { t: Date.now(), n: S.shifts.length, v });
    return v;
  };
  /** The running shift is well past its planned end or its usual length: { end, why: 'planned'|'usual', usual }. */
  App.overdue = function () {
    const a = S.activeShift;
    if (!a || !a.start) return null;
    const now = Date.now();
    if (a.stillAt && now - a.stillAt < 2 * U.HOUR) return null;
    const planned = a.fromPlanned && App.shift(a.fromPlanned);
    let end, why;
    if (planned && planned.end > a.start) { end = planned.end; why = 'planned'; }
    else {
      const u = App.usualShiftMs(App.currentRole() || a.roleId);
      if (!u) return null;
      end = Math.round((a.start + u) / (5 * 60000)) * (5 * 60000); // the usual end, to the nearest five minutes
      why = 'usual';
    }
    const grace = why === 'planned' ? 45 * 60000 : Math.max(45 * 60000, (end - a.start) * 0.25);
    if (end <= a.start || now < end + grace) return null;
    return { end, why, usual: end - a.start };
  };

  /** Shift object for the running timer (for previews and saving). */
  App.activeAsShift = function (end, forSave) {
    const a = S.activeShift;
    if (!a) return null;
    const now = end || Date.now();
    const brkMs = (a.breaks || []).reduce((s, b) => s + ((b.to || now) - b.from), 0);
    return {
      id: '__active', kind: 'shift', employerId: a.employerId, roleId: a.roleId, status: 'done',
      // breaks taken with the timer: those, unpaid (a short one is flagged). None taken: the saved shift gets the
      // law's break (null); the live "so far" leaves it out, or the amount would drop as the shift passed 6 hours
      start: a.start, end: now, splits: a.splits || [],
      ...((a.breaks || []).length ? { breakMin: Math.round(brkMs / 60000), breakPaid: false, breakSet: true }
        : forSave ? { breakMin: null, breakPaid: (App.employer(a.employerId) || {}).defaultBreakPaid !== false } : { breakMin: 0, breakPaid: true }),
      items: [], note: a.note || '',
    };
  };
  let previewCache = { t: 0, r: null, key: '' };
  App.previewActive = function () {
    const a = S.activeShift;
    // the same running shift (a new one, an edited start, a break or a role switch is another)
    const key = a ? [a.start, a.roleId, (a.breaks || []).map((b) => b.from + '-' + (b.to || '')).join(','), (a.splits || []).length].join('|') : '';
    if (Date.now() - previewCache.t < 15000 && previewCache.r && previewCache.key === key) return previewCache.r;
    const sh = App.activeAsShift();
    if (!sh) return null;
    const r = Engine.computeShift(sh, App.model.ctx, { priorMin: priorMinutes(sh) });
    previewCache = { t: Date.now(), r, key };
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
    App.justStarted = Date.now(); // the timer card springs in (the save redraws home at once)
    // a planned shift that has already begun can be measured from its planned start (App.markDone)
    const start = opts && opts.startAt && opts.startAt < now && now - opts.startAt < 24 * 3600000 ? opts.startAt : now;
    await Store.setActive({ start, roleId: role.id, employerId: role.employerId || S.employers[0].id, splits: [], breaks: [], fromPlanned: planned ? planned.id : null });
    if (App.shiftMoment) App.shiftMoment('start', opts && opts.at); else root.Fx.celebrate('start');
    UI.toast('המשמרת התחילה — בהצלחה!');
    App.askNotifyPermission();
  };
  /** Ends the running shift now, or at endAt (an earlier moment: "end at 16:10" for a shift left running). */
  App.stopShift = async function (at, endAt) {
    const a = S.activeShift;
    if (!a) return;
    const end = endAt && endAt > a.start && endAt < Date.now() ? endAt : Date.now();
    // breaks after the end are dropped, one still open closes at the end
    if (a.breaks && a.breaks.length) a.breaks = a.breaks.filter((b) => b.from < end).map((b) => ({ from: b.from, to: Math.min(b.to || end, end) }));
    const sh = App.activeAsShift(end, true);
    sh.id = U.uid();
    if ((sh.end - sh.start) < 60000) {
      const ok = await UI.confirm('משמרת קצרה מאוד', 'המשמרת נמשכה פחות מדקה. לשמור בכל זאת?', 'שמור');
      if (!ok) { await Store.setActive(null); return; }
    }
    const ops = [{ store: 'shifts', put: sh }];
    const planned = a.fromPlanned && App.shift(a.fromPlanned);
    if (planned && planned.status === 'planned') ops.push({ store: 'shifts', del: planned.id });
    await Store.apply(ops, 'סיום משמרת');
    App.justStopped = Date.now(); // the start button springs back in
    await Store.setActive(null);
    if (S.shifts.filter((x) => x.status === 'done').length === 1) App.celebrateOnce('first-shift', () => UI.toast('המשמרת הראשונה שלך נשמרה! 🎉'));
    if (App.shiftMoment) App.shiftMoment('stop', at); else root.Fx.celebrate('big');
    App.milestones();
    const r = App.result(sh.id);
    UI.toast(`נשמר: ${U.hm(r ? r.paidMin : 0)} שעות · ${U.money(r ? r.wage : 0)}`, { label: 'ביטול', fn: App.undo }, { ok: true });
    // a timer that kept running (the phone in a pocket, a forgotten stop): it is saved, so nothing is
    // lost, and the end time can be fixed right away
    const hours = (sh.end - sh.start) / U.HOUR;
    const usual = App.usualShiftMs(a.roleId);
    const muchLonger = usual && sh.end - sh.start > Math.max(usual * 1.6, usual + 3 * U.HOUR);
    if (!endAt && (hours > (+S.settings.alerts.suspiciousHours || 20) || muchLonger)) {
      const fix = await UI.confirm('שכחת לעצור?', `הטיימר רץ ${U.num(hours, 1)} שעות, מ-${U.fmtDate(U.epochKey(sh.start), 'short')} ב-${U.epochHM(sh.start)}${usual ? `, ובדרך כלל המשמרות שלך נמשכות כ-${U.hm(Math.round(usual / 60000))}` : ''}. אפשר לתקן עכשיו את שעת הסיום.`, 'לתקן');
      if (fix && App.sheetsApi.shiftEditor) { App.sheetsApi.shiftEditor(sh.id); return; }
    }
    App.sheetsApi.shiftDetail && App.sheetsApi.shiftDetail(sh.id);
    if (App.reviewAfterShift) App.reviewAfterShift(); // a good moment, once that screen is closed
  };
  App.toggleBreak = async function (at) {
    const a = Object.assign({}, S.activeShift);
    a.breaks = (a.breaks || []).slice();
    const last = a.breaks[a.breaks.length - 1];
    if (last && !last.to) { last.to = Date.now(); UI.toast('חזרת מהפסקה'); if (App.shiftMoment) App.shiftMoment('resume', at); }
    else { a.breaks.push({ from: Date.now() }); UI.toast('הפסקה — הזמן לא נספר'); if (App.shiftMoment) App.shiftMoment('pause', at); }
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
  /* Notifications: as few as possible (1.18, the owner's wish). Kept: the weekly and the monthly summary,
   * good news (a record, a goal reached, a birthday), and three that guard the user's own data or come once a
   * month (a timer left running, a backup due, payday's payslip). Never a notification that something is "not
   * legal" (minimum wage, the youth law, rest, long days, hours in a week, a payslip gap), and no nagging (more
   * hours than usual, no shift for a week, overlaps). The engine still finds those; they show where they belong
   * (the payslip check, the rights screen, the shift itself), not as notifications. A reminder before a planned
   * shift only when switched on in Settings. */
  const NOTIFY = new Set(['weekly', 'monthly', 'record', 'goal', 'birthday', 'timer', 'backup', 'payslipDue', 'upcoming', 'holidayPay']);
  const kindSent = (a) => NOTIFY.has(a.type) && !(a.type === 'goal' && a.severity !== 'good');
  // the reminder before a planned shift is off unless switched on
  const notifiable = (a) => kindSent(a) && (a.type === 'upcoming' ? S.settings.alerts.remindPlanned === true : S.settings.alerts.types[a.type] !== false);
  /** The monthly summary: once a pay period is over, its story is ready (it opens the month's recap). */
  function monthlyAlert() {
    const emp = S.employers[0];
    if (!emp) return null;
    const cur = Engine.periodOf(U.todayKey(), emp);
    const last = Engine.periodOf(U.addDays(cur.from, -1), emp);
    const t = Engine.rangeSummary(App.model, last.from, last.to);
    if (!t || !t.shifts) return null;
    return {
      key: 'monthly-' + last.key, type: 'monthly', cat: 'summary', severity: 'info', push: 'anomaly', data: { pk: last.key },
      title: `הסיכום של ${last.label} מוכן ✨`,
      body: `${t.shifts === 1 ? 'משמרת אחת' : t.shifts + ' משמרות'} · ${U.num(t.hours, 1)} שעות · ${U.money(t.gross, 0)} ברוטו. לחצו לסיפור של החודש.`,
    };
  }
  const insightsNow = () => Insights.run(App.model, {
    now: Date.now(), activeShift: S.activeShift, payslips: S.payslips, gaps: S.gaps,
    // with cloud sync the data is already safe; the backup reminder only applies to local-only use
    lastBackup: S.meta.cloudUid ? Date.now() : S.settings.backup.lastBackup, roleName: App.roleName,
    // how long this person's shifts usually last: the "forgot to end it?" reminder comes sooner for short shifts
    usualShiftMs: S.activeShift ? App.usualShiftMs(S.activeShift.roleId) : 0,
  });
  App.runInsights = async function () {
    if (!App.model || !S.settings.onboarded) return;
    const res = insightsNow();
    App.insights = res;
    const month = monthlyAlert();
    const wanted = res.alerts.filter(notifiable).concat(month && notifiable(month) ? [month] : []);
    // notifications of the kinds that are no longer sent go from the list too (once)
    const gone = S.notifications.filter((n) => !kindSent(n));
    if (gone.length) await Store.apply(gone.map((n) => ({ store: 'notifications', del: n.id })), null);
    const known = new Set(S.notifications.map((n) => n.key));
    const fresh = wanted.filter((a) => !known.has(a.key));
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
    if (App.widgets) App.widgets.push(); // the forecast may have moved
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
    // unlocking fades the lock screen away (removed at once, it was a hard cut to the app)
    const unlock = () => { if (el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => el.remove(), 260); S.meta._unlockedAt = Date.now(); pinFails = 0; };
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
    // with an account the data is already kept in the cloud: no weekly files piling up in Downloads
    if (S.settings.demo || S.meta.cloudUid) return;
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
    UI.toast(auto ? 'גיבוי אוטומטי נשמר בהורדות' : 'קובץ הגיבוי נשמר', { label: 'שתף ל-\u2060Drive', fn: () => UI.shareFile(name, blob, 'גיבוי משמרות') });
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
    // the admin of this account, as this phone last heard it (checked again once the account connects)
    App.isAdmin = !!S.meta.adminUid && S.meta.adminUid === S.meta.cloudUid;
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
          // the opening show waits for the account to connect and for the admin check (within its limit)
          const c = Cloud.connect(user).then(() => Cloud.adminCheck).catch((e) => console.warn('sync', e));
          if (root.Intro && root.Intro.hold) root.Intro.hold(c);
          return;
        }
        try { await Cloud.connect(user); } catch (e) { console.error(e); App.showLogin(navigator.onLine ? 'error' : 'offline'); return; }
        App.afterLogin();
        return;
      }
      if (failed) {
        // slow or no network: the app opens with what's on the phone and connects when it can
        App.afterLogin();
        // (the opening show does not wait for it: it already waited for the account as long as is reasonable)
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
    // the first screen is drawn whole: what the insights add to it (the month's forecast on the pay card) used
    // to come a second later with a redraw, and the card grew a line just after the opening show
    if (!App.insights && App.model) { try { App.insights = insightsNow(); } catch (e) { console.warn('insights', e); } }
    App.render();
    const action = App.pendingAction;
    App.pendingAction = null;
    // done once: a reload (or the browser's own restore) must never start or end a shift again
    if (action) { try { const u = new URL(location.href); u.searchParams.delete('action'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) { /* ignore */ } }
    if (action === 'start' && !S.activeShift) App.actions['timer-start']();
    if (action === 'stop' && S.activeShift) App.stopShift(); // the widget's "end" button
    if (action === 'add') App.sheetsApi.shiftEditor();
    if (action === 'schedule' && App.importSchedule) App.importSchedule(); // the app icon's shortcut
    if (action === 'share-in' && App.receiveShare) App.receiveShare(); // shared to the app (sw.js)
    if (action === 'plus' && root.Plus) setTimeout(() => root.Plus.sheet(), 600); // back from the web checkout (?action=plus): straight to the code field
    setTimeout(() => { App.runInsights(); App.autoBackupCheck(); }, 1200);
    // is Shaati Plus for sale here, and owned? (Google Play, Android app only) The opening show waits for the
    // answer (it can put a design and the brush on the pay card) and for the fonts, so neither lands after it
    const Intro = root.Intro;
    if (root.Plus) { const p = root.Plus.init().catch(() => {}); if (Intro && Intro.hold) Intro.hold(p); }
    if (Intro && Intro.hold && document.fonts && document.fonts.ready) requestAnimationFrame(() => Intro.hold(document.fonts.ready));
    if (App.whatsNew) App.whatsNew();
  };
  // just before the opening show leaves, the app draws itself once more under it (still), so anything the
  // start-up work changed (the account, the admin check, Google Play) is already in place when it shows
  if (root.Intro) root.Intro.beforeLeave = () => { App.applyTheme(); if (!App.blocking) App.rerender(); };

  function registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    const busy = () => !!App.blocking || !!document.querySelector('.sheet, .dialog');
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // A new version downloads quietly in the background and switches in when it can't disturb: when the app
      // goes to the background with nothing half-filled, so the next look at it is the new version. Never while
      // it opens: the reload that switching in needs flashed the screen right as the opening show handed over.
      const quietUpdate = (w) => {
        const apply = () => w.postMessage('skipWaiting');
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
    // Reload only when an update replaced a previous version, not when the very first install takes over.
    // Whether there was a previous version is checked at each change: a page that opened before the
    // first install (first launch from the store) must still reload on every later update.
    let current = navigator.serviceWorker.controller;
    let reloading = false;
    const reload = () => { if (!reloading) { reloading = true; location.reload(); } };
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const had = current;
      current = navigator.serviceWorker.controller;
      if (had) reload();
    });
    // Safety net: Android keeps the app's page alive for days. If a newer version has already replaced
    // this one's files but this page still runs the old code, start over when the app is hidden or
    // reopened (never in the middle of a form, and at most once per version).
    document.addEventListener('visibilitychange', () => {
      // only while hidden: a reload as the app comes back into view flashed the screen
      if (document.visibilityState !== 'hidden') return;
      if (!window.caches || !navigator.serviceWorker.controller || !window.APP_BUILD || busy()) return;
      caches.keys().then((keys) => {
        const shells = keys.filter((k) => k.startsWith('shiftpay-shell-'));
        if (shells.length !== 1 || shells[0] === 'shiftpay-shell-' + window.APP_BUILD || busy()) return;
        try { if (sessionStorage.getItem('reloaded-for') === shells[0]) return; sessionStorage.setItem('reloaded-for', shells[0]); } catch (e) { return; }
        reload();
      }).catch(() => {});
    });
  }

  // a storage hiccup inside a background save is already handled by the store; never let it surface as a crash
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    if (r && ['UnknownError', 'InvalidStateError', 'QuotaExceededError', 'AbortError', 'TransactionInactiveError'].includes(r.name)) { e.preventDefault(); console.warn('storage', r); }
  });
  document.addEventListener('DOMContentLoaded', () => App.boot());
})(typeof window !== 'undefined' ? window : globalThis);
