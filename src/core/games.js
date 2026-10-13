/* ============================================================
 * games.js — the content of the mini-games, kept apart from the
 * screens so it can be tested: pay questions ("כמה זה יוצא?") and
 * true/false statements about workers' rights ("נכון או לא?").
 *
 * The rights statements repeat what the rights center says (and are
 * just as general: information, not legal advice). The minimum wage
 * figure comes from the engine's table, so it never goes stale.
 * ============================================================ */
(function (root) {
  'use strict';

  /** A small seeded random generator (mulberry32), so a round can be replayed in tests. */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, list) => list[Math.floor(r() * list.length)];
  function shuffle(r, list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const r2 = (x) => Math.round(x * 100) / 100;
  const nis = (x) => `${Number.isInteger(r2(x)) ? r2(x) : r2(x).toFixed(2)} ₪`;
  const HRS = { 0.5: 'חצי שעה', 1: 'שעה', 1.5: 'שעה וחצי', 2: 'שעתיים', 2.5: 'שעתיים וחצי' };
  const hrs = (x) => HRS[x] || `${x} שעות`;

  /**
   * Four distinct choices: the right one and three plausible mistakes.
   * `wrong` lists candidate mistakes in order of preference; anything equal to the answer, not
   * positive, or too close to another choice to tell apart is skipped, and simple ±steps fill
   * any gap.
   */
  function choices(r, answer, wrong, fmt, step) {
    const out = [answer];
    const far = (v) => out.every((o) => Math.abs(o - v) >= (step || 1) - 1e-9);
    for (const w of wrong) { const v = r2(w); if (out.length < 4 && v > 0 && far(v)) out.push(v); }
    for (let k = 1; out.length < 4 && k < 40; k++) {
      for (const v of [r2(answer + k * (step || 1)), r2(answer - k * (step || 1))]) if (out.length < 4 && v > 0 && far(v)) out.push(v);
    }
    const opts = shuffle(r, out);
    return { options: opts.map(fmt), answer: opts.indexOf(answer), value: answer };
  }

  const ITEMS = [['פיצה משפחתית', 60], ['כרטיס לסרט', 45], ['נעלי ספורט', 420], ['אוזניות אלחוטיות', 240], ['חולצה', 90], ['כרטיס להופעה', 210], ['ארוחה במסעדה', 120], ['מנוי חודשי לחדר כושר', 180], ['משחק למחשב', 150]];
  /**
   * The pay questions. ctx: { rate } — the user's own hourly rate, used in some questions so the
   * numbers feel like theirs (rounded to whole shekels to keep the arithmetic friendly).
   */
  const QUESTIONS = [
    (r) => {
      const h = pick(r, [3, 4, 5, 6, 7, 8]), p = pick(r, [30, 32, 35, 36, 38, 40, 42, 45, 50]);
      return Object.assign({ q: `משמרת של ${hrs(h)} ב-${p} ₪ לשעה. כמה זה יוצא?`, x: `${h} × ${p} = ${h * p} ₪` },
        choices(r, h * p, [(h + 1) * p, (h - 1) * p, h * (p + 5), h * p + 10], nis, 5));
    },
    (r) => {
      const p = pick(r, [32, 36, 40, 44, 48]);
      return Object.assign({ q: `השכר הרגיל ${p} ₪ לשעה. כמה משלמים על שעה נוספת ראשונה (125%)?`, x: `${p} × 1.25 = ${nis(p * 1.25)}. השעתיים הראשונות מעבר ליום רגיל: 125%, ואחר כך 150%.` },
        choices(r, p * 1.25, [p * 1.5, p, p * 1.2, p + 5], nis, 1));
    },
    (r) => {
      const p = pick(r, [30, 32, 34, 36, 40, 44, 50]);
      return Object.assign({ q: `השכר הרגיל ${p} ₪ לשעה. כמה מקבלים לפחות על שעה בשבת (150%)?`, x: `${p} × 1.5 = ${nis(p * 1.5)}. עבודה במנוחה השבועית: לפחות 150%.` },
        choices(r, p * 1.5, [p * 1.25, p * 2, p, p + 10], nis, 1));
    },
    (r) => {
      const s = pick(r, [7, 8, 9, 10, 14, 15, 16]), L = pick(r, [5, 6, 7, 8]);
      const e = s + L; // a half-hour unpaid break makes the shift L + 0.5 long
      return Object.assign({ q: `משמרת מ-${String(s).padStart(2, '0')}:00 עד ${String(e).padStart(2, '0')}:30, עם חצי שעה הפסקה שלא משולמת. כמה שעות משולמות?`, x: `${hrs(L + 0.5)} פחות חצי שעה הפסקה = ${hrs(L)}.` },
        choices(r, L, [L + 0.5, L + 1, L - 0.5], hrs, 0.5));
    },
    (r) => {
      const d = pick(r, [3, 4, 5, 6, 8, 10]), t = pick(r, [9, 11, 12, 14, 15, 18]);
      return Object.assign({ q: `${d} ימי עבודה, והחזר הנסיעות ${t} ₪ ליום. כמה החזר מגיע?`, x: `${d} × ${t} = ${d * t} ₪. ההחזר משולם בנוסף לשכר.` },
        choices(r, d * t, [(d + 1) * t, (d - 1) * t, d * (t + 2), d * t * 2], nis, 2));
    },
    (r, ctx) => {
      const [item, price] = pick(r, ITEMS);
      const own = ctx && ctx.rate >= 15 && ctx.rate <= 200;
      const p = own ? Math.round(ctx.rate) : pick(r, [30, 35, 40, 45, 50, 60]);
      const ans = Math.max(0.5, Math.round((price / p) * 2) / 2);
      return Object.assign({ q: `${item} עולה ${price} ₪. ${own ? 'בשכר שלך' : 'בשכר של'} (${p} ₪ לשעה), בערך כמה שעות עבודה זה?`, x: `${price} ÷ ${p} ≈ ${hrs(ans)}.` },
        choices(r, ans, [ans * 2, ans + 2, ans - 1.5, ans / 2], hrs, 1));
    },
    (r) => {
      const n = pick(r, [2, 3, 4, 5]), h = pick(r, [4, 5, 6]), p = pick(r, [30, 35, 40, 45, 50]);
      return Object.assign({ q: `${n} משמרות של ${hrs(h)} ב-${p} ₪ לשעה. כמה זה יוצא בשבוע?`, x: `${n} × ${h} = ${n * h} שעות, × ${p} = ${n * h * p} ₪.` },
        choices(r, n * h * p, [(n + 1) * h * p, n * (h + 1) * p, n * h * p - p * h, n * h * p + 50], nis, 10));
    },
    (r) => {
      const d = pick(r, [200, 240, 280, 300, 320]);
      return Object.assign({ q: `יום המחלה השני משולם ב-50%. השכר ליום ${d} ₪. כמה מקבלים עליו?`, x: `${d} × 50% = ${d / 2} ₪. היום הראשון: 0%, השני והשלישי: 50%, מהרביעי: 100%.` },
        choices(r, d / 2, [d, d * 0.75, d / 4], nis, 10));
    },
    (r) => {
      const a = pick(r, [30, 40, 50]), pct = pick(r, [5, 10, 20, 25]);
      const b = a * (1 + pct / 100);
      return Object.assign({ q: `השכר לשעה עלה מ-${a} ₪ ל-${nis(b)}. בכמה אחוזים?`, x: `${nis(b - a)} מתוך ${a} ₪ = ${pct}%.` },
        choices(r, pct, [r2(b - a), pct * 2, pct + 5, pct / 2], (v) => `${v}%`, 2.5));
    },
  ];
  /** A round of n pay questions, never the same kind twice in a row. */
  function quizRound(seed, n, ctx) {
    const r = rng(seed);
    const out = [];
    let lastKind = -1;
    while (out.length < (n || 10)) {
      let k = Math.floor(r() * QUESTIONS.length);
      if (k === lastKind) k = (k + 1) % QUESTIONS.length;
      lastKind = k;
      out.push(Object.assign({ kind: k }, QUESTIONS[k](r, ctx || {})));
    }
    return out;
  }

  /**
   * True or false: workers' rights in Israel (general rules, as in the rights center).
   * mw: the adult hourly minimum wage today (from the engine).
   */
  function facts(mw) {
    const list = [
      ['fine', 'מותר למעסיק לנכות מהשכר קנס על איחור, גם בלי הסכמה בכתב.', false, 'מותר לנכות רק ניכויי חובה (מס, ביטוח לאומי, פנסיה) וניכויים שהסכמת להם בכתב.'],
      ['shabbat', 'עבודה בשבת משולמת לפחות ב-150%.', true, 'עבודה במנוחה השבועית משולמת לפחות ב-150% מהשכר הרגיל.'],
      ['travel-minor', 'החזר נסיעות מגיע רק לעובדים מגיל 18.', false, 'גם נוער זכאי להחזר נסיעות, והוא משולם בנוסף לשכר.'],
      ['break', 'ביום עבודה של 6 שעות ומעלה מגיעה הפסקה של 45 דקות.', true, '45 דקות, מתוכן חצי שעה ברצף.'],
      ['payday', 'את השכר צריך לשלם עד ה-9 בחודש שאחרי חודש העבודה.', true, 'איחור בתשלום מזכה בפיצוי הלנת שכר.'],
      ['sick-day1', 'על היום הראשון של מחלה מקבלים שכר מלא.', false, 'היום הראשון: 0%. השני והשלישי: 50%. מהרביעי: 100%. צריך אישור מחלה.'],
      ['overtime', 'השעתיים הנוספות הראשונות ביום משולמות ב-125%.', true, 'מעבר להן משלמים 150%.'],
      ['vacation', 'אפשר לוותר על ימי החופשה תמורת תוספת לשכר.', false, 'אסור לוותר על חופשה. כשעוזבים את העבודה מקבלים פדיון על הימים שלא נוצלו.'],
      ['night16', 'נער בן 16 רשאי לעבוד עד חצות בלי היתר מיוחד.', false, 'מגיל 16 אסור לעבוד בין 22:00 ל-06:00 (מתחת ל-16: בין 20:00 ל-08:00), אלא בהיתר.'],
      ['slip', 'מגיע לך תלוש שכר מפורט בכל חודש.', true, 'כדאי גם לבדוק אותו מול המשמרות שרשמת.'],
      ['hearing', 'לפני פיטורים מגיע שימוע.', true, 'וגם הודעה מוקדמת לפי הוותק.'],
      ['tax-minor', 'מתחת לגיל 18 מנכים מהשכר מס הכנסה וביטוח לאומי כמו לכל עובד.', false, 'מתחת ל-18 בדרך כלל לא מנוכים מס הכנסה, ביטוח לאומי ומס בריאות, כך שהנטו קרוב לברוטו.'],
      ['friday', 'ביום שישי ובערב חג נער עובד עד 7 שעות.', true, 'זה אחד הכללים המיוחדים של חוק עבודת הנוער.'],
      ['sick-accrue', 'צוברים 1.5 ימי מחלה על כל חודש עבודה מלא.', true, 'עד 90 ימים בסך הכול.'],
      ['broken', 'אם שברת משהו בעבודה, המעסיק רשאי לקזז את זה מהשכר בלי לשאול.', false, 'חוסרים בקופה או ציוד שנשבר: בדרך כלל אסור לנכות בלי הסכמה בכתב.'],
      ['recup', 'דמי הבראה מגיעים כבר מהחודש הראשון בעבודה.', false, 'דמי הבראה מגיעים אחרי שנת עבודה.'],
      ['pension', 'חובת ההפרשה לפנסיה מתחילה מגיל 21 לגבר ומגיל 20 לאישה.', true, 'אחרי 6 חודשי עבודה (או 3, אם כבר יש קרן פעילה).'],
      ['youth-wage', 'שכר המינימום לנוער זהה לזה של מבוגרים.', false, 'לנוער יש שכר מינימום משלו, נמוך יותר, שעולה עם הגיל.'],
      ['terms', 'נער שמתחיל לעבוד צריך לקבל הודעה בכתב על תנאי העבודה.', true, 'תוך 7 ימים: שכר לשעה, שעות העבודה ועוד.'],
    ];
    if (mw > 0) list.push(['minwage', `שכר המינימום לעובד מגיל 18 הוא ${nis(mw)} לשעה.`, true, 'לנוער יש שכר מינימום נמוך יותר, לפי הגיל.']);
    return list.map(([id, s, t, x]) => ({ id, s, t, x }));
  }
  /** A round of n statements, with both true and false ones. */
  function factsRound(seed, n, mw) {
    const r = rng(seed);
    const all = facts(mw);
    for (let tries = 0; tries < 20; tries++) {
      const round = shuffle(r, all).slice(0, n || 10);
      const t = round.filter((f) => f.t).length;
      if (t >= 3 && round.length - t >= 3) return round;
    }
    return shuffle(r, all).slice(0, n || 10);
  }

  /** Coin catcher: what falls, how often, and how fast, at second `t` of a 40-second round. */
  const DROPS = [
    { k: 'c1', v: 1, w: 30 }, { k: 'c5', v: 5, w: 24 }, { k: 'c10', v: 10, w: 14 },
    { k: 'b20', v: 20, w: 6 }, { k: 'b50', v: 50, w: 2 }, { k: 'clock', v: 0, w: 2 }, { k: 'fine', v: 0, w: 16, bad: true },
  ];
  function coinPace(t) {
    const f = Math.min(1, t / 40);
    return { every: 0.62 - 0.32 * f, speed: 190 + 230 * f, fineBoost: 1 + f * 0.8 };
  }
  function coinDrop(r, t) {
    const { fineBoost } = coinPace(t);
    const ws = DROPS.map((d) => d.w * (d.bad ? fineBoost : 1));
    let x = r() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < DROPS.length; i++) { x -= ws[i]; if (x <= 0) return DROPS[i]; }
    return DROPS[0];
  }

  root.Games = { rng, quizRound, QUESTIONS, facts, factsRound, coinPace, coinDrop, DROPS, hrs, nis };
})(typeof window !== 'undefined' ? window : globalThis);
