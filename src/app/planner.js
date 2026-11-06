/* ============================================================
 * planner.js (app): what planned shifts pay, on the screen: the one best-paying shift of a calendar month or
 * week and of an imported schedule (a single calm line, never a badge on every shift), and "what if I swap" from
 * a planned shift's sheet. The numbers come from core/planner.js, which asks the engine.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, UI, App, Store } = root;
  const S = Store.S;
  const { icon, esc, money } = UI;
  const P = () => root.Planner;

  App.planner = {};
  /** The best-paying planned shift among engine results still ahead (or null). */
  App.planner.best = (results) => P().best(results, { now: Date.now() });

  /**
   * The one line: "המשמרת הכי משתלמת השבוע: שישי בלילה, ₪412", its reason under it. title: the line's own words ('המשמרת הכי משתלמת השבוע', …)
   * With opts.open the line opens the shift (the calendar); without, it only tells (an import, not saved yet).
   */
  App.planner.bestLine = function (b, title, opts) {
    if (!b) return '';
    opts = opts || {};
    const date = opts.date ? ` · ${U.fmtDate(b.r.dateKey, 'short')}` : '';
    const inner = `<span class="plb-ic" aria-hidden="true">${icon('star', 's')}</span><span class="plb-b"><span class="plb-t">${esc(title)}: <b>${esc(b.when)}${date}, <span class="num">${money(b.wage, 0)}</span></b></span>${b.text ? `<span class="plb-s">${esc(b.text)}</span>` : ''}</span>`;
    return opts.open ? `<button class="pl-best" data-act="shift-open" data-id="${esc(b.id)}">${inner}</button>` : `<div class="pl-best">${inner}</div>`;
  };

  /* ---------------- what if I swap ---------------- */
  App.sheetsApi.swapSheet = function (id) {
    const sh = App.shift(id);
    const r0 = App.result(id);
    if (!sh || !r0) return;
    const d = { date: r0.dateKey, startT: U.epochHM(sh.start), endT: U.epochHM(sh.end) };
    const cand = () => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !/^\d{2}:\d{2}$/.test(d.startT) || !/^\d{2}:\d{2}$/.test(d.endT)) return null;
      const start = U.toEpoch(d.date, d.startT);
      let end = U.toEpoch(d.date, d.endT);
      if (end <= start) end = U.toEpoch(U.addDays(d.date, 1), d.endT);
      return { start, end };
    };
    const same = (c) => c && c.start === sh.start && c.end === sh.end;
    const compare = () => { const c = cand(); try { return c && !same(c) ? P().swap(S.shifts, App.model.ctx, id, c) : null; } catch (e) { console.warn('swap', e); return null; } };
    function resultHtml(res) {
      const c = cand();
      if (!c) return '<div class="sw-hint small muted">בוחרים יום ושעות</div>';
      if (same(c)) return '<div class="sw-hint small muted">אלה השעות של המשמרת שלך. בוחרים את היום והשעות של המשמרת האחרת, ומיד רואים מה זה עושה לשכר.</div>';
      if (!res) return '<div class="sw-hint small muted">לא הצלחנו לחשב את המשמרת הזו</div>';
      const dir = Math.abs(res.delta) < 1 ? 'eq' : res.delta > 0 ? 'up' : 'down';
      const parts = res.parts.map((x) => `<li><span>${esc(x.label)}</span><b class="num">${esc(P().signed(x.delta))}</b></li>`).join('');
      return `<div class="sw-head ${dir}">${esc(P().swapTitle(res))}</div>
        <div class="small muted sw-vs">${esc(P().whenOf(res.after.start))}: <span class="num">${money(res.after.wage, 0)}</span> במקום <span class="num">${money(res.before.wage, 0)}</span></div>
        ${parts ? `<ul class="sw-why">${parts}</ul>` : ''}
        ${Math.abs(res.others) >= 1 ? `<div class="tiny muted sw-note">מזה ${esc(P().signed(res.others))} במשמרות האחרות שלך באותו שבוע</div>` : ''}
        ${res.overlap ? `<div class="banner warn sw-clash">${icon('alert', 's')}<div>יש לך כבר משמרת בשעות האלה</div></div>` : ''}`;
    }
    const inp = (f, v, extra) => `<input class="input" data-sw="${f}" value="${esc(v)}" ${extra}>`;
    const entry = UI.openSheet({
      title: 'מה אם אחליף?', cls: 'swap-sheet',
      body: `<div class="small muted sw-from">המשמרת שלך: ${esc(P().whenOf(r0.start))}, ${U.fmtDate(r0.dateKey, 'short')} · <span class="num">\u2066${U.epochHM(r0.start)}\u2060–\u2060${U.epochHM(r0.rawEnd)}\u2069</span> · <span class="num">${money(r0.wage, 0)}</span></div>
        <div class="section-title">${icon('swap', 's')} המשמרת האחרת</div>
        <label class="field"><span class="lbl">תאריך</span>${inp('date', d.date, `type="date" min="${U.todayKey()}" max="${U.addDays(U.todayKey(), 366)}"`)}</label>
        <div class="grid2"><label class="field"><span class="lbl">התחלה</span>${inp('startT', d.startT, 'type="time"')}</label><label class="field"><span class="lbl">סיום</span>${inp('endT', d.endT, 'type="time"')}</label></div>
        <div class="card sw-res" id="sw-res" aria-live="polite">${resultHtml(null)}</div>`,
      foot: '<button class="btn" data-sw-take disabled></button>',
    });
    const el = entry.sh;
    const take = el.querySelector('[data-sw-take]');
    const box = el.querySelector('#sw-res');
    function redraw() {
      const res = compare();
      root.Dom.patch(box, resultHtml(res));
      take.disabled = !res;
      take.innerHTML = `${icon('swap', 's')} להחליף למשמרת הזו`;
    }
    redraw();
    el.addEventListener('input', (e) => { const f = e.target.dataset && e.target.dataset.sw; if (f) { d[f] = e.target.value; redraw(); } });
    el.addEventListener('change', (e) => { const f = e.target.dataset && e.target.dataset.sw; if (f) { d[f] = e.target.value; redraw(); } });
    take.addEventListener('click', async () => {
      const c = cand();
      if (!c || same(c) || !compare()) return;
      take.disabled = true;
      const res = compare();
      UI.closeTop();
      // the shift itself moves to the new hours (splits and manual changes were for the old ones, as in the comparison)
      const put = Object.assign(Store.clone(sh), { start: c.start, end: c.end, splits: [], overrides: null, status: 'planned' });
      await App.saveOps([{ store: 'shifts', put }], 'החלפת משמרת', `המשמרת עברה ל-${U.fmtDate(U.epochKey(c.start), 'short')} · ${P().swapTitle(res)}`);
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
