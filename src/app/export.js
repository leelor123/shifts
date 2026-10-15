/* ============================================================
 * export.js — CSV (Excel-friendly), .ics calendar, Google Calendar
 * link, printable PDF report and shareable summary image.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Engine, Store, UI, App } = root;
  const S = Store.S;
  const { esc } = UI;

  const csvCell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  function csv(rows) { return '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'); }
  const n2 = (x) => (Math.round((x || 0) * 100) / 100).toFixed(2);

  // exports use the free allowance (plus.js); with Plus they are unlimited
  const allowed = () => !root.Plus || root.Plus.use('export');
  function shiftsCsv(results, filename) {
    if (results.length && !allowed()) return; // an empty file costs nothing
    const head = ['תאריך', 'יום', 'מעסיק', 'תפקיד', 'התחלה', 'סיום', 'שעות לתשלום', 'הפסקה (דק׳)', 'רגילות', '125%', '150%', 'שבת/חג', 'שבת/חג + נוספות', 'לילה', 'שכר עבודה', 'תוספת שבת/חג', 'תוספת ש״נ', 'נסיעות', 'בונוס', 'טיפים', 'תוספות', 'ניכויים', 'סה״כ', 'סטטוס', 'עקיפה ידנית', 'סיבה', 'הערה'];
    const rows = [head];
    for (const r of results) {
      const sh = App.shift(r.id) || {};
      rows.push([
        r.dateKey, U.HEB_DAYS[U.dow(r.dateKey)], App.employer(r.employerId).name, [...new Set(r.segments.map((s) => App.roleName(s.roleId)))].join(' → '),
        U.epochHM(r.start), U.epochHM(r.rawEnd), n2(r.paidHours), r.breakMin || 0,
        n2(r.hoursBy.regular), n2(r.hoursBy.ot1), n2(r.hoursBy.ot2), n2(r.hoursBy.rest), n2(r.hoursBy.restOt1 + r.hoursBy.restOt2), n2(r.hoursBy.night),
        n2(r.wage), n2(r.restPremium), n2(r.otPremium), n2(r.travel.amount), n2(r.bonus), n2(r.tips), n2(r.additions), n2(r.deductions), n2(r.total),
        r.status === 'planned' ? 'מתוכננת' : 'בוצעה', r.overridden || r.dayRuleHit ? [...r.overrideList, r.dayRuleHit ? 'כלל יום' : ''].filter(Boolean).join('; ') : '', sh.overrideReason || '', sh.note || '',
      ]);
    }
    UI.download(filename || 'shifts.csv', csv(rows), 'text/csv;charset=utf-8');
    UI.toast('קובץ CSV נשמר — נפתח ב-Excel / Google Sheets');
  }
  function monthlyCsv() {
    if (!allowed()) return;
    const emp = S.employers[0];
    const cur = Engine.periodOf(U.todayKey(), emp).key;
    let first = cur;
    for (const r of App.model.results.values()) { const k = Engine.periodOf(r.dateKey, emp).key; if (k < first) first = k; }
    const rows = [['חודש', 'משמרות', 'שעות', 'רגילות', 'נוספות', 'שבת/חג', 'שכר עבודה', 'נסיעות', 'בונוסים ותוספות', 'חופשה/מחלה', 'ניכויים', 'ברוטו', 'נטו משוער', 'מס הכנסה משוער', 'ביטוח לאומי+בריאות', 'פנסיה עובד']];
    for (let pk = first; pk <= cur; pk = U.addMonthKey(pk, 1)) {
      const s = Engine.periodSummary(App.model, pk, emp.id);
      rows.push([pk, s.shifts, n2(s.hours), n2(s.hoursBy.regular), n2(s.hoursBy.ot1 + s.hoursBy.ot2), n2(s.restHours), n2(s.wage), n2(s.travel), n2(s.bonus + s.additions), n2(s.leavePay), n2(s.deductions), n2(s.gross), n2(s.net.net), n2(s.net.incomeTax), n2(s.net.bl + s.net.health), n2(s.net.pensionEmployee)]);
    }
    UI.download('monthly-summary.csv', csv(rows), 'text/csv;charset=utf-8');
  }

  /* ---------------- calendar ---------------- */
  const icsDate = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  function ics(results, filename) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shaati//HE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const r of results) {
      const roles = [...new Set(r.segments.map((s) => App.roleName(s.roleId)))].join(' → ');
      const sh = App.shift(r.id) || {};
      lines.push('BEGIN:VEVENT', `UID:${r.id}@shiftpay`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(r.start)}`, `DTEND:${icsDate(r.rawEnd)}`,
        `SUMMARY:${icsEsc('משמרת · ' + roles + (r.status === 'planned' ? ' (מתוכננת)' : ''))}`,
        `DESCRIPTION:${icsEsc(`${U.hm(r.paidMin)} שעות · ${U.money(r.total)}${sh.note ? '\n' + sh.note : ''}`)}`);
      if (r.status === 'planned') lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:משמרת', 'TRIGGER:-PT60M', 'END:VALARM');
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    UI.download(filename || 'shifts.ics', lines.join('\r\n'), 'text/calendar;charset=utf-8');
    UI.toast('קובץ יומן נשמר — פתח אותו כדי להוסיף ליומן');
  }
  function gcalLink(sh, r) {
    const roles = [...new Set(r.segments.map((s) => App.roleName(s.roleId)))].join(' → ');
    const p = new URLSearchParams({ action: 'TEMPLATE', text: 'משמרת · ' + roles, dates: icsDate(r.start) + '/' + icsDate(r.rawEnd), details: `${U.hm(r.paidMin)} שעות` });
    return 'https://calendar.google.com/calendar/render?' + p.toString();
  }

  /* ---------------- printable PDF report ---------------- */
  function printReport(from, to, label) {
    if (!allowed()) return;
    const t = Engine.rangeSummary(App.model, from, to);
    const list = [...App.model.results.values()].filter((r) => r.status === 'done' && r.dateKey >= from && r.dateKey <= to).sort((a, b) => a.start - b.start);
    const roles = Object.entries(t.byRole).map(([id, v]) => `<tr><td>${esc(App.roleName(id))}</td><td>${U.hours(v.hours)}</td><td>${U.money(v.amount)}</td></tr>`).join('');
    const el = document.getElementById('print-root');
    el.innerHTML = `<div dir="rtl">
      <h1>דוח שכר — ${esc(label)}</h1><div>${U.fmtDate(from)} – ${U.fmtDate(to)} · הופק ${U.fmtDate(U.todayKey())}</div><br>
      <span class="kp">ברוטו: <b>${U.money(t.gross)}</b></span><span class="kp">נטו משוער: <b>${U.money(t.net.net)}</b></span><span class="kp">שעות: <b>${U.hours(t.hours)}</b></span><span class="kp">משמרות: <b>${t.shifts}</b></span><span class="kp">נסיעות: <b>${U.money(t.travel)}</b></span><span class="kp">ממוצע לשעה: <b>${U.money(t.avgHourly)}</b></span>
      <h3>לפי תפקיד</h3><table><tr><th>תפקיד</th><th>שעות</th><th>סכום</th></tr>${roles}</table>
      <h3>לפי סוג שעה</h3><table><tr><th>רגילות</th><th>125%</th><th>150%</th><th>שבת/חג</th><th>שבת/חג + נוספות</th><th>לילה</th></tr><tr><td>${U.hours(t.hoursBy.regular)}</td><td>${U.hours(t.hoursBy.ot1)}</td><td>${U.hours(t.hoursBy.ot2)}</td><td>${U.hours(t.hoursBy.rest)}</td><td>${U.hours(t.hoursBy.restOt1 + t.hoursBy.restOt2)}</td><td>${U.hours(t.hoursBy.night)}</td></tr></table>
      <h3>משמרות</h3><table><tr><th>תאריך</th><th>תפקיד</th><th>שעות</th><th>זמן</th><th>שבת/חג</th><th>נוספות</th><th>שכר</th><th>נסיעות</th><th>סה״כ</th><th>הערות</th></tr>
      ${list.map((r) => { const sh = App.shift(r.id) || {}; return `<tr><td>${U.fmtDate(r.dateKey, 'short')} ${U.HEB_DAYS_SHORT[U.dow(r.dateKey)]}</td><td>${esc([...new Set(r.segments.map((s) => App.roleName(s.roleId)))].join(' → '))}</td><td>⁦${U.epochHM(r.start)}–${U.epochHM(r.rawEnd)}⁩</td><td>${U.hours(r.paidHours)}</td><td>${r.restHours ? U.hours(r.restHours) : ''}</td><td>${r.otHours ? U.hours(r.otHours) : ''}</td><td>${U.money(r.wage)}</td><td>${U.money(r.travel.amount)}</td><td>${U.money(r.total)}</td><td>${r.overridden || r.dayRuleHit ? '✋ ' + esc(sh.overrideReason || 'עקיפה ידנית') : ''} ${esc(sh.note || '')}</td></tr>`; }).join('')}</table>
      <div style="font-size:8pt;color:#555;margin-top:10pt">נטו משוער — הערכה בלבד. נסיעות לפי ${U.money(S.employers[0].travelPerDay)} ליום${+S.employers[0].travelMonthlyCap ? ', תקרה ' + U.money(S.employers[0].travelMonthlyCap) : ''}.</div></div>`;
    UI.toast('בחלון ההדפסה בחר "שמור כ-PDF"');
    setTimeout(() => window.print(), 300);
  }

  /* ---------------- summary as image ---------------- */
  async function summaryImage(r, t, p, sentence) {
    try { await document.fonts.ready; } catch (e) { /* ignore */ }
    const W = 1080, H = 1350;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const cs = getComputedStyle(document.documentElement);
    const col = (v, f) => (cs.getPropertyValue(v).trim() || f);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, col('--primary-container', '#dfe0ff'));
    bg.addColorStop(1, col('--surface', '#fbfbff'));
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const ink = col('--on-surface', '#111'), sub = col('--on-surface-var', '#555'), prim = col('--primary', '#3f51b5');
    const fam = (App.FONTS[S.settings.font] || App.FONTS.rubik)[0];
    const font = (w, s) => `${w} ${s}px '${fam}', Assistant, Arial, sans-serif`;
    g.direction = 'rtl'; g.textAlign = 'right';
    const X = W - 80;
    g.fillStyle = sub; g.font = font(600, 40); g.fillText('סיכום', X, 120);
    g.fillStyle = ink; g.font = font(800, 64); g.fillText(r.label, X, 200);
    g.fillStyle = sub; g.font = font(500, 36); g.fillText('ברוטו', X, 320);
    g.fillStyle = ink; g.font = font(800, 130); g.fillText(U.money(t.gross, 0), X, 450);
    if (p && p.gross) {
      const d = ((t.gross - p.gross) / p.gross) * 100;
      g.fillStyle = d >= 0 ? '#0a7d0a' : '#c62828'; g.font = font(700, 40);
      g.fillText(`${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d))}% מהתקופה הקודמת`, X, 520);
    }
    const tiles = [['נטו משוער', U.money(t.net.net, 0)], ['שעות', U.hm(t.hours * 60)], ['משמרות', String(t.shifts)], ['ממוצע לשעה', U.money(t.avgHourly)]];
    tiles.forEach(([l, v], i) => {
      const cx = i % 2, cy = Math.floor(i / 2);
      const x = W - 80 - cx * 470, y = 600 + cy * 230;
      g.fillStyle = 'rgba(255,255,255,.55)';
      roundRect(g, x - 440, y, 440, 200, 36); g.fill();
      g.fillStyle = sub; g.font = font(500, 34); g.fillText(l, x - 36, y + 70);
      g.fillStyle = ink; g.font = font(800, 60); g.fillText(v, x - 36, y + 150);
    });
    if (sentence) { g.fillStyle = ink; g.font = font(500, 38); wrap(g, sentence, X, 1110, W - 160, 52); }
    g.fillStyle = prim; g.font = font(700, 30); g.fillText('Shaati', X, H - 60);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    await UI.shareFile(`summary-${r.from || ''}.png`, blob, 'סיכום שכר');
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function wrap(g, text, x, y, maxW, lh) {
    const words = text.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; } else line = test;
    }
    if (line) g.fillText(line, x, y);
  }

  App.exporter = { shiftsCsv, monthlyCsv, ics, gcalLink, printReport, summaryImage, csv };
})(typeof window !== 'undefined' ? window : globalThis);
