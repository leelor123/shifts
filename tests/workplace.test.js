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
  const only = /validWpRules\(r\) \{\s*return r\.keys\(\)\.hasOnly\(\[([^\]]+)\]\)/.exec(rules);
  T.ok(only, 'validWpRules lists its keys');
  const keys = only[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  T.eq(keys.slice().sort().join(), ['n', 'ww', 'ro', ...W.KEYS].sort().join());
  for (const [k, kind, lo, hi] of W.FIELDS) {
    if (kind === 'int') T.ok(rules.includes(`wpInt(r, '${k}', ${lo}, ${hi})`), k);
    else if (kind === 'num') T.ok(rules.includes(`wpNum(r, '${k}', ${lo}, ${hi})`), k);
    else if (kind === 'bool') T.ok(rules.includes(`wpBool(r, '${k}')`), k);
    else if (kind === 'hhmm') T.ok(rules.includes(`wpHm(r, '${k}')`), k);
    else T.ok(rules.includes(`r.${k} in [${kind.map((x) => `'${x}'`).join(', ')}]`), k);
  }
  T.ok(rules.includes('r.ro.size() <= ' + W.MAX_ROLES), 'at most 8 roles');
  for (let i = 0; i < W.MAX_ROLES; i++) T.ok(rules.includes(`wpRole(r.ro, ${i})`), 'role ' + i + ' checked');
  T.ok(/wpRole\(l, i\)[\s\S]*?l\[i\]\.n\.size\(\) <= 40/.test(rules), 'a role name is short');
  T.ok(/validWp\(d\)[\s\S]*?hasOnly\(\['v', 't', 'r'\]\)/.test(rules), 'the document: a version, a time, the rules');
  T.ok(!/match \/wpc[\s\S]*?keys\(\)\.hasOnly\(\[[^\]]*'o'/.test(block('wpc')), 'the readable record has no owner');
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
