/* ============================================================
 * views-login.js — mandatory Google sign-in screen and the
 * "account & sync" settings section.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Store, UI, App, Cloud } = root;
  const S = Store.S;
  const { icon, esc } = UI;

  const GOOGLE_G = '<svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

  App.googleIcon = GOOGLE_G;

  /* ---------------- browsers inside other apps ----------------
   * Instagram, Facebook, TikTok, Snapchat, Telegram and similar apps open links in their own
   * built-in browser, and Google does not allow signing in there. Those visitors get a clear
   * way out: open the app in Chrome / Safari. */
  App.inAppBrowser = function () {
    const ua = navigator.userAgent || '';
    if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|Bytedance|LinkedInApp|Twitter|Pinterest|KAKAOTALK|MicroMessenger|Telegram/i.test(ua)) return true;
    if (/Android/i.test(ua) && /; wv\)/.test(ua) && !App.androidApp) return true; // an Android app's WebView
    // iPhone apps' web views have no "Safari/" in the name (Chrome = CriOS, Firefox = FxiOS); the home-screen app is fine
    if (/iPhone|iPad|iPod/i.test(ua) && !/Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua) && !navigator.standalone) return true;
    return false;
  };
  const isAndroid = () => /Android/i.test(navigator.userAgent || '');
  /** "Open in Chrome" for Android (an intent link), step-by-step words for iPhone, and copy-the-link. */
  App.openInBrowserCard = function () {
    const url = location.origin + location.pathname;
    const intent = 'intent://' + location.host + location.pathname + '#Intent;scheme=https;action=android.intent.action.VIEW;S.browser_fallback_url=' + encodeURIComponent(url) + ';end';
    return `<div class="card iab-card">
      <div class="iab-t">${icon('alert', 's')} פתחת את האפליקציה מתוך אפליקציה אחרת</div>
      <div class="small">Google לא מאפשרת להתחבר מכאן. פותחים בדפדפן ומתחברים בשנייה:</div>
      ${isAndroid() ? `<a class="btn block" href="${esc(intent)}" target="_blank" rel="noopener">${icon('share', 's')} פתח ב-\u2060Chrome</a>`
        : `<ol class="iab-steps"><li>לוחצים על <b>⋯</b> או על <b>⎋</b> בפינת המסך</li><li>בוחרים <b>"פתח ב-\u2060Safari"</b> / <b>"Open in browser"</b></li></ol>`}
      <button class="btn tonal block" data-copy-link>${icon('copy', 's')} העתק את הקישור</button>
    </div>`;
  };
  App.bindOpenInBrowser = function (el) {
    const b = el.querySelector('[data-copy-link]');
    if (b) b.onclick = async () => { await UI.copyText(location.origin + location.pathname); UI.toast('הקישור הועתק. הדבק אותו בדפדפן 👍'); };
  };

  /* ---------------- the header of the first screens: the living sky (sky.js) ----------------
   * The welcome screen and the sign-in screen open under the opening show, which draws this same header in the same
   * places (intro.js): the scene is the show's own (the same moment, city and weather), so the hand-over is unseen. */
  const LOGO = '<svg class="sh-logo" viewBox="0 0 1024 1024" aria-hidden="true"><path class="g" d="M300 660 A258 258 0 0 1 603 271 L603 600"/><path class="y" d="M420 422 L420 753 A258 258 0 0 0 720 362"/></svg>';
  const scene = () => {
    const I = root.Intro;
    if (I && I.covering && I.covering() && I.scene) return I.scene;
    const Sky = root.Sky, p = Sky ? Sky.prefs() : {};
    return { now: Date.now(), place: p.place, weather: Sky ? Sky.weatherNow(p) : 'clear' };
  };
  /** The header: the sky, the logo and the greeting. o.who: a returning user's own (their first name and the date,
   * as the opening shows them); otherwise "Shaati" and the app's promise. */
  App.skyHead = function (o) {
    const sc = scene(), Sky = root.Sky;
    const who = o && o.who && Sky;
    const title = who ? Sky.firstName(S.settings.userName) || 'Shaati' : 'Shaati';
    const sub = who ? Sky.dateLine(sc.now) : 'כמה מגיע לך על כל שעה';
    return `<div class="skyhead">${'<svg class="sky" aria-hidden="true"></svg>'}${LOGO}<div class="sh-text"><div class="sh-hello">${esc(Sky ? Sky.greeting(sc.now) : '')}</div><h1 class="sh-title">${esc(title)}</h1><div class="sh-sub">${esc(sub)}</div></div></div>`;
  };
  /** Draws the sky into a screen made with App.skyHead, and brings its sheet's content in: as the opening show hands
   * over (it covers the screen now), or on its own (first: true, a screen opened later); a redraw just stays. */
  App.mountSky = function (host, first) {
    const svg = host.querySelector('.skyhead .sky'), scr = host.classList.contains('skyscreen') ? host : host.querySelector('.skyscreen');
    if (svg && root.Sky) { try { svg.parentNode.dataset.phase = root.Sky.render(svg, scene()).phase; } catch (e) { console.warn('sky', e); } }
    if (!scr) return;
    const I = root.Intro;
    if (I && I.covering && I.covering()) {
      scr.classList.add('await');
      I.onLeave(() => { scr.classList.remove('await'); scr.classList.add('enter'); if (!I.full) scr.classList.add('solo'); setTimeout(() => scr.classList.add('entered'), 700); });
    } else if (first) { scr.classList.add('enter', 'solo'); setTimeout(() => scr.classList.add('entered'), 700); }
  };

  /* ---------------- signing in with an email link ---------------- */
  /** Asks for the email and sends the sign-in link. true when it was sent. */
  App.emailSignIn = async function () {
    const v = await UI.dialog({
      title: 'התחברות עם אימייל',
      html: `<p class="small muted" style="margin-top:0">נשלח לך קישור. לוחצים עליו בטלפון הזה ומחוברים, בלי סיסמה.</p>
        <label class="field"><span class="lbl">האימייל שלך</span><input class="input ltr" type="email" name="email" autocomplete="email" inputmode="email" placeholder="name@example.com" maxlength="100"></label>`,
      buttons: [{ label: 'ביטול', value: null }, { label: 'שליחת קישור', value: 'form' }],
    });
    if (!v) return false;
    const email = String(v.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { UI.invalid('כתובת האימייל לא נראית תקינה'); return false; }
    try { await Cloud.sendEmailLink(email); } catch (e) { console.warn('email link', e); UI.invalid(Cloud.errorText(e)); return false; }
    if (root.Fx) root.Fx.play('pick');
    await UI.dialog({ title: 'שלחנו לך קישור 📬', html: `<p style="margin-top:0">שלחנו קישור התחברות ל-<b dir="ltr">${esc(email)}</b>.</p><p class="small muted">פותחים את המייל בטלפון הזה ולוחצים על הקישור. לא הגיע תוך דקה? כדאי לבדוק גם בספאם.</p>`, buttons: [{ label: 'הבנתי', value: true }] });
    return true;
  };

  /* ---------------- signing in with an email and a password ---------------- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  let lastEmail = '';
  /** Asks for an email and a password and signs in (mode 'new': opens a new account; it can switch to signing in).
   * Resolves with the user, or null when given up. Errors are shown here and the form opens again. */
  App.emailPassword = async function (mode) {
    let isNew = mode === 'new', note = '';
    for (;;) {
      const v = await UI.dialog({
        title: isNew ? 'חשבון חדש עם אימייל' : 'התחברות עם אימייל וסיסמה',
        html: `${note ? `<div class="banner warn" style="margin-top:0">${icon('alert')}<div>${esc(note)}</div></div>` : ''}
          <label class="field"><span class="lbl">אימייל</span><input class="input ltr" type="email" name="email" autocomplete="email" inputmode="email" placeholder="name@example.com" maxlength="100" value="${esc(lastEmail)}"></label>
          <label class="field"><span class="lbl">${isNew ? 'סיסמה חדשה (8 תווים לפחות)' : 'סיסמה'}</span><input class="input ltr" type="password" name="password" autocomplete="${isNew ? 'new-password' : 'current-password'}" maxlength="128"></label>`,
        buttons: [{ label: 'ביטול', value: null }, isNew ? { label: 'כבר יש לי חשבון', value: 'switch' } : { label: 'שכחתי סיסמה', value: 'forgot' }, { label: isNew ? 'יצירת חשבון' : 'התחברות', value: 'form' }],
      });
      if (!v) return null;
      if (v === 'switch') { isNew = false; note = ''; continue; }
      if (v === 'forgot') {
        const e = String((await UI.promptText('איפוס סיסמה', 'האימייל של החשבון', lastEmail, { type: 'email', inputmode: 'email', ltr: true, ok: 'שליחת קישור' })) || '').trim();
        if (!e) continue;
        if (!EMAIL_RE.test(e)) { note = 'כתובת האימייל לא נראית תקינה'; continue; }
        lastEmail = e;
        try { await Cloud.resetPassword(e); note = ''; UI.toast('שלחנו קישור לבחירת סיסמה חדשה ל-' + e); } catch (x) { note = Cloud.errorText(x); }
        continue;
      }
      const email = String(v.email || '').trim(), pass = String(v.password || '');
      lastEmail = email;
      if (!EMAIL_RE.test(email)) { note = 'כתובת האימייל לא נראית תקינה'; continue; }
      if (!pass) { note = 'צריך להקליד סיסמה'; continue; }
      if (isNew && pass.length < 8) { note = 'הסיסמה קצרה מדי. בחרו סיסמה של 8 תווים לפחות.'; continue; }
      try { return await Cloud.signInEmail(email, pass, isNew); } catch (x) {
        console.warn('email sign-in', x);
        note = Cloud.errorText(x);
        // an email that already has an account: the form turns to signing in to it
        if (x && x.code === 'auth/email-already-in-use') isNew = false;
      }
    }
  };

  /* ---------------- using the app as a guest ---------------- */
  /** No account, by choice: everything stays on this phone (and goes with the app). true when chosen. */
  App.startGuest = async function () {
    const ok = await UI.dialog({
      title: 'להמשיך כאורח?',
      html: `<p style="margin-top:0">כאורח, כל מה שרושמים נשמר רק בטלפון הזה.</p>
        <p class="small muted">מחיקת האפליקציה, או ניקוי הנתונים של הדפדפן, מוחקים את הכול. כדי לשמור, מתחברים לחשבון מתי שרוצים, בהגדרות, וכל מה שכבר רשמתם עולה אליו.</p>`,
      buttons: [{ label: 'חזרה', value: false }, { label: 'להמשיך כאורח', value: true }],
    });
    if (!ok) return false;
    await Store.setMeta({ guest: true });
    App.localOnly = true;
    return true;
  };
  /** The other sign-in services that are turned on (firebase-config.js), as buttons: data-provider="id". */
  const PROVIDER_NAMES = { 'microsoft.com': 'Microsoft', 'github.com': 'GitHub', 'apple.com': 'Apple', 'yahoo.com': 'Yahoo' };
  App.providerButtons = (busy) => (root.AUTH_PROVIDERS || []).filter((id) => PROVIDER_NAMES[id]).map((id) => `<button class="btn tonal" data-provider="${esc(id)}" ${busy ? 'disabled' : ''}>התחברות עם ${PROVIDER_NAMES[id]}</button>`).join('');

  /* ---------------- login screen ---------------- */
  App.showLogin = function (reason) {
    if (App.rememberSky) App.rememberSky(); // the next opening comes to this screen
    const nav = document.getElementById('nav');
    nav.style.display = 'none';
    App.blocking = 'login';
    const v = document.getElementById('view');
    let busy = false, failedLoad = false, blocked = false, firstDraw = true;
    const draw = (msg, isErr) => {
      // the Google window may only open straight from the tap, so the button waits until Google is loaded
      const ready = Cloud.sdkReady();
      const label = busy ? 'מתחבר…' : !ready && !failedLoad ? 'רגע, מכינים את Google…' : 'התחברות עם Google';
      v.innerHTML = `<div class="wizard login skyscreen">${App.skyHead()}<div class="w-sheet" style="text-align:center">
        <h2 style="--i:0">כניסה לחשבון</h2>
        <p class="lead" style="--i:1">מתחברים עם Google${root.AUTH_EMAIL_LINK || root.AUTH_EMAIL_PASSWORD ? ' או עם אימייל' : ''}, וכל מה שרשמת נשמר בחשבון שלך ומחכה לך בכל טלפון.</p>
        ${App.inAppBrowser() ? App.openInBrowserCard() : ''}
        ${S.shifts.length ? `<div class="banner" style="text-align:start">${icon('cloud')}<div>הנתונים שכבר יש בטלפון יעלו לחשבון שלך בהתחברות הראשונה.</div></div>` : ''}
        ${msg ? `<div class="banner ${isErr ? 'warn' : ''}" style="text-align:start">${icon(isErr ? 'alert' : 'info')}<div>${esc(msg)}</div></div>` : ''}
        <button class="btn big ob-google" data-google ${busy || (!ready && !failedLoad) ? 'disabled' : ''}>${GOOGLE_G}<span>${label}</span></button>
        ${blocked ? '<button class="btn text sm" data-redirect>לא נפתח חלון? התחברות בדרך אחרת</button>' : ''}
        ${root.AUTH_EMAIL_PASSWORD ? `<button class="btn tonal login-email" data-email-pass ${busy ? 'disabled' : ''}>${icon('mail', 's')} התחברות עם אימייל וסיסמה</button>` : ''}
        ${App.providerButtons(busy)}
        ${root.AUTH_EMAIL_LINK ? `<button class="btn tonal login-email" data-email>${icon('mail', 's')} התחברות עם אימייל, בלי סיסמה</button>` : ''}
        ${S.meta.cloudUid ? '' : `<button class="btn text sm" data-guest ${busy ? 'disabled' : ''}>להמשיך כאורח, בלי חשבון</button>`}
        <button class="btn text sm" data-act="support" style="margin-top:6px">${icon('info', 's')} בעיה בהתחברות? כתבו לנו</button>
        <div class="tiny muted" style="margin-top:8px">בהתחברות את/ה מאשר/ת את ${App.legalLinks ? App.legalLinks() : 'תנאי השימוש ומדיניות הפרטיות'}. <a href="#" data-legal="accessibility">הצהרת נגישות</a></div>
        <div class="tiny muted" style="margin-top:10px;line-height:1.6">${icon('shield', 's')} הנתונים שלך נשמרים בחשבון שלך באפליקציה, ומשתמשים אחרים לא רואים אותם. האפליקציה עובדת גם בלי אינטרנט, ומסנכרנת כשהרשת חוזרת.</div>
        </div></div>`;
      App.mountSky(v, firstDraw);
      firstDraw = false;
      v.querySelector('[data-google]').onclick = () => go(false);
      const em = v.querySelector('[data-email]');
      if (em) em.onclick = async () => { if (await App.emailSignIn()) show('שלחנו קישור למייל. פותחים אותו בטלפון הזה כדי להתחבר 📬'); };
      const ep = v.querySelector('[data-email-pass]');
      if (ep) ep.onclick = async () => { const user = await App.emailPassword('signin'); if (user) signedIn(Promise.resolve(user)); };
      v.querySelectorAll('[data-provider]').forEach((b) => { b.onclick = () => { let p; try { p = Cloud.signIn({ provider: b.dataset.provider }); } catch (e) { p = Promise.reject(e); } signedIn(p); }; });
      const gu = v.querySelector('[data-guest]');
      if (gu) gu.onclick = async () => {
        if (!(await App.startGuest())) return;
        App.blocking = null;
        // came here before the setup questions ("I already have an account"): the questions first, with no sign-in
        if (!S.settings.onboarded) { App.sheetsApi.onboarding({ preLogin: true }); return; }
        nav.style.display = '';
        App.afterLogin();
      };
      const rd = v.querySelector('[data-redirect]');
      if (rd) rd.onclick = () => go(true);
      App.bindOpenInBrowser(v);
    };
    let lastMsg = '', lastErr = false;
    const show = (m, e) => { lastMsg = m || ''; lastErr = !!e; draw(lastMsg, lastErr); };
    function go(redirect) {
      if (busy) return;
      // no awaiting before this call: the browser allows the Google window only straight from the tap
      let p;
      try { p = Cloud.signIn(redirect ? { redirect: true } : null); } catch (e) { p = Promise.reject(e); }
      signedIn(p);
    }
    /** After any way of signing in (Google, an email and a password, another service): connect, then the app. */
    function signedIn(p) {
      if (busy) return;
      busy = true; blocked = false; show('');
      p.then(async (user) => {
        if (!user) return; // full-page sign-in: the page comes back signed in
        show('מסנכרן את הנתונים…');
        await Cloud.connect(user);
        nav.style.display = '';
        App.blocking = null;
        App.afterLogin();
        UI.toast('מחובר כ-' + (user.displayName || user.email));
      }).catch((e) => {
        console.warn('sign-in', e);
        busy = false;
        blocked = e && e.code === 'auth/popup-blocked';
        show(blocked ? 'הדפדפן חסם את חלון ההתחברות של Google. לחצו שוב על הכפתור 👇' : Cloud.errorText(e), true);
      });
    }
    const MSG = {
      offline: 'כדי להתחבר בפעם הראשונה צריך חיבור לאינטרנט. התחבר לרשת ונסה שוב.',
      error: 'לא ניתן לטעון את רכיב ההתחברות. בדוק את החיבור ונסה שוב.',
      expired: 'החיבור לחשבון הסתיים. התחבר שוב כדי להמשיך לסנכרן.',
    };
    show(MSG[reason] || (Cloud.redirectError ? Cloud.errorText(Cloud.redirectError) : ''), !!MSG[reason] && reason !== 'expired' || !!Cloud.redirectError);
    if (!Cloud.sdkReady()) {
      Cloud.sdk().then(() => { if (App.blocking === 'login') draw(lastMsg, lastErr); }, () => {
        failedLoad = true;
        if (App.blocking === 'login') show(navigator.onLine ? MSG.error : MSG.offline, true);
      });
    }
  };

  /* ---------------- cloud status in the top bar ---------------- */
  /** Small sync indicator for the home screen: shown only when something needs attention. */
  App.syncDot = function () {
    const st = Cloud.user ? Cloud.status : 'off';
    if (st !== 'error' && st !== 'offline') return '';
    return `<button class="icon-btn" data-act="settings-open" data-k="account" aria-label="${esc(Cloud.statusText())}" style="color:${st === 'error' ? 'var(--bad)' : 'var(--warn)'}">${icon(st === 'error' ? 'alert' : 'cloud')}</button>`;
  };
  App.cloudBadge = function () {
    const st = Cloud.user ? Cloud.status : 'off';
    const color = st === 'synced' ? 'var(--good)' : st === 'error' ? 'var(--bad)' : st === 'offline' ? 'var(--warn)' : 'var(--on-surface-var)';
    return `<button class="icon-btn" data-act="settings-open" data-k="account" aria-label="חשבון וסנכרון: ${esc(Cloud.statusText())}" style="color:${color}">${icon(st === 'error' ? 'alert' : 'cloud')}${st === 'syncing' ? '<span class="dot-badge" style="background:var(--primary);min-width:8px;height:8px;top:10px"></span>' : ''}</button>`;
  };
  let badgeT = null;
  Cloud.on(() => {
    clearTimeout(badgeT);
    badgeT = setTimeout(() => { const el = document.getElementById('sync-dot'); if (el) el.innerHTML = App.syncDot(); }, 300);
  });

  /* ---------------- settings: account & sync ---------------- */
  App.accountSection = function () {
    const u = Cloud.user;
    if (!u && !S.meta.cloudUid && root.FIREBASE_CONFIG) {
      // a guest (or someone who went on without an account while offline): one tap to the ways of signing in
      return `<div class="card"><div class="card-head">${icon('cloud')}<h3>${S.meta.guest ? 'את/ה כאן כאורח' : 'שמירה בחשבון'}</h3></div>
        <p class="small">הנתונים נשמרים רק בטלפון הזה. מחיקת האפליקציה, או ניקוי הנתונים של הדפדפן, מוחקים אותם.</p>
        <p class="small">מתחברים עם Google${root.AUTH_EMAIL_PASSWORD ? ' או עם אימייל וסיסמה' : ''}, וכל מה שכבר רשמת עולה לחשבון ומחכה לך בכל טלפון.</p>
        <button class="btn big ob-go" data-login>${icon('cloud', 's')} שמירה בחשבון</button></div>`;
    }
    if (!u && !S.meta.cloudUid) {
      return `<div class="card"><div class="card-head">${icon('cloud')}<h3>שמירה בענן</h3></div>
        <p class="small">ההתחברות עם Google עוד לא הופעלה לאפליקציה. בינתיים כל הנתונים נשמרים בטלפון, כרגיל.</p>
        <p class="small">כשההתחברות תופעל, מסך הכניסה יופיע אוטומטית. בהתחברות הראשונה כל מה שכבר יש בטלפון יעלה לחשבון שלך. שום דבר לא נמחק.</p>
        <button class="btn tonal block" data-probe>${icon('refresh')} בדוק שוב</button></div>`;
    }
    const name = (u && u.displayName) || S.meta.cloudName || '';
    const email = (u && u.email) || S.meta.cloudEmail || '';
    const photo = (u && u.photoURL) || S.meta.cloudPhoto || '';
    return `<div class="card" style="display:flex;gap:14px;align-items:center">
        ${photo ? `<img src="${esc(photo)}" alt="" referrerpolicy="no-referrer" style="width:56px;height:56px;border-radius:50%">` : `<span class="lead" style="width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:var(--primary-container)">${icon('users')}</span>`}
        <div style="min-width:0"><div class="bold">${esc(name || 'החשבון שלך')}</div><div class="small muted" style="direction:ltr;text-align:right">${esc(email)}</div></div></div>
      <div class="card"><div class="kv"><span>מצב</span><b>${esc(Cloud.statusText())}</b></div>
        <div class="kv"><span>שינויים שממתינים להעלאה</span><b>${Store.dirtyRecords().length + (S.meta.pendingDeletes || []).length}</b></div>
        <div class="btn-row" style="margin-top:10px"><button class="btn tonal" data-sync-now>${icon('refresh')} סנכרן עכשיו</button></div></div>
      <div class="card small"><b>מה נשמר בענן:</b> משמרות, חופשה ומחלה, תוספות, תפקידים ותעריפים, הגדרות, תבניות, תלושים (הנתונים שהוזנו) ופערים פתוחים.<br><b>מה נשאר רק בטלפון:</b> מפתח ה-\u2060API של Claude, קוד הנעילה, קובצי התלושים עצמם (תמונה/PDF) והטקסט הגולמי שזוהה מהם.</div>
      <div class="card"><label class="switch-row"><span class="body"><span class="t">שיתוף סטטיסטיקת שימוש</span><span class="s">מספר משמרות, ימי שימוש ותכונות פעילות, בלי פרטים מזהים (שם, אימייל או סכומים). רק מנהלי האפליקציה רואים אותה, כדי לדעת מה לשפר.</span></span><input type="checkbox" class="switch" data-share-stats ${root.Stats && root.Stats.enabled() ? 'checked' : ''}></label>
        ${u ? `<div class="kv" style="margin-top:6px"><span class="small">מזהה משתמש (למנהלים)</span><button class="btn text sm" data-copy-uid dir="ltr">${esc(u.uid.slice(0, 8))}… העתק</button></div>` : ''}</div>
      <button class="btn outlined block" data-signout>${icon('lock')} התנתק</button>
      <div class="tiny muted" style="margin:6px 4px 16px">ההתנתקות מוחקת את הנתונים מהטלפון הזה בלבד. הם נשארים בחשבון וחוזרים בהתחברות הבאה.</div>
      <div class="section-title" style="color:var(--bad)">${icon('trash', 's')} אזור מסוכן</div>
      <div class="card"><button class="btn danger block" data-delete-cloud>מחק את כל הנתונים מהחשבון</button>
        <div class="tiny muted" style="margin-top:8px">מוחק לצמיתות את הנתונים מהענן ומהטלפון, ואת החשבון באפליקציה. חשבון Google שלך, אם התחברת איתו, לא נפגע.</div></div>`;
  };
  App.accountMount = function (el, draw) {
    const q = (s) => el.querySelector(s);
    if (q('[data-share-stats]')) q('[data-share-stats]').onchange = async (e) => {
      const on = e.target.checked;
      await Store.setSettings((s) => { s.shareStats = on; s.statsAsked = true; });
      if (on) root.Stats.report(true); else root.Stats.forget();
    };
    if (q('[data-copy-uid]')) q('[data-copy-uid]').onclick = () => UI.copyText(Cloud.user.uid);
    if (q('[data-login]')) q('[data-login]').onclick = () => { UI.closeAll(); setTimeout(() => { App.localOnly = false; App.showLogin(); }, 350); };
    if (q('[data-probe]')) q('[data-probe]').onclick = async () => {
      const ok = await Cloud.probe();
      if (ok) { UI.closeAll(); setTimeout(() => App.showLogin(), 350); }
      else UI.toast(ok === null ? 'אין חיבור לאינטרנט' : 'עדיין לא הופעל');
    };
    if (q('[data-sync-now]')) q('[data-sync-now]').onclick = async () => { try { await Cloud.syncNow(); UI.toast('הסנכרון הופעל'); } catch (e) { UI.toast(Cloud.errorText(e)); } draw(); };
    if (q('[data-signout]')) q('[data-signout]').onclick = async () => {
      if (!(await UI.confirm('להתנתק?', 'הנתונים יימחקו מהטלפון הזה ויישארו בחשבון שלך.', 'התנתק'))) return;
      if (await Cloud.signOut()) location.reload();
    };
    if (q('[data-delete-cloud]')) q('[data-delete-cloud]').onclick = async () => {
      if (!(await UI.confirm('למחוק את החשבון ואת כל הנתונים?', 'כל המשמרות, התלושים וההגדרות יימחקו לצמיתות מהענן ומהטלפון, והחשבון באפליקציה יימחק. ייתכן ש-\u2060Google תבקש לאשר את החשבון שוב. מומלץ לגבות קודם.', 'מחק הכול', true))) return;
      const really = await UI.promptText('אישור סופי', 'הקלד "מחק" כדי לאשר', '');
      if (String(really || '').trim().toLowerCase() !== 'מחק'.toLowerCase()) { UI.toast('בוטל'); return; }
      // an account with a password confirms with it (deleting needs a recent sign-in)
      let password = '';
      if (Cloud.usesPassword()) {
        password = String((await UI.promptText('אישור עם הסיסמה', 'הסיסמה של החשבון', '', { type: 'password', ltr: true, ok: 'אישור' })) || '');
        if (!password) { UI.toast('בוטל'); return; }
      }
      try { await Cloud.deleteAccountData({ password }); location.reload(); } catch (e) { UI.dialog({ title: 'המחיקה נכשלה', text: Cloud.errorText(e), buttons: [{ label: 'סגור', value: true }] }); }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
