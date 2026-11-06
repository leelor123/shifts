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
  /** What the salaries that arrived taught about the net (core/netlearn.js): { adj, n } or null. */
  App.netLearned = () => (root.NetLearn ? root.NetLearn.learn(S.meta.salaryAns, S.meta.netLearnReset) : null);
  App.recompute = function () {
    // Shabbat/holiday windows are cached under a key made of every rest setting (city, holidays,
    // day rules…), so they stay valid across recalculations: only the shifts are recomputed
    try {
      App.model = Engine.buildModel({
        settings: S.settings, employers: S.employers, roles: S.roles, dayRules: S.dayRules,
        shifts: S.shifts, entries: S.entries, netAdj: App.netLearned() ? App.netLearned().adj : 0,
      });
    } catch (e) {
      // never leave the app without numbers: keep the last good calculation (or an empty one)
      console.error('recalculation failed', e);
      if (!App.model) App.model = Engine.buildModel({ settings: S.settings, employers: S.employers, roles: S.roles, dayRules: [], shifts: [], entries: [] });
    }
    // the friends' competition sends my card when its amounts changed (a little later, at most once in 20 s)
    if (root.FriendsView) root.FriendsView.changed();
    if (root.Invite) root.Invite.changed(); // a friend's link: its gift once the first shift is in
  };

  /* ---------------- theme ---------------- */
  const ACCENTS = {
    midnight: [221, 78, 'כחול לילה'], candy: [258, 72, 'סגול-ורוד'], petrol: [186, 48, 'פטרול'], indigo: [238, 62, 'סגול-כחול'], blue: [212, 75, 'כחול'], teal: [178, 62, 'טורקיז'], green: [145, 45, 'ירוק'],
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
  /* The look (theme, colour, text size, font, hidden amounts, the Plus skin) is painted by one function: from the
   * settings once they are loaded, and from a copy kept on the phone (localStorage 'shaati.look') the moment the code
   * runs, before the opening show's first frame. Painted only from the settings, it came in the middle of the start-up
   * that runs under the show, half a second into the logo's glide on a phone: the effects (body.fx) came on there, so
   * the sky's clouds, birds and leaves stood still and then jumped into place, and a text size or font of one's own,
   * or a theme other than the phone's, changed the show's header and sheet as it moved (the user, 6 Nov 2026: "a small
   * stutter in the opening"; tests/e2e/opening.js). The start-up now writes the very same values, and nothing changes. */
  const LOOK_KEY = 'shaati.look';
  /** Writes the look, only what differs: called after every change of settings, and writing the same colour or photo
   * again made the browser work out the whole page's look again (the pay card blinked). True when the text size or
   * the font changed. */
  function paintLook(L) {
    const de = document.documentElement;
    const data = (k, v) => { if (v) { if (de.dataset[k] !== v) de.dataset[k] = v; } else if (k in de.dataset) delete de.dataset[k]; };
    let roomChanged = false; // the text size or the font: the short labels are fitted again (Dom.fit)
    const prop = (k, v) => { if (de.style.getPropertyValue(k) !== String(v)) { de.style.setProperty(k, v); if (k === '--fs' || k === '--app-font') roomChanged = true; } };
    data('theme', L.theme);
    if (de.classList.contains('hide-money') !== !!L.money) de.classList.toggle('hide-money', !!L.money); // privacy: amounts blurred
    prop('--h', L.h);
    prop('--s', L.s);
    prop('--fs', L.fs);
    data('skin', L.skin);
    prop('--app-font', "'" + FONTS[L.font][0] + "'");
    const link = document.getElementById('font-link');
    // Rubik is the app's own (fonts/); only another font chosen in the settings is fetched from Google
    if (link && (link.dataset.font || 'rubik') !== L.font) {
      if (L.font === 'rubik') link.removeAttribute('href'); else link.href = App.fontCss(L.font);
      link.dataset.font = L.font;
    }
    return roomChanged;
  }
  // the kept look at once (the settings are not loaded yet), and the effects from their own kept copy (fx.js)
  try {
    const kept = JSON.parse(localStorage.getItem(LOOK_KEY) || 'null');
    if (kept && typeof kept === 'object' && FONTS[kept.font]) paintLook(kept);
  } catch (e) { /* none kept yet, or private mode */ }
  if (root.Fx && root.Fx.applyKept) root.Fx.applyKept();
  App.applyTheme = function () {
    const st = S.settings;
    const a = ACCENTS[st.accent] || ACCENTS.midnight;
    const L = {
      theme: st.theme === 'light' || st.theme === 'dark' ? st.theme : '',
      money: !!st.hideMoney,
      h: String(a[0]), s: a[1] + '%', fs: String(st.fontScale || 1),
      skin: root.Plus ? root.Plus.skin() : '', // a Shaati Plus skin for the pay card on home (only while Plus is on)
      font: FONTS[st.font] ? st.font : 'rubik',
    };
    const roomChanged = paintLook(L);
    if (root.Plus && root.Plus.paintPhoto) root.Plus.paintPhoto(document.documentElement, L.skin);
    try { const k = JSON.stringify(L); if (localStorage.getItem(LOOK_KEY) !== k) localStorage.setItem(LOOK_KEY, k); } catch (e) { /* private mode */ }
    App.statusBar();
    if (root.Fx) root.Fx.apply();
    if (roomChanged && root.Dom && root.Dom.fitAll) root.Dom.fitAll();
  };
  /** The phone's status bar takes the colour of what is under it: the opening's navy, the home screen's sky while it is
   * in view (its top colour, set by App.homeSky), otherwise the page (a beige bar sat above the night sky). */
  App.statusBar = function () {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const st = S.settings || {};
    const dark = st.theme === 'dark' || (st.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const c = document.getElementById('intro') ? '#0d2b6b' : App.tab === 'home' && !App.blocking && App.skyTop && App.skyInView !== false ? App.skyTop : dark ? '#0e1118' : '#f6f4ee';
    if (meta.content !== c) meta.content = c;
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
      : `<button class="${App.tab === t.id ? 'on' : ''}" data-act="tab" data-tab="${t.id}" aria-label="${t.label}"><span class="pill"><span class="ic">${icon(t.icon)}</span>${t.id === 'home' && unread && App.tab !== 'home' ? `<span class="dot-badge">${unread > 9 ? '9+' : unread}</span>` : ''}</span>${t.label}</button>`).join('')}</div>`;
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
  /** The opening show runs before the database is open, so it keeps a small copy of what it shows (sky.js): the
   * city (the sky and the land), the first name and which screen comes first. Written only when it changes. */
  App.rememberSky = function () {
    const Sky = root.Sky;
    if (!Sky) return;
    const st = S.settings, rest = st.rest || {};
    let place = null;
    try { const loc = root.HebCal.locationOf(rest); place = { name: rest.city === '__custom' ? '' : String(rest.city || ''), lat: +(+loc.lat).toFixed(3), lon: +(+loc.lon).toFixed(3) }; } catch (e) { /* the default city */ }
    const mode = !st.onboarded ? 'welcome' : st.lock && st.lock.enabled ? 'lock' : S.meta.cloudUid || App.localOnly ? 'home' : 'welcome';
    const next = { place, name: String(st.userName || '').slice(0, 40), mode };
    const p = Sky.prefs();
    if (JSON.stringify([p.place, p.name, p.mode]) === JSON.stringify([next.place, next.name, next.mode])) return;
    Sky.remember(next);
    // another city: its weather, for the next opening (once things are quiet)
    if (p.place && next.place && p.place.name !== next.place.name) { clearTimeout(App.rememberSky.t); App.rememberSky.t = setTimeout(() => Sky.refreshWeather(), 1500); }
  };
  App.render = function (opts) {
    App.rememberSky();
    if (App.blocking) return; // a full-screen step (login / terms / setup wizard) owns the screen
    if (App.quickOpen) App.quickOpen(); // the opening's quick actions, while it waits on them (views-quick.js)
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
      console.error('render failed', App.tab, e); if (root.Errors) root.Errors.capture(e, 'render');
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
    // the same screen drawn again (a save, the eye, a new minute, the opening show leaving): only what changed is
    // touched (Dom.patch) — replacing it all made every card new, so what moved on them began again and a phone
    // showed the new card's layer black for a frame. Another tab, or a first draw, is new anyway: it slides in.
    const inner = v.firstElementChild;
    const same = !fresh && drawn.tab === App.tab && inner && inner.id === 'view-inner' && root.Dom;
    drawn = { tab: App.tab, sig };
    if (same) root.Dom.patch(inner, html);
    else v.innerHTML = `<div class="view ${cls}" id="view-inner">${html}</div>`;
    try { if (App.views[App.tab + '_mount']) App.views[App.tab + '_mount'](v); } catch (e) { console.error('mount failed', App.tab, e); if (root.Errors) root.Errors.capture(e, 'mount'); }
    App.statusBar();
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
    if (root.Dom) root.Dom.keep(t, ['aria-invalid'], ['unclean']);
    let hint = t.nextElementSibling && t.nextElementSibling.classList.contains('unclean-hint') ? t.nextElementSibling : null;
    if (bad && !hint) { hint = document.createElement('div'); if (root.Dom) root.Dom.own(hint, t); hint.className = 'unclean-hint'; hint.setAttribute('role', 'status'); hint.textContent = 'בואו נשמור על שפה נקייה 🙂'; t.after(hint); }
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
    if (root.Fx && !(App.quietUntil > Date.now())) root.Fx.celebrate('big');
    setTimeout(() => el.classList.add('out'), 3600);
    setTimeout(() => el.remove(), 4100);
  };

  /* ---------------- data change pipeline ---------------- */
  let insightTimer = null;
  const LOOK_KEYS = new Set(['hideMoney', 'theme', 'accent', 'font', 'fontScale', 'skin', 'fx', 'home']);
  Store.on((ev) => {
    if (ev.type === 'storage-lost') {
      UI.toast('השמירה בטלפון לא עובדת כרגע. ' + (root.Cloud && root.Cloud.user ? 'הנתונים נשמרים בחשבון שלך ☁️' : 'כדאי להתחבר לחשבון כדי לא לאבד נתונים.'));
      App.rerender();
      return;
    }
    if (ev.type === 'active') { App.rerender(); return; }
    // a change of look only (the eye, colours, font, effects, home options): no calculation again — it held the
    // screen for a moment just as the blur or the colour began to change
    const lookOnly = ev.type === 'settings' && ev.keys && ev.keys.length && ev.keys.every((k) => LOOK_KEYS.has(k));
    if (!lookOnly) App.recompute();
    if (ev.type === 'settings') App.applyTheme();
    App.rerender();
    clearTimeout(insightTimer);
    insightTimer = setTimeout(() => App.runInsights(), 800);
  });
  /** Save with an Undo snackbar. */
  App.saveOps = async function (ops, label, toastText) {
    // nothing differs from what is saved (a save with no edit): no "updated", no coin, no undo (Store.apply)
    if (await Store.apply(ops, label) === null) { UI.toast('לא היו שינויים לשמור'); return; }
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

  // (U.single: a double tap, the opening's quick start and the home button at once, start one shift and log one start)
  App.startShift = U.single(async function (roleId, opts) {
    // a shift already running (another phone started it, a stale button): it is never replaced by a new start
    if (S.activeShift) return;
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
    if (root.ShiftLog) root.ShiftLog.started(start, opts && opts.widget ? 'widget' : 'timer'); // the signed shift log: the press, with the phone's time
    if (App.shiftMoment) App.shiftMoment('start', opts && opts.at); else root.Fx.celebrate('start');
    UI.toast('המשמרת התחילה. בהצלחה!');
    App.askNotifyPermission();
  });
  /** Ends the running shift now, or at endAt (an earlier moment: "end at 16:10" for a shift left running). One end at
   *  a time: a second tap while the first is saving saved the same shift twice. */
  let stopping = false;
  App.stopShift = async function (at, endAt, opts) {
    const a = S.activeShift;
    if (!a || stopping) return;
    stopping = true;
    let sh = null;
    try { sh = await saveStop(a, endAt, opts); } finally { stopping = false; }
    if (sh) return afterStop(a, sh, at, endAt);
  };
  /** The end itself: the shift saved and the timer off. Returns the saved shift (null: one under a minute, not kept). */
  async function saveStop(a, endAt, opts) {
    const end = endAt && endAt > a.start && endAt < Date.now() ? endAt : Date.now();
    // breaks after the end are dropped, one still open closes at the end
    if (a.breaks && a.breaks.length) a.breaks = a.breaks.filter((b) => b.from < end).map((b) => ({ from: b.from, to: Math.min(b.to || end, end) }));
    const sh = App.activeAsShift(end, true);
    sh.id = U.uid();
    if ((sh.end - sh.start) < 60000) {
      const ok = await UI.confirm('משמרת קצרה מאוד', 'המשמרת נמשכה פחות מדקה. לשמור בכל זאת?', 'שמור');
      if (!ok) { await Store.setActive(null); return null; }
    }
    const ops = [{ store: 'shifts', put: sh }];
    const planned = a.fromPlanned && App.shift(a.fromPlanned);
    if (planned && planned.status === 'planned') ops.push({ store: 'shifts', del: planned.id });
    await Store.apply(ops, 'סיום משמרת', { via: opts && opts.widget ? 'widget' : 'timer' }); // (via: for the signed shift log)
    App.justStopped = Date.now(); // the start button springs back in
    await Store.setActive(null);
    return sh;
  }
  /** What follows an end: the moment, the toast, a forgotten timer's question, the shift's screen. */
  async function afterStop(a, sh, at, endAt) {
    // a timer that kept running (the phone in a pocket, a forgotten stop): it is saved, so nothing is
    // lost, and the end time can be fixed right away (no moment for its wage then: it may be wrong)
    const hours = (sh.end - sh.start) / U.HOUR;
    const usual = App.usualShiftMs(a.roleId);
    const muchLonger = usual && sh.end - sh.start > Math.max(usual * 1.6, usual + 3 * U.HOUR);
    const forgot = !endAt && (hours > (+S.settings.alerts.suspiciousHours || 20) || muchLonger);
    const first = S.shifts.filter((x) => x.status === 'done').length === 1 && !(S.meta.celebrated || {})['first-shift'];
    // 23:00 to 06:00: no ka-ching, no coins, no medal's confetti (people around may be asleep). With the moment's card
    // (shift-end.js) the ka-ching and a buzz only: coins and confetti flew over its text and it is meant to be calm
    const quiet = !!(root.Moments && root.Moments.quietHour(Date.now()));
    const calm = !forgot && !!App.endMoment;
    if (quiet || calm) App.quietUntil = Date.now() + 5000;
    if (quiet) { /* nothing */ } else if (calm && root.Fx) { root.Fx.play('cash'); setTimeout(() => root.Fx.play('success'), 280); root.Fx.haptic([10, 40, 10, 40, 20]); }
    else if (App.shiftMoment) App.shiftMoment('stop', at); else root.Fx.celebrate('big');
    App.milestones();
    const r = App.result(sh.id);
    if (!forgot && App.endMoment) {
      if (first) App.celebrateOnce('first-shift', () => {}); // said on the moment itself
      const how = await App.endMoment(r, { first });
      if (how !== 'done') { if (how === 'gone' && App.reviewAfterShift) App.reviewAfterShift(); return; }
    } else {
      if (S.shifts.filter((x) => x.status === 'done').length === 1) App.celebrateOnce('first-shift', () => UI.toast('המשמרת הראשונה שלך נשמרה! 🎉'));
      UI.toast(`נשמר: ${U.hm(r ? r.paidMin : 0)} שעות · ${U.money(r ? r.wage : 0)}`, { label: 'ביטול', fn: App.undo }, { ok: true });
    }
    if (forgot) {
      const fix = await UI.confirm('שכחת לעצור?', `הטיימר רץ ${U.num(hours, 1)} שעות, מ-${U.fmtDate(U.epochKey(sh.start), 'short')} ב-${U.epochHM(sh.start)}${usual ? `, ובדרך כלל המשמרות שלך נמשכות כ-${U.hm(Math.round(usual / 60000))}` : ''}. אפשר לתקן עכשיו את שעת הסיום.`, 'לתקן');
      if (fix && App.sheetsApi.shiftEditor) { App.sheetsApi.shiftEditor(sh.id); return; }
    }
    App.sheetsApi.shiftDetail && App.sheetsApi.shiftDetail(sh.id);
    if (App.reviewAfterShift) App.reviewAfterShift(); // a good moment, once that screen is closed
  }
  App.toggleBreak = async function (at) {
    const a = Object.assign({}, S.activeShift);
    a.breaks = (a.breaks || []).slice();
    const last = a.breaks[a.breaks.length - 1];
    if (last && !last.to) { last.to = Date.now(); UI.toast('חזרת מהפסקה'); if (App.shiftMoment) App.shiftMoment('resume', at); }
    else { a.breaks.push({ from: Date.now() }); UI.toast('הפסקה: הזמן לא נספר'); if (App.shiftMoment) App.shiftMoment('pause', at); }
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
  App.pushNote = (n) => push(n); // youth-guard.js: a reminder while a shift runs
  async function push(n) {
    if (!S.settings.alerts.push || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const opt = { body: n.body, tag: n.key, icon: 'icon-192.png', badge: 'badge-96.png', lang: U.LANG, dir: U.RTL ? 'rtl' : 'ltr', data: { url: './#home' } };
      // the shift reminders as the user set them: staying until closed, or silent
      const R = S.settings.alerts.reminders || {};
      const shiftNote = n.type === 'upcoming' || n.type === 'confirmDone';
      if (shiftNote) {
        if (R.sticky) opt.requireInteraction = true;
        if (R.silent) opt.silent = true;
        // the offline worker may have shown this one already, while the app was closed: once is enough
        if (await App.shownNote(n.key)) return;
      }
      if (reg) await reg.showNotification(n.title, opt); else new Notification(n.title, opt);
      if (shiftNote) App.shownNote(n.key, true);
    } catch (e) { console.warn(e); }
  }
  /** The shift reminders shown, shared with the offline worker (sw.js reads and writes the same list). */
  App.shownNote = async function (tag, mark) {
    try {
      const c = await caches.open('shiftpay-shown');
      const r = await c.match('./__shown');
      const list = r ? await r.json() : {};
      if (!mark) return !!list[tag];
      list[tag] = Date.now();
      // a week is enough to remember
      for (const k of Object.keys(list)) if (Date.now() - list[k] > 7 * U.DAY) delete list[k];
      await c.put('./__shown', new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json' } }));
      return true;
    } catch (e) { return false; }
  };
  /* Notifications: as few as possible (1.18, the owner's wish). Kept: the weekly and the monthly summary,
   * good news (a record, a goal reached, a birthday), and three that guard the user's own data or come once a
   * month (a timer left running, a backup due, payday's payslip). Never a notification that something is "not
   * legal" (minimum wage, the youth law, rest, long days, hours in a week, a payslip gap), and no nagging (more
   * hours than usual, no shift for a week, overlaps). The engine still finds those; they show where they belong
   * (the payslip check, the rights screen, the shift itself), not as notifications. A reminder before a planned
   * shift only when switched on in Settings. */
  const NOTIFY = new Set(['taxrefund', 'plusend', 'weekly', 'monthly', 'record', 'goal', 'birthday', 'timer', 'backup', 'payslipDue', 'upcoming', 'confirmDone', 'holidayPay']);
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
      body: `${t.shifts === 1 ? 'משמרת אחת' : `${t.shifts} משמרות`} · ${U.num(t.hours, 1)} שעות · ${U.money(t.gross, 0)} ברוטו. לחצו לסיפור של החודש.`,
    };
  }
  const insightsNow = () => Insights.run(App.model, {
    now: Date.now(), activeShift: S.activeShift, payslips: S.payslips, gaps: S.gaps,
    // with cloud sync the data is already safe; the backup reminder only applies to local-only use
    lastBackup: S.meta.cloudUid ? Date.now() : S.settings.backup.lastBackup, roleName: App.roleName,
    // how long this person's shifts usually last: the "forgot to end it?" reminder comes sooner for short shifts
    usualShiftMs: S.activeShift ? App.usualShiftMs(S.activeShift.roleId) : 0,
  });
  // one run at a time (a timer, the 5-minute check and a pull-to-refresh at once): two runs both found the same new
  // alert and showed the phone's notification for it twice. A call during a run runs once more after it.
  let insightsRun = null, insightsAgain = false;
  App.runInsights = function () {
    if (insightsRun) { insightsAgain = true; return insightsRun; }
    insightsRun = runInsights().finally(() => { insightsRun = null; if (insightsAgain) { insightsAgain = false; App.runInsights(); } });
    return insightsRun;
  };
  async function runInsights() {
    if (!App.model || !S.settings.onboarded) return;
    const res = insightsNow();
    App.insights = res;
    const month = monthlyAlert();
    const refund = App.taxRefundAlert ? App.taxRefundAlert() : null; // a past year that looks like it holds a refund
    const plusEnd = root.Plus && root.Plus.endAlert ? root.Plus.endAlert() : null; // the trial or the gift ends tomorrow
    // that year's alert already there: its amount kept current, read or not (it is never sent twice)
    const stale = refund && S.notifications.find((n) => n.key === refund.key && (n.title !== refund.title || n.body !== refund.body));
    if (stale) await Store.apply([{ store: 'notifications', put: Object.assign({}, stale, { title: refund.title, body: refund.body }) }], null);
    const wanted = res.alerts.filter(notifiable).concat(month && notifiable(month) ? [month] : []).concat(refund && notifiable(refund) ? [refund] : []).concat(plusEnd && notifiable(plusEnd) ? [plusEnd] : []);
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
  }
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
  // after 5 wrong codes each further mistake makes you wait longer (30 s, 1 min, 2 min…). The count and the wait
  // are kept on the phone: in memory alone, closing and reopening the app gave 5 fresh guesses each time
  // (security scan, 1 Nov 2026)
  const PIN_KEY = 'shaati.pinFails';
  let pinFails = 0, pinWaitUntil = 0;
  try { const p = JSON.parse(localStorage.getItem(PIN_KEY) || '{}'); pinFails = +p.f || 0; pinWaitUntil = +p.until || 0; } catch (e) { /* none kept */ }
  const keepPinFails = () => { try { if (pinFails) localStorage.setItem(PIN_KEY, JSON.stringify({ f: pinFails, until: pinWaitUntil })); else localStorage.removeItem(PIN_KEY); } catch (e) { /* private mode */ } };
  App.lock = function () {
    const L = S.settings.lock;
    if (!L.enabled || document.getElementById('lock')) return;
    // the lock screen: the sky header greets by name (as the opening does), the keypad is on the sheet
    const el = document.createElement('div');
    el.className = 'lock skyscreen'; el.id = 'lock';
    el.innerHTML = `${App.skyHead({ who: true })}<div class="w-sheet lock-sheet"></div>`;
    const body = el.querySelector('.lock-sheet');
    let pin = '';
    // unlocking fades the lock screen away (removed at once, it was a hard cut to the app)
    const unlock = () => {
      if (el.classList.contains('out')) return;
      el.classList.add('out'); setTimeout(() => el.remove(), 260); S.meta._unlockedAt = Date.now(); pinFails = 0; pinWaitUntil = 0; keepPinFails();
      UI.syncInert();
      for (const fn of unlockWaits.splice(0)) { try { fn(); } catch (e) { console.warn('after unlock', e); } }
    };
    const tryBio = async () => { try { if (await App.bio.verify(L.bioId)) unlock(); } catch (e) { /* cancelled: the code still works */ } };
    const draw = () => {
      const wait = Math.ceil((pinWaitUntil - Date.now()) / 1000);
      body.innerHTML = `<h2 style="--i:0">${icon('lock', 's')} האפליקציה נעולה</h2><div class="small muted lock-say" style="--i:0">${wait > 0 ? `יותר מדי ניסיונות. נסה שוב בעוד ${wait} שניות` : 'הזן קוד'}</div>
        <div class="pin-dots" style="--i:1">${[0, 1, 2, 3, 4, 5, 6, 7].slice(0, Math.max(4, (L.len || 4))).map((i) => `<i class="${i < pin.length ? 'f' : ''}"></i>`).join('')}</div>
        <div class="pin-pad" style="--i:2">${[1, 2, 3, 4, 5, 6, 7, 8, 9, L.bioId ? 'bio' : '', 0, '⌫'].map((k) => k === '' ? '<span></span>' : k === 'bio' ? `<button data-bio aria-label="פתח בטביעת אצבע">${icon('finger')}</button>` : `<button data-k="${k}" ${wait > 0 ? 'disabled' : ''}>${k}</button>`).join('')}</div>`;
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
            keepPinFails();
            draw(); el.querySelector('.pin-dots').classList.add('shake'); UI.vibrate(80);
          }
        }
      }));
    };
    draw();
    document.body.appendChild(el);
    UI.syncInert();
    if (App.mountSky) App.mountSky(el, true);
    if (L.bioId) setTimeout(tryBio, 300);
  };
  /** Runs fn now, or once the code lock is opened (a shortcut such as ?action=add waits for the code). */
  const unlockWaits = [];
  App.locked = () => { const l = document.getElementById('lock'); return !!l && !l.classList.contains('out'); };
  App.afterUnlock = (fn) => { if (App.locked()) unlockWaits.push(fn); else fn(); };
  /** Before the lock is turned off, its code changed or the fingerprint switched on or off: the current code (or the
   *  fingerprint), with the lock screen's count of wrong codes and its wait. An open phone in someone else's hand could
   *  turn the lock off or set a code of their own (security scan, 2 Nov 2026). true = go on. */
  App.checkPin = async function () {
    const L = S.settings.lock;
    if (!L || !L.enabled || !L.hash) return true;
    if (L.bioId) { try { if (await App.bio.verify(L.bioId)) return true; } catch (e) { /* cancelled: the code still works */ } }
    const wait = Math.ceil((pinWaitUntil - Date.now()) / 1000);
    if (wait > 0) { UI.invalid(`יותר מדי ניסיונות. נסה שוב בעוד ${wait} שניות`); return false; }
    const pin = await UI.promptText('הקוד הנוכחי', 'כדי לשנות את הנעילה', '', { type: 'password', inputmode: 'numeric', ltr: true, ok: 'המשך' });
    if (!pin) return false;
    if ((await App.hashPin(pin, L.salt)) === L.hash) { pinFails = 0; pinWaitUntil = 0; keepPinFails(); return true; }
    pinFails++;
    if (pinFails >= 5) pinWaitUntil = Date.now() + 30000 * Math.pow(2, Math.min(pinFails - 5, 5));
    keepPinFails();
    UI.invalid('הקוד שגוי');
    return false;
  };
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else {
      const L = S.settings && S.settings.lock;
      // "מיד" stores 0, which `|| 1` once turned into a minute; 0 now locks on any return after a few seconds away
      const t = L && Number.isFinite(+L.timeoutMin) && L.timeoutMin !== '' && L.timeoutMin != null ? +L.timeoutMin : 1;
      if (L && L.enabled && Date.now() - hiddenAt >= Math.max(t * 60000, 3000)) App.lock();
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
      // the message must be seen: not under the first doors
      const lp = document.getElementById('lp-static'); if (lp) lp.remove();
      document.documentElement.classList.remove('lp-first', 'lp-open');
      document.getElementById('view').innerHTML = `<div class="view">${UI.emptyState('alert', 'לא ניתן לפתוח את מסד הנתונים', esc(e.message || e))}</div>`;
      return;
    }
    // the first doors (the language) open only on the very first open of a signed-out app with no language chosen. This
    // one value decides both: whether they open (below) and whether the doors written into the page go now (unseen,
    // under the opening show); two conditions that could differ left them covering the screen (tests without sign-in)
    App.needDoors = !!(root.FIREBASE_CONFIG && !S.meta.cloudUid && root.Lang && !root.Lang.stored() && !S.settings.onboarded);
    if (!App.needDoors) {
      const lp = document.getElementById('lp-static');
      if (lp) lp.remove();
      document.documentElement.classList.remove('lp-first', 'lp-open');
    }
    // the heavy start-up below waits for the opening show's logo to finish drawing (about 0.8 s): that drawing is
    // the one part of the show the main thread paints, and a busy start-up froze it halfway on slow phones
    if (root.Intro && root.Intro.drawn) await root.Intro.drawn();
    // the sign-in's code downloads from here on (before, it started with the page and the first screen's paint waited on
    // three large files; on a first open Google is needed only at the end of the questions, a returning user's account
    // reconnects behind the screen)
    if (root.Cloud && root.Cloud.preload) root.Cloud.preload();
    // the tax brackets follow the law of each tax year: a stored table that is some year's own (a default an earlier
    // version saved) becomes this year's, so the settings show what is used; a table the user typed stays theirs
    {
      const T = S.settings.tax, law = Engine.taxLaw(T, U.todayKey());
      if (T && !law.own.brackets && JSON.stringify(T.brackets) !== JSON.stringify(law.brackets.map(([u, p]) => [u, p]))) await Store.setSettings((s) => { s.tax.brackets = law.brackets.map(([u, p]) => [u, p]); });
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
    // midnight & gold (v4): the untouched default colour moves to the opening show's navy, once
    if (!S.meta.designV4) {
      if (S.settings.accent === 'candy') await Store.setSettings((s) => { s.accent = 'midnight'; });
      await Store.setMeta({ designV4: true });
    }
    // the admin of this account, as this phone last heard it (checked again once the account connects)
    App.isAdmin = !!S.meta.adminUid && S.meta.adminUid === S.meta.cloudUid;
    App.applyTheme();
    App.recompute();
    registerSW(); // offline support from the very first visit, before onboarding
    // the weather for the next opening's sky, asked once the show has gone (at most once an hour; the city only)
    if (root.Sky) (root.Intro ? root.Intro.after : (fn, d) => setTimeout(fn, d))(() => root.Sky.refreshWeather(), 2500);
    if (S.settings.lock.enabled) App.lock();
    const params = new URLSearchParams(location.search);
    // opened from the Android app (Trusted Web Activity): remembered for this session
    try { if (params.get('source') === 'twa' || document.referrer.startsWith('android-app://')) sessionStorage.setItem('androidApp', '1'); } catch (e) { /* ignore */ }
    try { App.androidApp = sessionStorage.getItem('androidApp') === '1'; } catch (e) { App.androidApp = false; }
    App.pendingAction = params.get('action');
    App.pendingTag = root.Nfc ? root.Nfc.readOpen(location.search) : null; // ?action=nfc&tag=… (a touch on an NFC sticker)
    if (App.pendingAction) history.replaceState(null, '', location.pathname + location.hash);

    // Google sign-in is required. Nothing on screen waits for Google to load: a returning user goes
    // straight in (the account reconnects in the background), a new user starts the setup questions
    // right away while Google loads behind them (it's needed only at the last step).
    const Cloud = root.Cloud;
    if (!root.FIREBASE_CONFIG) { App.localOnly = true; App.afterLogin(); return; } // a copy without sign-in (tests)
    Cloud.onAuthChange = (u) => { if (!u && S.meta.cloudUid) App.showLogin('expired'); };
    if (S.meta.cloudUid) {
      // A returning user opens at once with what is on the phone (the app works offline anyway); the account
      // reconnects behind it, and what it brings lands in place (screens are patched, not drawn anew). Waiting for
      // it — up to 4 s, then up to 2.5 s more for the sync — kept the opening show turning on a slow network ("the
      // intro is stuck", 2026-10-29; qa/intro-wait-test.js).
      App.afterLogin();
      const reconnect = () => Cloud.start().then(async (user) => {
        if (!user) { App.showLogin('expired'); return; }
        if (S.meta.cloudUid !== user.uid) {
          // another account signed in on this browser: it takes over (Cloud.connect never mixes two accounts)
          try { await Cloud.connect(user); } catch (e) { console.error(e); App.showLogin(navigator.onLine ? 'error' : 'offline'); return; }
          App.recompute();
          App.rerender();
          return;
        }
        await Cloud.connect(user).then(() => Cloud.adminCheck).catch((e) => console.warn('sync', e));
        if (root.Stats) root.Stats.report(); // the open's statistics wait for the account
      }).catch((e) => {
        // no network now: the app goes on with what is on the phone, and connects once it is back
        console.warn('sign-in', e);
        root.addEventListener('online', () => reconnect(), { once: true });
      });
      reconnect();
      return;
    }
    // a guest (no account, by choice): the app at once, its data on this phone only. A sign-in they started from the
    // settings and that came back here (Google's full-page way) finishes now, and their data goes up to the account.
    if (S.meta.guest && S.settings.onboarded) {
      App.localOnly = true;
      App.afterLogin();
      Cloud.start().then(async (user) => {
        if (!user || S.meta.cloudUid) return;
        await Cloud.connect(user);
        App.localOnly = false;
        App.recompute();
        App.rerender();
      }).catch((e) => console.warn('sign-in', e));
      return;
    }
    // nobody has signed in on this phone yet
    const starting = Cloud.start().catch((e) => { console.warn('sign-in not available yet', e); return null; });
    // the very first open: which language (another one reopens the app in it)
    if (App.needDoors) await root.Lang.firstRun();
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
    if (root.Lang && S.settings.onboarded) root.Lang.adopt();
    if (root.Stats) { root.Stats.markActive().then(() => root.Stats.report()); }
    document.getElementById('nav').style.display = '';
    if (!S.settings.onboarded) { App.sheetsApi.onboarding(); return; }
    const hash = (location.hash || '').replace('#', '');
    if (['home', 'calendar', 'reports', 'settings'].includes(hash)) App.tab = hash;
    // a returning user's first open in a session: the opening's quick actions are drawn first, in a frame of their own,
    // and the home screen under the show after it. Drawn together, in one long piece of work (half a second on a
    // phone), the actions could come only once the home screen was done too, and the sheet rose empty and stood still
    // before they came (6 Nov 2026, tests/e2e/opening.js). Now intro.js puts them on with the sheet's rise.
    const I = root.Intro;
    if (!quickFirst && I && I.quick && I.covering && I.covering() && App.quickOpen) {
      quickFirst = true;
      App.quickOpen();
      requestAnimationFrame(() => setTimeout(firstScreen, 0));
      return;
    }
    firstScreen();
  };
  let quickFirst = false;
  /** The first screen of a signed-in user, and what starts with it. */
  function firstScreen() {
    // the first screen is drawn whole: what the insights add to it (the month's forecast on the pay card) used
    // to come a second later with a redraw, and the card grew a line just after the opening show
    if (!App.insights && App.model) { try { App.insights = insightsNow(); } catch (e) { console.warn('insights', e); } }
    App.render();
    const action = App.pendingAction;
    App.pendingAction = null;
    // done once: a reload (or the browser's own restore) must never start or end a shift again
    if (action) { try { const u = new URL(location.href); u.searchParams.delete('action'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) { /* ignore */ } }
    // the widget's start and end buttons open these links, but so could any other site: the shift changes only
    // after one tap here (a link once ended a running shift with no question; security scan, 1 Nov 2026)
    // with the code lock up, the shortcut waits for the code (the shift editor once opened under the lock)
    if (action) App.afterUnlock(() => {
      if (action === 'start' && !S.activeShift) UI.confirm('התחל משמרת', '', 'התחלה').then((ok) => { if (ok && !S.activeShift) App.actions['timer-start'](); });
      if (action === 'stop' && S.activeShift) UI.confirm('סיום משמרת', '', 'סיום').then((ok) => { if (ok && S.activeShift) App.stopShift(); });
      if (action === 'nfc' && App.nfcOpen) App.nfcOpen(App.pendingTag || ''); // a touch on the NFC sticker at work (app/nfc.js): starts or ends a shift
      if (action === 'add') App.sheetsApi.shiftEditor();
      if (action === 'schedule' && App.importSchedule) App.importSchedule(); // the app icon's shortcut
      if (action === 'share-in' && App.receiveShare) App.receiveShare(); // shared to the app (sw.js)
      if (action === 'support' && App.actions.support) setTimeout(() => App.actions.support(), 300); // Play testers' feedback link
      if (action === 'plus' && root.Plus) setTimeout(() => root.Plus.sheet(), 600); // back from the web checkout (?action=plus): straight to the code field
      if (action === 'tax-refund' && App.actions['tax-refund']) setTimeout(() => App.actions['tax-refund']({ dataset: {} }), 600); // the website's tax refund page
    });
    setTimeout(() => { App.runInsights(); App.autoBackupCheck(); }, 1200);
    // is Shaati Plus for sale here, and owned? (Google Play, Android app only) The opening show does not wait for
    // the answer: the design in use is kept on the phone (meta.plus), so the first screen already has it, and the
    // answer only confirms it (Google Play can take seconds). It waits for the fonts (kept offline, at once).
    const Intro = root.Intro;
    if (root.Plus) root.Plus.init().catch(() => {});
    if (Intro && Intro.hold && document.fonts && document.fonts.ready) requestAnimationFrame(() => Intro.hold(document.fonts.ready));
    if (App.whatsNew) App.whatsNew();
    if (root.FriendsView) root.FriendsView.boot(); // an invitation that came with the address, accepted ones of mine
    if (root.Invite) root.Invite.boot(); // a month of Plus for inviting a friend (or being invited)
    if (root.WorkplaceCode) root.WorkplaceCode.boot(); // a workplace code that came with the address (its rules, to check and apply)
  }
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
        // a page newer than the files kept here (a browser visit gets the live page first) waits for its own
        // version to install; starting over now would open the older copy
        const ver = (b) => String(b).replace('shiftpay-shell-', '').split('-')[0].split('.').map(Number);
        const kept = ver(shells[0]), mine = ver(window.APP_BUILD);
        for (let i = 0; i < 3; i++) if ((kept[i] || 0) !== (mine[i] || 0)) { if ((kept[i] || 0) < (mine[i] || 0)) return; break; }
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
  // the code comes in after the first frame (index.html's loader), so the page may be parsed already
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.boot()); else App.boot();
})(typeof window !== 'undefined' ? window : globalThis);
