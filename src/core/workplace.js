/* ============================================================
 * workplace.js: "a workplace code": one worker shares the workplace's rules, coworkers apply them (pure, tested).
 *
 * The shared record (wpc/{code} in Firestore, app/workplace.js) holds only the workplace's rules: its name, the pay
 * period and pay day, travel, whether breaks are paid, overtime, Shabbat, night and eve premiums, rounding, the work
 * week, and the role names (with their hourly rates only when the sharer chose to include them). Never a shift, an
 * amount earned, a person's name or the sharer's account: who owns a code is kept apart (wpo/{code}), read only by
 * them. firestore.rules checks the same fields and ranges as FIELDS below (tests/workplace.test.js keeps them equal).
 * ============================================================ */
(function (root) {
  'use strict';
  const ABC = 'abcdefghijkmnpqrstuvwxyz23456789'; // no l, o, 0 or 1: a code is read aloud and typed
  const LEN = 8;
  const CODE_RE = /^[a-km-np-z2-9]{8}$/;
  const MAX_ROLES = 8;
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

  // the employer's fields a code carries: [key, kind, min, max] (kind: int, num, bool, hhmm, or a list of allowed values)
  const FIELDS = [
    ['periodStartDay', 'int', 1, 28],
    ['payDay', 'int', 1, 31],
    ['travelPerDay', 'num', 0, 500],
    ['travelMonthlyCap', 'num', 0, 20000],
    ['defaultBreakPaid', 'bool'],
    ['otLaw', 'bool'],
    ['otThreshold', 'num', 1, 24],
    ['otTier1Hours', 'num', 0, 24],
    ['otTier1Pct', 'num', 100, 400],
    ['otTier2Pct', 'num', 100, 400],
    ['restPct', 'num', 100, 500],
    ['restOt1Pct', 'num', 100, 500],
    ['restOt2Pct', 'num', 100, 500],
    ['nightEnabled', 'bool'],
    ['nightFrom', 'hhmm'],
    ['nightTo', 'hhmm'],
    ['nightType', ['pct', 'fixed']],
    ['nightValue', 'num', 0, 500],
    ['evePct', 'num', 0, 200],
    ['roundingMode', ['none', 'nearest', 'up', 'down']],
    ['roundingUnit', 'int', 1, 60],
  ];
  const KEYS = FIELDS.map((f) => f[0]);

  /** A new code: 8 letters and digits that are easy to read (rand(k) gives k random bytes). */
  function code(rand) {
    const bytes = rand ? rand(LEN) : Array.from({ length: LEN }, () => Math.floor(Math.random() * 256));
    return Array.from(bytes, (b) => ABC[b % ABC.length]).join('');
  }
  /** The code from an address (?wp=CODE), if it is one. */
  function codeFrom(search) {
    const m = /[?&]wp=([A-Za-z0-9]{8})(?:&|$)/.exec(String(search || ''));
    return m && CODE_RE.test(m[1].toLowerCase()) ? m[1].toLowerCase() : null;
  }
  /** What a person typed or pasted (a code with spaces or a dash, in capitals, or the whole link) → the code, or null. */
  function parse(typed) {
    const s = String(typed || '');
    const fromLink = codeFrom(s.includes('?') ? s.slice(s.indexOf('?')) : '');
    if (fromLink) return fromLink;
    const c = s.replace(/[\s\-_.]/g, '').toLowerCase();
    return CODE_RE.test(c) ? c : null;
  }
  /** As shown: ABCD-EFGH. */
  const pretty = (c) => (CODE_RE.test(c || '') ? (c.slice(0, 4) + '-' + c.slice(4)).toUpperCase() : '');

  function fieldOk(f, v) {
    const [, kind, lo, hi] = f;
    if (Array.isArray(kind)) return kind.includes(v);
    if (kind === 'bool') return typeof v === 'boolean';
    if (kind === 'hhmm') return typeof v === 'string' && HHMM.test(v);
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
    if (kind === 'int' && !Number.isInteger(v)) return false;
    return v >= lo && v <= hi;
  }
  const cleanName = (s, max) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const rateOf = (role, today) => {
    const rs = (role.rates || []).filter((r) => r && r.from <= today && +r.rate > 0).sort((a, b) => a.from.localeCompare(b.from));
    return rs.length ? +rs[rs.length - 1].rate : 0;
  };

  /**
   * The record to share, from my workplace: o = { employer, roles (its roles), workWeek, rates (include hourly rates?),
   * today }. A value out of range is left out (the coworker keeps their own).
   */
  function pack(o) {
    const e = o.employer || {};
    const r = { n: cleanName(e.name, 40) || '', ww: +o.workWeek === 6 ? 6 : 5 };
    for (const f of FIELDS) {
      let v = e[f[0]];
      if (f[1] === 'int' || f[1] === 'num') v = v === '' || v == null ? v : +v;
      if (fieldOk(f, v)) r[f[0]] = v;
    }
    const today = o.today || '2100-01-01';
    r.ro = (o.roles || []).filter((x) => x && !x.archived && cleanName(x.name, 40)).slice(0, MAX_ROLES).map((x) => {
      const one = { n: cleanName(x.name, 40) };
      const rate = Math.round(rateOf(x, today) * 100) / 100;
      if (o.rates && rate > 0 && rate < 1000) one.r = rate;
      return one;
    });
    if (!r.n) delete r.n;
    return r;
  }

  /** A record read from the cloud (anyone may have written it): only the known fields, in range, else null. */
  function clean(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    const out = {};
    const n = cleanName(r.n, 40); if (n) out.n = n;
    if (r.ww === 5 || r.ww === 6) out.ww = r.ww;
    for (const f of FIELDS) if (fieldOk(f, r[f[0]])) out[f[0]] = r[f[0]];
    out.ro = (Array.isArray(r.ro) ? r.ro : []).slice(0, MAX_ROLES).map((x) => {
      const nm = x && cleanName(x.n, 40);
      if (!nm) return null;
      const one = { n: nm };
      if (typeof x.r === 'number' && x.r > 0 && x.r < 1000) one.r = Math.round(x.r * 100) / 100;
      return one;
    }).filter(Boolean);
    return Object.keys(out).length > 1 || out.ro.length ? out : null;
  }

  /**
   * The first part of a record that firestore.rules would refuse ('' = none): 'keys', 'n', 'ww', a key of FIELDS,
   * 'ro', 'ro.keys', 'ro.n' or 'ro.r'. pack() never makes one (tests/workplace.test.js checks it at every edge); the
   * app checks before it writes, so a mismatch that comes back says where, not only "permission denied".
   */
  function check(r) {
    const keys = new Set(['n', 'ww', 'ro', ...KEYS]);
    if (!r || typeof r !== 'object' || Array.isArray(r)) return 'keys';
    if (Object.keys(r).some((k) => !keys.has(k))) return 'keys';
    const len = (s) => [...s].length; // the rules count letters, not UTF-16 units
    const name = (s) => typeof s === 'string' && len(s) >= 1 && len(s) <= 40 && !/[\n\r]/.test(s);
    if ('n' in r && !name(r.n)) return 'n';
    if ('ww' in r && r.ww !== 5 && r.ww !== 6) return 'ww';
    for (const f of FIELDS) if (f[0] in r && !fieldOk(f, r[f[0]])) return f[0];
    if (!('ro' in r)) return '';
    if (!Array.isArray(r.ro) || r.ro.length > MAX_ROLES) return 'ro';
    for (const x of r.ro) {
      if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).some((k) => k !== 'n' && k !== 'r')) return 'ro.keys';
      if (!name(x.n)) return 'ro.n';
      if ('r' in x && !(typeof x.r === 'number' && x.r > 0 && x.r < 1000)) return 'ro.r';
    }
    return '';
  }

  /** Does the record carry hourly rates? */
  const hasRates = (r) => !!(r && r.ro && r.ro.some((x) => x.r > 0));

  /** Which of the record's rules differ from this workplace's (keys of FIELDS, 'ww', 'n', 'ro'). */
  function changes(employer, workWeek, r, roles, today) {
    const out = [];
    if (!r) return out;
    if (r.n && r.n !== employer.name) out.push('n');
    if (r.ww && r.ww !== (+workWeek === 6 ? 6 : 5)) out.push('ww');
    for (const k of KEYS) if (k in r && r[k] !== employer[k]) out.push(k);
    const mine = (roles || []).filter((x) => !x.archived && x.employerId === employer.id);
    if ((r.ro || []).some((x) => { const m = mine.find((y) => y.name.trim() === x.n); return !m || (x.r > 0 && rateOf(m, today || '2100-01-01') !== x.r); })) out.push('ro');
    return out;
  }

  /**
   * The record applied to a workplace: o = { employer, roles (all of mine), record, today, fallbackRate (a new role's
   * rate when the record has none: the minimum wage), newId(), colors, keepName (true: the workplace keeps its name) }.
   * → { employer (a new object), roles (role records to save: new ones, and mine that get a new rate from today),
   *     workWeek, added, raised }. Nothing earlier changes: a new rate starts today, past shifts keep theirs.
   */
  function apply(o) {
    const r = o.record || {};
    const today = o.today;
    const emp = Object.assign({}, o.employer);
    for (const k of KEYS) if (k in r) emp[k] = r[k];
    if (r.n && !o.keepName) emp.name = r.n;
    const mine = (o.roles || []).filter((x) => !x.archived && x.employerId === emp.id);
    const used = new Set((o.roles || []).map((x) => x.color));
    const colors = o.colors || ['#888888'];
    const out = [];
    let added = 0, raised = 0;
    for (const x of r.ro || []) {
      const m = mine.find((y) => String(y.name || '').trim() === x.n);
      if (m) {
        if (x.r > 0 && rateOf(m, today) !== x.r) {
          const rates = (m.rates || []).filter((q) => q.from !== today).concat([{ from: today, rate: x.r }]);
          out.push(Object.assign({}, m, { rates }));
          raised++;
        }
        continue;
      }
      const color = colors.find((c) => !used.has(c)) || colors[out.length % colors.length];
      used.add(color);
      out.push({ id: o.newId(), name: x.n, color, employerId: emp.id, rates: [{ from: '2000-01-01', rate: x.r > 0 ? x.r : +o.fallbackRate || 0 }], archived: false });
      added++;
    }
    return { employer: emp, roles: out, workWeek: r.ww || null, added, raised };
  }

  /**
   * apply()'s result as one save step (Store.apply ops): the workplace, its roles, and the work week when it changes
   * (a setting op, so the same undo brings the earlier work week back).
   */
  function ops(out, workWeek) {
    const list = [{ store: 'employers', put: out.employer }, ...out.roles.map((x) => ({ store: 'roles', put: x }))];
    if (out.workWeek && +workWeek !== out.workWeek) list.push({ setting: { path: ['leave', 'workWeek'], value: out.workWeek } });
    return list;
  }

  /** Two records' rules are the same, whatever the order of their keys (the cloud gives a map back in its own order):
   *  an update with the same rules is not a new version. */
  function same(a, b) {
    const k = (x) => (x && typeof x === 'object' ? (Array.isArray(x) ? x.map(k) : Object.keys(x).sort().reduce((o, n) => ((o[n] = k(x[n])), o), {})) : x);
    return JSON.stringify(k(a)) === JSON.stringify(k(b));
  }

  root.Workplace = { same, ABC, LEN, CODE_RE, MAX_ROLES, FIELDS, KEYS, code, codeFrom, parse, pretty, pack, clean, check, hasRates, changes, apply, ops };
  if (typeof module !== 'undefined') module.exports = root.Workplace;
})(typeof window !== 'undefined' ? window : globalThis);
