/* ============================================================
 * review.js — now and then, a friendly screen asking for a rating.
 *
 * When: someone who uses the app (6 active days, 6 shifts done, past the first steps, not the demo), at a
 * good moment (the shift that was just ended has been looked at and closed, nothing else open). Then not
 * again for 45 days after "later", 200 days after "rate", and never more than 5 times. One per phone.
 *
 * What: stars that pop in with a twinkle, and three ways out that everyone sees alike (Google's rules: no
 * asking how they feel first, no sending only the happy ones to the store): rate on Google Play, send an
 * idea or a remark to us, or later. In the Android app "rate" opens the app's page in the Play Store; on
 * the web, where there is no store page, the screen asks to share the app with friends instead.
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
  const LATER = 45 * DAY, AFTER_RATE = 200 * DAY, MAX_ASKS = 5;

  const state = () => S.meta.review || {};
  /** Is now a time to ask? (the conditions above; App.reviewNow() skips them for a preview) */
  App.reviewDue = function () {
    if (App.blocking || S.settings.demo || (S.meta.guide && !S.meta.guideDone)) return false;
    if ((S.meta.activeDays || 0) < 6) return false;
    let done = 0;
    for (const r of App.model.results.values()) if (r.status === 'done') done++;
    if (done < 6) return false;
    const st = state();
    if ((st.n || 0) >= MAX_ASKS) return false;
    if (st.at && Date.now() - st.at < (st.rated ? AFTER_RATE : LATER)) return false;
    return true;
  };
  async function note(patch) { await Store.setMeta({ review: Object.assign({}, state(), patch) }); }

  /** The screen. */
  App.reviewNow = function (opts) {
    const preview = !!(opts && opts.preview);
    const play = !!App.androidApp;
    const stars = [0, 1, 2, 3, 4].map((i) => `<i class="rv-star" style="--i:${i}">${icon('star')}</i>`).join('');
    let answered = false;
    UI.openSheet({
      title: play ? 'נהנים משעתי? 💜' : 'נהנים משעתי? ספרו לחברים 💜', cls: 'review-sheet',
      body: `<div class="rv">
        ${App.mascot ? App.mascot('love', { size: 96, cls: 'rv-mascot' }) : ''}
        <div class="rv-stars" aria-hidden="true">${stars}</div>
        <p class="rv-s">${play ? 'ביקורת קצרה ב-⁠Google Play עוזרת לעוד עובדים לגלות כמה מגיע להם. זה לוקח 10 שניות, וזה עושה לנו את היום.' : 'כל שיתוף עוזר לעוד עובדים לדעת כמה מגיע להם, ולבדוק שמשלמים להם נכון.'}</p>
        <button class="btn big block rv-go" data-rv-go>${icon(play ? 'star' : 'share', 's')} ${play ? 'לדרג ב-⁠Google Play' : 'לשתף עם חברים'}</button>
        <button class="btn tonal block" data-rv-idea>${icon('chat', 's')} יש לי רעיון או הערה</button>
        <button class="btn text block" data-rv-later>אולי אחר כך</button>
      </div>`,
      onMount: (el) => {
        if (!preview) note({ at: Date.now(), n: (state().n || 0) + 1, rated: false }).catch(() => {});
        if (root.Fx) setTimeout(() => root.Fx.play('pick'), 380);
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.hasAttribute('data-rv-go')) {
            answered = true;
            if (!preview) await note({ rated: true, at: Date.now() });
            if (root.Fx) root.Fx.celebrate('small');
            UI.closeTop();
            if (play) setTimeout(() => { root.location.href = STORE_APP; }, 260);
            else setTimeout(() => App.actions['share-app'] && App.actions['share-app'](), 320);
          } else if (b.hasAttribute('data-rv-idea')) {
            answered = true;
            UI.closeTop();
            setTimeout(() => root.Support && root.Support.newTicket('idea'), 320);
          } else if (b.hasAttribute('data-rv-later')) { answered = true; UI.closeTop(); }
        });
      },
      onClose: () => { if (!answered && !preview) note({ at: Date.now() }).catch(() => {}); },
    });
  };

  // the admin's preview (admin dashboard): the screen as users see it, without counting as an ask
  App.actions['review-preview'] = () => { if (!App.isAdmin) return; UI.closeAll(); setTimeout(() => App.reviewNow({ preview: true }), 350); };

  /** After a shift was ended: once its screen (and anything opened from it) is closed, ask if it is time. */
  App.reviewAfterShift = function () {
    if (!App.reviewDue()) return;
    let tries = 0;
    const wait = setInterval(() => {
      tries++;
      if (tries > 240) { clearInterval(wait); return; } // two minutes, then another time
      if (UI.sheets.length || document.querySelector('.dialog') || App.blocking || document.visibilityState !== 'visible') return;
      clearInterval(wait);
      setTimeout(() => { if (!UI.sheets.length && !document.querySelector('.dialog') && App.reviewDue()) App.reviewNow(); }, 1100);
    }, 500);
  };
})(typeof window !== 'undefined' ? window : globalThis);
