/* "A workplace code": the shared record's shape (the same as firestore.rules), reading it back, applying it to a workplace. */
const fs = require('fs');
const path = require('path');
const { Workplace: W, Defaults } = globalThis;
const T = require('./t.js');
const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
const block = (name) => { const i = rules.indexOf('match /' + name + '/{code}'); return rules.slice(i, rules.indexOf('\n    }', i)); };

const today = '2026-11-06';
const emp = Object.assign(Defaults.defaultEmployer('emp1'), { name: 'קפה גרג רמת אביב', periodStartDay: 21, payDay: 10, travelPerDay: 22.6, travelMonthlyCap: 300, otLaw: true, restPct: 175, nightEnabled: true, nightValue: 25, evePct: 10, roundingMode: 'nearest', roundingUnit: 15, defaultBreakPaid: false });
const roles = [
  { id: 'r1', name: 'בריסטה', color: '#2a78d6', employerId: 'emp1', rates: [{ from: '2000-01-01', rate: 34 }, { from: '2026-04-01', rate: 36.5 }], archived: false },
  { id: 'r2', name: 'אחמ״ש', color: '#eb6834', employerId: 'emp1', rates: [{ from: '2000-01-01', rate: 45 }], archived: false },
  { id: 'r3', name: 'ישן', color: '#1baf7a', employerId: 'emp1', rates: [{ from: '2000-01-01', rate: 30 }], archived: true },
];

T.section('workplace code');
T.test('a code: 8 letters and digits that read clearly, typed any way, or pasted as the link', () => {
  const c = W.code();
  T.ok(W.CODE_RE.test(c), c);
  T.ok(!/[lo01]/.test(W.ABC), 'no look-alike letters');
  T.eq(W.parse(W.pretty(c)), c, 'as shown: ABCD-EFGH');
  T.eq(W.parse(' ' + c.toUpperCase().slice(0, 4) + ' ' + c.slice(4) + ' '), c);
  T.eq(W.parse('https://leelor123.github.io/shifts/?wp=' + c), c);
  T.eq(W.codeFrom('?source=twa&wp=' + c + '&x=1'), c);
  T.eq(W.parse('abc'), null);
  T.eq(W.parse('abcdefgl'), null, 'l is not in a code');
  T.eq(W.codeFrom('?wp=short'), null);
  T.eq(W.pretty('bad'), '');
});

T.test('the record holds only workplace rules: no shift, amount, person or account, rates off by default', () => {
  const r = W.pack({ employer: emp, roles: roles.filter((x) => x.employerId === 'emp1'), workWeek: 6, today });
  const allowed = new Set(['n', 'ww', 'ro', ...W.KEYS]);
  for (const k of Object.keys(r)) T.ok(allowed.has(k), 'unexpected key ' + k);
  T.eq(r.n, 'קפה גרג רמת אביב'); T.eq(r.ww, 6); T.eq(r.periodStartDay, 21); T.eq(r.travelPerDay, 22.6); T.eq(r.defaultBreakPaid, false);
  T.eq(r.ro.length, 2, 'archived roles stay home');
  T.ok(r.ro.every((x) => Object.keys(x).join() === 'n'), 'names only');
  T.ok(!('id' in r) && !JSON.stringify(r).includes('"emp1"') && !JSON.stringify(r).includes('"r1"'), 'no ids');
  const withRates = W.pack({ employer: emp, roles, workWeek: 5, rates: true, today });
  T.eq(withRates.ro[0].r, 36.5, "today's rate"); T.eq(withRates.ro[1].r, 45);
  T.ok(W.hasRates(withRates) && !W.hasRates(r));
});

T.test('a value out of range is left out of the record, and of what is read back', () => {
  const r = W.pack({ employer: Object.assign({}, emp, { payDay: 40, nightFrom: '25:00', roundingMode: 'x', travelPerDay: '' }), roles: [], today });
  T.ok(!('payDay' in r) && !('nightFrom' in r) && !('roundingMode' in r) && !('travelPerDay' in r));
  T.eq(W.clean({ payDay: 9, x: '<img>', ro: [{ n: '<b>מלצר</b>', r: -3 }, { n: '' }, 5], restPct: 9999 }).ro[0].n, 'bמלצר/b', 'markup is not kept');
  const c = W.clean({ payDay: 9, x: 1, restPct: 9999, ro: [{ n: 'מלצר', r: 2000 }] });
  T.ok(!('x' in c) && !('restPct' in c) && !('r' in c.ro[0]));
  T.eq(W.clean(null), null); T.eq(W.clean([]), null); T.eq(W.clean({ zz: 1 }), null);
  T.eq(W.clean({ ro: Array.from({ length: 20 }, (_, i) => ({ n: 'תפקיד ' + i })) }).ro.length, W.MAX_ROLES);
});

