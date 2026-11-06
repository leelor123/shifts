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
// Amharic (3 Nov 2026): its letters come from the app's own Ethiopic file, whatever font is chosen in the settings
T.test('Amharic letters come from the Ethiopic file, which stands right after the chosen font', () => {
  for (const c of [0x1200, 0x12a0, 0x1361, 0x1362]) T.eq(fileFor('Shaati Ethiopic', c), 'noto-ethiopic.woff2', `U+${c.toString(16)}`);
  T.ok(fs.existsSync(path.join(__dirname, '..', 'src', 'fonts', 'noto-ethiopic.woff2')), 'the file is there');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');
  T.ok(/--font: var\(--app-font\), 'Shaati Ethiopic',/.test(styles), '--font has the Ethiopic family after the chosen font');
  T.ok(fileFor('Shaati Ethiopic', 0x41) === undefined, 'nothing else is taken from it (Latin stays Rubik)');
});
// The first doors' own fonts (6 Nov 2026): 'Shaati Doors' (tools/doors-font.js) is the Arabic, Cyrillic and Ethiopic files
// cut down to the doors' letters, so a first visit's first paint waits on 27 KB instead of 245 KB
T.test('the first doors: every Arabic, Russian and Amharic letter they show is in their own small font', () => {
  const D = require('../tools/doors-font.js');
  const SRC = path.join(__dirname, '..', 'src');
  const doors = fs.readFileSync(path.join(SRC, 'fonts', 'doors.css'), 'utf8');
  const faces = [...doors.matchAll(/@font-face\{([^}]*)\}/g)].map((m) => ({
    family: /font-family: '([^']+)'/.exec(m[1])[1], weight: /font-weight: ([^;]+);/.exec(m[1])[1],
    file: /url\(fonts\/([^)]+)\)/.exec(m[1])[1], range: /unicode-range: ([^;]+)/.exec(m[1])[1],
  }));
  const text = D.doorsText();
  for (const s of D.SCRIPTS) {
    const f = faces.find((x) => x.file === 'doors-' + s.id + '.woff2');
    T.ok(f && f.family === 'Shaati Doors', 'a face for ' + s.id);
    T.eq(f.range, D.charsOf(s, text).map(D.hex).join(', '), s.id + ': a door text changed; run node tools/doors-font.js');
    T.ok(fs.existsSync(path.join(SRC, 'fonts', f.file)), f.file);
  }
  // Chrome picks a family's faces by weight before unicode-range: a face with another weight range is never used
  T.eq(new Set(faces.map((x) => x.weight)).size, 1, 'one weight range for all the doors faces');
  T.ok(!/U\+0020|U\+05|U\+00[4-7]/.test(doors), 'no space, Hebrew or Latin: the line heights and the rest stay Rubik');
  const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  T.ok(D.SCRIPTS.every((s) => html.includes("'" + s.id + "'")) && html.includes("'fonts/doors-'"), 'index.html asks for each doors file at once on a first visit');
  T.ok(/read\('fonts\/doors\.css'\)/.test(fs.readFileSync(path.join(__dirname, '..', 'tools', 'build.js'), 'utf8')), 'the build puts doors.css in the page');
  T.ok(/html\.lp-bare \.lp-host \{ font-family: 'Shaati Doors'/.test(fs.readFileSync(path.join(SRC, 'styles-v3.css'), 'utf8')), 'only the first visit\'s doors use it');
});
