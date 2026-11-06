/* ============================================================
 * shift-end.js — the moment a shift ends (App.endMoment, called by App.stopShift; the opening's quick "end" runs
 * the same App.stopShift once the show has gone).
 * A calm card across the bottom of the screen for about two seconds: the shift's wage big, its hours, and one line
 * on what made it (Moments.wageLine: "מזה ₪137 על שבת"), with "ביטול" kept. A tap closes it; it fades as the shift's
 * own sheet rises. It only fades (no movement) with reduced motion or with effects off. UI.closeAll() closes it too
 * (nothing opens after it then). Resolves 'undo', 'done' or 'gone'.
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, UI, U } = root;
  const { esc, money } = UI;
  const SHOW_MS = 1800; // then the fade (and the sheet comes up under it)
  const FADE_MS = 200;
  let cur = null; // { el, done(how) }

  App.endMoment = function (r, opts) {
    opts = opts || {};
    if (cur) cur.done('gone');
    return new Promise((resolve) => {
      const M = root.Moments;
      const line = M ? M.wageLine(r) : '';
      const motion = !!(root.Fx && root.Fx.motion());
      const el = document.createElement('div');
      el.className = 'end-moment' + (motion ? '' : ' em-still');
      el.setAttribute('role', 'status');
      const hours = `${U.hm(r ? r.paidMin : 0)} שעות`;
      el.innerHTML = `<div class="em-k">${opts.first ? 'המשמרת הראשונה שלך נשמרה!' : 'המשמרת נשמרה'} · ${hours}</div>
        <div class="em-wage num">${money(r ? r.wage : 0, 0)}</div>
        ${line ? `<div class="em-why"><span class="money">${esc(line)}</span></div>` : ''}
        <button class="em-undo" type="button">${'ביטול'}</button>`;
      // a toast still showing would sit on top of it
      const t = document.getElementById('toast');
      if (t) t.classList.remove('show');
      document.body.appendChild(el);
      let timer = 0, settled = false;
      const done = (how) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cur = null;
        document.removeEventListener('keydown', onKey, true);
        el.classList.remove('show');
        setTimeout(() => el.remove(), FADE_MS + 60);
        resolve(how);
      };
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done('done'); } };
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target.closest('.em-undo')) { done('undo'); App.undo(); return; }
        done('done');
      });
      document.addEventListener('keydown', onKey, true);
      cur = { el, done };
      // drawn once without .show, then shown: the transition runs from the first frame's place
      requestAnimationFrame(() => requestAnimationFrame(() => { if (!settled) el.classList.add('show'); }));
      timer = setTimeout(() => done('done'), SHOW_MS);
    });
  };
  // "close everything" closes the moment too, and nothing opens after it
  const closeAll = UI.closeAll;
  UI.closeAll = function () {
    if (cur) cur.done('gone');
    return closeAll.apply(this, arguments);
  };
})(typeof window !== 'undefined' ? window : globalThis);
