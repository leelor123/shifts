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

// an invisible direction mark typed into a translation file (14 Nov 2026): the writer escapes them (tools/i18n.js
// toJson), and a file edited by hand or merged must not bring one back in literally
T.test('no i18n file holds a literal direction mark (LRM, RLM, embedding, override or isolate)', () => {
  const fs = require('fs');
  const dir = path.join(__dirname, '..', 'i18n');
  const bad = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const n = (fs.readFileSync(path.join(dir, f), 'utf8').match(/[‎‏‪-‮⁦-⁩]/g) || []).length;
    if (n) bad.push(f + ': ' + n);
  }
  T.eq(bad.join(', '), '', 'literal direction marks');
  T.eq(JSON.parse(I.toJson({ a: 'x‏y' })).a, 'x‏y', 'an escaped mark reads back the same');
});
