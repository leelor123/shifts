/* Runs all tests in Israel time:  node tests/run.js */
process.env.TZ = 'Asia/Jerusalem';
const path = require('path');
const src = path.join(__dirname, '..', 'src', 'core');
for (const f of ['util.js', 'clean.js', 'timesheet.js', 'schedule.js', 'places-data.js', 'places.js', 'hebcal.js', 'defaults.js', 'netlearn.js', 'engine.js', 'planner.js', 'taxrefund.js', 'insights.js', 'payslip.js', 'slipplus.js', 'games.js', 'recap.js', 'analysis.js', 'leaderboard.js', 'friends.js', 'referral.js', 'ledger.js', 'workplace.js', 'moments.js', 'hourscheck.js', 'runnote.js', 'noteplan.js', 'funnel.js', 'nfc.js']) {
  try { require(path.join(src, f)); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
}
const T = require('./t.js');
for (const f of ['cards.test.js', 'taxrefund.test.js', 'undef.test.js', 'icons.test.js', 'redraw.test.js', 'changelog.test.js', 'engine.test.js', 'planner.test.js', 'insights.test.js', 'payslip.test.js', 'links.test.js', 'games.test.js', 'recap.test.js', 'leaderboard.test.js', 'friends.test.js', 'referral.test.js', 'ledger.test.js', 'workplace.test.js', 'places.test.js', 'clean.test.js', 'timesheet.test.js', 'schedule.test.js', 'law.test.js', 'i18n.test.js', 'fonts.test.js', 'webkit.test.js', 'sitecalc.test.js', 'sitesky.test.js', 'moments.test.js', 'hourscheck.test.js', 'netlearn.test.js', 'errors.test.js', 'mascot-voice.test.js', 'runnote.test.js', 'noteplan.test.js', 'account.test.js', 'funnel.test.js', 'nfc.test.js', 'playpay.test.js', 'android-strings.test.js', 'states.test.js', 'memory.test.js', 'security.test.js', 'placeholders.test.js', 'slipfirst.test.js', 'slipplus.test.js']) {
  try { require(path.join(__dirname, f)); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
}
T.section('cloud sync (simulated phones)');
require('./sync.test.js');
T.section('Firestore reads');
require('./reads.test.js');
require('./noop.test.js');
(async () => {
  await T.runAsync();
  console.log(`\n${T.results.pass} passed, ${T.results.fail} failed`);
  if (T.results.fail) { console.log(T.results.failures.join('\n')); process.exit(1); }
  process.exit(0);
})();