T.test('firestore.rules: the same fields and ranges as the app (core FIELDS)', () => {
  const only = /validWpRules\(r\) \{\s*return r is map && r\.keys\(\)\.hasOnly\(\[([^\]]+)\]\)/.exec(rules);
  T.ok(only, 'validWpRules lists its keys');
  const keys = only[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  T.eq(keys.slice().sort().join(), ['n', 'ww', 'ro', ...W.KEYS].sort().join());
  // each value read once, with a default that passes (see the rules: 1000 expressions at most)
  for (const [k, kind, lo, hi] of W.FIELDS) {
    if (kind === 'int') T.ok(rules.includes(`wpI(r.get('${k}', ${lo}), ${lo}, ${hi})`), k);
    else if (kind === 'num') T.ok(rules.includes(`wpN(r.get('${k}', ${lo}), ${lo}, ${hi})`), k);
    else if (kind === 'bool') T.ok(rules.includes(`r.get('${k}', true) is bool`), k);
    else if (kind === 'hhmm') T.ok(rules.includes(`wpHm(r.get('${k}', '00:00'))`), k);
    else T.ok(rules.includes(`r.get('${k}', '${kind[0]}') in [${kind.map((x) => `'${x}'`).join(', ')}]`), k);
  }
  T.ok(rules.includes("wpS(r.get('n', 'x'), 40) && r.get('ww', 5) in [5, 6]"), 'the name and the work week');
  T.ok(rules.includes('l is list && l.size() <= ' + W.MAX_ROLES), 'at most 8 roles');
  for (let i = 0; i < W.MAX_ROLES; i++) T.ok(rules.includes(`(l.size() < ${i + 1} || wpRole(l[${i}]))`), 'role ' + i + ' checked');
  T.ok(rules.includes("x.keys().hasOnly(['n', 'r']) && x.get('n', '').matches('^.{1,40}$') && wpRate(x.get('r', 1))"), 'a role: a short name, a rate');
  for (const b of ['allow create', 'allow update']) T.ok(new RegExp(b + ":[^;]*validWp\\(request\\.resource\\.data\\) && wpRoles\\(request\\.resource\\.data\\.r\\.get\\('ro', \\[\\]\\)\\)").test(block('wpc')), b + ' checks the roles');
  T.ok(/validWp\(d\)[\s\S]*?hasOnly\(\['v', 't', 'r'\]\)/.test(rules), 'the document: a version, a time, the rules');
  // the way that went over the limit (a helper given the map and a key, reading it again and again) stays out
  const wpFns = rules.slice(rules.indexOf('function validWp('), rules.indexOf('function wpRate('));
  T.ok(!/wp\w*\(r, '/.test(wpFns) && !/wpRole\(l, i\)/.test(wpFns), 'no helper reads r[k] or l[i] itself');
  T.ok(!/match \/wpc[\s\S]*?keys\(\)\.hasOnly\(\[[^\]]*'o'/.test(block('wpc')), 'the readable record has no owner');
});

// validWpRules and wpRoles as the rules read them (types as Firestore stores them: a whole JS number is an int)
const ruleOk = (r) => {
  const keys = new Set(['n', 'ww', 'ro', ...W.KEYS]);
  if (!r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).some((k) => !keys.has(k))) return 'keys';
  const g = (k, d) => (k in r ? r[k] : d);
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const str = (v, max) => typeof v === 'string' && [...v].length >= 1 && [...v].length <= max;
  if (!str(g('n', 'x'), 40)) return 'n';
  if (![5, 6].includes(g('ww', 5))) return 'ww';
  for (const [k, kind, lo, hi] of W.FIELDS) {
    const v = g(k, Array.isArray(kind) ? kind[0] : kind === 'bool' ? true : kind === 'hhmm' ? '00:00' : lo);
    const ok = Array.isArray(kind) ? kind.includes(v) : kind === 'bool' ? typeof v === 'boolean'
      : kind === 'hhmm' ? typeof v === 'string' && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v)
        : num(v) && (kind !== 'int' || Number.isInteger(v)) && v >= lo && v <= hi;
    if (!ok) return k;
  }
  const l = g('ro', []);
  if (!Array.isArray(l) || l.length > 8) return 'ro';
  for (const x of l) {
    if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).some((k) => k !== 'n' && k !== 'r')) return 'ro.keys';
    if (!str(x.n === undefined ? '' : x.n, 40) || /\n/.test(x.n)) return 'ro.n';
    const v = 'r' in x ? x.r : 1;
    if (!num(v) || !(v > 0 && v < 1000)) return 'ro.r';
  }
  return '';
};

