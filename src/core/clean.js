/* ============================================================
 * clean.js — keeping what people type clean: names, jobs, workplaces, notes, reasons, nicknames.
 *
 * Words are checked whole, not as pieces of other words ("מזין נתונים" is fine, "כוס קפה" is fine), after a
 * Hebrew prefix (ו, ה, ב, ל, מ, ש, כ and pairs of them) is taken off. The usual tricks are seen through:
 * niqqud, final letters, a letter typed many times ("זייייין"), dots or spaces between the letters of a long
 * word ("ש.ר.מ.ו.ט.ה"), digits and symbols for letters ("sh1t", "f*ck"). Short words are matched only whole,
 * so a real word that merely contains one is never refused.
 * ============================================================ */
(function (root) {
  'use strict';
  const FINAL = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
  const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };
  /** Lower case, no niqqud, final letters as plain ones, digits and symbols read as the letters they stand for. */
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFKD')
      .replace(/[֑-ׇ]/g, '')
      .replace(/[ךםןףץ]/g, (c) => FINAL[c])
      .replace(/[0134578@$!]/g, (c) => LEET[c] || c);
  }
  const squeeze = (w) => w.replace(/(.)\1+/g, '$1'); // "זייייין" → "זין", "fuuuck" → "fuck"

  // whole words (each written normalised and squeezed)
  const HE = ['זין', 'זינ', 'זיון', 'זיונ', 'לזינ', 'מזדינ', 'תזדינ', 'הזדינ', 'זדינ', 'כוסית', 'כוסיות', 'כוסאמק', 'כוסעמק', 'כוסאמא', 'כוסאמכ',
    'שרמוטה', 'שרמוט', 'שרמוטות', 'זונה', 'זונות', 'בנזונה', 'מניאק', 'מניאקית', 'מניאקים', 'חרא', 'חארה', 'קוקסינל', 'מזדינת', 'זנזונת',
    'מפגר', 'מפגרת', 'מפגרים', 'דביל', 'דבילית', 'אידיוט', 'אידיוטית', 'מטומטמ', 'מטומטמת', 'פוסטמה', 'חמאר'];
  // (left out on purpose, for the jobs and notes they belong to: זבל, מוצץ, שתן, כלבה, בהמה, כוס, תחת, Niger)
  const EN = ['fuck', 'fuk', 'fck', 'fucker', 'fucking', 'motherfucker', 'shit', 'shitty', 'bitch', 'bitches', 'cunt', 'dick', 'dickhead', 'cock', 'pussy',
    'asshole', 'ashole', 'bastard', 'slut', 'whore', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'retarded', 'porn', 'porno', 'boobs',
    'tits', 'wanker', 'twat', 'hitler', 'nazi'];
  // phrases of two words (some are fine word by word: "כוס" is also a cup)
  const PHRASES = [['כוס', 'אמק'], ['כוס', 'אמכ'], ['כוס', 'עמק'], ['כוס', 'אמא'], ['בנ', 'זונה'], ['יא', 'זונה'], ['בת', 'זונה'], ['son', 'of', 'a', 'bitch']];
  // as written, and with doubled letters collapsed (that form is used only for a word typed with doubled
  // letters: "זייייין"; squeezing everything made "Niger" the same as a slur)
  const RAW = new Set(HE.concat(EN));
  const SQ = new Set(HE.concat(EN).map(squeeze));
  const LONG = [...RAW].filter((w) => w.length >= 5); // also found with dots or spaces between the letters
  const PREFIX = /^(וש|וה|וב|ול|ומ|שה|שב|של|שמ|כש|מה|לה|בה|ו|ה|ב|ל|מ|ש|כ)(?=..)/;

  // a prefix comes off only to reveal a word of 4 letters or more: a short one inside a real word ("מזין",
  // "הזין נתונים") is never taken for a bad word
  function wordBad(w) {
    if (!w) return false;
    const doubled = /(.)\1/.test(w);
    const is = (x) => RAW.has(x) || (doubled && SQ.has(squeeze(x)));
    if (is(w)) return true;
    const p = w.replace(PREFIX, '');
    if (p !== w && p.length >= 4 && is(p)) return true;
    const p2 = p.replace(PREFIX, '');
    return p2 !== p && p2.length >= 4 && is(p2);
  }

  /** True when the text is clean (empty text is clean). */
  function isClean(text) {
    const n = norm(text);
    if (!n.trim()) return true;
    const words = n.split(/[^א-תa-z*]+/).map((w) => w.replace(/\*/g, '')).filter(Boolean);
    if (words.some(wordBad)) return false;
    for (const ph of PHRASES) {
      for (let i = 0; i + ph.length <= words.length; i++) {
        if (ph.every((x, j) => words[i + j] === x || squeeze(words[i + j]) === x || words[i + j].replace(PREFIX, '') === x)) return false;
      }
    }
    // a long bad word spelled with something between its letters ("ש.ר.מ.ו.ט.ה", "f u c k i n g")
    const joined = squeeze(n.replace(/[^א-תa-z]+/g, ''));
    const spaced = /[א-תa-z][^א-תa-z]+[א-תa-z][^א-תa-z]+[א-תa-z]/.test(n);
    if (spaced && LONG.some((w) => joined.includes(w))) return false;
    return true;
  }

  root.Clean = { isClean, norm };
})(typeof window !== 'undefined' ? window : globalThis);
