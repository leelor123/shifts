/* Tiny test harness (no dependencies). */
const results = { pass: 0, fail: 0, failures: [] };
let current = '';
function section(name) { current = name; console.log('\n▸ ' + name); }
function test(name, fn) {
  try { fn(); results.pass++; console.log('  ✓ ' + name); }
  catch (e) { results.fail++; results.failures.push(current + ' / ' + name + ': ' + e.message); console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || 'expected truthy'); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg ? msg + ': ' : '') + 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function near(a, b, tol, msg) {
  const t = tol == null ? 0.005 : tol;
  if (!(Math.abs(a - b) <= t)) throw new Error((msg ? msg + ': ' : '') + 'expected ≈' + b + ', got ' + a);
}
module.exports = { section, test, ok, eq, near, results };