T.test('pack() makes only records the rules take: every field at, inside and past its edges, any type', () => {
  const odd = [null, undefined, '', 'x', '15', '9.5', NaN, Infinity, -1, 0, 0.5, 1e9, true, false, {}, [], '25:00', '7:00', '22:00'];
  const tries = [];
  for (const [k, kind, lo, hi] of W.FIELDS) {
    const vals = Array.isArray(kind) ? kind.concat(['other', 1])
      : kind === 'bool' ? [true, false, 'true', 1]
        : kind === 'hhmm' ? ['00:00', '23:59', '24:00', '9:30', 2200]
          : [lo, hi, lo - 1, hi + 1, lo + 0.5, hi - 0.25, hi + 0.5, String(lo), String(hi), (lo + hi) / 3];
    for (const v of vals.concat(odd)) tries.push({ [k]: v });
  }
  // the real workplaces: the default one, the user's phone (6 Nov 2026), a cafe, and every field at once at its highest
  tries.push({}, { name: 'עבודה', payDay: 9, travelPerDay: 16, roundingUnit: 15 });
  tries.push(Object.assign({}, emp));
  tries.push(W.FIELDS.reduce((o, [k, kind, lo, hi]) => Object.assign(o, { [k]: Array.isArray(kind) ? kind[kind.length - 1] : kind === 'bool' ? true : kind === 'hhmm' ? '23:59' : hi }), { name: 'א'.repeat(60) }));
  const names = ['', ' ', '<>', 'x', 'א'.repeat(40), 'א'.repeat(41), '🦊'.repeat(30), 'a\nb', 'שם\u0000עם\u001fתווים', '  רווחים   כפולים  '];
  const rates = [0, -5, null, '40', 'x', 0.001, 0.004, 0.005, 32.3, 44.22, 999.99, 999.995, 1000, 5000, NaN];
  const roleSets = [[], roles,
    names.map((n, i) => ({ id: 'n' + i, name: n, employerId: 'emp1', rates: [{ from: '2000-01-01', rate: rates[i % rates.length] }], archived: false })),
    rates.map((r, i) => ({ id: 'q' + i, name: 'תפקיד ' + i, employerId: 'emp1', rates: [{ from: '2000-01-01', rate: r }], archived: false })),
    [{ id: 'z', name: 'בלי שכר', employerId: 'emp1' }, { id: 'y', name: 'עתידי', employerId: 'emp1', rates: [{ from: '2099-01-01', rate: 50 }] }, null]];
  let n = 0;
  for (const e of tries) for (const ro of roleSets) for (const ww of [5, 6, '6', 7, null]) for (const withRates of [false, true]) {
    for (const name of [undefined, ...names]) {
      const employer = Object.assign(Defaults.defaultEmployer('emp1'), name === undefined ? {} : { name }, e);
      const r = W.pack({ employer, roles: ro, workWeek: ww, rates: withRates, today });
      const bad = ruleOk(r);
      if (bad) T.ok(false, `refused at ${bad}: ${JSON.stringify(e)} roles ${ro.length} → ${JSON.stringify(r).slice(0, 300)}`);
      if (W.check(r)) T.ok(false, 'the app check refuses what the rules take: ' + W.check(r));
      n++;
    }
  }
  T.ok(n > 10000, n + ' records checked');
  // what clean() keeps from anything read back is also a record the rules take (an update writes it back)
  for (const e of tries) { const c = W.clean(Object.assign({ ro: [{ n: 'x', r: 1e9 }, { n: 'y', r: '5' }] }, e)); if (c) T.eq(ruleOk(c), '', JSON.stringify(e)); }
  // and the port refuses what the rules refuse
  T.eq(ruleOk({ payDay: 9.5 }), 'payDay'); T.eq(ruleOk({ restPct: '150' }), 'restPct'); T.eq(ruleOk({ n: '' }), 'n');
  T.eq(ruleOk({ ro: Array.from({ length: 9 }, () => ({ n: 'x' })) }), 'ro'); T.eq(ruleOk({ ro: [{ n: 'x', r: 0 }] }), 'ro.r'); T.eq(ruleOk({ x: 1 }), 'keys');
  // W.check (what the app checks before it writes) says the same as the rules, on what they refuse too
  const refused = [{ payDay: 9.5 }, { restPct: '150' }, { n: '' }, { n: 'א'.repeat(41) }, { ww: 7 }, { nightFrom: '24:00' }, { nightType: 'x' }, { x: 1 },
    { ro: Array.from({ length: 9 }, () => ({ n: 'x' })) }, { ro: [{ n: 'x', r: 0 }] }, { ro: [{ n: 'x', r: '5' }] }, { ro: [{ r: 5 }] }, { ro: ['x'] }, { ro: 'x' }, { ro: [{ n: 'x', who: 'y' }] }];
  for (const r of refused) T.eq(W.check(r), ruleOk(r), JSON.stringify(r));
  T.eq(W.check({ n: '🦊'.repeat(40) }), '', 'the rules count letters: 40 foxes are a name of 40');
});

