/* ============================================================
 * leaderboard.js — the games' "champions table" (pure, tested).
 *
 * Each player who joined has one public row, lb/{uid}: a nickname, an
 * emoji, a background (Shaati Plus) and, per game, the best score of
 * today (d), this week (w, Sunday to Saturday), this month (m), this
 * year (y) and of all time (a). A period's score is stored together
 * with the period, as period × 100000 + score, so a board is one range
 * on one field (no special database index), and yesterday's score
 * never counts for today. firestore.rules checks the same shape and
 * the same highest scores (MAX).
 * ============================================================ */
(function (root) {
  'use strict';
  const U = root.U;
  const P = 100000;
  const PERIODS = ['d', 'w', 'm', 'y', 'a'];
  /** the highest score each game can give (rounding up generously); the rules refuse anything above */
  const MAX = { coins: 5000, quiz: 3000, facts: 10, pairs: 140, hours: 500 };
  const EMOJI = ['🦊', '🐯', '🦉', '🐬', '🐺', '🦅', '🦔', '🐧', '🦜', '🐻', '🐢', '🐳', '🐼', '🦁', '🐸', '🐙', '🦄', '🐝', '⚡', '🔥', '⭐', '🚀', '🎧', '⚽'];
  const NOUNS = ['שועל', 'נמר', 'ינשוף', 'דולפין', 'זאב', 'נשר', 'קיפוד', 'פינגווין', 'תוכי', 'דוב', 'צב', 'לוויתן', 'אריה', 'צפרדע', 'תמנון', 'חד קרן'];
  const ADJS = ['זריז', 'חכם', 'אמיץ', 'מהיר', 'שמח', 'ערני', 'סקרן', 'נועז', 'רגוע', 'חרוץ'];
  // nicknames are public: no swearing, no phone numbers (5 digits or more in a row)
  // i18n-keep-start
  const BAD = ['זונה', 'זונות', 'כוס', 'זין', 'זיין', 'מזדיין', 'שרמוט', 'שרמוטה', 'מניאק', 'קוקסינל', 'נאצי', 'היטלר', 'מחבל',
    'fuck', 'shit', 'bitch', 'dick', 'cock', 'pussy', 'porn', 'sex', 'nazi', 'hitler', 'nigg', 'cunt', 'whore', 'slut'];
  const STAFF = ['admin', 'moderator', 'support', 'shaati', 'מנהל', 'מנהלת', 'צוות', 'תמיכה', 'שעתי', 'רשמי'];
  // i18n-keep-end
  // the same letters firestore.rules allows: a first name in any of the app's languages (Hebrew, Latin with its
  // accents, Cyrillic, Arabic), digits, and an apostrophe or geresh (ג'ני, D'Angelo)
  const NICK_RE = /^[א-תa-zA-ZÀ-ÖØ-öø-ÿЀ-ӿ\u0600-\u06FF0-9 _.'׳-]{2,16}$/;

  const num = (k) => +k.replace(/-/g, '');
  /** The period keys of a day: { d: 20261015, w: 20261011 (its Sunday), m: 202610, y: 2026 }. */
  function keys(dateKey) {
    return { d: num(dateKey), w: num(U.addDays(dateKey, -U.dow(dateKey))), m: num(dateKey.slice(0, 7)), y: +dateKey.slice(0, 4) };
  }
  const pack = (key, score) => key * P + score;
  const scoreOf = (v) => (Number.isFinite(+v) ? +v % P : 0);
  const keyOf = (v) => Math.floor(+v / P);
  /** The range of values that belong to a period now: [from, to). All time: every value. */
  function range(period, dateKey) {
    if (period === 'a') return null;
    const k = keys(dateKey)[period];
    return [k * P, (k + 1) * P];
  }
  /** A game's stored score in a period now (0 when the stored one is from an earlier period). */
  function scoreIn(gameRow, period, dateKey) {
    const v = gameRow && gameRow[period];
    if (v == null) return 0;
    if (period === 'a') return +v || 0;
    return keyOf(v) === keys(dateKey)[period] ? scoreOf(v) : 0;
  }
  /**
   * A new score for a game: the periods it improves, as the values to store ({} = no change).
   * Scores outside 0..MAX are cut to the range (the rules would refuse them).
   */
  function improve(gameRow, game, score, dateKey) {
    const s = Math.max(0, Math.min(MAX[game] || 0, Math.round(+score || 0)));
    const out = {};
    if (!(s > 0)) return out;
    const k = keys(dateKey);
    for (const p of PERIODS) {
      if (s <= scoreIn(gameRow, p, dateKey)) continue;
      out[p] = p === 'a' ? s : pack(k[p], s);
    }
    return out;
  }
  /** A nickname is shown to everyone: '' when fine, otherwise what is wrong with it. */
  function nickProblem(n) {
    const t = String(n || '').trim().replace(/\s+/g, ' ');
    if (t.length < 2) return 'לפחות 2 תווים';
    if (t.length > 16) return 'עד 16 תווים';
    if (!NICK_RE.test(t)) return 'רק אותיות, מספרים ורווחים';
    if (/\d{5,}/.test(t)) return 'בלי מספרים ארוכים (כמו מספר טלפון)';
    if (!/[^\d\s_.'׳-]/.test(t)) return 'צריך לפחות אות אחת';
    // short words only as a whole word (so 'מזין' or 'Essex' pass), longer ones anywhere
    const words = t.toLowerCase().split(/[\s_.-]+/);
    const low = words.join('');
    if (BAD.some((w) => (w.length <= 3 ? words.includes(w) : low.includes(w)))) return 'השם הזה לא מתאים לטבלה';
    if (root.Clean && !root.Clean.isClean(t)) return 'השם הזה לא מתאים לטבלה';
    // nobody may look like the app's own team
    if (STAFF.some((w) => low.includes(w))) return 'כינוי שנראה כמו צוות האפליקציה שמור';
    return '';
  }
  /** A random fun nickname ("שועל זריז 27"); seed makes it repeatable in tests. */
  /** The first name from the user's name (the first word, cut to 16 letters), or '' when it would not pass. */
  function firstName(full) {
    const w = String(full || '').trim().split(/\s+/)[0] || '';
    const n = w.slice(0, 16);
    return n && !nickProblem(n) ? n : '';
  }
  function randomNick(seed) {
    let x = (seed == null ? Math.floor(Math.random() * 1e9) : seed) >>> 0;
    const next = () => { x = (x * 1664525 + 1013904223) >>> 0; return x; };
    const n = NOUNS[next() % NOUNS.length], a = ADJS[next() % ADJS.length];
    // English (the made-up names in every language but Hebrew) puts the describing word first: "Swift Fox 27"
    return U.LANG === 'he' ? `${n} ${a} ${10 + (next() % 90)}` : `${a} ${n} ${10 + (next() % 90)}`;
  }
  /** "until midnight" / "until Sunday" … for each period, from a date and an hour. */
  function resetText(period, dateKey, now) {
    if (period === 'd') {
      const d = new Date(now); const left = (24 - d.getHours()) * 60 - d.getMinutes();
      return left > 60 ? `מתאפס בעוד ${Math.floor(left / 60)} שעות` : `מתאפס בעוד ${Math.max(1, left)} דקות`;
    }
    if (period === 'w') { const n = 7 - U.dow(dateKey); return n === 1 ? 'מתאפס מחר (יום ראשון)' : `מתאפס בעוד ${n} ימים`; }
    if (period === 'm') return `מתאפס ב-${U.fmtDate(U.addMonthKey(dateKey.slice(0, 7), 1) + '-01', 'dm')}`;
    if (period === 'y') return `מתאפס ב-${U.fmtDate(`${+dateKey.slice(0, 4) + 1}-01-01`, 'dm')} ${+dateKey.slice(0, 4) + 1}`;
    return 'השיאים של כל הזמנים';
  }

  root.Leaderboard = { P, PERIODS, MAX, EMOJI, keys, pack, scoreOf, keyOf, range, scoreIn, improve, nickProblem, firstName, randomNick, resetText };
})(typeof window !== 'undefined' ? window : globalThis);
