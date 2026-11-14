/* ============================================================
 * arrive.js — "a suggestion at work" in Settings › My work (opt-in, off by default; core/arrive.js has the rules).
 *
 * Only the Android app can do it: it says so over the widgets' channel ("shaati:geo", LauncherActivity), keeps the
 * spot on the phone and watches it (android/widgets/java/WorkGeo.java). This page never holds the spot: it opens the
 * Android app's own screen to save it (Arrive.setupUrl: the disclosure, then Android's permissions), asks for the
 * status ({"geo":1,"ask":1}; the answer says on, radius and the permissions only) and turns it off ({"geo":1,"off":1}).
 * Nothing about it is saved in the app's database, so nothing about it reaches the cloud, Sentry or the statistics.
 * In a browser (and on an iPhone) a web page cannot watch a place while it is closed: the section says so and offers
 * nothing.
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, UI, Arrive } = root;
  const { icon, esc } = UI;

  let native = false;
  let status = null; // { on, r, bg, fg, saved } from the Android app, or null before it answers
  let pick = Arrive.DEFAULT_R;
  let drawn = null; // the open section's redraw, while it is on the screen

  const ask = () => { if (native && App.widgets) App.widgets.post(JSON.stringify({ geo: 1, ask: 1 })); };
  const redraw = () => { if (drawn) { try { drawn(); } catch (e) { drawn = null; } } };

  App.arrive = {
    /** The Android app can do it (its hello on the channel). */
    hello() { native = true; ask(); },
    /** Its status answer (app/widgets.js hands over every {"geo":…} message). */
    status(m) {
      const s = Arrive.readStatus(m);
      if (!s) return;
      status = Object.assign(s, { saved: m.saved === true });
      redraw();
    },
    get native() { return native; },
    get on() { return !!(status && status.on); },
  };
  // back from the Android app's own screen (or its settings): the status may have changed
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ask(); });

  // inside an Android app built before 1.38 (it talks to the widgets but never announced the geofence): the feature
  // comes with the app's next update, so it is never told to open "the Android app" it is already in
  const oldApp = () => !native && !!(App.widgets && App.widgets.connected);
  App.arriveSub = () => {
    if (oldApp()) return 'מגיע בעדכון הקרוב של האפליקציה';
    if (!native) return 'באפליקציה לאנדרואיד: הצעה להתחיל משמרת כשמגיעים';
    if (status && status.on) return `פועל · ברדיוס ${status.r} מטר`;
    return 'כבוי';
  };

  App.arriveSection = function () {
    const intro = `<div class="nfc-intro">${UI.tile('pin', 'mint')}<p>כשמגיעים למקום העבודה, שעתי שולחת התראה שמציעה להתחיל משמרת. כשיוצאים ומשמרת רצה, היא מציעה לסיים אותה. משמרת לא מתחילה ולא מסתיימת בלי לחיצה שלך.</p></div>`;
    const privacy = '<div class="tiny muted nfc-note">המיקום נשמר רק בטלפון הזה. הוא לא נשלח לענן, לא לגיבוי ולא לשום מקום אחר.</div>';
    if (oldApp()) {
      return `<div class="card nfc-card">${intro}
        <div class="tiny muted nfc-note">האפשרות הזו מגיעה בעדכון הקרוב של שעתי ב־Google Play. אחרי העדכון היא תופיע כאן.</div></div>`;
    }
    if (!native) {
      return `<div class="card nfc-card">${intro}
        <div class="tiny muted nfc-note">זה עובד רק באפליקציית שעתי לאנדרואיד. דפדפן לא יכול לבדוק מיקום כשהאפליקציה סגורה, ולכן כאן אין את האפשרות הזו.</div></div>`;
    }
    const on = status && status.on;
    const seg = `<div class="section-title">רדיוס סביב המקום</div><div class="seg" style="margin-bottom:14px">${Arrive.RADII.map((r) => `<button data-arrive-r="${r}" class="${pick === r ? 'on' : ''}">${r} מטר</button>`).join('')}</div>`;
    if (on) {
      return `<div class="card nfc-card">${intro}
          <div class="item" style="cursor:default"><span class="lead">${icon('check')}</span><span class="body"><span class="t">פועל</span><span class="s">${esc(`ברדיוס ${status.r} מטר מהמקום ששמרת`)}</span></span></div>
          <button class="btn tonal block" data-arrive-off>${icon('x', 's')} כיבוי</button>
        </div>
        ${seg}
        <button class="btn block" data-arrive-save>${icon('pin', 's')} שמירה מחדש מהמקום הנוכחי</button>
        ${privacy}`;
    }
    const lost = status && status.saved && !status.bg;
    return `<div class="card nfc-card">${intro}
        ${lost ? '<div class="tiny nfc-note">ההרשאה לגשת למיקום כל הזמן בוטלה, ולכן ההצעות נעצרו. אפשר לשמור את המקום שוב.</div>' : ''}
        ${seg}
        <button class="btn go block" data-arrive-save>${icon('pin', 's')} שמירת המקום הנוכחי כמקום העבודה</button>
        <div class="tiny muted nfc-note">עומדים במקום העבודה ולוחצים. הטלפון יבקש הרשאת מיקום, וצריך לבחור “לאפשר כל הזמן”.</div>
      </div>
      ${privacy}`;
  };

  App.arriveMount = function (el, draw) {
    drawn = () => { if (el.isConnected) draw(); else drawn = null; };
    if (status && status.on) pick = Arrive.radius(status.r);
    ask();
    el.querySelectorAll('[data-arrive-r]').forEach((b) => (b.onclick = () => { pick = Arrive.radius(b.dataset.arriveR); draw(); }));
    const save = el.querySelector('[data-arrive-save]');
    // the Android app's own screen: the disclosure first, then Android's permission windows, then the spot is saved there
    if (save) save.onclick = () => { root.location.href = Arrive.setupUrl(pick); };
    const off = el.querySelector('[data-arrive-off]');
    // one tap, no question: turning it off loses nothing the user cannot save again in a moment
    if (off) {
      off.onclick = () => {
        if (App.widgets) App.widgets.post(JSON.stringify({ geo: 1, off: 1 }));
        if (status) status = Object.assign({}, status, { on: false, saved: false });
        UI.toast('ההצעות במקום העבודה כבויות', null, { ok: true });
        draw();
      };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
