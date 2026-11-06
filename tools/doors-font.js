/* The first doors' own small fonts (6 Nov 2026). The language doors of a first visit greet in seven languages, so the
 * page asked for the whole Arabic, Cyrillic and Ethiopic files (32 + 15 + 198 KB) while drawing its very first screen.
 * Lighthouse counts every file the first paint waits on: its first paint on a slow phone line came at 2.4 s, most of it
 * the Ethiopic file. These are the same fonts cut down to the letters the doors use (lang.js LANGS), under a family of
 * their own ('Shaati Doors'), used only by the doors of a browser that never kept anything of the app (html.lp-bare,
 * styles-v3.css): the same letters, drawn by the same font, from a few KB.
 *
 * Run after changing a door text in lang.js or the fonts (tests/fonts.test.js fails until then):
 *   npm i --no-save subset-font && node tools/doors-font.js
 * Writes src/fonts/doors-<script>.woff2 and src/fonts/doors.css (the build puts it after fonts.css). */
const fs = require('fs');
const path = require('path');

const FONTS = path.join(__dirname, '..', 'src', 'fonts');
// each script: the file it is cut from, its face's descriptors there, and which letters belong to it
const SCRIPTS = [
  { id: 'arabic', from: 'rubik-arabic.woff2', weight: '300 800', is: (c) => (c >= 0x600 && c <= 0x6ff) || (c >= 0xfb50 && c <= 0xfeff) },
  { id: 'cyrillic', from: 'rubik-cyrillic.woff2', weight: '300 800', is: (c) => c >= 0x400 && c <= 0x45f },
  // one weight range for all three faces: Chrome picks the faces of a family by their weight descriptor before their
  // unicode-range, so a face with another range (Noto's own 100 900) was never used and the whole Ethiopic file came
  // anyway. The doors draw at 400 to 800, inside both ranges, so Noto's weight axis gets the same values.
  { id: 'ethiopic', from: 'noto-ethiopic.woff2', weight: '300 800', is: (c) => (c >= 0x1200 && c <= 0x1399) || (c >= 0x2d80 && c <= 0x2dde) },
];

/** Every character the doors can show: each language's name, letter, greeting, question, badge and "later" line. */
function doorsText() {
  const vm = require('vm');
  const ctx = { U: {}, document: { documentElement: {} }, localStorage: { getItem: () => null }, console };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'lang.js'), 'utf8'), ctx);
  return ctx.Lang.LANGS.map((l) => [l.name, l.glyph, l.hello, l.ask, l.sug, l.later].join('')).join('');
}
const hex = (c) => 'U+' + c.toString(16).toUpperCase().padStart(4, '0');

/** The characters of one script the doors use, in order (the face's unicode-range). */
function charsOf(script, text) {
  return [...new Set([...text].map((ch) => ch.codePointAt(0)).filter(script.is))].sort((a, b) => a - b);
}

module.exports = { SCRIPTS, doorsText, charsOf, hex };

if (require.main === module) {
  (async () => {
    const subset = require('subset-font');
    const text = doorsText();
    let css = '/* tools/doors-font.js: the first doors\' letters only (html.lp-bare .lp-host) */\n';
    for (const s of SCRIPTS) {
      const chars = charsOf(s, text);
      const out = await subset(fs.readFileSync(path.join(FONTS, s.from)), String.fromCodePoint(...chars), { targetFormat: 'woff2' });
      const file = 'doors-' + s.id + '.woff2';
      fs.writeFileSync(path.join(FONTS, file), out);
      css += `@font-face{font-family: 'Shaati Doors'; font-style: normal; font-weight: ${s.weight}; font-display: swap; src: url(fonts/${file}) format('woff2'); unicode-range: ${chars.map(hex).join(', ')};}\n`;
      console.log(file, out.length, 'bytes,', chars.length, 'letters');
    }
    fs.writeFileSync(path.join(FONTS, 'doors.css'), css);
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
