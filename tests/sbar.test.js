/* The installed app's own scroll indicator (sbar.js, 24 Nov 2026): the thumb's geometry, when a list is worth one,
 * and the rules that keep it cheap and out of the way. The page checks are in shaati-handoff/qa/sbar-test.js. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const SRC = path.join(__dirname, '..', 'src');
const Sbar = require(path.join(SRC, 'app', 'sbar.js'));
const code = fs.readFileSync(path.join(SRC, 'app', 'sbar.js'), 'utf8');
const css = fs.readFileSync(path.join(SRC, 'styles-v3.css'), 'utf8');

T.section('scroll indicator (sbar.js)');
T.test('the length is the visible share of the list, the place the scrolled share', () => {
  // 800 of 2000 on screen, track 700: 280 long; at the top 0, half way 210, at the end 420
  T.eq(Sbar.geom(0, 2000, 800, 700).len, 280);
  T.eq(Sbar.geom(0, 2000, 800, 700).off, 0);
  T.eq(Sbar.geom(600, 2000, 800, 700).off, 210);
  T.eq(Sbar.geom(1200, 2000, 800, 700).off, 420);
});
T.test('a very long list keeps a 40 px thumb that still reaches both ends', () => {
  const g = Sbar.geom(0, 100000, 800, 700);
  T.eq(g.len, 40);
  T.eq(Sbar.geom(99200, 100000, 800, 700).off, 660);
  T.eq(Sbar.geom(0, 100000, 800, 30).len, 30, 'a track shorter than the minimum: the whole track');
});
T.test('overscroll and rounding never push it past the track', () => {
  T.eq(Sbar.geom(-80, 2000, 800, 700).off, 0);
  T.eq(Sbar.geom(1400, 2000, 800, 700).off, 420);
  const g = Sbar.geom(333, 2000, 800, 700);
  T.ok(g.off >= 0 && g.off + g.len <= 700, JSON.stringify(g));
});
T.test('nothing to show when nothing is hidden or there is no track', () => {
  T.eq(Sbar.geom(0, 800, 800, 700), null);
  T.eq(Sbar.geom(0, 500, 800, 700), null);
  T.eq(Sbar.geom(0, 2000, 800, 0), null);
  T.eq(Sbar.geom(0, 2000, 0, 700), null);
});
T.test('only a box at least 160 px tall with 15% or more out of sight is worth a thumb', () => {
  T.ok(Sbar.worth(2000, 800));
  T.ok(Sbar.worth(942, 800), '85% on screen');
  T.ok(!Sbar.worth(900, 800), '89% on screen');
  T.ok(!Sbar.worth(2000, 120), 'a short box');
  T.ok(!Sbar.worth(0, 800));
});
T.test('one shared mechanism: a passive capture scroll listener, frames in requestAnimationFrame, transform only', () => {
  T.ok(/addEventListener\('scroll', onScroll, \{ capture: true, passive: true \}\)/.test(code), 'one capture listener on the document');
  T.ok(/const opts = \{ capture: true, passive: true \}/.test(code), 'passive options');
  T.eq((code.match(/addEventListener\('(touch\w+|wheel)', [^\n]*, opts\);/g) || []).length, (code.match(/addEventListener\('(touch\w+|wheel)'/g) || []).length, 'every touch and wheel listener is passive');
  T.ok(/requestAnimationFrame\(frame\)/.test(code), 'rAF throttled');
  T.ok(/thumb\.style\.transform = 'translateY\(/.test(code) && !/thumb\.style\.(top|marginTop) =/.test(code), 'moves by transform');
  T.ok(/fill: 'forwards'/.test(code) && /track\.hidden = true/.test(code), 'fades on the compositor, then display none');
  T.ok(/Fx\.motion/.test(code) && /prefers-reduced-motion/.test(code), 'reduce motion and effects off: no fade');
  T.ok(/app-shell/.test(code) && /\(pointer: coarse\)/.test(code), 'the installed app on a touch screen only');
  T.ok(/\.pk-wheel/.test(code) && /\.game-sheet/.test(code) && /\.pp-rail/.test(code), 'leaves the wheels, the games and the letter rail alone');
});
T.test('the thumb never takes a touch, is hidden from screen readers and is in the build', () => {
  T.ok(/\.sbar \{[^}]*pointer-events: none/.test(css), 'pointer-events none');
  T.ok(/setAttribute\('aria-hidden', 'true'\)/.test(code), 'aria-hidden');
  T.ok(/\.sbar\[hidden\] \{ display: none; \}/.test(css), 'display none when gone');
  T.ok(/\.sbar\.pg \{[^}]*inset-inline-end/.test(css), 'the page\'s thumb on the inline-end edge');
  T.ok(/'app\/sbar\.js'/.test(fs.readFileSync(path.join(__dirname, '..', 'tools', 'build.js'), 'utf8')), 'built in');
});
