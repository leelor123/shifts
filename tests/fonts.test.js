/* The Hebrew font file wins the characters it shares with the others (2 Nov 2026): where two @font-face rules of a
 * family cover the same character, the browser takes the one written last. ₪ is in latin-ext too, and with Google's
 * order every price fetched latin-ext (not preloaded) after the first paint and the text holding it moved. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');

T.section('fonts');
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'fonts', 'fonts.css'), 'utf8');
const rules = [...css.matchAll(/@font-face\{([^}]*)\}/g)].map((m) => ({
  family: /font-family: '([^']+)'/.exec(m[1])[1],
  file: /url\(fonts\/([^)]+)\)/.exec(m[1])[1],
  ranges: /unicode-range: ([^;]+)/.exec(m[1])[1].split(',').map((r) => r.trim().replace('U+', '').split('-').map((h) => parseInt(h, 16))),
}));
const covers = (r, c) => r.ranges.some(([a, b]) => c >= a && c <= (b === undefined ? a : b));
// the font file a character comes from: the last rule of the family that covers it
const fileFor = (family, c) => rules.filter((r) => r.family === family && covers(r, c)).map((r) => r.file).pop();
for (const family of ['Rubik', 'Fredoka']) {
  T.test(`${family}: ₪, Hebrew letters and Hebrew punctuation come from the Hebrew file`, () => {
    for (const c of [0x20aa, 0x5d0, 0x5ea, 0x5be, 0x200f, 0x200e]) {
      const f = fileFor(family, c);
      T.ok(f && f.endsWith('-hebrew.woff2'), `U+${c.toString(16).toUpperCase()} comes from ${f}`);
    }
  });
}
T.test('digits, spaces and Latin letters still come from the Latin file', () => {
  for (const c of [0x20, 0x30, 0x41, 0x61]) T.eq(fileFor('Rubik', c), 'rubik-latin.woff2', `U+${c.toString(16)}`);
});
