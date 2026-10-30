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
