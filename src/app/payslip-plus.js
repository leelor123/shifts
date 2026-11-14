/* ============================================================
 * payslip-plus.js — following the payslips over time, part of Shaati Plus.
 *
 * The payslip check itself stays free for everyone, with every gap it finds, the open gaps, the letter and the
 * claim report (views-payslip.js, claim-report.js). Plus adds, on top of the payslips already saved:
 *  - a comparison between months: what changed in each main line from the payslip before (core/slipplus.js);
 *  - every payslip checked again together, against the shifts recorded now, with the sum of the gaps;
 *  - a detailed payslip report (every line, every finding, the changes) to keep as a PDF or print.
 * Where Plus cannot be bought on this phone (Plus.limited() is false), these are open to everyone, as the other
 * Plus extras are. Nothing here writes to the archive.
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, Store, UI, U } = root;
  const S = Store.S;
  const { icon, esc, money } = UI;
  const SP = root.SlipPlus;

  /** Plus can be bought here and is not on: the extras open the Plus page instead. */
  const locked = () => !!(root.Plus && root.Plus.limited && root.Plus.limited());
  const plusTag = () => (root.Plus && root.Plus.visible && root.Plus.visible() ? ' <span class="tag plus-tag">Plus</span>' : '');
  const gate = (fn) => (el) => { if (locked()) { root.Plus.sheet(); return; } fn(el); };
  const slips = () => SP.history(S.payslips);
  const fmt = (kind, x) => (kind === 'hours' ? `${U.num(x, 2)} ש׳` : kind === 'rate' ? `${U.money(x)} לשעה` : U.money(x));
  // the sign where the language's own number format puts a minus (a "+" in its place when it went up)
  const signed = (d, f) => (d < 0 ? f(d) : f(-d).replace(/[-−]/, '+'));
  const fmtDelta = (kind, d) => `<bdi>${kind === 'hours' ? `${signed(d, (x) => U.num(x, 2))} ש׳` : signed(d, (x) => U.money(x))}</bdi>`;
  const TO = () => (U.RTL ? '←' : '→'); // from the earlier payslip to this one, in the reading direction
  const STATUS = { ok: 'תקין', warn: 'כדאי לבדוק', bad: 'חסר או שגוי' };
  const CONF = { high: 'גבוה', medium: 'בינוני', low: 'נמוך' };

  /** One payslip checked against the shifts recorded now (the free check, run here again). */
  function check(slip) {
    let a = null, c = null;
    try { a = root.Payslip.analyze(slip, App.model); } catch (e) { console.warn('slip check', e); }
    if (a) { try { c = root.Payslip.checkGap(a, slip, App.model); } catch (e) { console.warn('slip gap', e); } }
    const itemOf = (f) => (c ? c.items.find((x) => x.id === f.id) : null);
    const statusOf = (f) => { const it = itemOf(f); return f.status === 'bad' && it && it.left < 1 ? 'warn' : f.status; };
    const counts = { ok: 0, warn: 0, bad: 0 };
    if (a) a.findings.forEach((f) => { counts[statusOf(f)]++; });
    const total = a ? a.totalMissing : 0;
    const left = Math.max(0, c && c.items.length ? c.left : total);
    return { slip, a, c, counts, total, left, statusOf, itemOf };
  }

  /* ---------------- the card in the payslips tab ---------------- */
  const item = (act, ic, t, s) => `<button class="item" data-act="${act}"><span class="lead" style="background:var(--surface-3)">${icon(ic)}</span>
    <span class="body"><span class="t">${t}</span><span class="s">${s}</span></span>${locked() ? `<span class="trail" aria-label="Plus">${icon('lock', 's')}</span>` : ''}</button>`;
  App.payslipPlusCard = function () {
    const n = slips().length;
    if (!n) return '';
    return `<div class="section-title">${icon('sparkle', 's')} מעקב תלושים${plusTag()}</div>
      <div class="list">
        ${n >= 2 ? item('slip-compare', 'chart', 'השוואה בין חודשים', 'מה השתנה בכל שורה מהתלוש הקודם') : ''}
        ${n >= 2 ? item('slip-recheck', 'refresh', 'בדיקה של כל התלושים יחד', `${n} תלושים מול המשמרות שרשומות עכשיו`) : ''}
        ${item('slip-report', 'file', 'דוח תלושים מפורט (PDF)', 'כל השורות והממצאים, לשמירה או להדפסה')}
      </div>`;
  };

  /* ---------------- comparison between months ---------------- */
  function compareSheet(id) {
    const all = slips();
    if (all.length < 2) { UI.toast('צריך לפחות 2 תלושים בארכיון כדי להשוות'); return; }
    let i = id ? all.findIndex((p) => p.id === id) : -1;
    if (i < 1) i = all.length - 1;
    const draw = (el) => {
      const now = all[i], prev = all[i - 1];
      const ch = SP.changes(SP.row(prev), SP.row(now));
      const months = all.slice(1).map((p, k) => `<button class="chip ${k + 1 === i ? 'on' : ''}" data-sc-i="${k + 1}" aria-pressed="${k + 1 === i}">${esc(U.fmtMonth(p.period))}</button>`).reverse().join('');
      const rows = ch.changed.map((x) => `<div class="item" style="cursor:default"><span class="body"><span class="t">${esc(x.label)}</span>
          <span class="s"><bdi>${fmt(x.kind, x.prev)}</bdi> ${TO()} <bdi>${fmt(x.kind, x.now)}</bdi></span></span>
          <span class="trail"><span class="a">${fmtDelta(x.kind, x.delta)}</span>${x.pct != null && Math.abs(x.pct) >= 1 ? `<br><span class="tiny muted"><bdi>${x.pct > 0 ? '+' : '−'}${Math.abs(x.pct)}%</bdi></span>` : ''}</span></div>`).join('');
      const recent = all.slice(-12).reverse().map((p) => { const r = SP.row(p); return `<tr><td>${esc(U.fmtMonth(p.period))}</td><td>${r.gross != null ? money(r.gross, 0) : '—'}</td><td>${r.net != null ? money(r.net, 0) : '—'}</td><td>${r.hours != null ? U.num(r.hours, 1) : '—'}</td></tr>`; }).join('');
      root.Dom.patch(el.querySelector('[data-sc]'), `
        <div class="chips" style="overflow-x:auto;flex-wrap:nowrap;margin-bottom:10px">${months}</div>
        <div class="small muted" style="margin:0 4px 8px">${esc(U.fmtMonth(now.period))} מול ${esc(U.fmtMonth(prev.period))}</div>
        ${rows ? `<div class="list">${rows}</div>` : `<div class="card tonal small">אין שינוי בשורות העיקריות מהתלוש הקודם.</div>`}
        ${ch.same ? `<div class="tiny muted" style="margin:6px 4px">${ch.same === 1 ? 'שורה אחת לא השתנתה' : `${ch.same} שורות לא השתנו`}.</div>` : ''}
        ${ch.onlyNow.length ? `<div class="tiny muted" style="margin:6px 4px">רק בתלוש הזה: ${esc(ch.onlyNow.join(', '))}.</div>` : ''}
        ${ch.onlyPrev.length ? `<div class="tiny muted" style="margin:6px 4px">רק בתלוש הקודם: ${esc(ch.onlyPrev.join(', '))}.</div>` : ''}
        <div class="banner" style="margin-top:10px">${icon('info', 's')}<div class="small">שינוי בין חודשים הוא לא בהכרח טעות. כדי לדעת אם חסר כסף, בדיקת התלוש משווה כל תלוש למשמרות שלך.</div></div>
        <div class="btn-row" style="margin-top:10px"><button class="btn tonal" data-act="payslip-open" data-id="${esc(now.id)}">${icon('receipt', 's')} לבדיקת התלוש</button><button class="btn tonal" data-sc-report>${icon('file', 's')} דוח PDF</button></div>
        <div class="section-title">${icon('chart', 's')} לאורך זמן</div>
        <div class="card" style="overflow-x:auto"><table class="sp-table" style="width:100%;border-collapse:collapse;font-size:.9em"><tr><th>חודש</th><th>ברוטו</th><th>נטו</th><th>שעות</th></tr>${recent}</table></div>`);
    };
    UI.openSheet({
      title: 'השוואה בין חודשים', full: true,
      body: '<div data-sc></div>',
      onMount: (el) => {
        draw(el);
        el.addEventListener('click', (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.scI) { i = +b.dataset.scI; draw(el); if (root.Fx) root.Fx.play('tick'); }
          else if (b.hasAttribute('data-sc-report')) report([all[i]]);
        });
      },
    });
  }

  /* ---------------- every payslip checked again together ---------------- */
  function recheckSheet() {
    const all = slips();
    if (all.length < 2) { UI.toast('צריך לפחות 2 תלושים בארכיון'); return; }
    const res = all.slice().reverse().map(check);
    const sum = SP.summary(res.map((r) => ({ period: r.slip.period, left: r.left })));
    const rowOf = (r) => {
      const was = r.slip.summary && r.slip.summary.left != null ? +r.slip.summary.left : null;
      const moved = was != null && Math.abs(was - r.left) >= 1;
      const k = r.counts;
      return `<button class="item" data-act="payslip-open" data-id="${esc(r.slip.id)}"><span class="lead" style="background:${r.left >= 1 ? 'var(--bad-bg)' : 'var(--surface-3)'};color:${r.left >= 1 ? 'var(--bad)' : 'inherit'}">${icon(r.left >= 1 ? 'xc' : 'okc')}</span>
        <span class="body"><span class="t">${esc(U.fmtMonth(r.slip.period))}</span><span class="s">${k.bad ? `<span class="ps-c bad">${icon('xc', 's')} ${k.bad}</span> ` : ''}${k.warn ? `<span class="ps-c warn">${icon('alert', 's')} ${k.warn}</span> ` : ''}${k.ok ? `<span class="ps-c ok">${icon('okc', 's')} ${k.ok}</span>` : ''}${moved ? ' · <span class="tag warn">השתנה מאז השמירה</span>' : ''}</span></span>
        <span class="trail"><span class="a">${r.left >= 1 ? money(r.left, 0) : 'תקין'}</span></span></button>`;
    };
    UI.openSheet({
      title: 'כל התלושים יחד', full: true,
      body: `<div class="card tonal">${sum.total >= 1
        ? `<div class="small">הפרש משוער בכל התלושים</div><div class="hero-num">${money(sum.total, 0)}</div><div class="tiny">${sum.withGap === 1 ? 'בחודש אחד' : `ב-${sum.withGap} חודשים`} מתוך ${sum.months}. הבדיקה רצה עכשיו על כל התלושים, מול המשמרות וההגדרות של היום.</div>`
        : `<b>${icon('okc', 's')} לא נמצאו חוסרים ב-${sum.months} התלושים</b><div class="small">הבדיקה רצה עכשיו על כל התלושים, מול המשמרות וההגדרות של היום.</div>`}</div>
        <div class="list">${res.map(rowOf).join('')}</div>
        <div class="btn-row" style="margin-top:12px"><button class="btn tonal" data-rc-report>${icon('file', 's')} דוח PDF לכל התלושים</button></div>
        ${sum.total >= 1 ? `<button class="btn text block" data-act="claim-report" style="margin-top:4px">${icon('send', 's')} דוח ומכתב לבירור מול המעסיק</button>` : ''}`,
      onMount: (el) => el.addEventListener('click', (e) => { if (e.target.closest('[data-rc-report]')) report(all); }),
    });
  }

  /* ---------------- the detailed payslip report (print / save as PDF) ---------------- */
  function reportHtml(list) {
    const all = slips();
    const prevOf = (p) => { const k = all.findIndex((x) => x.id === p.id); return k > 0 ? all[k - 1] : null; };
    const rs = SP.history(list).map(check);
    const tr = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    const total = SP.summary(rs.map((r) => ({ period: r.slip.period, left: r.left }))).total;
    const first = rs[0], last = rs[rs.length - 1];
    const part = (r) => {
      const F = r.slip.fields || {};
      const prev = prevOf(r.slip);
      const lines = root.Payslip.explainLines(F, prev && prev.fields);
      const ch = prev ? SP.changes(SP.row(prev), SP.row(r.slip)) : null;
      const fs = r.a ? r.a.findings.slice().sort((x, y) => ({ bad: 0, warn: 1, ok: 2 })[r.statusOf(x)] - ({ bad: 0, warn: 1, ok: 2 })[r.statusOf(y)]) : [];
      return `<section style="break-inside:avoid-page;margin-top:14pt">
        <h3>${esc(U.fmtMonth(r.slip.period))}</h3>
        <span class="kp">ברוטו: <b>${F.gross ? U.money(F.gross.value) : '—'}</b></span><span class="kp">נטו: <b>${F.net ? U.money(F.net.value) : '—'}</b></span><span class="kp">הפרש משוער: <b>${r.left >= 1 ? U.money(r.left) : 'לא נמצא'}</b></span>
        ${lines.length ? `<table><tr><th>שורה</th><th>סוג</th><th>סכום</th><th>כמות</th></tr>${lines.map((l) => tr([esc(l.label), esc(l.kindLabel || ''), l.kind === 'info' ? esc(U.num(l.value, 2)) : U.money(l.value), l.qty ? esc(U.num(l.qty, 2)) : ''])).join('')}</table>` : ''}
        ${fs.length ? `<table><tr><th>נושא</th><th>מה נמצא</th><th>מצב</th><th>הפרש משוער</th><th>ביטחון</th></tr>${fs.map((f) => { const st = r.statusOf(f); return tr([esc(f.area + ' · ' + f.title), esc(f.detail || ''), STATUS[st], f.amount > 0 && f.status !== 'ok' ? U.money(f.amount) : '—', CONF[f.confidence] || '']); }).join('')}</table>` : ''}
        ${ch && ch.changed.length ? `<div style="font-size:9.5pt">שינויים מ${esc(U.fmtMonth(prev.period))}: ${ch.changed.map((x) => `${esc(x.label)} ${fmt(x.kind, x.prev)} ${TO()} ${fmt(x.kind, x.now)}`).join(' · ')}</div>` : ''}
      </section>`;
    };
    return `<div class="claim">
      <h1>דוח תלושים מפורט</h1>
      <div>${esc(S.settings.userName || '')}${S.settings.userName ? ' · ' : ''}${rs.length === 1 ? esc(U.fmtMonth(first.slip.period)) : `${esc(U.fmtMonth(first.slip.period))} עד ${esc(U.fmtMonth(last.slip.period))}`} · הופק ${U.fmtDate(U.todayKey())}</div><br>
      <span class="kp">תלושים: <b>${rs.length}</b></span>${total >= 1 ? `<span class="kp">הפרש משוער בסך הכול: <b>${U.money(total)}</b></span>` : ''}
      ${rs.length > 1 ? `<table><tr><th>חודש</th><th>ברוטו</th><th>נטו</th><th>שעות</th><th>הפרש משוער</th></tr>${rs.map((r) => { const w = SP.row(r.slip); return tr([esc(U.fmtMonth(r.slip.period)), w.gross != null ? U.money(w.gross) : '—', w.net != null ? U.money(w.net) : '—', w.hours != null ? esc(U.num(w.hours, 2)) : '—', r.left >= 1 ? U.money(r.left) : '—']); }).join('')}</table>` : ''}
      ${rs.map(part).join('')}
      <div style="font-size:8pt;color:#555;margin-top:10pt">הופק באפליקציית Shaati לשמירה אישית. כל תלוש נבדק מול המשמרות וההגדרות שרשומות באפליקציה ביום ההפקה. זה כלי עזר ואינו ייעוץ משפטי או חשבונאי: הסכם קיבוצי, צו הרחבה ענפי או החוזה שלך יכולים לקבוע אחרת.</div>
    </div>`;
  }
  function report(list) {
    if (!list || !list.length) { UI.toast('עוד אין תלושים בארכיון'); return; }
    if (!App.exporter || !App.exporter.printHtml) return;
    App.exporter.printHtml(reportHtml(list));
  }
  /** Which payslips go into the report: the last one, the last 3, the last 12, or all of them. */
  function reportSheet() {
    const all = slips();
    if (!all.length) { UI.toast('עוד אין תלושים בארכיון'); return; }
    if (all.length === 1) { report(all); return; }
    const opts = [[1, 'התלוש האחרון'], [3, '3 התלושים האחרונים'], [12, '12 התלושים האחרונים']].filter(([n]) => n < all.length)
      .concat([[all.length, `כל התלושים (${all.length})`]]);
    UI.openSheet({
      title: 'דוח תלושים מפורט',
      body: `<div class="small muted" style="margin:0 4px 10px">כל השורות של כל תלוש, הממצאים מול המשמרות והשינויים מהחודש הקודם. בחלון ההדפסה אפשר לשמור כ-\u2060PDF.</div>
        <div class="list">${opts.map(([n, t]) => `<button class="item" data-rp="${n}"><span class="lead" style="background:var(--surface-3)">${icon('file')}</span><span class="body"><span class="t">${esc(t)}</span></span></button>`).join('')}</div>`,
      onMount: (el) => el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-rp]');
        if (!b) return;
        const pick = all.slice(-(+b.dataset.rp));
        UI.closeTop();
        setTimeout(() => report(pick), 320);
      }),
    });
  }

  App.actions['slip-compare'] = gate((el) => compareSheet(el && el.dataset && el.dataset.id));
  App.actions['slip-recheck'] = gate(() => recheckSheet());
  App.actions['slip-report'] = gate(() => reportSheet());
  App.payslipPlus = { reportHtml, check, locked };
})(typeof window !== 'undefined' ? window : globalThis);
