/* ============================================================
 * views-quick.js — quick actions on the opening (the user, 2026-11-02: "quick actions before the whole app opens: a
 * button that starts a shift at once, it asks which role and starts; more actions that fit; a button to enter the app").
 * On a returning user's first open in a session the opening show (intro.js, Intro.quick) stops with its sheet up under
 * the sky, and these are on it: start a shift (or, while one runs, its clock with end and break), log a shift that took
 * place, the month so far, the calendar (or the next planned shift), and "כניסה". Each one enters the app first (the
 * sheet goes up over the header and the home screen is there), then runs, so what it opens is seen and a new shift gets
 * its moment on the home screen. Only the role question stays on the sheet. The buttons carry data-q, not data-act: the
 * app's own handlers must not run under the show.
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, Store, UI, U, Engine } = root;
  const S = Store.S;
  const { icon, esc, money } = UI;
  let picking = false; // the role question is on the sheet

  function top() {
    const a = S.activeShift;
    if (picking) {
      const last = S.meta.lastRole;
      const list = App.roles().slice().sort((x, y) => (y.id === last) - (x.id === last));
      return `<div class="iq-ask">באיזה תפקיד?</div>
        <div class="list iq-roles">${list.map((r) => `<button class="item" data-q="role" data-id="${esc(r.id)}"><span class="lead" style="background:${esc(r.color)};color:#fff">${esc(r.name.slice(0, 1))}</span><span class="body"><span class="t">${esc(r.name)}</span><span class="s">${money(Engine.roleRate(r, U.todayKey()))} לשעה${App.multiEmp() ? ' · ' + esc(App.employer(r.employerId).name) : ''}</span></span></button>`).join('')}</div>
        <button class="btn text iq-back" data-q="back">ביטול</button>`;
    }
    if (a) {
      // the running shift as the home screen shows it (the same card), its buttons the sheet's own
      const role = App.role(App.currentRole());
      const onBreak = App.onBreak();
      return `<div class="card timer-card running${onBreak ? ' on-break' : ''}">
        <div class="tc-head"><span class="pulse"></span>${onBreak ? 'בהפסקה' : 'משמרת פעילה'}${role ? ' · ' + esc(role.name) : ''}<span class="spacer"></span><span class="tiny">מ-${U.epochHM(a.start)}</span></div>
        <div class="clock" data-clock="net">0:00:00</div>
        <div class="meta">עד עכשיו <b data-live-pay></b></div>
        <div class="tc-actions">
          <button class="btn big" data-q="stop">${icon('stop')} סיים משמרת</button>
          <button class="icon-btn tonal lg" data-q="break" aria-label="${onBreak ? 'חזור מהפסקה' : 'הפסקה'}">${icon(onBreak ? 'play' : 'coffee')}</button>
        </div></div>`;
    }
    return `<button class="btn big iq-start" data-q="start">${icon('play')} התחל משמרת</button>`;
  }
  function tiles() {
    const tile = (q, ic, tint, t, sub) => `<button class="am-tile" data-q="${q}">${UI.tile(ic, tint)}<span class="am-t">${t}</span>${sub ? `<span class="am-s">${sub}</span>` : ''}</button>`;
    let month = '';
    // whole shekels, as on the pay card
    try { const emp = S.employers[0]; month = money(Engine.periodSummary(App.model, Engine.periodOf(U.todayKey(), emp).key, emp.id).gross, 0); } catch (e) { /* the tile without its sum */ }
    const now = Date.now();
    const next = S.shifts.filter((s) => s.status === 'planned' && s.start > now).sort((x, y) => x.start - y.start)[0];
    return `<div class="am-grid iq-tiles">
      ${tile('log', 'clock', 'violet', 'רישום משמרת', 'שהתקיימה')}
      ${tile('month', 'chart', 'mint', 'החודש', month)}
      ${next ? tile('cal', 'calendar', 'sky', 'המשמרת הבאה', U.fmtDate(U.epochKey(next.start), 'short') + ' ' + U.epochHM(next.start)) : tile('cal', 'calendar', 'sky', 'לוח שנה')}
    </div>`;
  }
  // the way in is the main button, first and filled (the user, 2 Nov: a big green start-a-shift looked like the way in);
  // the quick actions come after it, start a shift first among them. The role question has the sheet to itself.
  const panel = () => (picking ? '' : '<button class="btn big iq-enter" data-q="enter">כניסה</button>') + top() + (picking ? '' : tiles());

  /** Leaves for the app; fn (the action) runs once the show has gone. */
  const go = (fn) => { const I = root.Intro; if (I && I.enter) I.enter(fn); else if (fn) fn(); };
  const ACT = {
    start: (b, kbd) => {
      const roles = App.roles();
      if (roles.length > 1) { picking = true; draw(kbd); return; }
      go(() => App.startShift(roles[0] && roles[0].id));
    },
    role: (b) => go(() => App.startShift(b.dataset.id)),
    back: (b, kbd) => { picking = false; draw(kbd); },
    stop: () => go(() => App.stopShift()),
    break: () => go(() => App.toggleBreak()),
    log: () => go(() => App.actions['shift-new']()),
    month: () => go(() => App.actions['go-summary']()),
    cal: () => go(() => App.go('calendar')),
    enter: () => go(null),
  };
  function host() {
    const sheet = document.querySelector('#intro .intro-sheet');
    if (!sheet) return null;
    let h = sheet.querySelector('.iq');
    if (!h) {
      h = document.createElement('div');
      h.className = 'iq';
      h.inert = true; // out of reach (taps, keys, readers) until the show puts it on (intro.js showQuick)
      h.addEventListener('click', (e) => {
        const b = e.target.closest('[data-q]');
        if (!b || !ACT[b.dataset.q]) return;
        e.stopPropagation(); // not a tap to skip the show
        ACT[b.dataset.q](b, e.detail === 0); // detail 0: Enter or Space, not a finger
      });
      sheet.appendChild(h);
    }
    return h;
  }
  /** focus: the question or the way back came from a keyboard, so the next control takes the focus (after a finger the
   * ring would show for nothing). */
  function draw(focus) {
    const h = host();
    if (!h) return;
    const html = panel();
    if (root.Dom && root.Dom.patch) root.Dom.patch(h, html); else h.innerHTML = html;
    App.tickTimer();
    if (focus) { const f = h.querySelector('[data-q]'); if (f) f.focus({ preventScroll: true }); }
  }
  /** Drawn with every render while the show waits on its quick actions (the data can still change under it). */
  App.quickOpen = function () {
    const I = root.Intro;
    if (!I || !I.quick || !I.covering || !I.covering()) return;
    draw(false);
    if (I.quickDrawn) I.quickDrawn(); // on the sheet as it rises, not after the show
  };
})(typeof window !== 'undefined' ? window : globalThis);
