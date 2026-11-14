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
    const n = (fs.readFileSync(path.join(dir, f), 'utf8').match(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g) || []).length;
    if (n) bad.push(f + ': ' + n);
  }
  // the code too: a mark is written as an escape (\u2066 and the like), never typed in (14 Nov 2026)
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.c?js$/.test(e.name) ? [path.join(d, e.name)] : []));
  for (const sub of ['src', 'tools', 'tests']) {
    for (const f of walk(path.join(__dirname, '..', sub))) {
      const n = (fs.readFileSync(f, 'utf8').match(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g) || []).length;
      if (n) bad.push(path.relative(path.join(__dirname, '..'), f) + ': ' + n);
    }
  }
  T.eq(bad.join(', '), '', 'literal direction marks');
  T.eq(JSON.parse(I.toJson({ a: 'x\u200Fy' })).a, 'x\u200Fy', 'an escaped mark reads back the same');
});
