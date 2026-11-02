/* Fonts served from the app's own address (Rubik + Fredoka, SIL Open Font License): Google's stylesheet held the first
 * paint for a round trip to two more servers. Run once (or to update them): node tools/fonts.js
 * Writes src/fonts/<family>-<subset>.woff2 and src/fonts/fonts.css (the @font-face rules with local addresses);
 * the build copies them next to the app (docs/fonts) and the website (site/fonts). */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '..', 'src', 'fonts');
const CSS_URL = 'https://fonts.googleapis.com/css2?family=Rubik:wght@300..800&family=Fredoka:wght@500..700&display=swap';
// a desktop Chrome gets woff2 with one file per script (unicode-range)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const get = (url) => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
    if (res.statusCode !== 200) { reject(new Error(url + ': ' + res.statusCode)); return; }
    const parts = [];
    res.on('data', (d) => parts.push(d));
    res.on('end', () => resolve(Buffer.concat(parts)));
  }).on('error', reject);
});

(async () => {
  const css = String(await get(CSS_URL));
  fs.mkdirSync(OUT, { recursive: true });
  const blocks = [...css.matchAll(/\/\* ([\w-]+) \*\/\s*@font-face \{([\s\S]*?)\}/g)];
  if (!blocks.length) throw new Error('no @font-face in the stylesheet');
  const rules = [];
  for (const [, subset, body] of blocks) {
    const family = /font-family: '([^']+)'/.exec(body)[1];
    const url = /url\((https:[^)]+\.woff2)\)/.exec(body)[1];
    const file = family.toLowerCase() + '-' + subset + '.woff2';
    fs.writeFileSync(path.join(OUT, file), await get(url));
    rules.push({ subset, css: '@font-face{' + body.replace(/\s+/g, ' ').trim().replace(url, 'fonts/' + file) + '}\n' });
    console.log(file);
  }
  // the Hebrew file last: where two files of a family cover the same character, the browser takes the one written
  // last, and ₪ (U+20AA) is in latin-ext too. Written in Google's order, every price fetched latin-ext (not preloaded)
  // after the first paint, and the text holding it moved (website CLS .038). tests/fonts.test.js keeps it so.
  const out = rules.filter((r) => r.subset !== 'hebrew').concat(rules.filter((r) => r.subset === 'hebrew')).map((r) => r.css).join('');
  fs.writeFileSync(path.join(OUT, 'fonts.css'), out);
})().catch((e) => { console.error(e.message); process.exit(1); });
