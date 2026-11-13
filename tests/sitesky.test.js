/* The website's living sky (site/sky.js, a copy of the app's) draws still <svg> drawings and wraps every moving part in a
 * div.sk-lay of its own. A page that shows it needs the app's layer rules: the sky clips, and the drawings and layers
 * lie on top of each other. Without them (1.34.1 to 1.37.2) the layers stacked down the page and a drifting cloud made
 * the home page wider than the screen in Safari (RTL: a layer moved left past the edge widens the page). Each moving
 * part is styled, and moves in drawing units (x --sku), as the app's styles.css does. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const SITE = path.join(__dirname, '..', 'site');

T.section('website sky: layers lie inside the sky');
const sky = fs.readFileSync(path.join(SITE, 'sky.js'), 'utf8');
const moving = [...new Set([...sky.matchAll(/moving\('(sk-[a-z-]+)'/g)].map((m) => m[1]))];
const css = (html) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const rule = (text, sel) => { const m = text.match(new RegExp('(?:^|[}\\n])\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}')); return m ? m[1] : null; };
const keyframes = (text, name) => { const m = text.match(new RegExp('@keyframes ' + name + '\\s*\\{((?:[^{}]*\\{[^}]*\\})*)[^{}]*\\}')); return m ? m[1] : null; };

T.test('sky.js still wraps its moving parts in div.sk-lay', () => {
  T.ok(/'sk-lay '/.test(sky), 'sky.js no longer makes div.sk-lay: update this test');
  T.ok(moving.length >= 3, 'no moving parts found in sky.js');
});
const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html')).filter((f) => /<script[^>]+src="sky\.js"/.test(fs.readFileSync(path.join(SITE, f), 'utf8')));
T.test('the pages that show the sky are found', () => T.ok(pages.includes('index.html'), 'site/index.html no longer loads sky.js'));
for (const f of pages) {
  const c = css(fs.readFileSync(path.join(SITE, f), 'utf8'));
  T.test(`site/${f}: the sky clips what moves in it`, () => {
    const r = rule(c, '.sky');
    T.ok(r && /overflow\s*:\s*(hidden|clip)/.test(r), '.sky { overflow: hidden } is missing');
  });
  T.test(`site/${f}: the drawings and layers lie on top of each other`, () => {
    T.ok(/position\s*:\s*absolute/.test(rule(c, '.sky .sk-lay') || ''), '.sky .sk-lay { position: absolute; inset: 0 } is missing');
    T.ok(/position\s*:\s*absolute/.test(rule(c, '.sky > svg, .sky .sk-lay > svg') || ''), '.sky > svg, .sky .sk-lay > svg { position: absolute } is missing');
  });
  for (const cls of moving) T.test(`site/${f}: .${cls} is styled and moves in drawing units`, () => {
    const r = rule(c, '.sky .' + cls);
    T.ok(r, `.sky .${cls} has no rule`);
    const name = (r.match(/animation\s*:\s*([a-z-]+)/) || [])[1];
    T.ok(name, `.sky .${cls} has no animation`);
    const k = keyframes(c, name);
    T.ok(k, `@keyframes ${name} is missing`);
    for (const t of k.match(/translate[XY]?\([^;]*\)/g) || []) T.ok(/--sku/.test(t), `@keyframes ${name}: ${t} is in screen pixels, not drawing units (x var(--sku))`);
  });
}
