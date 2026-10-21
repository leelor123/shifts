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

  /* ---------------- login screen ---------------- */
  App.showLogin = function (reason) {
    const nav = document.getElementById('nav');
    nav.style.display = 'none';
    App.blocking = 'login';
    const v = document.getElementById('view');
    let busy = false, failedLoad = false, blocked = false;
    const draw = (msg, isErr) => {
      // the Google window may only open straight from the tap, so the button waits until Google is loaded
      const ready = Cloud.sdkReady();
      const label = busy ? 'מתחבר…' : !ready && !failedLoad ? 'רגע, מכינים את Google…' : 'התחברות עם Google';
      v.innerHTML = `<div class="wizard login"><div class="content" style="display:flex;flex-direction:column;justify-content:center;text-align:center">
        <div class="login-mascot">${App.mascot ? App.mascot(isErr ? 'think' : 'wave', { size: 110 }) : '<div class="brand-mark big" aria-hidden="true"></div>'}</div>
        <h1 class="brand-name">Shaati</h1><div class="brand-sub">מעקב משמרות ושכר</div>
        <p class="lead">מתחברים עם Google${root.AUTH_EMAIL_LINK ? ' או עם אימייל' : ''}, וכל מה שרשמת נשמר בחשבון שלך ומחכה לך בכל טלפון.</p>
        ${App.inAppBrowser() ? App.openInBrowserCard() : ''}
        ${S.shifts.length ? `<div class="banner" style="text-align:start">${icon('cloud')}<div>הנתונים שכבר יש בטלפון יעלו לחשבון שלך בהתחברות הראשונה.</div></div>` : ''}
        ${msg ? `<div class="banner ${isErr ? 'warn' : ''}" style="text-align:start">${icon(isErr ? 'alert' : 'info')}<div>${esc(msg)}</div></div>` : ''}
        <button class="btn big ob-google" data-google ${busy || (!ready && !failedLoad) ? 'disabled' : ''}>${GOOGLE_G}<span>${label}</span></button>
        ${blocked ? '<button class="btn text sm" data-redirect>לא נפתח חלון? התחברות בדרך אחרת</button>' : ''}
        ${root.AUTH_EMAIL_LINK ? `<button class="btn tonal login-email" data-email>${icon('mail', 's')} התחברות עם אימייל, בלי סיסמה</button>` : ''}
        <button class="btn text sm" data-act="support" style="margin-top:6px">${icon('info', 's')} בעיה בהתחברות? כתבו לנו</button>
        <div class="tiny muted" style="margin-top:8px">בהתחברות את/ה מאשר/ת את ${App.legalLinks ? App.legalLinks() : 'תנאי השימוש ומדיניות הפרטיות'}.</div>
        <div class="tiny muted" style="margin-top:10px;line-height:1.6">${icon('shield', 's')} רק את/ה יכול/ה לראות את הנתונים שלך. האפליקציה עובדת גם בלי אינטרנט, ומסנכרנת כשהרשת חוזרת.</div>
        </div></div>`;
      v.querySelector('[data-google]').onclick = () => go(false);
      const em = v.querySelector('[data-email]');
      if (em) em.onclick = async () => { if (await App.emailSignIn()) show('שלחנו קישור למייל. פותחים אותו בטלפון הזה כדי להתחבר 📬'); };
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
      // not signed in yet (e.g. continued without an account while offline): one tap to sign in
      return `<div class="card"><div class="card-head">${icon('cloud')}<h3>שמירה בחשבון Google</h3></div>
        <p class="small">עוד לא התחברת, אז הנתונים נשמרים רק בטלפון הזה. מתחברים, וכל מה שכבר רשמת עולה לחשבון ומחכה לך בכל טלפון.</p>
        <button class="btn big ob-google" data-login>${GOOGLE_G}<span>התחברות עם Google</span></button></div>`;
    }
    if (!u && !S.meta.cloudUid) {
      return `<div class="card"><div class="card-head">${icon('cloud')}<h3>שמירה בענן</h3></div>
        <p class="small">ההתחברות עם Google עוד לא הופעלה לאפליקציה. בינתיים כל הנתונים נשמרים בטלפון, כרגיל.</p>
        <p class="small">כשההתחברות תופעל, מסך הכניסה יופיע אוטומטית. בהתחברות הראשונה כל מה שכבר יש בטלפון יעלה לחשבון שלך — שום דבר לא נמחק.</p>
        <button class="btn tonal block" data-probe>${icon('refresh')} בדוק שוב</button></div>`;
    }
    const name = (u && u.displayName) || S.meta.cloudName || '';
    const email = (u && u.email) || S.meta.cloudEmail || '';
    const photo = (u && u.photoURL) || S.meta.cloudPhoto || '';
    return `<div class="card" style="display:flex;gap:14px;align-items:center">
        ${photo ? `<img src="${esc(photo)}" alt="" referrerpolicy="no-referrer" style="width:56px;height:56px;border-radius:50%">` : `<span class="lead" style="width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:var(--primary-container)">${icon('users')}</span>`}
        <div style="min-width:0"><div class="bold">${esc(name || 'משתמש Google')}</div><div class="small muted" style="direction:ltr;text-align:right">${esc(email)}</div></div></div>
      <div class="card"><div class="kv"><span>מצב</span><b>${esc(Cloud.statusText())}</b></div>
        <div class="kv"><span>שינויים שממתינים להעלאה</span><b>${Store.dirtyRecords().length + (S.meta.pendingDeletes || []).length}</b></div>
        <div class="btn-row" style="margin-top:10px"><button class="btn tonal" data-sync-now>${icon('refresh')} סנכרן עכשיו</button></div></div>
      <div class="card small"><b>מה נשמר בענן:</b> משמרות, חופשה ומחלה, תוספות, תפקידים ותעריפים, הגדרות, תבניות, תלושים (הנתונים שהוזנו) ופערים פתוחים.<br><b>מה נשאר רק בטלפון:</b> מפתח ה-\u2060API של Claude, קוד הנעילה, קובצי התלושים עצמם (תמונה/PDF) והטקסט הגולמי שזוהה מהם.</div>
      <div class="card"><label class="switch-row"><span class="body"><span class="t">שיתוף סטטיסטיקה אנונימית</span><span class="s">מספר משמרות, ימי שימוש ותכונות פעילות, בלי שם, אימייל או סכומים. עוזר לשפר את האפליקציה.</span></span><input type="checkbox" class="switch" data-share-stats ${S.settings.shareStats !== false ? 'checked' : ''}></label>
        ${u ? `<div class="kv" style="margin-top:6px"><span class="small">מזהה משתמש (למנהלים)</span><button class="btn text sm" data-copy-uid dir="ltr">${esc(u.uid.slice(0, 8))}… העתק</button></div>` : ''}</div>
      <button class="btn outlined block" data-signout>${icon('lock')} התנתק</button>
      <div class="tiny muted" style="margin:6px 4px 16px">ההתנתקות מוחקת את הנתונים מהטלפון הזה בלבד. הם נשארים בחשבון וחוזרים בהתחברות הבאה.</div>
      <div class="section-title" style="color:var(--bad)">${icon('trash', 's')} אזור מסוכן</div>
      <div class="card"><button class="btn danger block" data-delete-cloud>מחק את כל הנתונים מהחשבון</button>
        <div class="tiny muted" style="margin-top:8px">מוחק לצמיתות את הנתונים מהענן ומהטלפון, ואת החשבון באפליקציה. חשבון Google שלך לא נפגע.</div></div>`;
  };
  App.accountMount = function (el, draw) {
    const q = (s) => el.querySelector(s);
    if (q('[data-share-stats]')) q('[data-share-stats]').onchange = async (e) => {
      const on = e.target.checked;
      await Store.setSettings((s) => { s.shareStats = on; });
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
      if (really !== 'מחק') { UI.toast('בוטל'); return; }
      try { await Cloud.deleteAccountData(); location.reload(); } catch (e) { UI.dialog({ title: 'המחיקה נכשלה', text: Cloud.errorText(e), buttons: [{ label: 'סגור', value: true }] }); }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
