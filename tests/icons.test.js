/* Every icon the app asks for exists. An unknown name draws the "i" (info) icon without a word (UI.icon falls back to
 * it), so a wrong name went unseen: the tax refund sheet asked for 'user', which was never drawn (2026-10-30). */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');

const APP = path.join(__dirname, '..', 'src', 'app');
const iconNames = () => {
  const src = fs.readFileSync(path.join(APP, 'ui.js'), 'utf8');
  const table = src.slice(src.indexOf('const P = {'), src.indexOf('\n  };', src.indexOf('const P = {')));
  return new Set([...table.matchAll(/^ {4}(\w+): /gm)].map((m) => m[1]));
};
/** Every icon name written in the code: icon('x'), UI.tile('x'), tile(act, 'x'), emptyState('x') and ic: 'x'. */
function asked(src) {
  const out = [];
  const add = (re) => { for (const m of src.matchAll(re)) out.push(m[1]); };
  add(/\bicon\(\s*'(\w+)'/g);
  add(/\bUI\.tile\(\s*'(\w+)'/g);
  add(/(?:^|[^.\w])tile\(\s*'[\w-]+',\s*'(\w+)'/gm); // the add menus' own tile(action, icon, …)
  add(/\bemptyState\(\s*'(\w+)'/g);
  add(/\bic: '(\w+)'/g);
  return out;
}

T.section('icons');
T.test('every icon the app asks for is drawn (none falls back to the info icon)', () => {
  const have = iconNames();
  T.ok(have.size > 80, 'icons found: ' + have.size);
  const bad = [];
  for (const f of fs.readdirSync(APP).filter((x) => x.endsWith('.js'))) {
    for (const n of asked(fs.readFileSync(path.join(APP, f), 'utf8'))) if (!have.has(n)) bad.push(f + ': ' + n);
  }
  T.eq([...new Set(bad)].join(', '), '');
});
T.test('...and the check sees a missing one', () => {
  T.eq(asked("x = `${icon('user', 's')} עליך`; y = { ic: 'nope' };").filter((n) => !iconNames().has(n)).join(','), 'user,nope');
});

/* The notification icon in the status bar: Android draws it in a 24dp box, and other apps' glyphs fill about 20dp.
 * Ours filled 60% (14.5dp), so it looked smaller than its neighbours (2026-11-22). tools/notif-icon.js draws the web
 * badge and the Android app's drawables (copied over the generated project on every build) at 20dp. */
T.section('notification icon');
T.test('the badge and every Android drawable fill 20dp of the 24dp box, centred', () => {
  const N = require('../tools/notif-icon.js');
  const ROOT = path.join(__dirname, '..');
  const files = [['src/icons/badge-96.png', 96], ...Object.entries(N.ANDROID).map(([d, s]) => [`android/res/drawable-${d}/ic_notification_icon.png`, s])];
  for (const [f, size] of files) {
    const img = N.decode(path.join(ROOT, f));
    T.eq(img.w + 'x' + img.h, size + 'x' + size, f);
    const b = N.glyphBox(img), w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1, side = Math.max(w, h) / size;
    T.ok(side >= 0.8 && side <= 0.9, `${f}: glyph ${Math.round(side * 24 * 10) / 10}dp of 24dp`);
    T.ok(Math.abs(b.x0 - (size - 1 - b.x1)) <= 1 && Math.abs(b.y0 - (size - 1 - b.y1)) <= 1, f + ' centred');
  }
});
T.test('...and the build copies the Android drawables over the generated ones', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'android.js'), 'utf8');
  const at = src.indexOf('function patchNames'), fn = src.slice(at, src.indexOf('\n}', at));
  T.ok(fn.includes("path.join(ROOT, 'android', 'res')"), 'patchNames copies android/res');
  T.ok(/^ {2}patchNames\(\);/m.test(src), 'every generated project gets patchNames');
});
