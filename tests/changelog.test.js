/* Settings › about › all the updates: a release never ships without its line there (the user asked for the list,
 * 2026-10-29). The newest line is this version; versions go down, days never go up. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'views-guide.js'), 'utf8');
const pkg = require('../package.json');
const rows = [...src.matchAll(/\['(\d+\.\d+\.\d+)', '(\d{4}-\d\d-\d\d)', '([^']*(?:\\'[^']*)*)'\]/g)].map((m) => ({ v: m[1], d: m[2], t: m[3] }));
const num = (v) => v.split('.').reduce((s, x) => s * 1000 + +x, 0);

T.section('all the updates');
T.test('the newest line is this version (add it when the version goes up)', () => {
  T.eq(rows[0] && rows[0].v, pkg.version);
});
T.test('versions go down and days never go up, each with a text', () => {
  const bad = rows.filter((r, i) => i && (num(rows[i - 1].v) <= num(r.v) || rows[i - 1].d < r.d)).map((r) => r.v);
  T.eq(bad.join(' '), '');
  T.ok(rows.length >= 59 && rows.every((r) => r.t.length > 8), String(rows.length));
});
T.test('what\'s new is for this version', () => {
  const m = src.match(/const WHATS_NEW = \{\s*id: '([\d.]+)'/);
  T.eq(m && m[1], pkg.version);
});
