/* The website's shift calculator (site/shift-calculator.html): "how much is this shift worth?" for a worker who has
 * not installed the app. Date, start, end, hourly rate, age and city go through the app's own engine (src/core:
 * util, hebcal, defaults, engine, joined before this file into site/calc.js by tools/site-pages.js), with the
 * settings a new user of the app gets plus overtime by the law. Nothing leaves the phone. tools/site-pages.js puts
 * the city list (the app's localities of 20,000 people and more, same coordinates) in place of __DATA__. */
(function (root) {
  'use strict';
  const D = __DATA__;
  const { U, HebCal, Defaults, Engine } = root;

  // the app's place lookup, for the cities on this page only (hebcal.js asks root.Places for any city outside its own 44)
  const byName = new Map(D.places.map(([name, lat, lon, candle]) => [name, { name, lat, lon, candle }]));
  if (!root.Places) root.Places = { find: (n) => byName.get(n) || null };

  const AGES = { u16: 15, a16: 16, a17: 17, adult: null };
  // a birth date that makes the worker that age on the shift's day (half a year past the birthday); 18+ = none, as in the app
  const birthFor = (dk, age) => (age == null ? null : U.addMonths(dk, -(age * 12 + 6)));

  /** One shift through the app's engine. inp: { date: 'YYYY-MM-DD', start: 'HH:MM', end: 'HH:MM' (at or before the
   *  start = the next day), rate, age: 'u16'|'a16'|'a17'|'adult', city, breakPaid } */
  function compute(inp) {
    const settings = Defaults.defaultSettings();
    settings.rest = Object.assign({}, settings.rest, { city: inp.city });
    settings.birthDate = birthFor(inp.date, AGES[inp.age]);
    const emp = Object.assign(Defaults.defaultEmployer('emp1'), { otLaw: true, travelPerDay: 0 });
    const role = { id: 'r1', name: 'משמרת', color: '#2a78d6', employerId: 'emp1', rates: [{ from: '2000-01-01', rate: +inp.rate }], archived: false };
    const ctx = Engine.makeCtx({ settings, employers: [emp], roles: [role], dayRules: [] });
    const start = U.toEpoch(inp.date, inp.start);
    let endKey = inp.date, end = U.toEpoch(endKey, inp.end);
    if (end <= start) { endKey = U.addDays(inp.date, 1); end = U.toEpoch(endKey, inp.end); }
    const shift = { id: 's1', kind: 'shift', employerId: 'emp1', roleId: 'r1', start, end, breakMin: null, breakPaid: inp.breakPaid !== false, status: 'done', items: [] };
    const r = Engine.computeAll([shift], ctx).get('s1');
    const min = Engine.legalMinWage(inp.date, settings.birthDate);
    const wins = HebCal.restWindows(U.addDays(inp.date, -1), U.addDays(endKey, 1), ctx.restCfg).filter((w) => w.end > start && w.start < r.end);
    return { r, min, wins, start, end, endKey, overnight: endKey !== inp.date, age: AGES[inp.age] };
  }
  root.SiteCalc = { compute, birthFor, places: D.places, src: D.src };
  if (typeof document === 'undefined' || !document.querySelector('[data-sc]')) return;

  /* ---------------- the page ---------------- */
  const $ = (s) => document.querySelector(s);
  const money = (n) => U.money(n);
  const hmOf = (h) => U.hm(h * 60);
  const hWords = (h) => { const m = Math.round(h * 60); return m % 60 ? `${Math.floor(m / 60)} שעות ו-${m % 60} דקות` : `${m / 60} שעות`; };
  const el = { date: $('#sc-date'), start: $('#sc-start'), end: $('#sc-end'), rate: $('#sc-rate'), city: $('#sc-city'), unpaid: $('#sc-unpaid') };
  const err = $('#sc-err'), out = $('#sc-out');
  let age = 'adult', last = null;
  el.date.value = U.todayKey();
  const ages = document.querySelectorAll('[data-age]');
  ages.forEach((b) => b.addEventListener('click', () => {
    age = b.dataset.age;
    ages.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    update();
  }));
  Object.values(el).forEach((x) => { x.addEventListener('input', update); x.addEventListener('change', update); });

  const read = (x) => { const t = String(x.value).trim().replace(',', '.'); return t === '' ? '' : /^\d+(\.\d+)?$/.test(t) ? +t : NaN; };
  const say = (msg, at) => {
    Object.values(el).forEach((x) => x.removeAttribute('aria-invalid'));
    if (at) at.setAttribute('aria-invalid', 'true');
    err.textContent = msg;
    err.hidden = !msg;
  };
  const dayName = (k) => 'יום ' + ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][U.dow(k)];
  const at = (t) => `${U.epochHM(t)} ב${dayName(U.epochKey(t))}`;
  // "from 14:00 to 23:30" in words: a range with a dash turns around in right-to-left text (23:30–14:00)
  const span = (inp, c) => `מ-${inp.start} עד ${inp.end}${c.overnight ? ' למחרת' : ''}`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const line = (label, pct, h, amount) => `<tr><td>${esc(label)} <span class="pct">${pct}%</span></td><td>${hmOf(h)}</td><td><b>${money(amount)}</b></td></tr>`;

  function update() {
    const rate = read(el.rate), date = el.date.value, s = el.start.value, e = el.end.value;
    let msg = '', bad = null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { msg = 'בחרו תאריך למשמרת'; bad = el.date; }
    else if (!/^\d{2}:\d{2}$/.test(s)) { msg = 'מתי המשמרת מתחילה?'; bad = el.start; }
    else if (!/^\d{2}:\d{2}$/.test(e)) { msg = 'מתי המשמרת נגמרת?'; bad = el.end; }
    else if (s === e) { msg = 'שעת הסיום זהה לשעת ההתחלה'; bad = el.end; }
    else if (rate === '' || !(rate >= 1 && rate <= 500)) { msg = 'שכר לשעה הוא מספר בין 1 ל-500 ₪, למשל 40'; bad = el.rate; }
    say(msg, bad);
    if (msg) { out.hidden = true; last = null; return; }
    const inp = { date, start: s, end: e, rate, age, city: el.city.value, breakPaid: !el.unpaid.checked };
    const c = compute(inp), r = c.r;
    last = { inp, c };
    // the breakdown: the engine's own pay lines (hours at 100%, overtime at 125% and 150%, Shabbat and holiday at 150%, 175%, 200%)
    const rows = r.lines.map((l) => line(l.rest ? l.label : l.tier === 0 ? 'שעות רגילות' : 'שעות נוספות', l.pct, l.hours, l.amount));
    $('#sc-rows').innerHTML = rows.join('') + `<tr class="sum"><td>סך הכול</td><td>${hmOf(r.paidHours)}</td><td><b>${money(r.wage)}</b></td></tr>`;
    $('#sc-total').textContent = money(r.wage);
    $('#sc-when').textContent = `${U.fmtDate(date, 'long')}, ${span(inp, c)}`;
    const notes = [];
    const cityName = el.city.value;
    for (const w of c.wins) notes.push(`<b>${esc(w.label)}</b> ב${esc(cityName)}: מ-${at(w.start)} עד ${at(w.end)}. כל שעה בתוך הזמן הזה שווה לפחות 150%.`);
    if (r.otHours > 0) notes.push(`<b>שעות נוספות</b> מתחילות אחרי ${hWords(r.thresholdH)} ביום${r.isNightShift ? ' (במשמרת לילה)' : c.age != null && r.thresholdH < 8 ? ' (לנוער ביום שלפני שבת או חג)' : ''}: השעתיים הראשונות ב-125%, ומהשלישית 150%.`);
    if (r.isNightShift) notes.push('<b>משמרת לילה</b> (שעתיים לפחות בין 22:00 ל-06:00): יום העבודה הרגיל בה הוא 7 שעות. החוק לא קובע תוספת לילה בשקלים, רק אם יש כזו בהסכם.');
    if (r.breakAuto && r.breakMin > 0) notes.push(r.breakPaid ? '<b>הפסקה</b> של 45 דקות מגיעה במשמרת של 6 שעות ומעלה. כאן היא נספרת בתשלום, כי הורדת את הסימון שהיא לא משולמת.' : '<b>הפסקה</b> של 45 דקות ירדה מהשעות. לפי החוק לא משלמים עליה, חוץ ממקום שאסור לצאת ממנו בהפסקה. אם אצלכם משלמים עליה, הורידו את הסימון.');
    if (c.age != null) {
      const y = Engine.youthRules(c.age, 5);
      const nightIvs = [];
      for (let k = U.addDays(date, -1); k <= c.endKey; k = U.addDays(k, 1)) nightIvs.push([U.toEpoch(k, String(y.nightFrom).padStart(2, '0') + ':00'), U.toEpoch(U.addDays(k, 1), String(y.nightTo).padStart(2, '0') + ':00')]);
      if (nightIvs.some(([a, b]) => a < c.end && b > c.start)) notes.push(`<b>חוק עבודת הנוער</b>: בגיל ${c.age < 16 ? 'פחות מ-16' : c.age} אסור לעבוד בין ${y.nightFrom}:00 ל-${String(y.nightTo).padStart(2, '0')}:00, אלא בהיתר.`);
      if (r.paidHours > y.dayHours) notes.push(`<b>חוק עבודת הנוער</b>: עד ${y.dayHours} שעות עבודה ביום. כל שעה מעבר לזה משולמת כשעה נוספת.`);
    }
    const minWarn = $('#sc-min');
    if (rate < c.min.hourly - 0.004) {
      const atMin = compute(Object.assign({}, inp, { rate: c.min.hourly }));
      minWarn.innerHTML = `<b>התעריף נמוך משכר המינימום.</b> שכר המינימום ${c.age == null ? 'מגיל 18' : c.age < 16 ? 'מתחת לגיל 16' : 'בגיל ' + c.age} הוא ${money(c.min.hourly)} לשעה, ולפיו המשמרת הזו שווה לפחות <b>${money(atMin.r.wage)}</b>.`;
      minWarn.hidden = false;
    } else minWarn.hidden = true;
    $('#sc-notes').innerHTML = notes.map((n) => `<li>${n}</li>`).join('');
    $('#sc-notes').hidden = !notes.length;
    $('#sc-share-ok').hidden = true;
    out.hidden = false;
  }

  /* ---------------- sharing: the result in one sentence ---------------- */
  const PAGE = 'https://shaati.web.app/shift-calculator';
  const text = () => {
    const { inp, c } = last, r = c.r;
    const rest = r.restHours > 0 ? `, מתוכן ${hWords(r.restHours)} ב${c.wins.length ? c.wins[0].label : 'שבת'} ב-150% ומעלה` : '';
    return `המשמרת שלי ב${U.fmtDate(inp.date, 'long')}, ${span(inp, c)}, שווה ${money(r.wage)} לפי חוק העבודה (${hWords(r.paidHours)}${rest}). כמה שווה המשמרת שלך? ${PAGE}`;
  };
  $('#sc-share').addEventListener('click', async () => {
    if (!last) return;
    const t = text();
    if (navigator.share) {
      try { await navigator.share({ text: t }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    // no share sheet here (a computer): the sentence goes to the clipboard
    const ok = $('#sc-share-ok');
    try { await navigator.clipboard.writeText(t); ok.textContent = 'המשפט הועתק. אפשר להדביק אותו בוואטסאפ.'; } catch (e) { ok.textContent = t; }
    ok.hidden = false;
  });
  // a visitor whose phone is not on Israel's clock: the engine reads times in the phone's own zone
  try { if (Intl.DateTimeFormat().resolvedOptions().timeZone !== 'Asia/Jerusalem') $('#sc-tz').hidden = false; } catch (e) { /* no Intl: say nothing */ }
  update();
  root.__calc = { update, text, state: () => last };

  /* ---------------- on another website (site/embed/shift-calculator.html, in an iframe) ----------------
   * The page tells the site around it how tall it is, at load and whenever a result, a note or a font changes it, so
   * the frame can fit it (the script on site/embed.html). Only a number goes out: nothing the visitor typed. */
  // the message goes to the host page's own origin only: Chrome and Safari name it in location.ancestorOrigins, and every
  // browser sends it as the frame's referrer (at least the origin, by default). A host with no referrer at all gets no
  // message, and the fixed height in the iframe code applies.
  let target = '';
  try { const a = root.location.ancestorOrigins; target = a && a.length ? a[0] : new URL(document.referrer).origin; } catch (e) { target = ''; }
  if (target === 'null') target = '';
  if (document.documentElement.hasAttribute('data-embed') && root.parent && root.parent !== root && target) {
    let sent = 0;
    const post = () => {
      const h = Math.ceil(document.body.getBoundingClientRect().height);
      if (!h || h === sent) return;
      sent = h;
      root.parent.postMessage({ type: 'shaati-calc-height', height: h }, target);
    };
    if (root.ResizeObserver) new ResizeObserver(post).observe(document.body);
    post();
    // the host's listener may start after this frame loaded (its script below the iframe, still downloading): the same
    // height again at load and twice after it, so a late listener still gets it
    const again = () => { sent = 0; post(); };
    root.addEventListener('load', () => { again(); setTimeout(again, 1000); setTimeout(again, 3000); });
  }
})(typeof window !== 'undefined' ? window : globalThis);
