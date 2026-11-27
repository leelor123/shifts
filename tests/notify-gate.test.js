/* Inside the Android app no notification goes through Chrome (the user, 27 Nov 2026: one came with
 * "leelor123.github.io" and the site's icon on it). Every web notification goes through App.webNote, which refuses
 * inside the Android app; the offline worker shows none for it; the running shift is the phone's own (RunningNote). */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
// code without its comments (a comment may name what it guards against)
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
function files(dir) {
  const out = [];
  for (const f of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = dir + '/' + f.name;
    if (f.isDirectory()) out.push(...files(p));
    else if (f.name.endsWith('.js')) out.push(p);
  }
  return out;
}

T.section('notifications: never through Chrome inside the Android app');
T.test('every showNotification and new Notification is in App.webNote (or the offline worker)', () => {
  const bad = [];
  for (const f of files('src')) {
    if (f === 'src/sw.js') continue;
    let c = code(read(f));
    if (f === 'src/app/app.js') {
      const i = c.indexOf('App.webNote = async function');
      const j = c.indexOf('async function push(n)', i);
      T.ok(i > 0 && j > i, 'App.webNote is in app.js');
      c = c.slice(0, i) + c.slice(j);
    }
    if (/\.showNotification\s*\(|new\s+Notification\s*\(/.test(c)) bad.push(f);
  }
  T.eq(bad.join(' '), '', 'a notification shown around the gate');
});
T.test('App.webNote refuses inside the Android app, first thing', () => {
  const c = code(read('src/app/app.js'));
  const body = c.slice(c.indexOf('App.webNote = async function'), c.indexOf('async function push(n)'));
  T.ok(/^App\.webNote = async function \(title, opt\) \{\s*if \(App\.androidApp && !\(opt && opt\.oldApp && !App\.nativeRun\)\) return false;/.test(body), body.slice(0, 160));
  // the one let through: the running shift of an Android app before 1.46 (it has no RunningNote), only from run-note.js
  const users = files('src').filter((f) => /oldApp: true/.test(code(read(f))));
  T.eq(users.join(' '), 'src/app/run-note.js');
  T.ok(code(read('src/app/widgets.js')).includes("if (data === 'shaati:run') { App.nativeRun = true;") && read('tools/android.js').includes('s.postMessage("shaati:run", null);'), 'the phone says it can');
});
T.test('push(): inside the Android app before its channel is up, the notification waits for it', () => {
  const c = code(read('src/app/app.js'));
  T.ok(c.includes('if (App.androidApp) { if (App.phoneNotes) App.phoneNotes.later(n, look); return; }'), 'waits');
  const p = code(read('src/app/phone-notes.js'));
  T.ok(/hello\(\) \{[\s\S]*for \(const \[a, n\] of queued\.splice\(0\)\)/.test(p), 'shown at the hello');
});
T.test('the offline worker shows none of the Android app\'s (it shows them itself)', () => {
  const sw = code(read('src/sw.js'));
  const i = sw.indexOf('if (plan.native) return;'), j = sw.indexOf('self.registration.showNotification');
  T.ok(i > 0 && j > i, 'the worker checks before it shows');
  T.ok(code(read('src/app/phone-notes.js')).includes('notes: plan, native: native || !!App.androidApp'), 'the app marks the list');
});
T.test('the running shift inside the Android app is the phone\'s own live notification', () => {
  const rn = code(read('src/app/run-note.js'));
  T.ok(/if \(App\.nativeRun\) \{[\s\S]{0,1200}?nativeRun = \{[\s\S]{0,400}?total:/.test(rn), 'the words go to the phone, with the bar\'s length');
  T.ok(code(read('src/app/widgets.js')).includes('run: active && App.runNote && App.runNote.native ? App.runNote.native() : null'), 'with the snapshot');
  const j = read('android/widgets/java/RunningNote.java');
  for (const s of ['n.extras.putBoolean(PROMOTED, true);', '"android.requestPromotedOngoing"', '.setOngoing(true)', '.setUsesChronometer(!onBreak)', '.setWhen(start)', 'ShaatiWidget.tap(c, "stop", 7401)', 'new Notification.ProgressStyle()', 'setProgressTrackerIcon', 'nm.cancel(TAG, 1);']) T.ok(j.includes(s), s);
  T.ok(read('android/widgets/java/WidgetData.java').includes('RunningNote.sync(c);'), 'follows every snapshot and tap');
  T.ok(read('android/widgets/java/NoteWake.java').includes('if (RunningNote.TICK.equals(a)) { RunningNote.sync(app); return; }'), 'the bar moves on with the app closed (its own alarm, NoteWake)');
  T.ok(j.includes('tick(c, Build.VERSION.SDK_INT >= 36);'), 'the 5-minute alarm only on Android 16+, where the bar needs it (the chronometer counts below)');
  T.ok(read('tools/android.js').includes('android.permission.POST_PROMOTED_NOTIFICATIONS'), 'the permission for a Live Update');
  for (const l of ['', '-en', '-ru', '-ar', '-fr', '-es', '-am']) {
    const x = read('android/widgets/res/values' + l + '/w_strings.xml');
    T.ok(/<string name="w_ch_run">[^<]+<\/string>/.test(x) && /<string name="w_ch_run_d">[^<]+<\/string>/.test(x), 'channel words ' + (l || 'he'));
  }
});