T.test('firestore.rules: owner only for create, update and delete; get by any signed-in user; list never', () => {
  const wpc = block('wpc'), wpo = block('wpo');
  T.ok(/allow get: if request\.auth != null;/.test(wpc), 'get: signed in');
  T.ok(/allow list: if false;/.test(wpc), 'no list');
  T.ok(/allow create:[\s\S]*?getAfter\([^;]*?wpo\/\$\(code\)\)\.data\.o == request\.auth\.uid/.test(wpc), 'create: with my owner record');
  T.ok(/allow create:[\s\S]*?request\.resource\.data\.v == 1/.test(wpc), 'starts at version 1');
  T.ok(/allow update:[^;]*wpOwner\(code\) == request\.auth\.uid[^;]*v == resource\.data\.v \+ 1/.test(wpc), 'update: owner, one version up');
  T.ok(/allow delete: if request\.auth != null && wpOwner\(code\) == request\.auth\.uid;/.test(wpc), 'delete: owner');
  T.ok(/allow get: if request\.auth != null && resource\.data\.o == request\.auth\.uid;/.test(wpo), 'the owner record: read by its owner only');
  T.ok(/allow list, update: if false;/.test(wpo));
  T.ok(/allow create:[\s\S]*?hasOnly\(\['o'\]\)[\s\S]*?\.o == request\.auth\.uid/.test(wpo));
  T.ok(/allow delete:[\s\S]*?!existsAfter/.test(wpo), 'the owner record goes with the code');
  for (const b of [wpc, wpo]) T.ok(b.includes("code.matches('^[a-km-np-z2-9]{8}$')"), 'the code shape');
  T.eq(String(W.CODE_RE), '/^[a-km-np-z2-9]{8}$/', 'the same in the app');
});

T.test('applying a code to my workplace: its rules, its new roles, new rates from today only', () => {
  const rec = W.clean(W.pack({ employer: emp, roles, workWeek: 6, rates: true, today }));
  const mine = Object.assign(Defaults.defaultEmployer('e9'), { name: 'העבודה' });
  const myRoles = [{ id: 'm1', name: 'בריסטה', color: '#2a78d6', employerId: 'e9', rates: [{ from: '2000-01-01', rate: 32 }], archived: false }];
  T.ok(W.changes(mine, 5, rec, myRoles, today).includes('payDay'));
  let n = 0;
  const out = W.apply({ employer: mine, roles: myRoles, record: rec, today, fallbackRate: 32.3, newId: () => 'new' + (++n), colors: Defaults.ROLE_COLORS });
  T.eq(out.employer.id, 'e9', 'the same workplace'); T.eq(out.employer.name, 'קפה גרג רמת אביב');
  T.eq(out.employer.payDay, 10); T.eq(out.employer.otLaw, true); T.eq(out.employer.defaultBreakPaid, false); T.eq(out.employer.roundingUnit, 15);
  T.eq(mine.payDay, 9, 'the original is not changed');
  T.eq(out.workWeek, 6);
  T.eq(out.added, 1); T.eq(out.raised, 1);
  const raised = out.roles.find((x) => x.id === 'm1');
  T.eq(raised.rates.length, 2); T.eq(raised.rates[0].rate, 32, 'the old rate stays for past shifts'); T.eq(raised.rates[1].from, today); T.eq(raised.rates[1].rate, 36.5);
  const fresh = out.roles.find((x) => x.id === 'new1');
  T.eq(fresh.name, 'אחמ״ש'); T.eq(fresh.employerId, 'e9'); T.eq(fresh.rates[0].rate, 45); T.ok(fresh.color !== '#2a78d6', 'a free colour');
  T.eq(W.changes(out.employer, 6, rec, [raised, fresh], today).length, 0, 'applied: nothing left to change');
});

