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

  /* ---------------- login screen ---------------- */
  App.showLogin = function (reason) {
    const nav = document.getElementById('nav');
    nav.style.display = 'none';
    App.blocking = 'login';
    const v = document.getElementById('view');
    let busy = false;
    const draw = (msg, isErr) => {
      v.innerHTML = `<div class="wizard"><div class="content" style="display:flex;flex-direction:column;justify-content:center;text-align:center">
        <div class="brand-mark big" aria-hidden="true"></div>
        <h1 class="brand-name">Shaati</h1><div class="brand-sub">מעקב משמרות ושכר</div>
        <p class="lead">התחבר עם חשבון Google. כל הנתונים שלך נשמרים בענן לפי החשבון, וזמינים בכל טלפון שתתחבר ממנו.</p>
        ${S.shifts.length ? `<div class="banner" style="text-align:start">${icon('cloud')}<div>הנתונים שכבר יש בטלפון יעלו לחשבון שלך בהתחברות הראשונה.</div></div>` : ''}
        ${msg ? `<div class="banner ${isErr ? 'warn' : ''}" style="text-align:start">${icon(isErr ? 'alert' : 'info')}<div>${esc(msg)}</div></div>` : ''}
        <button class="btn big" data-google style="background:#fff;color:#1f1f1f;border:1px solid #dadce0;margin-top:8px" ${busy ? 'disabled' : ''}>${GOOGLE_G}<span>${busy ? 'מתחבר…' : 'התחברות עם Google'}</span></button>
        <div class="tiny muted" style="margin-top:12px">בהתחברות אתה מאשר את ${App.legalLinks ? App.legalLinks() : 'תנאי השימוש ומדיניות הפרטיות'}.</div>
        <div class="tiny muted" style="margin-top:10px;line-height:1.6">${icon('shield', 's')} רק אתה יכול לראות את הנתונים שלך. מפתח ה-API, קוד הנעילה וקובצי התלושים (תמונות ו-PDF) נשארים רק בטלפון. האפליקציה ממשיכה לעבוד גם בלי אינטרנט, ומסנכרנת כשהרשת חוזרת.</div>
        </div></div>`;
      v.querySelector('[data-google]').onclick = go;
    };
    async function go() {
      if (busy) return;
      busy = true; draw();
      try {
        const user = await Cloud.signIn();
        if (!user) return; // redirect flow: the page will reload signed in
        draw('מסנכרן את הנתונים…');
        await Cloud.connect(user);
        nav.style.display = '';
        App.blocking = null;
        App.afterLogin();
        UI.toast('מחובר כ-' + (user.displayName || user.email));
      } catch (e) {
        console.error(e);
        busy = false;
        draw(Cloud.errorText(e), true);
      }
    }
    const MSG = {
      offline: 'כדי להתחבר בפעם הראשונה צריך חיבור לאינטרנט. התחבר לרשת ונסה שוב.',
      error: 'לא ניתן לטעון את רכיב ההתחברות. בדוק את החיבור ונסה שוב.',
      expired: 'החיבור לחשבון הסתיים. התחבר שוב כדי להמשיך לסנכרן.',
    };
    const msg = MSG[reason] || (Cloud.redirectError ? Cloud.errorText(Cloud.redirectError) : '');
    draw(msg, !!msg && reason !== 'expired');
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
      <div class="card small"><b>מה נשמר בענן:</b> משמרות, חופשה ומחלה, תוספות, תפקידים ותעריפים, הגדרות, תבניות, תלושים (הנתונים שהוזנו) ופערים פתוחים.<br><b>מה נשאר רק בטלפון:</b> מפתח ה-API של Claude, קוד הנעילה, קובצי התלושים עצמם (תמונה/PDF) והטקסט הגולמי שזוהה מהם.</div>
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
      if (!(await UI.confirm('למחוק את החשבון ואת כל הנתונים?', 'כל המשמרות, התלושים וההגדרות יימחקו לצמיתות מהענן ומהטלפון, והחשבון באפליקציה יימחק. ייתכן ש-Google תבקש לאשר את החשבון שוב. מומלץ לגבות קודם.', 'מחק הכול', true))) return;
      const really = await UI.promptText('אישור סופי', 'הקלד "מחק" כדי לאשר', '');
      if (really !== 'מחק') { UI.toast('בוטל'); return; }
      try { await Cloud.deleteAccountData(); location.reload(); } catch (e) { UI.dialog({ title: 'המחיקה נכשלה', text: Cloud.errorText(e), buttons: [{ label: 'סגור', value: true }] }); }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
