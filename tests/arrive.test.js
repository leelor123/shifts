/* A suggestion at work (src/core/arrive.js, src/app/arrive.js, android/widgets/java/WorkGeo*.java): when the suggestion
 * comes, that it only suggests (never starts or ends a shift itself), that the spot never leaves the phone, that the
 * disclosure comes before Android's permission windows, and that the web rules and the phone's rules stay the same. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const A = globalThis.Arrive;
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const MIN = 60000;
const now = 1_800_000_000_000;

T.section('a suggestion at work');
T.test('arriving with no shift running suggests a start; with one running, nothing', () => {
  T.eq(A.decide({ kind: 'in', active: false, now }), 'start');
  T.eq(A.decide({ kind: 'in', active: true, now }), null);
});
T.test('the same arrival is suggested once: Android sending the stay again, or out and back within 30 minutes', () => {
  // suggested at now - 10 min and never left since
  T.eq(A.decide({ kind: 'in', active: false, now, lastInNote: now - 10 * MIN, lastExit: now - 60 * MIN }), null);
  // left 5 minutes after the suggestion and came back 10 minutes later: the same stay
  T.eq(A.decide({ kind: 'in', active: false, now, lastInNote: now - 15 * MIN, lastExit: now - 10 * MIN }), null);
  // away 40 minutes since the last suggestion: a new arrival
  T.eq(A.decide({ kind: 'in', active: false, now, lastInNote: now - 5 * 60 * MIN, lastExit: now - 40 * MIN }), 'start');
});
T.test('leaving suggests an end only while a shift runs, and once per hour at most', () => {
  T.eq(A.decide({ kind: 'out', active: false, now }), null);
  T.eq(A.decide({ kind: 'out', active: true, now }), 'stop');
  T.eq(A.decide({ kind: 'out', active: true, now, lastOutNote: now - 20 * MIN }), null);
  T.eq(A.decide({ kind: 'out', active: true, now, lastOutNote: now - 61 * MIN }), 'stop');
  T.eq(A.decide({ kind: 'sideways', active: true, now }), null);
});
T.test('the radius is one of the offered ones; anything else is the default', () => {
  T.eq(A.radius(150), 150);
  T.eq(A.radius('500'), 500);
  T.eq(A.radius(5), A.DEFAULT_R);
  T.eq(A.radius('x'), A.DEFAULT_R);
  T.ok(A.RADII.includes(A.DEFAULT_R));
  T.ok(Math.min(...A.RADII) >= 100, 'Android geofences below ~100 m miss often');
});
T.test('the setup link opens the Android app screen with the radius only', () => {
  const u = A.setupUrl(150);
  T.eq(u, 'intent://save?r=150#Intent;scheme=shaati-geo;package=io.github.leelor123.shifts;end');
  T.eq(A.setupUrl('9999'), 'intent://save?r=300#Intent;scheme=shaati-geo;package=io.github.leelor123.shifts;end');
});
T.test('the status message from the phone keeps on, radius and permissions; a spot in it is dropped', () => {
  const s = A.readStatus({ geo: 1, on: true, r: 150, bg: true, fg: true, lat: 32.1, lng: 34.8 });
  T.eq(JSON.stringify(s), JSON.stringify({ on: true, r: 150, bg: true, fg: true }));
  T.eq(A.readStatus({ notes: 1 }), null);
  T.eq(A.readStatus(null), null);
  T.eq(A.readStatus({ geo: 1, on: 'yes' }).on, false);
});

T.section('a suggestion at work: the phone and the page stay in step');
const java = read('android/widgets/java/WorkGeo.java');
const act = read('android/widgets/java/WorkGeoActivity.java');
const recv = read('android/widgets/java/WorkGeoReceiver.java');
const all = java + act + recv;
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
T.test('the same numbers on the phone as in core/arrive.js', () => {
  T.ok(java.includes(`RADII = { ${A.RADII.join(', ')} }`), 'radii');
  T.ok(java.includes(`DEFAULT_R = ${A.DEFAULT_R};`), 'default radius');
  T.ok(java.includes(`AWAY_MS = ${A.AWAY_MS / MIN} * MIN;`), 'away');
  T.ok(java.includes(`LEAVE_GAP_MS = ${A.LEAVE_GAP_MS / MIN} * MIN;`), 'leave gap');
  T.ok(java.includes(`DWELL_MS = ${A.DWELL_MS / MIN} * 60000;`), 'dwell');
  T.ok(/if \(active\) return null;\s*if \(lastInNote > 0 && \(lastExit < lastInNote \|\| now - lastExit < AWAY_MS\)\) return null;\s*return "start";/.test(java), 'arrival rule');
  T.ok(/if \(!active\) return null;\s*if \(lastOutNote > 0 && now - lastOutNote < LEAVE_GAP_MS\) return null;\s*return "stop";/.test(java), 'leaving rule');
});
T.test('quiet hours: the phone uses the app\'s one night rule (Moments.quietHour), and comes silent then', () => {
  const m = read('src/core/moments.js');
  T.ok(/const quietHour = \(ms\) => \{ const h = new Date\(ms\)\.getHours\(\); return h >= 23 \|\| h < 6; \};/.test(m), 'moments.js rule as known');
  T.ok(java.includes('return h >= 23 || h < 6;'), 'WorkGeo.quietHour is the same');
  T.ok(/\.setSilent\(quiet\)/.test(java), 'silent at night, not dropped (a night shift starts then)');
});
T.test('it never starts or ends a shift itself: the buttons open ?action=start / ?action=stop, which ask first', () => {
  T.ok(!/WidgetData\.tap\s*\(|"taps"|startShift|stopShift/.test(code(all)), 'no widget tap and no shift change in WorkGeo*');
  T.ok(java.includes('"./?action=start"') && java.includes('"./?action=stop"'), 'the two buttons');
  const app = read('src/app/app.js');
  T.ok(/action === 'start' && !S\.activeShift\) UI\.confirm\(/.test(app), '?action=start asks');
  T.ok(/action === 'stop' && S\.activeShift\) UI\.confirm\(/.test(app), '?action=stop asks');
  const web = code(read('src/app/arrive.js'));
  T.ok(!/startShift|stopShift|timer-start/.test(web), 'the settings section never starts a shift');
});
T.test('the spot never leaves the phone: not to the page, the database, a backup or anywhere', () => {
  // the status the page gets holds no coordinates
  const st = java.slice(java.indexOf('static String status('), java.indexOf('static int radius(Uri'));
  T.ok(st.length > 50 && !/lat|lng|getString\("l/.test(st), 'status() has no coordinates');
  // the page side has no geolocation, no coordinates, no Store write, no network
  const web = code(read('src/app/arrive.js')) + code(read('src/core/arrive.js'));
  T.ok(!/geolocation|latitude|longitude|\blat\b|\blng\b/.test(web.replace(/lat: 32\.1|lng: 34\.8/g, '')), 'no coordinates on the page');
  T.ok(!/Store\.set|setSettings|setMeta|fetch\(|Cloud\.|Sentry|Stats\./.test(web), 'nothing saved or sent from the page');
  // the phone keeps it out of the backups
  for (const f of ['w_backup_rules.xml', 'w_data_extraction.xml']) {
    const x = read('android/widgets/res/xml/' + f);
    T.eq((x.match(/path="shaati_geo\.xml"/g) || []).length, f === 'w_backup_rules.xml' ? 1 : 2, f);
  }
  T.ok(/getSharedPreferences\(PREFS, Context\.MODE_PRIVATE\)/.test(java) && java.includes('PREFS = "shaati_geo"'), 'kept in shaati_geo.xml');
  T.ok(!/HttpURLConnection|OkHttp|URL\(|postMessage/.test(code(all)), 'WorkGeo* send nothing anywhere');
});
T.test('the disclosure comes first, then precise location, then "all the time"; "not now" asks nothing', () => {
  const c = code(act);
  const disc = c.indexOf('w_geo_disc_t'), fine = c.indexOf('ACCESS_FINE_LOCATION'), bg = c.indexOf('ACCESS_BACKGROUND_LOCATION');
  T.ok(disc > 0 && fine > disc && bg > fine, 'order in the code');
  T.ok(/setPositiveButton\([^;]*askFine\(\)\)/.test(c), 'precise location only from the disclosure button');
  T.ok(/w_geo_not_now\), \(d, w\) -> finish\(\)\)/.test(c), 'not now: finish');
  T.eq((c.match(/requestPermissions\(/g) || []).length, 2, 'two requests, nothing else');
  // the disclosure says background, the purpose and that it stays on the phone, in every language
  for (const d of ['values', 'values-en', 'values-ru', 'values-ar', 'values-fr', 'values-es', 'values-am']) {
    T.ok(/name="w_geo_disc">[^<]{120,}</.test(read(`android/widgets/res/${d}/w_strings.xml`)), d + ' disclosure');
  }
  T.ok(/w_geo_disc">[^<]*ברקע[^<]*סגורה[^<]*בטלפון/.test(read('android/widgets/res/values/w_strings.xml')), 'Hebrew: background, closed, on the phone');
  T.ok(/w_geo_disc">[^<]*background[^<]*closed[^<]*stays on this phone/.test(read('android/widgets/res/values-en/w_strings.xml')), 'English: background, closed, on the phone');
});
T.test('the Android build: the permissions, the screen and the receiver go in together; the hello only with them', () => {
  const t = read('tools/android.js');
  T.ok(/const WORK_GEOFENCE = process\.env\.SHAATI_GEOFENCE !== '0';/.test(t), 'one switch');
  T.ok(/if \(WORK_GEOFENCE\) \{\s*m = m\.replace\('<application', `<uses-permission android:name="android\.permission\.ACCESS_COARSE_LOCATION" \/>\s*<uses-permission android:name="android\.permission\.ACCESS_FINE_LOCATION" \/>\s*<uses-permission android:name="android\.permission\.ACCESS_BACKGROUND_LOCATION" \/>/.test(t), 'permissions behind the switch');
  T.ok(/const geo = !WORK_GEOFENCE \? '' :/.test(t) && t.includes('android:scheme="shaati-geo" android:host="save"'), 'the screen behind the switch, its link as the page builds it');
  T.ok(t.includes('<receiver android:name=".WorkGeoReceiver" android:exported="false" />'), 'the receiver is not exported');
  T.ok(/\$\{WORK_GEOFENCE \? `[^`]*postMessage\("shaati:geo", null\)/.test(t), 'the hello behind the switch');
  T.ok(t.includes("play-services-location:"), 'the location library');
  T.ok(!/noHistory/.test(t.slice(t.indexOf('WorkGeoActivity'), t.indexOf('WorkGeoReceiver'))), 'the screen survives Android\'s settings page (background permission)');
});
T.test('the page: off until the Android app says it can, nothing saved in the database, one tap turns it off', () => {
  const s = read('src/app/views-settings.js');
  T.ok(/keys: \['roles', 'pay', 'templates', 'nfc', 'arrive'\]/.test(s), 'in Settings › My work');
  T.ok(!/arrive|geofence|workGeo/i.test(read('src/core/defaults.js')), 'no setting of its own (nothing to sync)');
  const w = read('src/app/widgets.js');
  T.ok(w.includes("data === 'shaati:geo'") && /m\.geo === 1\) \{ if \(App\.arrive\) App\.arrive\.status\(m\); return; \}/.test(w), 'the channel hands both over');
  const web = read('src/app/arrive.js');
  T.ok(/off\.onclick = \(\) => \{\s*if \(App\.widgets\) App\.widgets\.post\(JSON\.stringify\(\{ geo: 1, off: 1 \}\)\);/.test(web), 'off: one tap, no question');
  T.ok(/if \(!native\) \{/.test(web), 'a browser gets the honest note and no button');
  T.ok(read('android/widgets/java/WorkGeoReceiver.java').includes('WorkGeo.ACTION_OFF.equals(a)'), 'the notification turns it off too');
});
