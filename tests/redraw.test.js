/* Rules in the code that keep the screen from flashing (the user, 2026-10-29: "fix it at the root, so it never
 * happens again"). Each was a real flash once:
 *  - a screen or a sheet drawn again by replacing its HTML made every element new: what moved on it began again and
 *    a phone showed the new card black for a frame → redraws go through Dom.patch;
 *  - CSS :active is on every ancestor of what is pressed: the pay card turned white while its eye was held → a
 *    container's own press style is never on while a button inside it is pressed;
 *  - the privacy blur was a fixed 7px (the big number stayed readable) and jumped → it grows with the text and fades. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const SRC = path.join(__dirname, '..', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const appFiles = fs.readdirSync(path.join(SRC, 'app')).filter((f) => f.endsWith('.js')).map((f) => 'app/' + f);

T.section('no flashing redraws');
T.test('the same screen drawn again is patched, not replaced', () => {
  const app = read('app/app.js');
  T.ok(/if \(same\) root\.Dom\.patch\(inner, html\)/.test(app), 'App.render patches the same screen');
  T.ok(read('app/dom.js').includes('Dom.patch = function'), 'Dom.patch exists');
});
T.test('a sheet\'s body is never redrawn by replacing its HTML', () => {
  const bad = [];
  for (const f of appFiles) {
    read(f).split('\n').forEach((l, i) => {
      if (/sh-body['"]?\)\.innerHTML\s*=|\b(b|body|el)\.innerHTML\s*=\s*(body|empPicker)\(|innerHTML\s*=\s*preview\(\)/.test(l)) bad.push(`${f}:${i + 1}`);
    });
  }
  T.eq(bad.join(' '), '', 'use root.Dom.patch(el, html)');
});
T.test('screen mounts bind their listeners once per element (UI.on), as a patched screen keeps its elements', () => {
  const bad = [];
  for (const f of appFiles) {
    const s = read(f);
    const re = /App\.views\.(\w+)_mount = function[\s\S]*?\n {2}\};/g;
    let m;
    while ((m = re.exec(s))) if (/\.addEventListener\(/.test(m[0])) bad.push(`${f} ${m[1]}_mount`);
  }
  T.eq(bad.join(' '), '', 'use UI.on(el, type, fn)');
});

T.test('what code adds next to a drawn element is marked as its own (a patch would remove it)', () => {
  const bad = [];
  for (const f of appFiles) {
    const L = read(f).split('\n');
    L.forEach((l, i) => {
      if (/\b(input|sel|el|t|btn)\.after\(/.test(l) && !/Dom\.own/.test(L.slice(i, i + 2).join(' '))) bad.push(`${f}:${i + 1}`);
    });
  }
  T.eq(bad.join(' '), '', 'root.Dom.own(node, anchor)');
});

T.section('presses and the privacy blur');
const css = read('styles.css') + '\n' + read('styles-v3.css');
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((r) => r.split('{')[0].trim()).filter(Boolean);
T.test('a card that holds buttons has no press style of its own while one of them is pressed', () => {
  const bad = [];
  // a selector list split at its own commas (not those inside :is(…) / :has(…))
  const splitTop = (sel) => { const out = []; let d = 0, cur = ''; for (const ch of sel) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  for (const sel of rules) {
    for (const one of splitTop(sel)) {
      const s = one.trim();
      // the pay card, the timer card, plain cards and list rows hold buttons (the eye, the brush, a row's switch)
      if (/\.(home-hero|timer-card|card|item)(\.[\w-]+)*:active\b/.test(s) && !/:has\(.*:active\)\)/.test(s)) bad.push(s);
    }
  }
  T.eq(bad.join(' | '), '', 'add :not(:has(button:active))');
});
T.test('the privacy blur grows with the text and fades in and out', () => {
  const m = css.match(/html\.hide-money \.money \{([^}]*)\}/);
  T.ok(m, 'the rule is there');
  const blur = m && m[1].match(/blur\(([\d.]+)em\)/);
  T.ok(blur && +blur[1] >= 0.25, 'an em-based blur, at least .25em: ' + (m && m[1]));
  T.ok(/\.money \{ transition: filter/.test(css), 'a transition on the blur');
});
