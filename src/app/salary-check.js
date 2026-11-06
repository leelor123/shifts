/* ============================================================
 * salary-check.js — "did the salary arrive?" on the home screen (App.salaryCard(), placed by the home screen).
 * From pay day at noon (the first employer's payDay, Engine.periodOf), once: "המשכורת של <month> נכנסה? צפי: ₪X נטו",
 * with "כן, בדיוק", "סכום אחר" (a number) and "עוד לא" (asked again the next day, for a week at most;
 * Moments.salaryState). A different amount shows the gap and a way to the payslip check, until it is closed.
 * The answers stay on this phone, in meta.salaryAns by pay period ({ a, d, amt, exp, raw, closed }; raw: the estimate before the
 * learned correction). From two answers on, the net estimate learns from them (core/netlearn.js, App.netLearned).
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, Store, UI, U, Engine } = root;
  const S = Store.S;
  const { icon, esc, money } = UI;
  let typing = null; // the period whose amount is being typed

  /** The pay period asked about today and what it expects: { P, exp, minor, ans, state } or null. */
  function due() {
    const emp = S.employers && S.employers[0], M = root.Moments;
    if (!emp || !M || !App.model || S.settings.demo) return null;
    const today = U.todayKey(), hour = new Date().getHours();
    const cur = Engine.periodOf(today, emp);
    const P = [Engine.periodOf(U.addDays(cur.from, -1), emp), cur].find((x) => x.payDate <= today && today <= U.addDays(x.payDate, M.ASK_DAYS));
    if (!P) return null;
    const all = S.meta.salaryAns && typeof S.meta.salaryAns === 'object' ? S.meta.salaryAns : {};
    const raw = all[P.key];
    const ans = raw && typeof raw === 'object' ? { a: String(raw.a), d: String(raw.d || ''), amt: +raw.amt || 0, exp: +raw.exp || 0, closed: !!raw.closed } : null;
    const state = M.salaryState(ans, P.payDate, today, hour);
    if (!state) return null;
    const sum = Engine.periodSummary(App.model, P.key, emp.id);
    if (!(sum.gross > 0)) return null;
    // raw: the estimate before the learned correction (core/netlearn.js learns from it, so a correction never feeds itself)
    return { P, exp: Math.round(sum.net.net), raw: Math.round(sum.net.rawNet != null ? sum.net.rawNet : sum.net.net), minor: !!sum.net.minor, ans, state };
  }
  async function save(key, patch) {
    const all = Object.assign({}, S.meta.salaryAns);
    all[key] = Object.assign({}, all[key], patch);
    const keys = Object.keys(all).sort();
    while (keys.length > 12) delete all[keys.shift()]; // a year of answers is enough
    await Store.setMeta({ salaryAns: all });
    App.recompute(); // the net estimate learns from what arrived
  }

  App.salaryCard = function () {
    const d = due();
    if (!d) return '';
    const card = (inner) => `<div class="card salary-card" data-key="salary-card">${inner}</div>`;
    const btn = (act, cls, label, ic) => `<button class="btn${cls ? ' ' + cls : ''}" data-act="${act}">${ic ? icon(ic, 's') + ' ' : ''}${label}</button>`;
    if (d.state === 'gap') {
      const g = root.Moments.salaryGap(d.ans.exp, d.ans.amt);
      const came = `נכנסו ${money(d.ans.amt, 0)} על ${esc(d.P.label)}`;
      // the amounts each at a line's end, never before a full stop (a shekel sign and a dot read badly together)
      const gap = g.less ? `${money(-g.diff, 0)} פחות מהצפי` : `${money(g.diff, 0)} יותר מהצפי`;
      const exp = `צפי: ${money(d.ans.exp, 0)}`;
      const tip = g.less ? 'כדאי לבדוק בתלוש מה ירד.' : 'אפשר לבדוק בתלוש ממה זה בא.';
      return card(`<div class="sc-q">${came}</div><div class="sc-gap"><b>${gap}</b> · ${exp}</div><div class="sc-exp">${tip}</div>
        <div class="btn-row">${btn('salary-check', '', 'בדיקת תלוש', 'file')}${btn('salary-close', 'text', 'סגירה')}</div>`);
    }
    const q = `המשכורת של ${esc(d.P.label)} נכנסה?`;
    const exp = d.minor ? `צפי: ${money(d.exp, 0)}` : `צפי: ${money(d.exp, 0)} נטו`;
    const head = `<div class="sc-q">${icon('wallet', 's')} ${q}</div><div class="sc-exp">${exp}</div>`;
    if (typing === d.P.key) {
      const ph = 'כמה נכנס, בשקלים';
      return card(`${head}<div class="sc-in"><input type="number" inputmode="decimal" min="0" step="1" class="input" id="salary-amt" aria-label="${ph}" placeholder="${ph}">${btn('salary-save', '', 'שמירה')}</div>
        <div class="btn-row">${btn('salary-back', 'text', 'ביטול')}</div>`);
    }
    return card(`${head}<div class="btn-row">${btn('salary-yes', 'tonal', 'כן, בדיוק')}${btn('salary-other', 'tonal', 'סכום אחר')}${btn('salary-not', 'text', 'עוד לא')}</div>`);
  };

  App.actions['salary-yes'] = async () => {
    const d = due(); if (!d) return;
    await save(d.P.key, { a: 'yes', d: U.todayKey(), exp: d.exp, raw: d.raw, amt: d.exp });
    UI.toast('מעולה, נרשם', null, { ok: true });
    App.rerender();
  };
  App.actions['salary-not'] = async () => {
    const d = due(); if (!d) return;
    await save(d.P.key, { a: 'not', d: U.todayKey(), exp: d.exp, raw: d.raw });
    UI.toast('בסדר, נשאל שוב מחר');
    App.rerender();
  };
  App.actions['salary-other'] = () => {
    const d = due(); if (!d) return;
    typing = d.P.key;
    App.rerender();
    setTimeout(() => { const i = document.getElementById('salary-amt'); if (i) i.focus({ preventScroll: true }); }, 60);
  };
  App.actions['salary-back'] = () => { typing = null; App.rerender(); };
  App.actions['salary-save'] = async () => {
    const d = due(); if (!d) return;
    const i = document.getElementById('salary-amt');
    const amt = Math.round(+String(i && i.value || '').replace(/[^\d.]/g, ''));
    if (!(amt > 0) || amt > 1e6) { if (root.Fx) root.Fx.nope(); if (i) i.focus(); return; }
    typing = null;
    const g = root.Moments.salaryGap(d.exp, amt);
    // a few shekels off is the same salary
    await save(d.P.key, { a: g.small ? 'yes' : 'other', d: U.todayKey(), exp: d.exp, raw: d.raw, amt });
    if (g.small) UI.toast('נרשם. כמעט בדיוק כמו הצפי', null, { ok: true });
    App.rerender();
  };
  App.actions['salary-close'] = async () => {
    const d = due(); if (!d) return;
    await save(d.P.key, { closed: true });
    App.rerender();
  };
  App.actions['salary-check'] = async () => {
    const d = due();
    if (d) await save(d.P.key, { closed: true });
    App.rerender();
    App.actions['payslip-new']();
  };
  /* ---------------- the net that learned from these answers (core/netlearn.js) ---------------- */
  /** The sentence on the learned correction, or ''. */
  App.netLearnText = function () {
    const L = App.netLearned && App.netLearned();
    if (!L) return '';
    const amt = U.money(Math.abs(L.adj), 0); // plain text (UI.money is HTML)
    return L.adj > 0 ? `לפי המשכורות שקיבלת, הנטו שלך בדרך כלל ${amt} פחות מהחישוב. הנטו המשוער כבר כולל את זה.`
      : `לפי המשכורות שקיבלת, הנטו שלך בדרך כלל ${amt} יותר מהחישוב. הנטו המשוער כבר כולל את זה.`;
  };
  App.netLearnHtml = function () {
    const t = App.netLearnText();
    return t ? `<p class="net-learned">${icon('sparkle', 's')} ${esc(t)}</p>` : '';
  };
  App.actions['net-learn-reset'] = async () => {
    const before = S.meta.netLearnReset || '';
    await Store.setMeta({ netLearnReset: root.NetLearn.resetKeyOf(S.meta.salaryAns) });
    App.recompute();
    App.rerender();
    UI.toast('הנטו חזר לחישוב הרגיל', { label: 'ביטול', fn: async () => { await Store.setMeta({ netLearnReset: before }); App.recompute(); App.rerender(); } });
  };
  // Enter in the amount saves it
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target && e.target.id === 'salary-amt') { e.preventDefault(); App.actions['salary-save'](); } });
})(typeof window !== 'undefined' ? window : globalThis);
