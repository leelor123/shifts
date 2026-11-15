/* ============================================================
 * arrive.js — "a suggestion at work" in Settings › My work (opt-in, off by default; core/arrive.js has the rules).
 *
 * Only the Android app can do it: it says so over the widgets' channel ("shaati:geo", LauncherActivity), keeps the
 * spots on the phone and watches them (android/widgets/java/WorkGeo.java). This page never holds a spot: it opens the
 * Android app's own screen to save one (Arrive.setupUrl: the disclosure, then Android's permissions), asks for the
 * status ({"geo":1,"ask":1}; the answer says on, the permissions and each place's id, radius, name and employer only)
 * and turns a place off ({"geo":1,"off":1,"id":…}).
 * Up to Arrive.MAX_PLACES workplaces (an app from 1.39 sends its list of places); an Android app before it keeps one
 * place and sends no list, and the section then offers that one place only.
 * Nothing about it is saved in the app's database, so nothing about it reaches the cloud, Sentry or the statistics.
 * In a browser (and on an iPhone) a web page cannot watch a place while it is closed: the section says so and offers
 * nothing.
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, UI, Arrive } = root;
  const { icon, esc } = UI;

  let native = false;
  let status = null; // { on, r, bg, fg, attn, saved, places? } from the Android app, or null before it answers
  let pick = Arrive.DEFAULT_R;
  let addName = ''; // the new place's name, as typed (or the employer picked)
  let addEmp = ''; // the employer the new place's shift starts at
  let drawn = null; // the open section's redraw, while it is on the screen

  const ask = () => { if (native && App.widgets) App.widgets.post(JSON.stringify({ geo: 1, ask: 1 })); };
  const redraw = () => { if (drawn) { try { drawn(); } catch (e) { drawn = null; } } };
  /** The saved places (an Android app from 1.39), or null (an app before it: one place, no list). */
  const placesOf = () => (status && Array.isArray(status.places) ? status.places : null);
  /** The employers with a job in them: with two or more, a new place says which one it is. */
  const employers = () => (root.Store.S.employers || []).filter((e) => App.roles(e.id).length);
  const placeName = (p, i, n) => p.n || (n > 1 ? `מקום ${i + 1}` : 'מקום העבודה');

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
    const list = placesOf();
    if (status && status.on && list && list.length > 1) return `פועל · ${list.length} מקומות עבודה`;
    if (status && status.on) return `פועל · ברדיוס ${status.r} מטר`;
    if (status && status.attn) return 'לא פועל: צריך להפעיל את דיוק המיקום';
    return 'כבוי';
  };

  const seg = () => `<div class="section-title">רדיוס סביב המקום</div><div class="seg" style="margin-bottom:14px">${Arrive.RADII.map((r) => `<button data-arrive-r="${r}" class="${pick === r ? 'on' : ''}">${r} מטר</button>`).join('')}</div>`;

  /** The new place's name and employer (with several employers, or when a place is saved already). */
  function nameFields(count) {
    const emps = employers();
    if (emps.length < 2 && count < 1) return '';
    const chips = emps.length > 1
      ? `<div class="section-title">איזה מקום עבודה?</div><div class="seg" style="margin-bottom:10px;flex-wrap:wrap">${emps.map((e) => `<button data-arrive-emp="${esc(e.id)}" class="${addEmp === e.id ? 'on' : ''}">${esc(e.name || 'מקום עבודה')}</button>`).join('')}</div>`
      : '';
    return `${chips}<label class="field"><span class="lbl">שם המקום</span><input class="input" id="arrive-name" maxlength="30" autocomplete="off" placeholder="למשל: הסניף בדיזנגוף" value="${esc(addName)}"></label>
      <div class="tiny muted nfc-note">השם מופיע בהתראה, כדי שיהיה ברור לאיזה מקום הגעת.</div>`;
  }

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
    const list = placesOf();
    const lost = status && status.saved && !status.bg;
    // Google Play services refused to watch the places (Android/WorkGeo: Location Accuracy off): never shown as on
    const attn = status && status.attn;
    const notes = `${lost ? '<div class="tiny nfc-note">ההרשאה לגשת למיקום כל הזמן בוטלה, ולכן ההצעות נעצרו. אפשר לשמור את המקום שוב.</div>' : ''}
        ${attn ? '<div class="tiny nfc-note">הטלפון לא מצליח לעקוב אחרי המקום, ולכן ההצעות לא פועלות. בדרך כלל זה קורה כשדיוק המיקום כבוי. אחרי שמפעילים אותו בהגדרות המיקום של הטלפון, אפשר לשמור את המקום שוב.</div>' : ''}`;

    // an Android app from 1.39: the saved places, each saved again or removed on its own, and room for more
    if (list && list.length && status.saved) {
      const n = list.length;
      const rows = list.map((p, i) => `<div class="item" style="cursor:default"><span class="lead">${icon(on ? 'check' : 'pin')}</span><span class="body"><span class="t">${esc(placeName(p, i, n))}</span><span class="s">${esc(`ברדיוס ${p.r} מטר`)}</span></span></div>
          <div class="row-flex" style="margin-bottom:10px"><button class="btn tonal sm" data-arrive-again="${p.id}">${icon('pin', 's')} שמירה מחדש מכאן</button><button class="btn tonal sm" data-arrive-off="${p.id}">${icon('x', 's')} ${n > 1 ? 'הסרה' : 'כיבוי'}</button></div>`).join('');
      const room = n < Arrive.MAX_PLACES;
      return `<div class="card nfc-card">${intro}
          ${on ? '' : notes}
          <div class="section-title">${n > 1 ? 'מקומות העבודה ששמרת' : 'מקום העבודה ששמרת'}</div>
          ${rows}
        </div>
        ${room ? `<div class="section-title">הוספת מקום עבודה נוסף</div>
        ${nameFields(n)}
        ${seg()}
        <button class="btn go block" data-arrive-save>${icon('plus', 's')} שמירת המקום הנוכחי כמקום עבודה נוסף</button>
        <div class="tiny muted nfc-note">עומדים במקום העבודה הנוסף ולוחצים. אפשר לשמור עד ${Arrive.MAX_PLACES} מקומות.</div>` : `<div class="tiny muted nfc-note">שמרת ${Arrive.MAX_PLACES} מקומות, וזה המספר המרבי. כדי להוסיף מקום אחר, מסירים קודם אחד מהם.</div>`}
        ${privacy}`;
    }
    // an Android app before 1.39: its one place, as before
    if (on) {
      return `<div class="card nfc-card">${intro}
          <div class="item" style="cursor:default"><span class="lead">${icon('check')}</span><span class="body"><span class="t">פועל</span><span class="s">${esc(`ברדיוס ${status.r} מטר מהמקום ששמרת`)}</span></span></div>
          <button class="btn tonal block" data-arrive-off>${icon('x', 's')} כיבוי</button>
        </div>
        ${seg()}
        <button class="btn block" data-arrive-save>${icon('pin', 's')} שמירה מחדש מהמקום הנוכחי</button>
        ${privacy}`;
    }
    return `<div class="card nfc-card">${intro}
        ${notes}
        ${list ? nameFields(0) : ''}
        ${seg()}
        <button class="btn go block" data-arrive-save>${icon('pin', 's')} שמירת המקום הנוכחי כמקום העבודה</button>
        <div class="tiny muted nfc-note">עומדים במקום העבודה ולוחצים. הטלפון יבקש הרשאת מיקום, וצריך לבחור “לאפשר כל הזמן”.</div>
      </div>
      ${privacy}`;
  };

  App.arriveMount = function (el, draw) {
    drawn = () => { if (el.isConnected) draw(); else drawn = null; };
    const list = placesOf();
    if (status && status.on && !list) pick = Arrive.radius(status.r);
    ask();
    const name = el.querySelector('#arrive-name');
    if (name) name.oninput = () => { addName = name.value; };
    el.querySelectorAll('[data-arrive-r]').forEach((b) => (b.onclick = () => { pick = Arrive.radius(b.dataset.arriveR); draw(); }));
    el.querySelectorAll('[data-arrive-emp]').forEach((b) => (b.onclick = () => {
      const e = employers().find((x) => x.id === b.dataset.arriveEmp);
      if (!e) return;
      // the employer's name is the place's name, unless one was typed for another place
      if (!addName.trim() || employers().some((x) => x.name === addName)) addName = e.name || '';
      addEmp = e.id;
      draw();
    }));
    // the Android app's own screen: the disclosure first, then Android's permission windows, then the spot is saved there
    const save = el.querySelector('[data-arrive-save]');
    if (save) {
      save.onclick = () => {
        const emps = employers();
        // one employer: every place starts its shift there
        const emp = addEmp || (emps.length === 1 ? emps[0].id : '');
        // an app before 1.39 saves its one place again (it reads the radius only)
        const id = list ? Arrive.nextId(list) : null;
        if (list && list.length && !id) return;
        root.location.href = Arrive.setupUrl(pick, list ? { id, name: addName, emp } : {});
      };
    }
    // a place saved again from where the phone is now: the same name and employer
    el.querySelectorAll('[data-arrive-again]').forEach((b) => (b.onclick = () => {
      const p = (list || []).find((x) => x.id === b.dataset.arriveAgain);
      if (p) root.location.href = Arrive.setupUrl(p.r, { id: p.id, name: p.n, emp: p.e });
    }));
    // one tap, no question: turning it off loses nothing the user cannot save again in a moment
    el.querySelectorAll('[data-arrive-off]').forEach((off) => (off.onclick = () => {
      const id = off.dataset.arriveOff;
      const msg = id ? { geo: 1, off: 1, id } : { geo: 1, off: 1 };
      if (App.widgets) App.widgets.post(JSON.stringify(msg));
      const left = id && list ? list.filter((p) => p.id !== id) : [];
      if (status) status = Object.assign({}, status, left.length ? { places: left } : { on: false, saved: false, places: list ? [] : undefined });
      UI.toast(left.length ? 'המקום הוסר' : 'ההצעות במקום העבודה כבויות', null, { ok: true });
      draw();
    }));
  };
})(typeof window !== 'undefined' ? window : globalThis);
