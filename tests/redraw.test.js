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

/* The hours report, 6 Nov 2026: a table cell that held only an amount got the class "money" itself, and .money is an
 * inline-block, so the wage, travel and total cells left their row and stacked in one column. An amount in a cell or
 * a list item is marked with a span of its own; any other element that holds only an amount still takes the class. */
T.test('an amount in a table cell or a list item is wrapped, the cell itself stays a cell', () => {
  const vm = require('vm');
  // a small DOM: enough for Dom.markMoney (text nodes, elements, classList, closest, a tree walker)
  const doc = {};
  const el = (tag, kids) => {
    const n = { nodeType: 1, tagName: tag.toUpperCase(), ownerDocument: doc, childNodes: [], parentNode: null, cls: new Set(),
      get className() { return [...this.cls].join(' '); }, set className(v) { this.cls = new Set(String(v).split(/\s+/).filter(Boolean)); },
      get textContent() { return this.childNodes.map((c) => (c.nodeType === 3 ? c.nodeValue : c.textContent)).join(''); },
      set textContent(v) { this.childNodes = []; this.appendChild(text(v)); },
      appendChild(c) { if (c.nodeType === 11) { c.childNodes.slice().forEach((k) => this.appendChild(k)); c.childNodes = []; return c; } c.parentNode = this; this.childNodes.push(c); return c; },
      replaceChild(nu, old) { const i = this.childNodes.indexOf(old); const add = nu.nodeType === 11 ? nu.childNodes.splice(0) : [nu]; add.forEach((k) => { k.parentNode = this; }); this.childNodes.splice(i, 1, ...add); return old; },
      closest(sel) { for (let p = this; p && p.nodeType === 1; p = p.parentNode) if (sel.split(',').some((x) => /^\.[\w-]+$/.test(x.trim()) && p.cls.has(x.trim().slice(1)))) return p; return null; },
    };
    n.classList = { add: (c) => n.cls.add(c), contains: (c) => n.cls.has(c) };
    (kids || []).forEach((k) => n.appendChild(typeof k === 'string' ? text(k) : k));
    return n;
  };
  const text = (v) => ({ nodeType: 3, nodeValue: v, parentNode: null, ownerDocument: doc });
  Object.assign(doc, {
    createTextNode: text,
    createElement: (t) => el(t),
    createDocumentFragment: () => { const f = el('#frag'); f.nodeType = 11; return f; },
    createTreeWalker: (root) => {
      const all = []; const walk = (n) => n.childNodes.forEach((c) => { if (c.nodeType === 3) all.push(c); else walk(c); }); walk(root);
      let i = 0; return { nextNode: () => all[i++] || null };
    },
  });
  const ctx = { NodeFilter: { SHOW_TEXT: 4 } };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(SRC, 'app/dom.js'), 'utf8'), ctx);
  const amount = '‏576.00 ‏₪';
  const row = el('tr', [el('td', ['3/11']), el('td', [amount]), el('td', ['16.00 ₪'])]);
  const list = el('ul', [el('li', [amount])]);
  const plain = el('div', [el('span', [amount]), el('b', [amount])]);
  for (const n of [row, list, plain]) ctx.Dom.markMoney(n);
  for (const c of row.childNodes.concat(list.childNodes)) T.ok(!c.cls.has('money'), c.tagName + ' itself is not marked');
  const span = (c) => c.childNodes.find((k) => k.nodeType === 1);
  T.ok(span(row.childNodes[1]).cls.has('money') && span(row.childNodes[2]).cls.has('money'), 'its amount is, in a span');
  T.ok(span(list.childNodes[0]).cls.has('money'), 'the list item\'s amount too');
  T.ok(plain.childNodes.every((c) => c.cls.has('money') && c.childNodes.length === 1), 'a span or a b that holds only the amount is marked itself');
  T.eq(row.childNodes[0].cls.has('money'), false, 'a cell without an amount stays as it was');

  /* The claim report, 6 Nov 2026: "(" ended a line and the amount began the next one. The amount is an inline-block and
   * a line may break between it and the text that touches it; what touches it goes into one no-wrap span with it. */
  const RLM = '‏';
  const amt = RLM + '408.67 ' + RLM + '₪';
  const cell = el('td', ['8 שעות (' + amt + ').']);
  const kids = (n) => n.childNodes.map((c) => (c.nodeType === 3 ? JSON.stringify(c.nodeValue) : c.tagName + '.' + c.className));
  ctx.Dom.markMoney(cell);
  const glue = cell.childNodes.find((c) => c.nodeType === 1);
  T.ok(glue && glue.cls.has('money-glue'), 'the amount and its brackets are in one glue span: ' + kids(cell));
  T.ok(glue && glue.textContent === '(' + amt + ').', 'the glue holds "(", the amount, ")" and the period: ' + (glue && JSON.stringify(glue.textContent)));
  const inner = glue && glue.childNodes.find((c) => c.nodeType === 1);
  T.ok(inner && inner.cls.has('money') && inner.textContent === '408.67 ' + RLM + '₪', 'only the amount is .money (blurred), not the brackets');
  T.eq(cell.cls.has('money'), false, 'the cell itself stays a cell');
  T.eq(cell.childNodes[0].nodeValue, '8 שעות ', 'the words before it stay outside');
  // a range of two amounts joined without a space: one glue
  const range = el('span', ['בין ' + amt + '–' + amt + ' לשעה']);
  ctx.Dom.markMoney(range);
  const g2 = range.childNodes.filter((c) => c.nodeType === 1);
  T.ok(g2.length === 1 && g2[0].cls.has('money-glue') && g2[0].childNodes.filter((c) => c.nodeType === 1 && c.cls.has('money')).length === 2, 'two joined amounts share one glue: ' + kids(range));
  // an amount between spaces (only a direction mark touches it): no glue, as before
  const free = el('span', ['בסך ' + amt + ' בחודש']);
  ctx.Dom.markMoney(free);
  T.ok(free.childNodes.filter((c) => c.nodeType === 1).every((c) => c.cls.has('money')), 'an amount between spaces gets only its .money span: ' + kids(free));
  // marked again (a redraw marks the new tree and the watcher marks what is added): nothing changes
  const before = JSON.stringify(kids(cell)) + JSON.stringify(kids(glue));
  ctx.Dom.markMoney(cell);
  T.eq(JSON.stringify(kids(cell)) + JSON.stringify(kids(glue)), before, 'marking twice changes nothing');

  /* The payslip check, 13 Nov 2026: "...; בתלוש" ended one line and "נטו 5,352.91 ₪." began the next. The label that
   * opens a clause and names an amount goes into one inline-block (.money-phrase) with it, so the line breaks before
   * the label. */
  const calc = el('div', [RLM + '5,894.53 ' + RLM + '₪ − ' + RLM + '541.62 ' + RLM + '₪ = ' + amt + '; בתלוש נטו ' + amt + '.']);
  ctx.Dom.markMoney(calc);
  const phrases = calc.childNodes.filter((c) => c.nodeType === 1 && c.cls.has('money-phrase'));
  T.eq(phrases.length, 1, 'one phrase: ' + kids(calc));
  T.ok(phrases[0] && phrases[0].textContent === 'בתלוש נטו ' + amt + '.', 'it holds the label, the amount and the period: ' + (phrases[0] && JSON.stringify(phrases[0].textContent)));
  T.ok(phrases[0] && phrases[0].childNodes.some((c) => c.nodeType === 1 && c.cls.has('money-glue')), 'the amount keeps its glue inside the phrase');
  T.ok(!calc.childNodes.some((c) => c.nodeType === 3 && /נטו/.test(c.nodeValue)), 'no part of the label is left outside');
  const phraseBefore = JSON.stringify(kids(calc));
  ctx.Dom.markMoney(calc);
  T.eq(JSON.stringify(kids(calc)), phraseBefore, 'marking twice changes nothing');
  // not a phrase: a sign before an amount ("= 5 ₪"), more than three words, or words with no clause mark before them
  for (const s of ['סך הכול = ' + amt, 'ומה, אם בכל זאת קיבלת ' + amt, 'קיבלת בסך הכול ' + amt]) {
    const n = el('div', [s]);
    ctx.Dom.markMoney(n);
    T.ok(!n.childNodes.some((c) => c.nodeType === 1 && c.cls.has('money-phrase')), 'no phrase in ' + JSON.stringify(s) + ': ' + kids(n));
  }
});

T.test('the glue span keeps an amount and its brackets on one line', () => {
  const css = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8');
  T.ok(/\.money-glue \{ white-space: nowrap; \}/.test(css), '.money-glue is nowrap');
  // the label + amount phrase is an inline-block that may still wrap inside: nowrap could push it past the edge
  const rule = /\.money-phrase \{([^}]*)\}/.exec(css);
  T.ok(rule && /display: inline-block/.test(rule[1]), '.money-phrase is an inline-block');
  T.ok(rule && !/nowrap/.test(rule[1]), '.money-phrase is not nowrap (a phrase wider than the line wraps, it is never cut)');
});
