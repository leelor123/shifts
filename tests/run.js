/* Runs all tests in Israel time:  node tests/run.js */
process.env.TZ = 'Asia/Jerusalem';
const path = require('path');
const src = path.join(__dirname, '..', 'src', 'core');
for (const f of ['util.js', 'hebcal.js', 'defaults.js', 'engine.js', 'insights.js', 'payslip.js']) {
  try { require(path.join(src, f)); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
}
const T = require('./t.js');
for (const f of ['engine.test.js', 'insights.test.js', 'payslip.test.js']) {
  try { require(path.join(__dirname, f)); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
}
console.log(`\n${T.results.pass} passed, ${T.results.fail} failed`);
if (T.results.fail) { console.log(T.results.failures.join('\n')); process.exit(1); }
