/* iPhone (Safari / WebKit) guards. Every browser on an iPhone is Safari's engine, and an iPhone keeps the Safari
 * of its iOS version, so the app must load on older Safari too:
 *  - a regular expression with a lookbehind ((?<= / (?<!) is a syntax error in Safari before iOS 16.4. The build
 *    turns each into new RegExp(...) (esbuild target safari15), so it fails only when it runs; it must therefore
 *    never run while a file loads (that stopped the whole app), only through U.lazyRx, which falls back.
 *  - 'vh' on an iPhone counts the screen without Safari's toolbar: a sheet sized in vh pushes its title off the top
 *    while the toolbar shows. A height in vh needs a dvh value right after it. */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');
const T = require('./t.js');

const SRC = path.join(__dirname, '..', 'src');
const jsFiles = ['core', 'app'].flatMap((d) => fs.readdirSync(path.join(SRC, d)).filter((f) => f.endsWith('.js')).map((f) => path.join(SRC, d, f)))
  .concat([path.join(SRC, 'sw.js')]);
const LOOKBEHIND = /\(\?<[=!]/;

T.section('iPhone: Safari engine');
T.test('every lookbehind regex is built through U.lazyRx (on first use; Safari before iOS 16.4 cannot read one)', () => {
  const bad = [];
  for (const file of jsFiles) {
    const code = fs.readFileSync(file, 'utf8');
    const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowHashBang: true });
    walk.fullAncestor(ast, (node, _st, anc) => {
      const lit = node.type === 'Literal' && node.regex && LOOKBEHIND.test(node.regex.pattern);
      const ctor = (node.type === 'NewExpression' || node.type === 'CallExpression') && node.callee.name === 'RegExp'
        && LOOKBEHIND.test(code.slice(node.start, node.end));
      if (!lit && !ctor) return;
      const lazy = anc.some((a) => a.type === 'CallExpression' && a.callee.type === 'MemberExpression' && a.callee.property.name === 'lazyRx');
      if (!lazy) bad.push(path.relative(SRC, file) + ':' + node.loc.start.line);
    });
  }
  T.eq(JSON.stringify(bad), '[]');
});
T.test('U.lazyRx: built once on first read, and a regex the browser cannot build matches nothing', () => {
  let built = 0;
  const R = U.lazyRx({ A: () => { built++; return /a/g; }, BAD: () => { throw new SyntaxError('Invalid regular expression'); } });
  T.eq(built, 0);
  T.ok(R.A === R.A && built === 1, 'the same object each time');
  T.eq('abc'.replace(R.BAD, 'x'), 'abc');
  T.eq([...'abc'.matchAll(R.BAD)].length, 0);
});
T.test('a height in vh has a dvh value right after it', () => {
  const bad = [];
  for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(SRC, f), 'utf8');
    for (const m of css.matchAll(/(?<![a-z-])((?:max-|min-)?height):\s*([^;}]*\dvh\b[^;}]*);(?!\s*\1:\s*[^;}]*dvh)/g)) bad.push(f + ': ' + m[0].trim());
  }
  T.eq(JSON.stringify(bad), '[]');
  T.eq(JSON.stringify([...'.a { max-height: 94vh; display: flex; }'.matchAll(/(?<![a-z-])((?:max-|min-)?height):\s*([^;}]*\dvh\b[^;}]*);(?!\s*\1:\s*[^;}]*dvh)/g)].length), '1');
});
T.test('the build compiles the code for Safari 15 (a lookbehind becomes new RegExp, not a load-time syntax error)', () => {
  const build = fs.readFileSync(path.join(__dirname, '..', 'tools', 'build.js'), 'utf8');
  T.ok(/target:\s*\[[^\]]*'safari15'/.test(build), 'tools/build.js: the JS minify target names safari15');
});
