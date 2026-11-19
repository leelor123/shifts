/* Looping animations move by transform and opacity only, so the compositor runs them without the main thread.
 * An endless keyframe on box-shadow, background-position, width, height, top/left, filter and the like repaints
 * every frame for as long as it is on screen (the running-shift dot did, until 19 Nov 2026: 450 paints in 3 s).
 * Reads every stylesheet, the page's <style> and the inline styles the screens write. */
const T = require('./t.js');
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');

// what a looping keyframe may change: these the compositor runs on its own
const ALLOWED = new Set(['transform', 'translate', 'rotate', 'scale', 'opacity', 'animation-timing-function']);
const KEYWORDS = new Set(['infinite', 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end', 'alternate', 'alternate-reverse', 'reverse', 'normal', 'forwards', 'backwards', 'both', 'none', 'running', 'paused', 'initial', 'inherit', 'unset']);

/** splits on the commas that are not inside brackets (cubic-bezier(.2, 1, .3, 1) is one value) */
function topCommas(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && !depth) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}
/** the names of the animations that loop forever, from every `animation:` shorthand and every rule that sets
 *  animation-iteration-count: infinite next to an animation-name */
function loopingNames(text) {
  const names = new Set();
  const shorthand = /animation\s*:\s*([^;}"'`]+)/g;
  let m;
  while ((m = shorthand.exec(text))) {
    for (const part of topCommas(m[1])) {
      const bare = part.replace(/[a-z-]+\([^)]*\)/gi, ' ');
      if (!/\binfinite\b/.test(bare)) continue;
      const name = bare.trim().split(/\s+/).find((t) => /^-?[a-z_][\w-]*$/i.test(t) && !KEYWORDS.has(t));
      if (name) names.add(name);
    }
  }
  const block = /\{([^{}]*)\}/g;
  while ((m = block.exec(text))) {
    if (!/animation-iteration-count\s*:\s*[^;]*infinite/.test(m[1])) continue;
    const n = /animation-name\s*:\s*([^;]+)/.exec(m[1]);
    if (n) topCommas(n[1]).forEach((x) => names.add(x.trim()));
  }
  return names;
}
/** every @keyframes rule: its name and the properties its frames set */
function keyframes(text) {
  const out = [];
  const head = /@keyframes\s+([\w-]+)\s*\{/g;
  let m;
  while ((m = head.exec(text))) {
    let depth = 1, i = head.lastIndex;
    while (i < text.length && depth) { if (text[i] === '{') depth++; else if (text[i] === '}') depth--; i++; }
    const body = text.slice(head.lastIndex, i - 1);
    const props = new Set();
    body.replace(/\{([^{}]*)\}/g, (_, decls) => { decls.split(';').forEach((d) => { const p = d.split(':')[0].trim().toLowerCase(); if (p) props.add(p); }); return ''; });
    out.push({ name: m[1], props: [...props] });
  }
  return out;
}
/** looping animations whose keyframes change something the compositor cannot run */
function offenders(text) {
  const loops = loopingNames(text);
  return keyframes(text).filter((k) => loops.has(k.name)).map((k) => ({ name: k.name, bad: k.props.filter((p) => !ALLOWED.has(p)) })).filter((k) => k.bad.length);
}

function sources() {
  let all = '';
  for (const f of fs.readdirSync(SRC)) if (f.endsWith('.css')) all += fs.readFileSync(path.join(SRC, f), 'utf8') + '\n';
  const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  for (const s of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) all += s[1] + '\n';
  all += html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '') + '\n';
  for (const dir of ['app', 'core']) for (const f of fs.readdirSync(path.join(SRC, dir))) if (f.endsWith('.js')) all += fs.readFileSync(path.join(SRC, dir, f), 'utf8') + '\n';
  return all;
}

T.section('looping animations stay on the compositor');
T.test('the check itself catches a box-shadow pulse and a sliding background', () => {
  const old = '.pulse { animation: pulse 1.6s infinite; } @keyframes pulse { 0% { box-shadow: 0 0 0 0 red; } 70% { box-shadow: 0 0 0 10px transparent; } }'
    + ' .skel { animation: skel 1.4s ease-in-out infinite; } @keyframes skel { from { background-position: 100% 0; } to { background-position: -100% 0; } }'
    + ' .x { animation: grow 1s cubic-bezier(.2, 1, .3, 1) infinite, fade .2s forwards; } @keyframes grow { to { width: 20px; } } @keyframes fade { to { height: 0; } }'
    + ' .y { animation-name: glow; animation-iteration-count: infinite; } @keyframes glow { to { filter: blur(2px); } }';
  const found = offenders(old).map((k) => k.name + ':' + k.bad.join('+')).sort().join(' ');
  T.eq(found, 'glow:filter grow:width pulse:box-shadow skel:background-position');
});
T.test('a looping transform/opacity animation passes, and a one-off paint animation is not a loop', () => {
  T.eq(offenders('.a { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(1turn); opacity: .5; } } .b { animation: pop .3s ease-out both; } @keyframes pop { to { box-shadow: 0 0 4px red; } }').length, 0);
});
T.test('no endless keyframe in the app repaints every frame', () => {
  const text = sources();
  T.ok(loopingNames(text).size > 20, 'found the looping animations (' + loopingNames(text).size + ')');
  const bad = offenders(text);
  T.ok(!bad.length, 'move these by transform/opacity (a pseudo-element that scales or slides): ' + bad.map((k) => k.name + ' (' + k.bad.join(', ') + ')').join('; '));
});
