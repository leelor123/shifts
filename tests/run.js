/* Runs all tests in Israel time:  node tests/run.js */
process.env.TZ = 'Asia/Jerusalem';
const path = require('path');
const src = path.join(__dirname, '..', 'src', 'core');
for (const f of ['util.js', 'clean.js', 'timesheet.js', 'schedule.js', 'places-data.js', 'places.js', 'hebcal.js', 'defaults.js', 'engine.js', 'insights.js', 'payslip.js', 'games.js', 'recap.js', 'analysis.js', 'leaderboard.js', 'friends.js']) {
  try { require(path.join(src, f)); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
}
const T = require('./t.js');
for (const f of ['engine.test.js', 'insights.test.js', 'payslip.test.js', 'links.test.js', 'games.test.js', 'recap.test.js', 'leaderboard.test.js', 'friends.test.js', 'places.test.js', 'clean.test.js', 'timesheet.test.js', 'schedule.test.js', 'law.test.js']) {
  try { require(path.join(__dirname, f)); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
}
T.section('cloud sync (simulated phones)');
require('./sync.test.js');
(async () => {
  await T.runAsync();
  console.log(`\n${T.results.pass} passed, ${T.results.fail} failed`);
  if (T.results.fail) { console.log(T.results.failures.join('\n')); process.exit(1); }
  process.exit(0);
})();
