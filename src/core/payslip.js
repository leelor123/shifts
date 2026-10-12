/* ============================================================
 * payslip.js — payslip text parsing, privacy redaction, analysis
 * against the recorded shifts, explanations and employer message.
 * Runs fully on the device. (Optional AI parsing lives in the app
 * layer and only receives redacted text the user approved.)
 * ============================================================ */
(function (root) {
  'use strict';
  const U = root.U;
  const Engine = root.Engine;

  /* ---------------- field dictionary ----------------
   * kind: pay = earning, ded = employee deduction, emp = employer contribution,
   *       total, info. Matching order = array order (most specific first). */
  const FIELDS = [
    { key: 'vacationBalance', label: 'יתרת ימי חופשה', kind: 'info', pats: ['יתרת חופשה', 'יתרה חופשה', 'יתרת ימי חופשה', 'חופשה יתרה'] },
    { key: 'sickBalance', label: 'יתרת ימי מחלה', kind: 'info', pats: ['יתרת מחלה', 'יתרה מחלה', 'יתרת ימי מחלה', 'מחלה יתרה'] },
    { key: 'creditPoints', label: 'נקודות זיכוי', kind: 'info', pats: ['נקודות זיכוי', 'נק. זיכוי', "נק' זיכוי", 'נק זיכוי'] },
    { key: 'ytdGross', label: 'ברוטו מצטבר (שנתי)', kind: 'info', pats: ['ברוטו מצטבר', 'מצטבר ברוטו', 'ברוטו שנתי'] },
    { key: 'ytdTax', label: 'מס הכנסה מצטבר', kind: 'info', pats: ['מס הכנסה מצטבר', 'מס מצטבר'] },
    { key: 'taxableGross', label: 'ברוטו למס', kind: 'info', pats: ['ברוטו למס', 'הכנסה חייבת', 'שכר חייב'] },
    { key: 'net', label: 'נטו לתשלום', kind: 'total', pats: ['נטו לתשלום', 'שכר נטו', 'סה"כ נטו', 'סה״כ נטו', 'נטו'] },
    { key: 'totalDeductions', label: 'סה״כ ניכויים', kind: 'total', pats: ['סה"כ ניכויים', 'סה״כ ניכויים', 'סך הניכויים', 'סך ניכויים', 'סה"כ ניכויי חובה'] },
    { key: 'gross', label: 'ברוטו', kind: 'total', pats: ['סה"כ ברוטו', 'סה״כ ברוטו', 'שכר ברוטו', 'סך כל התשלומים', 'סה"כ תשלומים', 'סה״כ תשלומים', 'ברוטו'] },
    { key: 'pensionEmployer', label: 'פנסיה — חלק המעסיק', kind: 'emp', pats: ['תגמולי מעביד', 'תגמולי מעסיק', 'פנסיה מעביד', 'פנסיה מעסיק', 'גמל מעביד', 'גמל מעסיק', 'הפרשת מעביד', 'הפרשת מעסיק'] },
    { key: 'severance', label: 'פיצויים (מעסיק)', kind: 'emp', pats: ['פיצויים'] },
    { key: 'hishtalmutEmployer', label: 'קרן השתלמות — מעסיק', kind: 'emp', pats: ['השתלמות מעביד', 'השתלמות מעסיק', 'קה"ש מעביד', 'קה"ש מעסיק'] },
    { key: 'incomeTax', label: 'מס הכנסה', kind: 'ded', pats: ['מס הכנסה', 'מ.הכנסה', 'מ. הכנסה', 'מס הכ'] },
    { key: 'nationalInsurance', label: 'ביטוח לאומי', kind: 'ded', pats: ['ביטוח לאומי', 'בטוח לאומי', 'ב.לאומי', 'ב. לאומי', 'ב"ל'] },
    { key: 'healthTax', label: 'מס בריאות', kind: 'ded', pats: ['מס בריאות', 'דמי בריאות', 'ביטוח בריאות', 'בטוח בריאות'] },
    { key: 'hishtalmutEmployee', label: 'קרן השתלמות — עובד', kind: 'ded', pats: ['קרן השתלמות', 'השתלמות', 'קה"ש'] },
    { key: 'pensionEmployee', label: 'פנסיה — חלק העובד', kind: 'ded', pats: ['תגמולי עובד', 'פנסיה עובד', 'גמל עובד', 'קופ"ג עובד', 'קרן פנסיה', 'פנסיה', 'תגמולים', 'גמל'] },
    { key: 'rest200', label: 'שבת/חג + נוספות 200%', kind: 'pay', hours: true, pats: ['200%', 'שעות 200'] },
    { key: 'rest175', label: 'שבת/חג + נוספות 175%', kind: 'pay', hours: true, pats: ['175%', 'שעות 175'] },
    { key: 'rest150', label: 'שעות שבת/חג 150%', kind: 'pay', hours: true, pats: ['שבת', 'חג 150', 'שעות חג', 'מנוחה'] },
    { key: 'ot150', label: 'שעות נוספות 150%', kind: 'pay', hours: true, pats: ['150%', 'נוספות 150', 'ש.נ 150', 'ש"נ 150', 'ש.נ. 150'] },
    { key: 'ot125', label: 'שעות נוספות 125%', kind: 'pay', hours: true, pats: ['125%', 'נוספות 125', 'ש.נ 125', 'ש"נ 125', 'ש.נ. 125', 'שעות נוספות'] },
    { key: 'night', label: 'תוספת לילה', kind: 'pay', pats: ['לילה'] },
    { key: 'seniority', label: 'תוספת ותק', kind: 'pay', pats: ['ותק'] },
    { key: 'travel', label: 'נסיעות', kind: 'pay', pats: ['נסיעות', 'נסיעה', 'דמי נסיעה'] },
    { key: 'recuperation', label: 'דמי הבראה', kind: 'pay', pats: ['הבראה'] },
    { key: 'vacationPay', label: 'דמי חופשה', kind: 'pay', pats: ['דמי חופשה', 'חופשה'] },
    { key: 'sickPay', label: 'דמי מחלה', kind: 'pay', pats: ['דמי מחלה', 'מחלה'] },
    { key: 'holidayPay', label: 'דמי חגים', kind: 'pay', pats: ['דמי חג', 'חגים'] },
    { key: 'bonus', label: 'בונוס / פרמיה', kind: 'pay', pats: ['בונוס', 'פרמיה', 'מענק', 'תמריץ'] },
    { key: 'diff', label: 'הפרשי שכר / תיקונים', kind: 'pay', pats: ['הפרשי', 'הפרש', 'רטרו', 'תיקון'] },
    { key: 'base', label: 'שכר יסוד / שעות רגילות', kind: 'pay', hours: true, pats: ['שכר יסוד', 'שכר בסיס', 'שעות רגילות', 'שכר רגיל', 'שכר שעתי', 'שעות 100', '100%', 'משכורת'] },
    { key: 'workHours', label: 'סה״כ שעות עבודה', kind: 'info', pats: ['סה"כ שעות', 'סה״כ שעות', 'שעות עבודה', 'שעות בפועל'] },
    { key: 'workDays', label: 'ימי עבודה', kind: 'info', pats: ['ימי עבודה', 'ימים בפועל'] },
  ];
  const FIELD = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
  const HOUR_FIELDS = ['base', 'ot125', 'ot150', 'rest150', 'rest175', 'rest200'];

  /* ---------------- explanations (plain Hebrew) ---------------- */
  const EXPLAIN = {
    base: 'השכר על השעות הרגילות (100%): מספר השעות × התעריף לשעה. זה הבסיס לחישוב פנסיה, חופשה ומחלה.',
    ot125: 'שעות נוספות: אחרי ' + '8' + ' שעות ביום, השעתיים הראשונות משולמות ב-125% מהתעריף.',
    ot150: 'שעות נוספות מעבר לשעתיים הראשונות: 150% מהתעריף.',
    rest150: 'שעות בשבת או בחג משולמות ב-150% מהתעריף (לפי חוק שעות עבודה ומנוחה).',
    rest175: 'שעות נוספות שנעשו בשבת או בחג — השעתיים הראשונות: 175%.',
    rest200: 'שעות נוספות בשבת או בחג מעבר לשעתיים: 200%.',
    night: 'תוספת על שעות לילה — לפי ההסכם או הנוהג אצל המעסיק (לא חובה בחוק לכל העובדים).',
    seniority: 'תוספת לפי ותק — לפי הסכם קיבוצי או חוזה אישי.',
    travel: 'החזר הוצאות נסיעה לעבודה: לפי מספר ימי העבודה בפועל, עד תקרה יומית (22.60 ₪ לפי צו ההרחבה, 2025). החזר הנסיעות חייב במס.',
    recuperation: 'דמי הבראה: אחרי שנת עבודה. מספר ימים לפי ותק × תעריף יומי (418 ₪ במגזר הפרטי) × היקף המשרה.',
    vacationPay: 'תשלום על ימי חופשה שנוצלו — לפי השכר היומי הממוצע.',
    sickPay: 'דמי מחלה לפי חוק: יום ראשון — ללא תשלום, ימים 2–3 — 50%, מהיום הרביעי — 100%.',
    holidayPay: 'דמי חגים: לעובדים שעתיים אחרי 3 חודשי עבודה, על ימי חג שחלו ביום חול ולא עבדו בהם (לפי צו ההרחבה).',
    bonus: 'בונוס, פרמיה או מענק — לפי מדיניות המעסיק. חייב במס ובביטוח לאומי.',
    diff: 'הפרשים — תיקון של חודשים קודמים (למשל שעות שלא שולמו). כדאי לבדוק אם זה סוגר פער פתוח.',
    gross: 'ברוטו: סך כל התשלומים לפני ניכויים.',
    net: 'נטו: מה שנכנס לחשבון הבנק — ברוטו פחות כל הניכויים.',
    totalDeductions: 'סך כל הניכויים מהברוטו: מס הכנסה, ביטוח לאומי, מס בריאות, פנסיה וניכויים נוספים.',
    incomeTax: 'מס הכנסה: מחושב לפי מדרגות מס (10%, 14%, 20%...) על השכר החודשי, פחות זיכוי על כל נקודת זיכוי (242 ₪ לנקודה) ופחות זיכוי על הפקדה לפנסיה. אם הוא עלה — לרוב כי הברוטו עלה ונכנסת למדרגה גבוהה יותר.',
    nationalInsurance: 'ביטוח לאומי (חלק העובד): 1.04% על השכר עד 7,522 ₪ ו-7% מעל (2025). משתנה ישירות עם הברוטו.',
    healthTax: 'מס בריאות: 3.23% עד 7,522 ₪ ו-5.17% מעל (2025). מממן את קופת החולים.',
    pensionEmployee: 'הפרשת העובד לפנסיה: לרוב 6% מהשכר הקובע. נחסך על שמך ומקטין את מס ההכנסה (זיכוי 35%).',
    pensionEmployer: 'הפרשת המעסיק לתגמולים: לרוב 6.5%. לא יורד מהנטו — זה כסף נוסף שנחסך בשבילך.',
    severance: 'הפרשת המעסיק לפיצויים: 6% עד 8.33%. נצבר בקרן הפנסיה.',
    hishtalmutEmployee: 'קרן השתלמות — חלק העובד (לרוב 2.5%). חיסכון שאפשר למשוך אחרי 6 שנים, פטור ממס עד תקרה.',
    hishtalmutEmployer: 'קרן השתלמות — חלק המעסיק (לרוב 7.5%).',
    creditPoints: 'נקודות זיכוי: מקטינות את מס ההכנסה (כל נקודה 242 ₪ בחודש). תושב/ת: 2.25; אישה: 2.75; ועוד לפי ילדים, תואר, שחרור מצבא וכו׳.',
    vacationBalance: 'כמה ימי חופשה צברת ועדיין לא ניצלת.',
    sickBalance: 'כמה ימי מחלה צברת (1.5 ימים לחודש עבודה מלא, עד 90).',
    ytdGross: 'סכום הברוטו מתחילת השנה.',
    ytdTax: 'סך מס ההכנסה שנוכה מתחילת השנה.',
    taxableGross: 'השכר החייב במס: הברוטו אחרי הפחתות מסוימות.',
    workHours: 'סך השעות שהמעסיק רשם לחודש.',
    workDays: 'מספר ימי העבודה שהמעסיק רשם — משמש גם לחישוב הנסיעות.',
  };

  /* ---------------- text helpers ---------------- */
  const HEB = /[֐-׿]/;
  const revStr = (s) => s.split('').reverse().join('');
  /** Visual-order (reversed) Hebrew → logical order: reverse token order, reverse letters of Hebrew tokens. */
  function fixVisual(line) {
    return line.split(/\s+/).reverse().map((t) => (HEB.test(t) ? revStr(t) : t)).join(' ');
  }
  function normalize(s) {
    return s.replace(/[‎‏‪-‮]/g, '').replace(/[״“”]/g, '"').replace(/[׳‘’`]/g, "'").replace(/\s+/g, ' ').trim();
  }
  /** Numbers in a line, in reading order. Handles 1,234.56 / trailing minus / percents. */
  function numbersIn(line) {
    const clean = line.replace(/\b\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}\b/g, ' ');
    const re = /(-?)(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(-?)(\s*%)?/g;
    const out = [];
    let m;
    while ((m = re.exec(clean))) {
      const raw = m[2];
      if (!raw.includes('.') && !raw.includes(',') && raw.length > 6) continue; // ids
      let v = parseFloat(raw.replace(/,/g, ''));
      if (m[1] === '-' || m[3] === '-') v = -v;
      out.push({ v, pct: !!m[4], dec: raw.includes('.'), raw: m[0] });
    }
    return out;
  }
  function matchField(line) {
    const n = normalize(line);
    for (const f of FIELDS) {
      for (const p of f.pats) {
        if (n.includes(p)) {
          // 150% lines that mention Shabbat/holiday belong to rest150
          if (f.key === 'ot150' && /שבת|חג|מנוחה/.test(n)) return FIELD.rest150;
          if (f.key === 'ot125' && /שבת|חג|מנוחה/.test(n) && /150/.test(n)) return FIELD.rest150;
          if (f.key === 'gross' && /למס|מצטבר/.test(n)) continue;
          if (f.key === 'net' && /מצטבר/.test(n)) continue;
          return f;
        }
      }
    }
    return null;
  }
  /** Choose amount / qty / rate from a line's numbers. */
  function pickValues(f, nums) {
    const vals = nums.filter((x) => !x.pct).map((x) => x.v);
    const pcts = nums.filter((x) => x.pct).map((x) => x.v);
    if (!vals.length) return null;
    if (f.kind === 'info') return { value: vals[0] };
    if (vals.length >= 3) {
      for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) for (let k = 0; k < vals.length; k++) {
        if (k === i || k === j) continue;
        const prod = vals[i] * vals[j];
        if (vals[k] !== 0 && Math.abs(prod - vals[k]) / Math.abs(vals[k]) < 0.015) {
          return { value: vals[k], qty: vals[i], rate: vals[j], pct: pcts[0] };
        }
      }
    }
    if (vals.length === 2 && f.hours) {
      // qty + amount (rate missing)
      return { value: vals[1], qty: vals[0], pct: pcts[0] };
    }
    return { value: vals[vals.length - 1], pct: pcts[0] };
  }

  /** Group pdf.js text items into logical lines (right-to-left). */
  function linesFromPdfItems(items) {
    const rows = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4], y = it.transform[5];
      let row = rows.find((r) => Math.abs(r.y - y) < 3);
      if (!row) { row = { y, items: [] }; rows.push(row); }
      row.items.push({ x, s: it.str, w: it.width || 0 });
    }
    rows.sort((a, b) => b.y - a.y);
    return rows.map((r) => r.items.sort((a, b) => b.x - a.x).map((i) => i.s).join(' '));
  }

  const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  function detectPeriod(text) {
    const counts = {};
    const bump = (y, m) => { if (y < 2000 || y > 2100 || m < 1 || m > 12) return; const k = y + '-' + U.pad(m); counts[k] = (counts[k] || 0) + 1; };
    let m;
    const re1 = /(?:^|[^\d])(\d{1,2})[\/.-](20\d{2})(?!\d)/g;
    while ((m = re1.exec(text))) bump(+m[2], +m[1]);
    MONTHS.forEach((name, i) => {
      const re = new RegExp(name + "\\s*['׳]?\\s*(20\\d{2})", 'g');
      let mm;
      while ((mm = re.exec(text))) { bump(+mm[1], i + 1); bump(+mm[1], i + 1); }
    });
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : null;
  }

  /**
   * Parse raw text (one line per row).
   * Returns { fields:{key:{value,qty,rate,pct,line}}, other:[{line,value,guess}], period, lineCount }
   */
  function parseText(text) {
    const rawLines = text.split(/\r?\n/).map(normalize).filter(Boolean);
    const fields = {};
    const other = [];
    for (const raw of rawLines) {
      let f = matchField(raw);
      let line = raw;
      if (!f && HEB.test(raw)) {
        const alt = fixVisual(raw);
        f = matchField(alt);
        if (f) line = alt;
      }
      const nums = numbersIn(line);
      if (!f) {
        const vals = nums.filter((x) => !x.pct && x.dec);
        if (vals.length && HEB.test(line)) other.push({ line, value: vals[vals.length - 1].v, guess: null });
        continue;
      }
      const pv = pickValues(f, nums);
      if (!pv) continue;
      if (fields[f.key]) {
        // a second line for the same field: sum earnings (e.g. two roles' base pay), keep first for others
        if (f.kind === 'pay') {
          const cur = fields[f.key];
          cur.value += pv.value;
          if (pv.qty != null) cur.qty = (cur.qty || 0) + pv.qty;
          cur.line += ' | ' + line;
          cur.rate = cur.qty ? cur.value / cur.qty : cur.rate;
        }
        continue;
      }
      fields[f.key] = Object.assign({ line }, pv);
    }
    return { fields, other, period: detectPeriod(text), lineCount: rawLines.length };
  }

  /* ---------------- redaction (before optional AI) ---------------- */
  function redact(text) {
    let count = 0;
    const lines = text.split(/\r?\n/).map((line) => {
      let l = line;
      if (/(רחוב|רח'|רח׳|כתובת|מיקוד|ת\.ד|דירה|שכונת|ישוב:|יישוב:)/.test(l)) { count++; return '[כתובת הוסתרה]'; }
      if (/(בנק|סניף|חשבון|IBAN|מס' חשבון)/i.test(l)) {
        l = l.replace(/\d[\d\-\s]{2,}\d/g, () => { count++; return '[פרטי בנק הוסתרו]'; });
      }
      if (/(ת\.ז|ת"ז|ת״ז|תעודת זהות|מספר זהות|מס' זהות|זהות)/.test(l)) {
        l = l.replace(/\d[\d\-\s]{4,}\d/g, () => { count++; return '[ת״ז הוסתרה]'; });
      }
      l = l.replace(/\b\d{9}\b/g, () => { count++; return '[מספר הוסתר]'; });
      l = l.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, () => { count++; return '[אימייל הוסתר]'; });
      l = l.replace(/(?:\+972[-\s]?|\b0)(?:5\d|[2-489]|7\d)[-\s]?\d{3}[-\s]?\d{4}\b/g, () => { count++; return '[טלפון הוסתר]'; });
      return l;
    });
    return { text: lines.join('\n'), count };
  }

  /** JSON schema for the optional AI extraction (structured output).
   *  Kept flat with no optional/union types: qty and rate are 0 when absent. */
  function aiSchema() {
    return {
      type: 'object',
      properties: {
        period: { type: 'string', description: 'Pay month as YYYY-MM, or empty string' },
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', enum: FIELDS.map((f) => f.key) },
              value: { type: 'number' }, qty: { type: 'number' }, rate: { type: 'number' },
            },
            required: ['key', 'value', 'qty', 'rate'], additionalProperties: false,
          },
        },
        otherLines: {
          type: 'array',
          items: {
            type: 'object',
            properties: { label: { type: 'string' }, amount: { type: 'number' }, type: { type: 'string', enum: ['payment', 'deduction', 'employer', 'info'] } },
            required: ['label', 'amount', 'type'], additionalProperties: false,
          },
        },
        notes: { type: 'string' },
      },
      required: ['period', 'fields', 'otherLines', 'notes'], additionalProperties: false,
    };
  }
  function aiPrompt() {
    return 'You read the text of an Israeli payslip (תלוש שכר) produced by PDF text extraction or Hebrew OCR. ' +
      'Hebrew words may appear reversed (visual order) and table columns may be out of order; reconstruct the meaning carefully. ' +
      'Personal details were replaced with placeholders such as [ת״ז הוסתרה]; ignore them.\n' +
      'Return the monthly amounts in ILS for every field key below that appears in the payslip (omit keys that do not appear). ' +
      'For hour-based lines also return qty (hours) and rate (ILS per hour); use 0 when a line has no quantity or rate. ' +
      'Deductions are positive numbers. Do not invent values. Year-to-date (מצטבר) columns go only to the ytd* keys.\n' +
      'Field keys: ' + FIELDS.map((f) => `${f.key} = ${f.label}`).join('; ') + '.\n' +
      'Put every other payment, deduction or employer-contribution line in otherLines. ' +
      'period is the pay month (YYYY-MM) if visible, otherwise an empty string. notes: one short Hebrew sentence about anything unclear, or an empty string.';
  }
  /** Convert AI JSON to the same {fields, other, period} shape as parseText. */
  function fromAi(json) {
    const fields = {};
    for (const x of json.fields || []) {
      if (!FIELD[x.key] || x.value == null) continue;
      fields[x.key] = { value: +x.value, qty: x.qty ? +x.qty : undefined, rate: x.rate ? +x.rate : undefined, line: 'AI' };
    }
    const other = (json.otherLines || []).map((o) => ({ line: o.label, value: o.amount, guess: o.type === 'deduction' ? 'otherDed' : o.type === 'payment' ? 'otherPay' : 'ignore' }));
    return { fields, other, period: /^\d{4}-\d{2}$/.test(json.period || '') ? json.period : null, notes: json.notes || '' };
  }

  /* ---------------- analysis ---------------- */
  const val = (F, k) => (F[k] && F[k].value != null && !isNaN(F[k].value) ? +F[k].value : null);
  const qty = (F, k) => (F[k] && F[k].qty != null && !isNaN(F[k].qty) ? +F[k].qty : null);

  /** App-side expectations for a pay period. */
  function expected(model, pk, useAuto) {
    const emp = model.ctx.primaryEmployer();
    const P = Engine.periodByKey(pk, emp);
    const results = useAuto && model.autoResults && model.autoResults.size ? model.autoResults : model.results;
    const m = Object.assign({}, model, { results });
    const t = Engine.totals(m, P.from, P.to);
    const pay = { base: 0, ot125: 0, ot150: 0, rest150: 0, rest175: 0, rest200: 0 };
    const hrs = { base: 0, ot125: 0, ot150: 0, rest150: 0, rest175: 0, rest200: 0 };
    const shifts = [];
    for (const r of results.values()) {
      if (r.status !== 'done' || r.dateKey < P.from || r.dateKey > P.to) continue;
      shifts.push(r);
      for (const l of r.lines) {
        const k = l.rest ? ['rest150', 'rest175', 'rest200'][l.tier] : ['base', 'ot125', 'ot150'][l.tier];
        pay[k] += l.amount; hrs[k] += l.hours;
      }
    }
    shifts.sort((a, b) => a.start - b.start);
    const net = Engine.netEstimate({ gross: t.gross, pensionBase: Engine.pensionBaseOf(t, model.ctx.settings), deductions: t.deductions, periodTo: P.to }, model.ctx.settings);
    return { P, t, pay, hrs, shifts, net, avgRate: t.hours ? t.wage / t.hours : 0, baseRate: hrs.base ? pay.base / hrs.base : 0 };
  }

  /**
   * Compare a verified payslip to the recorded shifts.
   * slip = { period:'YYYY-MM', fields:{...}, other:[{line,value,guess}] }
   */
  function analyze(slip, model) {
    const S = model.ctx.settings;
    const F = slip.fields || {};
    const E = expected(model, slip.period, false);
    const A = expected(model, slip.period, true);
    const overridesInPeriod = E.shifts.filter((r) => r.overridden || r.dayRuleHit);
    const hasOv = overridesInPeriod.length > 0;
    const findings = [];
    let fid = 0;
    const add = (o) => findings.push(Object.assign({ id: 'f' + (++fid), amount: 0, shifts: [], confidence: 'medium', fromOverride: null }, o));
    const ovNote = (appVal, autoVal, slipVal, tol) => {
      if (!hasOv || Math.abs(appVal - autoVal) < tol) return null;
      if (slipVal != null && Math.abs(slipVal - autoVal) <= Math.abs(slipVal - appVal)) {
        return `הפער נובע כנראה מעקיפה ידנית שהזנת ב-${overridesInPeriod.length} משמרות: בלי העקיפה האפליקציה הייתה מחשבת ${U.num(autoVal, 2)} — קרוב למה שבתלוש.`;
      }
      return `שים לב: ${overridesInPeriod.length} משמרות בתקופה כוללות עקיפה ידנית (חישוב אוטומטי: ${U.num(autoVal, 2)}).`;
    };
    const dates = (rs) => rs.map((r) => U.fmtDate(r.dateKey, 'short')).join(', ');

    /* 1. total hours */
    let covered = []; // shifts already identified as unpaid — excluded from the OT / rest checks to avoid double counting
    const slipHours = HOUR_FIELDS.reduce((s, k) => s + (qty(F, k) || 0), 0) || val(F, 'workHours');
    const appHours = E.t.hours;
    if (slipHours == null || slipHours === 0) {
      add({ area: 'שעות', status: 'warn', title: 'לא זוהו שעות בתלוש', detail: `באפליקציה רשומות ${U.hours(appHours)} שעות לתקופה. אם התלוש מציג שעות, הוסף אותן במסך האימות כדי לבדוק התאמה.`, basis: 'אין כמות שעות בשורות התלוש שזוהו.', confidence: 'low' });
    } else {
      const diff = appHours - slipHours;
      if (diff > 0.25) {
        // try to name the missing shift(s)
        // which shift(s) are probably missing? 1) the last shifts of the period (cut-off), 2) a single shift of that length
        let suspects = [], how = '', conf = 'medium';
        let acc = 0; const tail = [];
        for (let i = E.shifts.length - 1; i >= 0 && acc < diff - 0.3; i--) { acc += E.shifts[i].paidHours; tail.unshift(E.shifts[i]); }
        if (tail.length && Math.abs(acc - diff) <= 0.3) {
          suspects = tail; conf = 'high';
          how = tail.length > 1 ? 'המשמרות האחרונות בתקופה — ייתכן שנכנסו לתלוש הבא' : 'המשמרת האחרונה בתקופה — ייתכן שנכנסה לתלוש הבא';
        } else {
          const same = E.shifts.filter((r) => Math.abs(r.paidHours - diff) <= 0.3);
          if (same.length === 1) { suspects = same; how = 'משמרת באורך השעות החסרות'; conf = 'high'; }
          else if (same.length > 1) { suspects = same; how = 'אחת מהמשמרות באורך הזה'; }
        }
        if (conf === 'high') covered = suspects;
        const exact = conf === 'high' ? suspects.reduce((x, r) => x + r.wage, 0) : 0;
        const amount = exact || diff * E.avgRate;
        add({ area: 'שעות', status: 'bad', title: 'שעות שלא שולמו', amount, shifts: suspects.map((r) => r.id),
          detail: `רשמת ${U.hours(appHours)} שעות, בתלוש ${U.hours(slipHours)}. חסרות ${U.hours(diff)} שעות` + (suspects.length ? ` (${how}: ${dates(suspects)})` : '') + (exact ? `. השכר על ${suspects.length > 1 ? 'המשמרות האלה' : 'המשמרת הזו'} לפי החישוב: ${U.money(amount)} (כולל תוספות).` : `. לפי שכר ממוצע של ${U.money(E.avgRate)} לשעה ≈ ${U.money(amount)}.`),
          basis: 'השוואת סך השעות בתלוש לשעות ששולמו לפי המשמרות שרשמת לתקופה ' + '⁦' + U.fmtDate(E.P.from, 'short') + '–' + U.fmtDate(E.P.to, 'short') + '⁩.',
          confidence: conf, fromOverride: ovNote(appHours, A.t.hours, slipHours, 0.1) });
      } else if (diff < -0.25) {
        add({ area: 'שעות', status: 'warn', title: 'בתלוש יש יותר שעות ממה שרשמת', detail: `בתלוש ${U.hours(slipHours)} שעות, באפליקציה ${U.hours(appHours)}. אולי שכחת לרשום משמרת?`, basis: 'השוואת סך השעות.', confidence: 'medium' });
      } else {
        add({ area: 'שעות', status: 'ok', title: 'סך השעות תואם', detail: `${U.hours(slipHours)} שעות בתלוש מול ${U.hours(appHours)} באפליקציה.`, basis: 'השוואת סך השעות.', confidence: 'high' });
      }
    }

    /* 2. hourly base rate */
    const bq = qty(F, 'base'), bv = val(F, 'base');
    if (bq && bv && E.hrs.base > 0) {
      const slipRate = F.base.rate || bv / bq;
      // rates actually used in the period (per role, by date)
      const rates = [];
      for (const r of E.shifts) for (const l of r.lines) if (!l.rest && l.tier === 0) rates.push(l.rate);
      const minRate = rates.length ? Math.min(...rates) : E.baseRate;
      const maxRate = rates.length ? Math.max(...rates) : E.baseRate;
      const mixed = maxRate - minRate > 0.01;
      if (slipRate < minRate - 0.02) {
        // below even the lowest agreed rate → certainly underpaid on every regular hour
        const amount = (E.baseRate - slipRate) * bq;
        add({ area: 'תעריף', status: 'bad', title: 'תעריף לשעה נמוך מהמוסכם', amount,
          detail: `בתלוש ${U.money(slipRate)} לשעה, ${mixed ? `נמוך מהתעריף הנמוך ביותר שלך בתקופה (${U.money(minRate)})` : `התעריף שהגדרת ${U.money(minRate)}`}. על ${U.hours(bq)} שעות רגילות ≈ ${U.money(amount)}.`,
          basis: 'שכר יסוד ÷ שעות רגילות בתלוש, מול התעריף לפי תאריך המשמרת (כולל היסטוריית תעריפים).',
          confidence: mixed ? 'medium' : 'high', fromOverride: ovNote(E.baseRate, A.baseRate, slipRate, 0.01) });
      } else if (mixed && slipRate < E.baseRate - 0.02 && Math.abs(bq - E.hrs.base) <= 0.25) {
        add({ area: 'תעריף', status: 'warn', title: 'תעריף ממוצע נמוך מהצפוי', amount: (E.baseRate - slipRate) * bq,
          detail: `בתלוש ${U.money(slipRate)} לשעה בממוצע; לפי המשמרות שרשמת הממוצע המשוקלל ${U.money(E.baseRate)} (תעריפים ⁦${U.money(minRate)}–${U.money(maxRate)}⁩). ייתכן שחלק מהשעות שולמו בתעריף של תפקיד זול יותר — או שחסרות שעות בתפקיד היקר.`,
          basis: 'השוואת ממוצע משוקלל; תלוי בתמהיל התפקידים.', confidence: 'low' });
      } else {
        add({ area: 'תעריף', status: 'ok', title: 'התעריף לשעה תקין', detail: `${U.money(slipRate)} לשעה בתלוש (באפליקציה: ${mixed ? '⁦' + U.money(minRate) + '–' + U.money(maxRate) + '⁩' : U.money(E.baseRate)}).` + (mixed && Math.abs(bq - E.hrs.base) > 0.25 ? ' הממוצע לא הושווה כי מספר השעות שונה.' : ''), basis: 'שכר יסוד ÷ שעות רגילות.', confidence: mixed ? 'medium' : 'high' });
      }
    }

    /* 3. Shabbat & holiday */
    const slipRestH = (qty(F, 'rest150') || 0) + (qty(F, 'rest175') || 0) + (qty(F, 'rest200') || 0);
    const slipRestPay = (val(F, 'rest150') || 0) + (val(F, 'rest175') || 0) + (val(F, 'rest200') || 0);
    const covSum = (f) => covered.reduce((x, r) => x + f(r), 0);
    const appRestH = E.t.restHours - covSum((r) => r.restHours);
    if (appRestH > 0.01 || slipRestH > 0 || slipRestPay > 0) {
      const restShifts = E.shifts.filter((r) => r.restHours > 0 && !covered.includes(r));
      if (slipRestH === 0 && slipRestPay === 0 && appRestH > 0.25) {
        const amount = E.t.restPremium;
        add({ area: 'שבת וחג', status: 'bad', title: 'לא שולמה תוספת שבת/חג', amount, shifts: restShifts.map((r) => r.id),
          detail: `רשמת ${U.hours(appRestH)} שעות בשבת/חג (${dates(restShifts)}), ובתלוש לא מופיעה שורת שבת/חג. התוספת (מעבר ל-100%) ≈ ${U.money(amount)}.`,
          basis: 'חלון השבת/חג לפי ' + (S.rest.mode === 'city' ? 'זמני כניסה ויציאה ב' + S.rest.city : 'השעות הקבועות שהגדרת') + ', ' + (model.ctx.primaryEmployer().restPct || 150) + '%.',
          confidence: 'medium', fromOverride: ovNote(appRestH, A.t.restHours, 0, 0.1) });
      } else if (slipRestH > 0 && appRestH - slipRestH > 0.25) {
        const missingH = appRestH - slipRestH;
        const amount = missingH * E.avgRate * ((model.ctx.primaryEmployer().restPct || 150) - 100) / 100;
        add({ area: 'שבת וחג', status: 'bad', title: 'חסרות שעות שבת/חג', amount, shifts: restShifts.map((r) => r.id),
          detail: `באפליקציה ${U.hours(appRestH)} שעות שבת/חג, בתלוש ${U.hours(slipRestH)}. ${U.hours(missingH)} שעות כנראה שולמו כרגילות; התוספת החסרה ≈ ${U.money(amount)}.`,
          basis: 'השוואת שעות 150%/175%/200% בתלוש לשעות בתוך חלון השבת/חג.', confidence: 'medium',
          fromOverride: ovNote(appRestH, A.t.restHours, slipRestH, 0.1) });
      } else if (slipRestH > 0 && slipRestPay > 0) {
        const eff = slipRestPay / slipRestH;
        const exp = E.pay.rest150 + E.pay.rest175 + E.pay.rest200;
        const expRate = appRestH > 0 ? exp / appRestH : 0;
        if (expRate > 0 && eff < expRate * 0.97) {
          const amount = (expRate - eff) * slipRestH;
          add({ area: 'שבת וחג', status: 'bad', title: 'תעריף שבת/חג נמוך', amount, detail: `בתלוש ${U.money(eff)} לשעת שבת, צפוי ${U.money(expRate)}. ≈ ${U.money(amount)}.`, basis: 'סכום ÷ שעות בשורות השבת/חג.', confidence: 'medium' });
        } else add({ area: 'שבת וחג', status: 'ok', title: 'שעות שבת/חג תקינות', detail: `${U.hours(slipRestH)} שעות בתלוש מול ${U.hours(appRestH)} באפליקציה.`, basis: 'שעות 150%/175%/200%.', confidence: 'medium' });
      } else if (slipRestH > appRestH + 0.25) {
        add({ area: 'שבת וחג', status: 'warn', title: 'בתלוש יותר שעות שבת/חג', detail: `בתלוש ${U.hours(slipRestH)}, באפליקציה ${U.hours(appRestH)}. ייתכן שהמעסיק מגדיר את חלון השבת אחרת — אפשר לכוון בהגדרות › שבת וחגים.`, basis: 'השוואת שעות.', confidence: 'low' });
      } else add({ area: 'שבת וחג', status: 'ok', title: 'שעות שבת/חג תקינות', detail: `${U.hours(slipRestH)} שעות.`, basis: 'השוואת שעות.', confidence: 'medium' });
    }

    /* 4. overtime */
    const slipOt = (qty(F, 'ot125') || 0) + (qty(F, 'ot150') || 0);
    const appOt1 = E.t.hoursBy.ot1 - covSum((r) => r.hoursBy.ot1), appOt2 = E.t.hoursBy.ot2 - covSum((r) => r.hoursBy.ot2);
    const appOt = appOt1 + appOt2;
    if (appOt > 0.25 || slipOt > 0) {
      const otShifts = E.shifts.filter((r) => r.hoursBy.ot1 + r.hoursBy.ot2 > 0 && !covered.includes(r));
      if (appOt - slipOt > 0.25) {
        const missing125 = Math.max(0, appOt1 - (qty(F, 'ot125') || 0));
        const missing150 = Math.max(0, appOt2 - (qty(F, 'ot150') || 0));
        const amount = E.avgRate * (missing125 * 0.25 + missing150 * 0.5);
        add({ area: 'שעות נוספות', status: 'bad', title: 'שעות נוספות חסרות', amount, shifts: otShifts.map((r) => r.id),
          detail: `באפליקציה ${U.hours(appOt1)} ש׳ ב-125% ו-${U.hours(appOt2)} ש׳ ב-150% (${dates(otShifts)})${covered.length ? ', לא כולל המשמרות שחסרות לגמרי' : ''}; בתלוש ${U.hours(qty(F, 'ot125') || 0)} ו-${U.hours(qty(F, 'ot150') || 0)}. התוספת החסרה ≈ ${U.money(amount)}.`,
          basis: 'שעות נוספות יומיות אחרי ' + model.ctx.primaryEmployer().otThreshold + ' שעות (לפי ההגדרות).', confidence: 'medium',
          fromOverride: ovNote(appOt, A.t.hoursBy.ot1 + A.t.hoursBy.ot2, slipOt, 0.1) });
      } else add({ area: 'שעות נוספות', status: 'ok', title: 'שעות נוספות תקינות', detail: `${U.hours(slipOt)} בתלוש מול ${U.hours(appOt)} באפליקציה.`, basis: 'השוואת שעות 125%/150%.', confidence: 'medium' });
    }

    /* 5. travel */
    const slipTravel = val(F, 'travel');
    if (E.t.travel > 0 || slipTravel) {
      const d = E.t.travel - (slipTravel || 0);
      const emp = model.ctx.primaryEmployer();
      const basis = `${E.t.workDays} ימי עבודה × ${U.money(emp.travelPerDay)}` + (+emp.travelMonthlyCap ? `, תקרה ${U.money(emp.travelMonthlyCap)}` : '') + '.';
      if (d > 1) add({ area: 'נסיעות', status: 'bad', title: 'החזר נסיעות חסר', amount: d, detail: `צפוי ${U.money(E.t.travel)}, בתלוש ${U.money(slipTravel || 0)}.` + (val(F, 'workDays') ? ` המעסיק רשם ${val(F, 'workDays')} ימי עבודה.` : ''), basis, confidence: 'high', fromOverride: ovNote(E.t.travel, A.t.travel, slipTravel, 0.5) });
      else if (d < -1) add({ area: 'נסיעות', status: 'warn', title: 'נסיעות גבוהות מהצפוי', detail: `בתלוש ${U.money(slipTravel)}, צפוי ${U.money(E.t.travel)}. אולי התעריף היומי שהגדרת שונה?`, basis, confidence: 'medium' });
      else add({ area: 'נסיעות', status: 'ok', title: 'נסיעות תקינות', detail: U.money(slipTravel || 0), basis, confidence: 'high' });
    }

    /* 6. minimum wage */
    const rateForMin = bq && bv ? (F.base.rate || bv / bq) : E.baseRate;
    if (rateForMin > 0) {
      const MW = Engine.minWageFor(S, (slip.period || U.todayKey().slice(0, 7)) + '-15');
      const mw = MW.hourly;
      if (rateForMin + 0.005 < mw) {
        const h = bq || E.hrs.base;
        add({ area: 'שכר מינימום', status: 'bad', title: 'שכר נמוך משכר המינימום', amount: (mw - rateForMin) * h, detail: `${U.money(rateForMin)} לשעה, שכר המינימום ${U.money(mw)}.`, basis: 'שכר מינימום לשעה כפי שמוגדר בהגדרות (עדכן אם השתנה).', confidence: 'high' });
      } else add({ area: 'שכר מינימום', status: 'ok', title: 'מעל שכר המינימום', detail: `${U.money(rateForMin)} ≥ ${U.money(mw)} לשעה.`, basis: MW.custom ? 'שכר מינימום לשעה (מההגדרות).' : `שכר מינימום ${MW.youth ? 'לנוער בגיל ' + MW.age : 'למבוגר'} לפי החוק, מ-${U.fmtDate(MW.from)}.`, confidence: 'high' });
    }

    /* 7. pension */
    const gross = val(F, 'gross');
    // pensionable wage per the settings: "base" = all paid hours × hourly rate; "all" = gross without travel/recuperation
    const slipBaseRate = bq && bv ? (F.base.rate || bv / bq) : 0;
    const pBase = S.pension.base === 'base' && slipBaseRate && slipHours
      ? slipHours * slipBaseRate
      : (gross || E.t.gross) - (slipTravel || 0) - (val(F, 'recuperation') || 0);
    const active = Engine.pensionActive(S, E.P.to);
    const pe = val(F, 'pensionEmployee'), pr = val(F, 'pensionEmployer');
    if (S.pension.enabled) {
      if (active && !pe) {
        const amount = pBase * ((+S.pension.employerPct || 0) + (+S.pension.severancePct || 0)) / 100;
        add({ area: 'פנסיה', status: 'bad', title: 'לא נמצאה הפרשה לפנסיה', amount,
          detail: `לפי תאריך תחילת העבודה (${S.startDate ? U.fmtDate(S.startDate) : '—'}) ההפרשות היו אמורות להתחיל אחרי ${S.pension.startAfterMonths} חודשים. חלק המעסיק (תגמולים + פיצויים) ≈ ${U.money(amount)} בחודש.`,
          basis: 'צו ההרחבה לפנסיה חובה. הסכום הוא כסף שהמעסיק אמור להפקיד לקרן, לא לנטו.', confidence: S.startDate ? 'medium' : 'low',
          note: 'אם הייתה לך קרן פנסיה פעילה לפני כן — ההפרשה אמורה להתחיל כבר אחרי 3 חודשים (ולעיתים רטרואקטיבית). כדאי לוודא מול המעסיק.' });
      } else if (pe) {
        const p = pBase > 0 ? (pe / pBase) * 100 : 0;
        const ok = Math.abs(p - S.pension.employeePct) <= 0.6;
        add({ area: 'פנסיה', status: ok ? 'ok' : 'warn', title: ok ? 'הפרשת עובד לפנסיה תקינה' : 'אחוז הפרשה לפנסיה לא צפוי',
          detail: `${U.money(pe)} = ${U.num(p, 2)}% מ-${U.money(pBase)} (צפוי ~${S.pension.employeePct}%).` + (pr ? ` מעסיק: ${U.money(pr)} (${U.num(pBase ? pr / pBase * 100 : 0, 2)}%).` : ''),
          basis: (S.pension.base === 'base' ? 'הבסיס המשוער: כל השעות × התעריף הבסיסי (בלי תוספות)' : 'הבסיס המשוער: ברוטו פחות נסיעות והבראה') + '. השכר הקובע לפנסיה עשוי להיות שונה לפי ההסכם — אפשר לשנות בהגדרות › נטו משוער.', confidence: 'low' });
        if (pr != null && pBase > 0 && pr / pBase * 100 < (+S.pension.employerPct || 6.5) - 0.6) {
          add({ area: 'פנסיה', status: 'warn', title: 'הפרשת המעסיק נמוכה', amount: pBase * S.pension.employerPct / 100 - pr, detail: `${U.num(pr / pBase * 100, 2)}% במקום ${S.pension.employerPct}%.`, basis: 'צו ההרחבה: לפחות 6.5% תגמולי מעסיק.', confidence: 'low' });
        }
      } else if (!active) {
        const minorP = Engine.isMinor(S, E.P.to);
        add({ area: 'פנסיה', status: 'ok', title: 'פנסיה עוד לא חובה', detail: minorP ? 'מתחת לגיל 18 אין חובת הפרשה לפנסיה.' : `ההפרשות מתחילות אחרי ${S.pension.startAfterMonths} חודשי עבודה.`, basis: 'צו ההרחבה לפנסיה חובה.', confidence: S.startDate ? 'medium' : 'low' });
      }
    }

    /* 8. recuperation */
    const L = Engine.leaveBalances(model, E.P.to);
    if (L.recuperation && L.recuperation.eligible) {
      const rm = +S.leave.recuperationMonth || 0;
      const month = +slip.period.slice(5, 7);
      const rec = val(F, 'recuperation');
      if (rm === 0 || rm === month) {
        const exp = rm === 0 ? L.recuperation.amount / 12 : L.recuperation.amount;
        if (!rec) add({ area: 'הבראה', status: 'warn', title: 'לא נמצאו דמי הבראה', amount: exp, detail: `לפי ותק ${U.num(L.seniorityYears, 1)} שנים והיקף משרה ~${U.num(L.jobPct * 100, 0)}%: ≈ ${U.money(exp)}.`, basis: 'צו ההרחבה לדמי הבראה (מגזר פרטי).', confidence: 'low', note: 'מעסיקים משלמים בחודשים שונים. אם קיבלת בחודש אחר — הכול בסדר.' });
        else add({ area: 'הבראה', status: 'ok', title: 'שולמו דמי הבראה', detail: `${U.money(rec)} (הערכה: ${U.money(exp)}).`, basis: 'צו ההרחבה לדמי הבראה.', confidence: 'low' });
      }
    }

    /* 9. leave balances */
    const vb = val(F, 'vacationBalance');
    if (vb != null) {
      const appV = L.vacationAccrued - L.vacationUsed;
      const ok = Math.abs(appV - vb) <= 1.5;
      add({ area: 'חופשה', status: ok ? 'ok' : 'warn', title: ok ? 'יתרת חופשה סבירה' : 'יתרת חופשה שונה מההערכה', detail: `בתלוש ${U.num(vb, 2)} ימים, הערכה באפליקציה ${U.num(appV, 2)}.`, basis: 'חוק חופשה שנתית, לפי היקף המשרה בפועל. תלוי בהסכם ובצבירה מלפני השימוש באפליקציה.', confidence: 'low' });
    }
    const sb = val(F, 'sickBalance');
    if (sb != null) {
      const appS = L.sickAccrued - L.sickUsed;
      const ok = Math.abs(appS - sb) <= 2;
      add({ area: 'מחלה', status: ok ? 'ok' : 'warn', title: ok ? 'יתרת מחלה סבירה' : 'יתרת מחלה שונה מההערכה', detail: `בתלוש ${U.num(sb, 2)} ימים, הערכה ${U.num(appS, 2)}.`, basis: '1.5 ימים לחודש מלא, יחסית להיקף המשרה.', confidence: 'low' });
    }

    /* 10. credit points */
    const cp = val(F, 'creditPoints');
    if (cp != null) {
      const ok = Math.abs(cp - S.tax.creditPoints) < 0.01;
      add({ area: 'נקודות זיכוי', status: ok ? 'ok' : 'warn', title: ok ? 'נקודות הזיכוי תואמות' : 'נקודות זיכוי שונות', detail: `בתלוש ${cp}, בהגדרות ${S.tax.creditPoints}.` + (ok ? '' : ' אם מגיעות לך יותר — מלא טופס 101 מעודכן.'), basis: 'טופס 101 שמילאת אצל המעסיק.', confidence: 'medium' });
    }

    /* 11-12. tax & social security */
    const minor = Engine.isMinor(S, E.P.to);
    if (minor) {
      const blm = (val(F, 'nationalInsurance') || 0) + (val(F, 'healthTax') || 0);
      const itm = val(F, 'incomeTax') || 0;
      if (blm > 0) add({ area: 'ביטוח לאומי', status: 'bad', title: 'נוכו ביטוח לאומי / מס בריאות לעובד מתחת לגיל 18', amount: blm, detail: `נוכו ${U.money(blm)}, אבל עובד שטרם מלאו לו 18 פטור מדמי ביטוח לאומי ומס בריאות.`, basis: 'חוק הביטוח הלאומי — פטור לנער עד גיל 18 (לפי תאריך הלידה שהוזן).', confidence: 'medium' });
      if (itm > 0) add({ area: 'מס הכנסה', status: 'warn', title: 'נוכה מס הכנסה מתחת לגיל 18', amount: itm, detail: `נוכו ${U.money(itm)}. בשכר רגיל של נער/ה, נקודות הזיכוי מאפסות בדרך כלל את המס — כדאי לבדוק שמולא טופס 101.`, basis: 'מדרגות מס ונקודות זיכוי.', confidence: 'low', note: 'מס שנוכה ביתר אפשר לקבל בחזרה בהחזר מס שנתי.' });
      if (!blm && !itm) add({ area: 'ביטוח לאומי', status: 'ok', title: 'ללא ניכויי חובה — מתחת לגיל 18', detail: 'הנטו אמור להיות שווה לברוטו (פחות ניכויים אישיים, אם יש).', basis: 'פטור לנער עד גיל 18.', confidence: 'medium' });
    }
    if (gross && !minor) {
      const est = Engine.netEstimate({ gross, pensionBase: pe ? pe / (S.pension.employeePct / 100) : pBase, pensionActive: !!pe, deductions: 0, periodTo: E.P.to }, Object.assign({}, S, { tax: Object.assign({}, S.tax, { creditPoints: cp != null ? cp : S.tax.creditPoints }) }));
      const it = val(F, 'incomeTax');
      if (it != null) {
        const over = it - est.incomeTax;
        if (over > Math.max(40, est.incomeTax * 0.15)) add({ area: 'מס הכנסה', status: 'warn', title: 'מס הכנסה גבוה מההערכה', amount: over, detail: `נוכו ${U.money(it)}, הערכה ${U.money(est.incomeTax)}. סיבות אפשריות: עבודה אצל יותר ממעסיק אחד בלי תיאום מס, טופס 101 חסר (מס מקסימלי), או רכיבים שלא ידועים לאפליקציה.`, basis: 'מדרגות מס חודשיות ונקודות זיכוי (מההגדרות).', confidence: 'low', note: 'אם נוכה מס ביתר, אפשר לקבל אותו בהחזר מס שנתי.' });
        else add({ area: 'מס הכנסה', status: 'ok', title: 'מס הכנסה סביר', detail: `${U.money(it)} (הערכה: ${U.money(est.incomeTax)}).`, basis: 'מדרגות מס חודשיות.', confidence: 'low' });
      }
      const bl = val(F, 'nationalInsurance'), ht = val(F, 'healthTax');
      if (bl != null || ht != null) {
        const actual = (bl || 0) + (ht || 0);
        const expBL = (bl != null ? est.bl : 0) + (ht != null ? est.health : 0);
        const ok = Math.abs(actual - expBL) <= Math.max(15, expBL * 0.1);
        add({ area: 'ביטוח לאומי', status: ok ? 'ok' : 'warn', title: ok ? 'ביטוח לאומי ומס בריאות סבירים' : 'ביטוח לאומי / בריאות שונים מההערכה', detail: `נוכו ${U.money(actual)}, הערכה ${U.money(expBL)}.`, basis: 'שיעורים מופחתים עד 60% מהשכר הממוצע, מלאים מעל.', confidence: 'medium' });
      }
      const net = val(F, 'net'), td = val(F, 'totalDeductions');
      if (net != null && td != null) {
        const ok = Math.abs(gross - td - net) <= 2;
        add({ area: 'נטו', status: ok ? 'ok' : 'warn', title: ok ? 'החשבון ברוטו → נטו נסגר' : 'ברוטו פחות ניכויים ≠ נטו', detail: `${U.money(gross)} − ${U.money(td)} = ${U.money(gross - td)}; בתלוש נטו ${U.money(net)}.`, basis: 'בדיקה אריתמטית.', confidence: 'high' });
      }
      // gross vs app
      const dg = E.t.gross - gross;
      add({ area: 'ברוטו', status: Math.abs(dg) <= Math.max(20, gross * 0.02) ? 'ok' : dg > 0 ? 'warn' : 'ok', title: 'ברוטו: תלוש מול אפליקציה', detail: `בתלוש ${U.money(gross)}, לפי המשמרות ${U.money(E.t.gross)} (הפרש ${U.money(dg)}).`, basis: 'כולל שכר, נסיעות, בונוסים וימי חופשה/מחלה שרשמת.', confidence: 'medium', fromOverride: ovNote(E.t.gross, A.t.gross, gross, 1) });
    }

    /* 13. unexplained deductions */
    const unexplained = (slip.other || []).filter((o) => o.guess === 'otherDed');
    if (unexplained.length) {
      add({ area: 'ניכויים', status: 'warn', title: 'ניכויים שלא מוסברים', amount: 0, detail: unexplained.map((o) => `${o.line.replace(/[\d.,\-%]+/g, '').trim() || 'ניכוי'}: ${U.money(Math.abs(o.value))}`).join(' · '), basis: 'שורות ניכוי שלא שייכות לניכויי החובה המוכרים. ניכוי מהשכר מותר רק לפי חוק או בהסכמה בכתב.', confidence: 'medium' });
    }

    const bad = findings.filter((f) => f.status === 'bad');
    const totalMissing = bad.reduce((s, f) => s + Math.max(0, f.amount || 0), 0);
    return { findings, expected: E, auto: A, totalMissing, overridesInPeriod: overridesInPeriod.length, period: slip.period };
  }

  /** Waterfall steps gross → net. */
  function waterfall(F) {
    const g = val(F, 'gross');
    if (!g) return null;
    const steps = [{ label: 'ברוטו', value: g, type: 'total' }];
    const items = [['incomeTax', 'מס הכנסה'], ['nationalInsurance', 'ביטוח לאומי'], ['healthTax', 'מס בריאות'], ['pensionEmployee', 'פנסיה'], ['hishtalmutEmployee', 'השתלמות']];
    let known = 0;
    for (const [k, l] of items) { const v = val(F, k); if (v) { steps.push({ label: l, value: -Math.abs(v), type: 'neg' }); known += Math.abs(v); } }
    const net = val(F, 'net');
    if (net != null) {
      const other = g - known - net;
      if (Math.abs(other) > 1) steps.push({ label: 'ניכויים אחרים', value: -other, type: 'neg' });
      steps.push({ label: 'נטו', value: net, type: 'total' });
    }
    return steps;
  }

  /** Line-by-line plain explanations, with change vs previous slip. */
  function explainLines(F, prevF) {
    const out = [];
    for (const f of FIELDS) {
      const v = val(F, f.key);
      if (v == null) continue;
      let change = null;
      if (prevF) {
        const pv = val(prevF, f.key);
        if (pv == null) change = 'שורה חדשה — לא הופיעה בתלוש הקודם.';
        else if (Math.abs(v - pv) > Math.max(1, Math.abs(pv) * 0.05)) {
          const up = v > pv;
          change = (up ? 'עלה' : 'ירד') + ` ב-${U.money(Math.abs(v - pv))} לעומת התלוש הקודם (${U.money(pv)})`;
          if (['incomeTax', 'nationalInsurance', 'healthTax', 'pensionEmployee'].includes(f.key)) {
            const gNow = val(F, 'gross'), gPrev = val(prevF, 'gross');
            if (gNow && gPrev) change += gNow > gPrev === up ? ' — בהתאם לשינוי בברוטו.' : ' — למרות שהברוטו השתנה בכיוון ההפוך; כדאי לבדוק.';
          } else change += '.';
        }
      }
      out.push({ key: f.key, label: f.label, kind: f.kind, value: v, qty: qty(F, f.key), explain: EXPLAIN[f.key] || '', change });
    }
    return out;
  }

  /** Notable changes between consecutive slips (for alerts). */
  function compareSlips(prevF, F) {
    const out = [];
    if (!prevF) return out;
    const g1 = val(prevF, 'gross'), g2 = val(F, 'gross');
    const gChange = g1 && g2 ? (g2 - g1) / g1 : 0;
    for (const f of FIELDS.filter((x) => x.kind === 'ded')) {
      if (val(F, f.key) && !val(prevF, f.key)) out.push({ type: 'newDeduction', text: `ניכוי חדש: ${f.label} (${U.money(val(F, f.key))})` });
    }
    const p1 = val(prevF, 'pensionEmployee'), p2 = val(F, 'pensionEmployee');
    if (p1 && (!p2 || (p2 - p1) / p1 < -0.15) && gChange > -0.1) out.push({ type: 'pensionDrop', text: `הפרשת הפנסיה ירדה מ-${U.money(p1)} ל-${U.money(p2 || 0)} למרות שהברוטו כמעט לא ירד.` });
    const c1 = val(prevF, 'creditPoints'), c2 = val(F, 'creditPoints');
    if (c1 != null && c2 != null && c1 !== c2) out.push({ type: 'credit', text: `נקודות הזיכוי השתנו מ-${c1} ל-${c2}.` });
    const t1 = val(prevF, 'incomeTax'), t2 = val(F, 'incomeTax');
    if (t1 && t2 && (t2 - t1) / t1 > 0.3 && gChange < 0.1) out.push({ type: 'taxJump', text: `מס ההכנסה קפץ מ-${U.money(t1)} ל-${U.money(t2)} בלי עלייה דומה בברוטו.` });
    return out;
  }

  /** Polite message to the employer / HR. */
  function employerMessage(analysis, opts) {
    opts = opts || {};
    const bad = analysis.findings.filter((f) => f.status === 'bad' || (opts.includeWarn && f.status === 'warn' && f.amount > 0));
    const P = analysis.expected.P;
    if (!bad.length) return '';
    let s = `שלום${opts.to ? ' ' + opts.to : ''},\n\nבדקתי את תלוש השכר של ${U.fmtMonth(analysis.period)} מול רישום המשמרות שלי (⁦${U.fmtDate(P.from)}–${U.fmtDate(P.to)}⁩), ונראה לי שיש כמה נקודות שכדאי לבדוק:\n\n`;
    // findings are written to the user ("רשמת"); the message speaks in first person
    const firstPerson = (t) => t.replace(/(^|\s)רשמת(\s)/g, '$1רשמתי$2').replace(/שרשמת(\s|\)|\.|,)/g, 'שרשמתי$1').replace(/באפליקציה/g, 'לפי הרישום שלי').replace(/שהגדרת/g, 'שסוכמו');
    bad.forEach((f, i) => {
      s += `${i + 1}. ${f.title}: ${firstPerson(f.detail)}`;
      if (f.amount > 0 && !/≈|לפי החישוב/.test(f.detail)) s += ` (הפרש משוער: ${U.money(f.amount)})`;
      s += '\n';
    });
    const tot = bad.reduce((x, f) => x + Math.max(0, f.amount || 0), 0);
    if (tot > 0) s += `\nסה״כ הפרש משוער: ${U.money(tot)}.\n`;
    s += '\nאשמח אם תוכלו לבדוק ולעדכן אותי, ואם צריך — לתקן בתלוש הבא. אם פספסתי משהו, אשמח להסבר.\n\nתודה רבה,\n' + (opts.name || '');
    return s.trim();
  }

  root.Payslip = { FIELDS, FIELD, HOUR_FIELDS, EXPLAIN, normalize, fixVisual, numbersIn, matchField, pickValues, linesFromPdfItems, detectPeriod, parseText, redact, aiSchema, aiPrompt, fromAi, expected, analyze, waterfall, explainLines, compareSlips, employerMessage };
})(typeof window !== 'undefined' ? window : globalThis);
