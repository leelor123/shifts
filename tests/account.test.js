/* Guard for the user's report of 11 Nov 2026: "every so often, when I open the app, it signs me out".
 * Cause: opening the phone's database fails now and then on Android Chrome for a moment; after one failure the app ran
 * from memory, with no data and no account, and showed the sign-in screen or the first questions, although Google still
 * kept the sign-in. Now the database is tried again, the account is also kept outside it (localStorage), and an empty
 * phone that was signed in brings the account back by itself. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

T.section('the account stays signed in when the phone\'s database fails');
T.test('the database is opened again before the app runs from memory; a blocked open waits for the old page', () => {
  const s = read('src/app/store.js');
  T.ok(s.includes('db = await openDbRetry();'), 'load() retries');
  T.ok(/for \(const wait of \[0, \d+, \d+, \d+\]\)/.test(s), 'a few tries with pauses');
  T.ok(!/req\.onblocked = \(\) => reject\(/.test(s), 'blocked does not fail at once');
});
T.test('the account is kept outside the database, and forgotten only when the phone stops being that account\'s', () => {
  const s = read('src/app/store.js');
  T.ok(s.includes("const HINT = 'shaati.account'"));
  T.ok(/function setMeta\(patch\) \{[\s\S]{0,120}'cloudUid' in patch\) keepHint\(\)/.test(s), 'every change of account updates it');
  T.ok(/async function wipe\(\) \{[\s\S]{0,200}localStorage\.removeItem\(HINT\)/.test(s), 'signing out or deleting forgets it');
  T.ok(s.includes('if (S.meta.cloudUid) keepHint();'), 'a phone signed in before gets it at load');
});
T.test('an empty phone that was signed in reconnects by itself: no sign-in screen, no first questions', () => {
  const a = read('src/app/app.js');
  const i = a.indexOf('const hint = Store.accountHint');
  T.ok(i > 0 && i < a.indexOf('if (S.meta.guest && S.settings.onboarded)'), 'checked before the guest and first-visit paths');
  T.ok(/App\.showLogin\('reconnect'\)[\s\S]{0,700}Cloud\.connect\(user\)[\s\S]{0,200}App\.afterLogin\(\)/.test(a), 'shows a calm note and connects');
  T.ok(read('src/app/views-login.js').includes("reconnect: '"), 'the note has words');
});
T.test('the widgets channel waits for the data (Sentry SHAATI-4: settings null)', () => {
  const w = read('src/app/widgets.js');
  T.ok(w.includes('if (S.settings) take(p); else whenReady(() => take(p));'));
  T.ok(w.includes('const noData = () => !!S.settings && !S.settings.onboarded;'));
});

T.section('a new shift starts with the times it most likely had');
T.test('the end is the minute the editor opened, the start seven hours before on a whole or half hour', () => {
  const src = read('src/app/views-shift.js');
  const body = src.slice(src.indexOf('App.shiftGuess = function (now) {'), src.indexOf('  function draftFrom(sh, opts) {'));
  const App = {};
  new Function('App', 'U', body)(App, globalThis.U);
  const U = globalThis.U;
  const g = App.shiftGuess(U.toEpoch('2026-11-11', '17:43'));
  T.eq(g.endT, '17:43'); T.eq(g.startT, '10:30'); T.eq(g.date, '2026-11-11');
  T.eq(App.shiftGuess(U.toEpoch('2026-11-11', '17:14')).startT, '10:00');
  const night = App.shiftGuess(U.toEpoch('2026-11-11', '03:05'));
  T.eq(night.startT, '20:00'); T.eq(night.date, '2026-11-10', 'a night shift belongs to the day it began');
  T.ok(!src.includes(": '08:00', endT:"), 'no fixed 08:00-16:00 any more');
});
