/*
 * undef.js — names used in src/ that are defined nowhere (a variable left behind when code moved: the shift editor's
 * calculation used `sh` after it moved out of the function that had it, and the editor could not open, 2026-10-29).
 * The unit tests run the engine, not the screens, so a mistake like that waited for a browser. This walks every file
 * with its scopes (var / let / const / function / class / parameters / catch, hoisting included) and lists each name
 * that no scope declares and the browser does not have.
 * usage: node tools/undef.js            (prints the names; exit 1 when there is one)
 *        require('./undef.js').check()  → [{ file, line, name }]
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

// what the page has without declaring it (the browser, and what Node gives the shared core files)
const GLOBALS = new Set(`undefined NaN Infinity globalThis window self document navigator location history screen
console setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame requestIdleCallback
cancelIdleCallback queueMicrotask structuredClone fetch Request Response Headers URL URLSearchParams AbortController
Blob File FileReader FormData TextEncoder TextDecoder atob btoa crypto performance matchMedia getComputedStyle
localStorage sessionStorage indexedDB IDBKeyRange caches alert confirm prompt open close print scrollTo scrollBy
innerWidth innerHeight scrollX scrollY devicePixelRatio visualViewport Notification ServiceWorkerRegistration
Image Audio AudioContext OfflineAudioContext webkitAudioContext OffscreenCanvas ImageBitmap createImageBitmap ImageData
Path2D DOMParser XMLSerializer MutationObserver IntersectionObserver ResizeObserver PerformanceObserver Event
CustomEvent KeyboardEvent MouseEvent PointerEvent TouchEvent InputEvent NodeFilter Node Element HTMLElement
HTMLInputElement HTMLSelectElement HTMLTextAreaElement HTMLCanvasElement HTMLImageElement HTMLVideoElement
SVGElement CSS CSSStyleSheet DOMRect Worker BroadcastChannel MessageChannel WebSocket EventSource XMLHttpRequest
Intl Math JSON Date RegExp Error TypeError RangeError SyntaxError ReferenceError EvalError URIError AggregateError
Object Array String Number Boolean Symbol BigInt Map Set WeakMap WeakSet WeakRef FinalizationRegistry Promise Proxy
Reflect ArrayBuffer SharedArrayBuffer DataView Uint8Array Uint8ClampedArray Uint16Array Uint32Array Int8Array
Int16Array Int32Array Float32Array Float64Array BigInt64Array BigUint64Array isNaN isFinite parseInt parseFloat
encodeURIComponent decodeURIComponent encodeURI decodeURI escape unescape eval arguments require module exports
process Buffer __dirname __filename global name origin isSecureContext onerror onunhandledrejection CloseWatcher
ClipboardItem PublicKeyCredential SpeechSynthesisUtterance speechSynthesis Animation KeyframeEffect DOMException
FontFace TextMetrics DocumentFragment Range Selection getSelection ShadowRoot Text Comment Option PaymentRequest`.split(/\s+/));

function check(files) {
  const SRC = path.join(__dirname, '..', 'src');
  files = files || ['core', 'app'].flatMap((d) => fs.readdirSync(path.join(SRC, d)).filter((f) => f.endsWith('.js')).map((f) => path.join(SRC, d, f)))
    .concat(fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).map((f) => path.join(SRC, f)));
  const out = [];
  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');
    let ast;
    try { ast = acorn.parse(code, { ecmaVersion: 2024, sourceType: 'script', locations: true, allowReturnOutsideFunction: true }); } catch (e) { out.push({ file, line: e.loc ? e.loc.line : 0, name: 'cannot be read: ' + e.message }); continue; }
    const rel = path.relative(path.join(SRC, '..'), file).replace(/\\/g, '/');
    // a scope: its names, its parent, and whether it is a function's (where var goes)
    const scope = (parent, fn) => ({ names: new Set(), parent, fn });
    const fnScope = (s) => { while (!s.fn) s = s.parent; return s; };
    const declare = (pat, s) => {
      if (!pat) return;
      if (pat.type === 'Identifier') s.names.add(pat.name);
      else if (pat.type === 'ObjectPattern') pat.properties.forEach((p) => declare(p.type === 'RestElement' ? p.argument : p.value, s));
      else if (pat.type === 'ArrayPattern') pat.elements.forEach((e) => declare(e, s));
      else if (pat.type === 'RestElement') declare(pat.argument, s);
      else if (pat.type === 'AssignmentPattern') declare(pat.left, s);
    };
    // the declarations a block (or a function's body) makes for itself, before anything in it runs
    const hoist = (stmts, block, fnS) => {
      const vars = (n) => {
        if (!n || typeof n.type !== 'string') return;
        if (/Function/.test(n.type) && n !== stmts) return; // another function's own
        if (n.type === 'VariableDeclaration' && n.kind === 'var') n.declarations.forEach((d) => declare(d.id, fnS));
        for (const k of Object.keys(n)) { const v = n[k]; if (k === 'loc') continue; if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && !/Function/.test(c.type) && vars(c)); else if (v && typeof v.type === 'string' && !/Function/.test(v.type)) vars(v); }
      };
      for (const st of stmts) {
        if (st.type === 'VariableDeclaration' && st.kind !== 'var') st.declarations.forEach((d) => declare(d.id, block));
        if (st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') { block.names.add(st.id.name); fnS.names.add(st.id.name); }
        vars(st);
      }
    };
    const known = (name, s) => { for (; s; s = s.parent) if (s.names.has(name)) return true; return GLOBALS.has(name); };
    const ref = (id, s) => { if (!known(id.name, s)) out.push({ file: rel, line: id.loc.start.line, name: id.name }); };
    function fn(n, s) {
      const f = scope(s, true);
      if (n.type === 'FunctionExpression' && n.id) f.names.add(n.id.name);
      n.params.forEach((p) => declare(p, f));
      n.params.forEach((p) => pattern(p, f)); // defaults may use names
      if (n.body.type === 'BlockStatement') { hoist(n.body.body, f, f); n.body.body.forEach((c) => visit(c, f)); } else visit(n.body, f);
    }
    // a pattern's defaults and computed keys are uses
    function pattern(p, s) {
      if (!p) return;
      if (p.type === 'AssignmentPattern') { pattern(p.left, s); visit(p.right, s); } else if (p.type === 'ObjectPattern') p.properties.forEach((q) => { if (q.type === 'RestElement') pattern(q.argument, s); else { if (q.computed) visit(q.key, s); pattern(q.value, s); } });
      else if (p.type === 'ArrayPattern') p.elements.forEach((e) => pattern(e, s));
      else if (p.type === 'RestElement') pattern(p.argument, s);
      else if (p.type === 'MemberExpression') visit(p, s);
    }
    function visit(n, s) {
      if (!n || typeof n.type !== 'string') return;
      switch (n.type) {
        case 'Identifier': ref(n, s); return;
        case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': fn(n, s); return;
        case 'ClassDeclaration': case 'ClassExpression': {
          const c = scope(s, false); if (n.id) c.names.add(n.id.name);
          visit(n.superClass, c);
          n.body.body.forEach((m) => { if (m.computed) visit(m.key, c); if (m.value) visit(m.value, c); if (m.type === 'StaticBlock') m.body.forEach((x) => visit(x, c)); });
          return;
        }
        case 'BlockStatement': case 'StaticBlock': { const b = scope(s, false); hoist(n.body, b, fnScope(s)); n.body.forEach((c) => visit(c, b)); return; }
        case 'SwitchStatement': { visit(n.discriminant, s); const b = scope(s, false); const all = n.cases.flatMap((c) => c.consequent); hoist(all, b, fnScope(s)); n.cases.forEach((c) => { visit(c.test, b); c.consequent.forEach((x) => visit(x, b)); }); return; }
        case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': {
          const b = scope(s, false);
          const init = n.init || n.left;
          if (init && init.type === 'VariableDeclaration') { init.declarations.forEach((d) => declare(d.id, init.kind === 'var' ? fnScope(s) : b)); init.declarations.forEach((d) => { pattern(d.id, b); visit(d.init, b); }); } else if (init) { if (n.type === 'ForStatement') visit(init, b); else pattern(init, b); }
          visit(n.test, b); visit(n.update, b); visit(n.right, b); visit(n.body, b);
          return;
        }
        case 'CatchClause': { const c = scope(s, false); declare(n.param, c); visit(n.body, c); return; }
        case 'VariableDeclaration': n.declarations.forEach((d) => { pattern(d.id, s); visit(d.init, s); }); return;
        case 'MemberExpression': visit(n.object, s); if (n.computed) visit(n.property, s); return;
        case 'Property': if (n.computed) visit(n.key, s); visit(n.value, s); return;
        case 'MethodDefinition': case 'PropertyDefinition': if (n.computed) visit(n.key, s); visit(n.value, s); return;
        case 'LabeledStatement': visit(n.body, s); return;
        case 'BreakStatement': case 'ContinueStatement': return;
        case 'AssignmentExpression': if (n.left.type === 'Identifier') ref(n.left, s); else pattern(n.left, s); visit(n.right, s); return;
        case 'MetaProperty': return;
        default:
          for (const k of Object.keys(n)) {
            if (k === 'loc' || k === 'type') continue;
            const v = n[k];
            if (Array.isArray(v)) v.forEach((c) => visit(c, s)); else if (v && typeof v.type === 'string') visit(v, s);
          }
      }
    }
    const top = scope(null, true);
    hoist(ast.body, top, top);
    ast.body.forEach((c) => visit(c, top));
  }
  return out;
}
module.exports = { check, GLOBALS };
if (require.main === module) {
  const r = check();
  r.forEach((x) => console.log(`${x.file}:${x.line}  ${x.name}`));
  console.log(r.length ? `\n${r.length} names defined nowhere` : 'every name is defined');
  process.exit(r.length ? 1 : 0);
}
