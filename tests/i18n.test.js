/* Every text in the app has its translation in every language, read from the source as it is now (2 Nov 2026: a
 * changed home-screen template had none, and the English app would have shown its top in Hebrew; "check must show
 * 0" was a rule nothing enforced, and a catalog not extracted again hid it). */
const path = require('path');
const T = require('./t.js');
const I = require(path.join(__dirname, '..', 'tools', 'i18n.js'));

T.section('translations');
const list = I.collect();
for (const lang of Object.keys(I.LANGS)) {
  if (lang === 'he') continue;
  T.test(`${lang}: every text of the app is translated`, () => {
    const dict = I.dictOf(lang);
    const missing = list.filter((e) => dict[e.key] == null).map((e) => (e.where[0] || '') + ' ' + e.key.replace(/\s+/g, ' ').slice(0, 60));
    T.eq(missing.length, 0, missing.slice(0, 3).join(' | '));
  });
}
