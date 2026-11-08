/* A coloured card keeps its colour (the user, 9 Nov 2026: the payday card showed empty: its dark background came from
 * a lone ".payday" rule in styles.css, and the ".card" rule in styles-v3.css, read later with the same weight, painted
 * it white under its white text). Every "card X" box whose background is set by a lone ".X" before the last ".card"
 * background rule is listed here; ".card.X" wins. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');

const SRC = process.env.CARDS_SRC || path.join(__dirname, '..', 'src'); // (CARDS_SRC=<a copy of src/>: the same check on another version)
T.section('coloured cards');
T.test('no card colour is set by a lone class that the later .card rule beats', () => {
  const js = fs.readdirSync(path.join(SRC, 'app')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(SRC, 'app', f), 'utf8')).join('\n');
  const names = new Set();
  for (const m of js.matchAll(/class="card ([a-z0-9 -]+)/g)) m[1].split(/\s+/).forEach((n) => n && names.add(n));
  // the sheets in the order the page reads them (tools/build.js)
  const rules = []; let i = 0;
  for (const f of ['styles.css', 'styles-v3.css', 'styles-v4.css']) {
    const css = fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) rules.push({ f, sel: m[1].trim(), body: m[2], i: i++ });
  }
  const paints = (r) => /(^|;)\s*background(-color)?\s*:/.test(r.body);
  const lastCard = Math.max(...rules.filter((r) => paints(r) && r.sel.split(',').some((s) => s.trim() === '.card')).map((r) => r.i));
  T.ok(lastCard > 0, 'a .card background rule');
  const beaten = [];
  for (const r of rules) if (paints(r) && r.i < lastCard) for (const s of r.sel.split(',').map((x) => x.trim())) if (/^\.[a-z0-9-]+$/.test(s) && names.has(s.slice(1))) beaten.push(`${s} (${r.f})`);
  T.eq(beaten.join(', '), '');
});
