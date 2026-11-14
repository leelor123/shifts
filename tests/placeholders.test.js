/* A placeholder is never cut (13 Nov 2026): nine translated placeholders were wider than a full-width input on a
 * 360px phone (270px of room at 16px), so the end of the hint was hidden ("For example: cashier, waitress, usher",
 * "Recherchez, ou décrivez un problème", three in Amharic...). The exact check measures each one in the browser
 * (qa placeholder-audit.js). This is the length budget behind it, in every language: every single-line placeholder
 * (a textarea's wraps) stays within 34 units, an Ethiopic letter counting 1.25 (they are wider), a Cyrillic letter
 * 1.03, a direction mark or a combining mark nothing. Every placeholder that was cut measured over the budget, and
 * every one that fits stays within it. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');

T.section('placeholders fit a small phone');
const I18N = path.join(__dirname, '..', 'i18n');
const LANGS = ['en', 'ru', 'ar', 'fr', 'es', 'am'];
const BUDGET = 34;
const units = (t) => [...t].reduce((a, c) => a + (/[ሀ-᎟ⶀ-⷟꬀-꬯]/.test(c) ? 1.25 : /[Ѐ-ӿ]/.test(c) ? 1.03 : /[​-\u200F⁠\u2066-\u2069]|\p{M}/u.test(c) ? 0 : 1), 0);
// the placeholders of single-line inputs in a template (the same reading as the browser audit)
const placeholders = (s) => [...String(s).matchAll(/placeholder="([^"$]*)"/g)].map((m) => (/^<textarea/.test(String(s).slice(String(s).lastIndexOf('<', m.index))) ? null : m[1]));
const dec = (s) => s.replace(/&#10;/g, '\n').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

T.test('the budget catches the placeholders that were cut and passes ones that fit', () => {
  for (const t of ['For example: cashier, waitress, usher', 'Recherchez, ou décrivez un problème', 'например: ресторан, магазин одежды', 'e.g. not counted as Shabbat at work', 'ማስታወሻዎችን፣ የሥራ መደብን፣ ቀንን ይፈልጉ…']) T.ok(units(t) > BUDGET, JSON.stringify(t) + ' is over: ' + units(t));
  for (const t of ['למשל: המעסיק לא מחשיב אותה כשבת', 'Chercher : service, paie, shabbat…', 'напр.: наушники, поездка, телефон', 'ይፈልጉ: ፈረቃ፣ የደመወዝ ወረቀት፣ ሻባት…']) T.ok(units(t) <= BUDGET, JSON.stringify(t) + ' is within: ' + units(t));
});

T.test(`every input placeholder, Hebrew and every translation, is within ${BUDGET} units`, () => {
  const over = [];
  let n = 0;
  for (const l of LANGS) {
    const cat = JSON.parse(fs.readFileSync(path.join(I18N, l + '.json'), 'utf8'));
    for (const [k, v] of Object.entries(cat)) {
      const he = placeholders(k), tr = placeholders(v || '');
      he.forEach((x, i) => {
        if (!x || !/[א-ת]/.test(x) || tr[i] === undefined || tr[i] === null) return;
        for (const [lang, t] of [['he', x], [l, tr[i]]]) {
          n++;
          const w = Math.max(...dec(t).split('\n').map(units));
          if (w > BUDGET) over.push(`${lang} ${w.toFixed(1)}: ${JSON.stringify(dec(t))}`);
        }
      });
    }
  }
  T.ok(n > 100, 'placeholders read: ' + n);
  T.eq([...new Set(over)].join(' | '), '', 'placeholders over the budget (shorten the text)');
});
