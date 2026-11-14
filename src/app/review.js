/* ============================================================
 * review.js — now and then, a light ask for a rating, right after something went well.
 *
 * Who: someone who uses the app (5 active days, and 6 shifts done or 2 payslips checked), past the first steps, not
 * the demo. Never after "rate" or "don't ask again", at most 3 asks ever, 60 days after "not now" (120 days after
 * Google's own window, which never says whether it showed). One record per phone (meta.review, store.js DEVICE_META).
 *
 * When (App.reviewMoment): only right after a good result. The 10th, 25th, 50th... shift ended; the first shift of a
 * month after a full month (8 shifts or more); a new payslip that matched the calculation, or in which the check found
 * money owed; money that came back (a gap marked as paid). Never in the app's first minute (the opening, a sign-in),
 * never within 10 minutes of an error, never at night (Moments.quietHour), never while a screen or a question is open:
 * the screen must stay clear for 2 seconds first.
 *
 * What: in the Android app that knows Google's In-App Review (it says "shaati:review" on the widgets' channel, see
 * tools/android.js), the page asks the app and Google decides whether its window shows. Nothing waits for it and
 * nothing depends on it; when the app answers that it could not ask, the card below takes its place.
 * Elsewhere (the website, an iPhone, an older Android app): a card on the home screen, in the home queue
 * (views-home.js, at most 2 cards), for a day. Everyone sees the same four ways out (Google's rules: no question
 * about how they feel first, no sending only the happy ones to the store, no reward): rate on Google Play (the
 * Android app) or share with friends (the website, where there is no store page to rate), a remark to us, not now,
 * and don't ask again.
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, Store, UI } = root;
  const S = Store.S;
  const { icon } = UI;
  const DAY = 86400000;
  const PKG = 'io.github.leelor123.shifts';
  const STORE_WEB = `https://play.google.com/store/apps/details?id=${PKG}`;
  // the Play Store app itself (Chrome hands the intent over); its web page when the store app is missing
  const STORE_APP = `intent://details?id=${PKG}#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=${encodeURIComponent(STORE_WEB)};end`;
  const LATER = 60 * DAY, AFTER_NATIVE = 120 * DAY, MAX_ASKS = 3;
  const FRESH = 60 * 1000, AFTER_ERROR = 10 * 60 * 1000, CARD_FOR = DAY, CLEAR_FOR = 2000;
  const MILESTONES = [10, 25, 50, 100, 200, 300, 500, 1000];
  const loadedAt = Date.now();
  let errorAt = 0;
  root.addEventListener('error', () => { errorAt = Date.now(); });
  root.addEventListener('unhandledrejection', () => { errorAt = Date.now(); });

  const state = () => S.meta.review || {};
  const doneShifts = () => { let n = 0; for (const r of App.model.results.values()) if (r.status === 'done') n++; return n; };
  const quiet = (now) => !!(root.Moments && root.Moments.quietHour(now));
  async function note(patch) { await Store.setMeta({ review: Object.assign({}, state(), patch) }); }

  /** Someone who uses the app, and who may still be asked (the counts and gaps above). */
  function mayAsk(now) {
    if (S.settings.demo || (S.meta.guide && !S.meta.guideDone) || !App.model) return false;
    if ((S.meta.activeDays || 0) < 5) return false;
    if (doneShifts() < 6 && (S.payslips || []).length < 2) return false;
    const st = state();
    if (st.never || st.rated || st.done || (st.n || 0) >= MAX_ASKS) return false;
    if (st.at && now - st.at < (st.native ? AFTER_NATIVE : LATER)) return false;
    return true;
  }
  /** Is now a time to ask? (the person and the moment; App.reviewNow() skips them for a preview) */
  App.reviewDue = function () {
    const now = Date.now();
    if (App.blocking || quiet(now) || now - loadedAt < FRESH || (errorAt && now - errorAt < AFTER_ERROR)) return false;
    return mayAsk(now);
  };

  // Google's In-App Review through the Android app: the app says it can (widgets.js passes its messages here)
  let native = false;
  App.reviewNative = function (msg) {
    if (msg === 'shaati:review') native = true;
    // Google's window could not be asked for (no Play services, an error): the card instead, this time only
    else if (msg === 'shaati:review:no' && pending && pending.native) { pending = { why: pending.why, n: pending.n, until: Date.now() + CARD_FOR, counted: true }; redraw(); }
  };
  const canNative = () => native && !!App.androidApp && !!(App.widgets && App.widgets.connected);

  let pending = null; // { why, n, until, counted } the card's moment, in memory only: a moment is now or never
  const clear = () => !UI.sheets.length && !document.querySelector('.dialog') && !App.blocking && document.visibilityState === 'visible';
  const redraw = () => { if (App.tab === 'home' && clear()) App.rerender(); };

  /** A good result just happened (why: 'milestone' | 'month' | 'payslip-match' | 'payslip-owed' | 'money-back'). */
  App.reviewMoment = function (why, n) {
    if (!why || !App.reviewDue()) return;
    let calm = 0, tries = 0;
    const wait = setInterval(() => {
      tries++;
      if (tries > 240) { clearInterval(wait); return; } // two minutes, then another time
      calm = clear() ? calm + 500 : 0;
      if (calm < CLEAR_FOR) return;
      clearInterval(wait);
      if (!App.reviewDue()) return;
      if (canNative()) {
        pending = { why, n, native: true };
        note({ at: Date.now(), n: (state().n || 0) + 1, native: true }).catch(() => {});
        if (!App.widgets.post('shaati:review')) App.reviewNative('shaati:review:no');
        return;
      }
      pending = { why, n, until: Date.now() + CARD_FOR, counted: false };
      redraw();
    }, 500);
  };

  /** After a shift was ended: a milestone, or the first shift of a month after a full month, is a good moment. */
  App.reviewAfterShift = function () {
    if (!App.model) return;
    const done = [...App.model.results.values()].filter((r) => r.status === 'done');
    if (MILESTONES.includes(done.length)) { App.reviewMoment('milestone', done.length); return; }
    const month = (r) => String(r.date || r.dateKey || '').slice(0, 7);
    const now = root.U ? root.U.todayKey().slice(0, 7) : '';
    if (!now || done.filter((r) => month(r) === now).length !== 1) return;
    const prev = root.U.addMonthKey(now, -1);
    if (done.filter((r) => month(r) === prev).length >= 8) App.reviewMoment('month');
  };

  const LEADS = {
    milestone: (n) => `${n} משמרות בשעתי 🎉`,
    month: () => 'עוד חודש מלא של משמרות 🎉',
    'payslip-match': () => 'התלוש תואם לחישוב ✅',
    'payslip-owed': () => 'בדיקת התלוש מצאה פער אפשרי',
    'money-back': () => 'הכסף שהגיע לך חזר 🎉',
  };
  function cardHtml(p, preview) {
    const play = !!App.androidApp;
    const lead = (LEADS[p.why] || LEADS.month)(p.n);
    return `<div class="card rv-card" role="region" aria-label="${play ? 'דירוג ב־Google Play' : 'שיתוף עם חברים'}"${preview ? ' data-rv-preview' : ''}>
      <div class="rv-top">${App.mascot ? App.mascot('love', { size: 44, cls: 'rv-mascot' }) : ''}<div class="rv-txt"><b>${UI.esc(lead)}</b>
        <span class="small">${play ? 'דירוג ב־Google Play עוזר לעוד עובדים למצוא את שעתי. זה לוקח כמה שניות.' : 'שיתוף עם חברים עוזר להם לבדוק שמשלמים להם נכון.'}</span></div></div>
      <div class="btn-row rv-btns"><button class="btn sm rv-go" data-act="rv-go">${icon(play ? 'star' : 'share', 's')} ${play ? 'לדרג' : 'לשתף'}</button>
        <button class="btn tonal sm" data-act="rv-idea">${icon('chat', 's')} ${'יש לי הערה'}</button>
        <button class="btn text sm" data-act="rv-later">${'לא עכשיו'}</button></div>
      <button class="rv-never" data-act="rv-never">${'לא לשאול שוב'}</button></div>`;
  }
  /** The home queue's card (views-home.js HOME_QUEUE): only in the day after a good moment. */
  App.reviewCard = function () {
    const p = pending;
    if (!p || p.native) return '';
    const now = Date.now();
    if (now > p.until || quiet(now) || state().never || state().rated || state().done) { if (now > p.until) pending = null; return ''; }
    if (!p.counted) {
      p.counted = true;
      setTimeout(() => note({ at: Date.now(), n: (state().n || 0) + 1, native: false }).catch(() => {}), 0);
    }
    return cardHtml(p);
  };

  const close = (patch) => { if (pending && pending.preview) { pending = null; App.rerender(); return; } pending = null; if (patch) note(patch).catch(() => {}); App.rerender(); };
  App.actions['rv-go'] = () => {
    const play = !!App.androidApp;
    const preview = !!(pending && pending.preview);
    close(play ? { rated: true, at: Date.now() } : { done: true, at: Date.now() });
    if (preview) return;
    if (root.Fx && !quiet(Date.now())) root.Fx.celebrate('small');
    if (play) setTimeout(() => { root.location.href = STORE_APP; }, 260);
    else setTimeout(() => App.actions['share-app'] && App.actions['share-app'](), 200);
  };
  App.actions['rv-idea'] = () => { close({ at: Date.now() }); setTimeout(() => root.Support && root.Support.newTicket('idea'), 200); };
  App.actions['rv-later'] = () => close({ at: Date.now() });
  App.actions['rv-never'] = () => { close({ never: true, at: Date.now() }); UI.toast('בסדר, לא נשאל שוב'); };

  /** The admin's preview: the card on home as users see it, without counting as an ask. */
  App.reviewNow = function () {
    pending = { why: 'milestone', n: 10, until: Date.now() + 10 * 60 * 1000, counted: true, preview: true };
    if (App.tab !== 'home') App.go('home'); else App.rerender();
  };
  App.actions['review-preview'] = () => { if (!App.isAdmin) return; UI.closeAll(); setTimeout(() => App.reviewNow(), 350); };

  // for the tests
  App._review = { mayAsk, cardHtml, get pending() { return pending; }, set pending(p) { pending = p; }, reset() { pending = null; native = false; errorAt = 0; } };
})(typeof window !== 'undefined' ? window : globalThis);