T.test('a code without rates: new roles get the fallback rate, my rates stay, keepName keeps my name', () => {
  const rec = W.clean(W.pack({ employer: emp, roles, workWeek: 5, today }));
  const mine = Object.assign(Defaults.defaultEmployer('e9'), { name: 'שלי' });
  const myRoles = [{ id: 'm1', name: 'בריסטה', color: '#2a78d6', employerId: 'e9', rates: [{ from: '2000-01-01', rate: 32 }], archived: false }];
  const out = W.apply({ employer: mine, roles: myRoles, record: rec, today, fallbackRate: 32.3, newId: () => 'x', colors: Defaults.ROLE_COLORS, keepName: true });
  T.eq(out.employer.name, 'שלי');
  T.eq(out.raised, 0); T.eq(out.added, 1);
  T.eq(out.roles[0].rates[0].rate, 32.3);
});

T.test('the save step: the work week rides along only when it changes', () => {
  const out = { employer: { id: 'e1' }, roles: [{ id: 'r9' }], workWeek: 6 };
  T.eq(W.ops(out, 5).length, 3);
  T.eq(JSON.stringify(W.ops(out, 5)[2]), JSON.stringify({ setting: { path: ['leave', 'workWeek'], value: 6 } }));
  T.eq(W.ops(out, 6).length, 2, 'the same week: no setting');
  T.eq(W.ops(Object.assign({}, out, { workWeek: null }), 5).length, 2, 'a code without a week');
});

// one undo after applying a code brings back the workplace, its roles and the earlier work week (a phone's Store)
T.atest('undo after applying a code: the earlier work week comes back with the workplace', async () => {
  const vm = require('vm');
  const { fakeIndexedDB } = require('./fakes.js');
  const ctx = { console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, indexedDB: fakeIndexedDB(), navigator: { onLine: true } };
  ctx.window = ctx; ctx.addEventListener = () => {};
  ctx.UI = { toast() {} };
  vm.createContext(ctx);
  for (const f of ['core/util.js', 'core/hebcal.js', 'core/defaults.js', 'core/engine.js', 'core/workplace.js', 'app/store.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
  const { Store, Workplace: WP } = ctx;
  await Store.load();
  const S = Store.S;
  T.eq(+S.settings.leave.workWeek, 5);
  const before = JSON.stringify(S.employers[0]);
  const rec = WP.clean({ payDay: 10, ww: 6, ro: [{ n: 'בריסטה', r: 40 }] });
  const out = WP.apply({ employer: S.employers[0], roles: S.roles, record: rec, today, fallbackRate: 30, newId: () => 'rnew', colors: ['#111111'] });
  await Store.apply(WP.ops(out, S.settings.leave.workWeek), 'code');
  T.eq(S.settings.leave.workWeek, 6); T.eq(S.employers[0].payDay, 10); T.ok(S.roles.some((r) => r.id === 'rnew'));
  T.ok(S.meta.settingsDirty, 'the setting goes up to the account');
  await Store.undo();
  T.eq(+S.settings.leave.workWeek, 5, 'the work week is back');
  T.eq(S.employers[0].payDay, 9); T.ok(!S.roles.some((r) => r.id === 'rnew'), 'the new role is gone');
  const same = (x) => JSON.stringify(Object.assign({}, x, { updatedAt: 0, createdAt: 0 }));
  T.eq(same(S.employers[0]), same(JSON.parse(before)), 'the workplace as it was');
});
