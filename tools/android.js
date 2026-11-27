/* Google Play build (Trusted Web Activity via Bubblewrap). Dev tool, not part of the app.
 *   node tools/android.js generate     regenerate the Android project from the live web manifest
 *   node tools/android.js build        build + sign the .aab (upload to Play) and .apk (sideload test)
 *   node tools/android.js assetlinks   print assetlinks.json for the fingerprints in android/fingerprints.json
 *   node tools/android.js videotest    the Play location-declaration video's builds (android/videotest): the app with the
 *                                      geofence and its test APK, in videotest/twa and release/video (Firebase Test Lab)
 * Everything lives in %USERPROFILE%\ShiftPay-Android (override with SHIFTPAY_ANDROID):
 *   keys\shiftpay-upload.jks + keys\KEYSTORE-PASSWORDS.txt   (never commit these)
 *   twa\        generated Android project     release\   signed outputs per version
 * Needs: npm i -g @bubblewrap/cli, and ~/.bubblewrap/config.json pointing at JDK 17 + Android SDK. */
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const HOME = process.env.SHIFTPAY_ANDROID || path.join(process.env.USERPROFILE || process.env.HOME, 'ShiftPay-Android');
const RELEASE_TWA = path.join(HOME, 'twa');
let TWA = RELEASE_TWA; // videotest builds in a project of its own, so the release project stays as it was generated
const KEYSTORE = path.join(HOME, 'keys', 'shiftpay-upload.jks');
const PASSWORDS = path.join(HOME, 'keys', 'KEYSTORE-PASSWORDS.txt');
const APP = {
  packageId: 'io.github.leelor123.shifts',
  host: 'leelor123.github.io',
  scope: '/shifts/',
  startUrl: '/shifts/?source=twa',
  launcherName: 'Shaati',
};
const FINGERPRINTS = path.join(ROOT, 'android', 'fingerprints.json');
// a suggestion at work (android/widgets/java/WorkGeo*.java, src/app/arrive.js): the geofence needs the background
// location permission, and Google Play reviews every build that has it against the Console's location declaration
// (play-store/APP-CONTENT.md). SHAATI_GEOFENCE=0 builds without the permissions, the setup screen and the hello, so the
// page never offers it (the code stays: nothing runs it).
const WORK_GEOFENCE = process.env.SHAATI_GEOFENCE !== '0';

const CLI = path.join(execSync('npm root -g').toString().trim(), '@bubblewrap', 'cli');
const core = require(path.join(CLI, 'node_modules', '@bubblewrap', 'core'));
const shared = require(path.join(CLI, 'dist', 'lib', 'cmds', 'shared'));

// 1.2.0 → 10200: every version bump gives Play a higher versionCode
const versionCode = (v) => { const [a, b, c] = v.split('.').map(Number); return a * 10000 + b * 100 + c; };

async function generate() {
  const manifestUrl = new URL(`https://${APP.host}${APP.scope}manifest.webmanifest`);
  const res = await fetch(manifestUrl);
  if (!res.ok) throw new Error(`web manifest: HTTP ${res.status}`);
  const web = await res.json();
  const base = core.TwaManifest.fromWebManifestJson(manifestUrl, web).toJson();
  // the launcher shortcuts open the app as the app, not as a website: without source=twa the page knew it only from
  // the referrer or the Digital Goods API, and the Play app must never show the website's checkout (Review Ready scan)
  base.shortcuts = (base.shortcuts || []).map((sc) => Object.assign({}, sc, { url: sc.url + (sc.url.includes('?') ? '&' : '?') + 'source=twa' }));
  const tm = new core.TwaManifest(Object.assign(base, {
    packageId: APP.packageId,
    host: APP.host,
    launcherName: APP.launcherName,
    startUrl: APP.startUrl,
    themeColor: '#1D4A4F', themeColorDark: '#0F1413',
    // the phone's own bar under the app is the app's bottom bar colour (styles-v4.css --surface, light and dark), and
    // its divider the same colour: no line between them, so the app does not look like a page in a browser
    navigationColor: '#F6F4EE', navigationColorDark: '#0E1118',
    navigationDividerColor: '#F6F4EE', navigationDividerColorDark: '#0E1118',
    backgroundColor: '#0D2B6B', // same navy as the opening animation: no flash between them
    monochromeIconUrl: `https://${APP.host}${APP.scope}icon-mono-512.png`, // notification icon
    enableNotifications: true,
    // Google Play Billing (Digital Goods API + Payment Request) for the optional Shaati Plus purchase (src/app/plus.js)
    features: { playBilling: { enabled: true } },
    orientation: 'portrait',
    // a phone with no browser that can run the app as an app (no Chrome, Samsung Internet, Edge…; the launcher opens
    // Chrome whenever it is installed) opens it as a browser tab, with an address bar. "webview" would hide the bar but
    // break more than it fixes there: Google refuses its sign-in inside an embedded WebView (disallowed_useragent) and
    // the native sign-in, the widgets' numbers, the phone's own notifications and the rating ask all need the browser's
    // message channel, which a WebView does not have; Play Billing (Digital Goods API) and web notifications are
    // missing too. A tab keeps all of the web app working, so the rare phone keeps a working app (tests/signin.test.js)
    fallbackType: 'customtabs',
    minSdkVersion: 24, // androidbrowserhelper 2.7 needs Android 7.0+
    enableSiteSettingsShortcut: true,
    signingKey: { path: KEYSTORE, alias: 'shiftpay' },
    appVersionName: pkg.version,
    appVersion: pkg.version,
    appVersionCode: versionCode(pkg.version),
    fullScopeUrl: `https://${APP.host}${APP.scope}`,
    generatorApp: 'bubblewrap-cli',
  }));
  fs.mkdirSync(TWA, { recursive: true });
  const file = path.join(TWA, 'twa-manifest.json');
  await tm.saveToFile(file);
  // the generator only writes its own files: a Java file another branch's build added stayed and broke this build
  // (SignInActivity.java of 1.44.0 in a 1.43.0 build, 2026-11-22), so the sources start empty every time
  fs.rmSync(path.join(TWA, 'app', 'src'), { recursive: true, force: true });
  await new core.TwaGenerator().createTwaProject(TWA, tm, new core.ConsoleLog('generate'));
  patchLauncher();
  patchWidgets();
  patchNames();
  await shared.generateManifestChecksumFile(file, TWA);
  fs.mkdirSync(path.join(ROOT, 'android'), { recursive: true });
  // keep a copy in the repo (no secrets in it: only the keystore's location); the video's project is not the release
  if (TWA === RELEASE_TWA) fs.copyFileSync(file, path.join(ROOT, 'android', 'twa-manifest.json'));
  console.log(`generated ${APP.packageId} v${pkg.version} (${versionCode(pkg.version)}) → ${TWA}`);
}

/**
 * Android 13+ blocks an app's notifications until the app itself asks for them. The browser that
 * hosts the app (Chrome or Samsung Internet) shows the web app's reminders through this app, so
 * without this permission they never appear. Ask once, on the first launch, before opening the app.
 */
function patchLauncher() {
  const file = path.join(TWA, 'app', 'src', 'main', 'java', ...APP.packageId.split('.'), 'LauncherActivity.java');
  let src = fs.readFileSync(file, 'utf8');
  const need = (a) => { if (!src.includes(a)) throw new Error('LauncherActivity template changed: ' + a); };
  need('import android.os.Bundle;');
  need('        extends com.google.androidbrowserhelper.trusted.LauncherActivity {');
  need('        super.onCreate(savedInstanceState);\n');
  src = src.replace('import android.os.Bundle;', 'import android.os.Bundle;\nimport android.Manifest;\nimport android.content.pm.PackageManager;');
  src = src.replace('        extends com.google.androidbrowserhelper.trusted.LauncherActivity {', `        extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    // Shaati: ask once for notification permission (Android 13+) before opening the app
    private static final int NOTIFICATION_REQUEST = 7301;
    private static final String PREFS = "shaati";
    private static final String ASKED = "askedNotifications";
    private boolean mAskNotifications;

    private boolean needsNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) return false;
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return false;
        return !getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(ASKED, false);
    }

    @Override
    protected boolean shouldLaunchImmediately() {
        mAskNotifications = needsNotificationPermission();
        return !mAskNotifications;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_REQUEST) launchTwa();
    }

    // Shaati: open in Chrome when it is installed. Samsung Internet (the default browser on many
    // Galaxy phones) reports notification permission as granted inside apps like this one but
    // refuses to show the notifications. Without Chrome, the default browser is used as before.
    private static final String CHROME = "com.android.chrome";

    @Override
    protected com.google.androidbrowserhelper.trusted.TwaLauncher createTwaLauncher() {
        try {
            if (getPackageManager().getApplicationInfo(CHROME, 0).enabled) {
                mShaatiLauncher = new com.google.androidbrowserhelper.trusted.TwaLauncher(this, CHROME,
                        com.google.androidbrowserhelper.trusted.SessionStore.makeSessionId(getTaskId()),
                        new com.google.androidbrowserhelper.trusted.SharedPreferencesTokenStore(this));
                warmUpForWidgets();
                return mShaatiLauncher;
            }
        } catch (PackageManager.NameNotFoundException e) {
            // not installed: fall back to the default browser
        }
        mShaatiLauncher = super.createTwaLauncher();
        warmUpForWidgets();
        return mShaatiLauncher;
    }

    // Chrome opens a message channel only after some app has warmed it up (CustomTabsConnection refuses the
    // request until then), and the browser helper never does: warm it up now, while the page is still loading.
    // Without this the widgets never received their numbers (found on the phone, 3 Nov 2026).
    private void warmUpForWidgets() {
        String browser = mShaatiLauncher == null ? null : mShaatiLauncher.getProviderPackage();
        boolean bound = browser != null && androidx.browser.customtabs.CustomTabsClient.connectAndInitialize(getApplicationContext(), browser);
        android.util.Log.i("ShaatiWidgets", "warm-up " + browser + ": " + bound);
    }

    // Shaati: the home-screen widgets (WidgetData) get their numbers from the web app over a message channel.
    // Once the page has loaded, the app asks Chrome for a channel to the site; when it is ready it says hello,
    // and the page answers with a snapshot (JSON) now and whenever its numbers change. Everything else the
    // browser helper's own callback does is passed on to it unchanged.
    private com.google.androidbrowserhelper.trusted.TwaLauncher mShaatiLauncher;
    private boolean mChannelRequested;
    private static final android.net.Uri SHAATI_ORIGIN = android.net.Uri.parse("https://leelor123.github.io");

    @Override
    protected androidx.browser.customtabs.CustomTabsCallback getCustomTabsCallback() {
        final androidx.browser.customtabs.CustomTabsCallback inner = super.getCustomTabsCallback();
        return new androidx.browser.customtabs.CustomTabsCallback() {
            @Override
            public void onNavigationEvent(int navigationEvent, Bundle extras) {
                if (inner != null) inner.onNavigationEvent(navigationEvent, extras);
                // every page that finishes loading gets its own channel: Chrome ends a channel when the page changes
                // (the first open moves to the chosen language's page right after loading), and the page can't ask
                if (navigationEvent == NAVIGATION_FINISHED) { mChannelRequested = false; requestChannel(0); }
            }

            @Override
            public void extraCallback(String callbackName, Bundle args) {
                if (inner != null) inner.extraCallback(callbackName, args);
            }

            @Override
            public Bundle extraCallbackWithResult(String callbackName, Bundle args) {
                return inner != null ? inner.extraCallbackWithResult(callbackName, args) : null;
            }

            @Override
            public void onRelationshipValidationResult(int relation, android.net.Uri origin, boolean result, Bundle extras) {
                if (inner != null) inner.onRelationshipValidationResult(relation, origin, result, extras);
            }

            @Override
            public void onMessageChannelReady(Bundle extras) {
                if (inner != null) inner.onMessageChannelReady(extras);
                androidx.browser.customtabs.CustomTabsSession s = widgetSession();
                int sent = s == null ? -1 : s.postMessage("shaati:widgets", null);
                android.util.Log.i("ShaatiWidgets", "channel ready; hello sent: " + sent);
                // Google sign-in in Android's own account picker (SignInActivity): said right after the widgets' hello,
                // so a page that hears another hello first knows it is in an app without it (src/app/native-signin.js)
                if (s != null) s.postMessage("shaati:signin", null);
                SignInActivity.sink = (m) -> runOnUiThread(() -> {
                    if (isFinishing()) return;
                    androidx.browser.customtabs.CustomTabsSession ss = widgetSession();
                    if (ss != null) ss.postMessage(m, null);
                });
                // this app shows the notifications itself, at their time, also while closed (NoteCenter): the page
                // sends it the list of the coming days and the ones of now (src/app/phone-notes.js)
                if (s != null) s.postMessage("shaati:notes", null);
                // and the running shift as its own live notification (RunningNote, from 1.46): the page sends its words
                // with the widgets' snapshot; an app before it never says this, and the page keeps the browser's one
                if (s != null) s.postMessage("shaati:run", null);
                // this app can ask for Google Play's In-App Review (PlayReview): the page asks right after a good moment
                if (s != null) s.postMessage("shaati:review", null);
${WORK_GEOFENCE ? `                // this app can suggest a shift at the workplace (WorkGeo): the page offers it in Settings
                if (s != null) s.postMessage("shaati:geo", null);
                // and its later answers: Google Play services may refuse the circle after the status went out (Location
                // Accuracy off), and the page shows it as needing attention, not as on
                WorkGeo.sink = (st) -> runOnUiThread(() -> {
                    if (isFinishing()) return;
                    androidx.browser.customtabs.CustomTabsSession gs = widgetSession();
                    if (gs != null) gs.postMessage(st, null);
                });
` : ''}                sendTaps(s);
            }

            @Override
            public void onPostMessage(String message, Bundle extras) {
                if (inner != null) inner.onPostMessage(message, extras);
                // back to the front, the page asks for the starts and ends tapped on a widget meanwhile
                if ("ask".equals(message)) { sendTaps(widgetSession()); return; }
                if (NoteCenter.isNotes(message)) { NoteCenter.receive(getApplicationContext(), message); return; }
                // Google's review window (src/app/review.js), started on the main thread from this activity
                if ("shaati:review".equals(message)) { runOnUiThread(() -> PlayReview.ask(LauncherActivity.this, widgetSession())); return; }
                // Google sign-in: the page's ask, the one nonce SignInActivity may go on with
                if (SignInActivity.isSignIn(message)) { SignInActivity.expect(message); return; }
                // the suggestion at work: the page asks for its status or turns it off; the answer never holds the spot
                if (WorkGeo.isGeo(message)) {
                    String geo = WorkGeo.receive(getApplicationContext(), message);
                    androidx.browser.customtabs.CustomTabsSession gs = widgetSession();
                    if (geo != null && gs != null) gs.postMessage(geo, null);
                    return;
                }
                android.util.Log.i("ShaatiWidgets", "numbers received (" + (message == null ? 0 : message.length()) + " chars)");
                WidgetData.save(getApplicationContext(), message);
            }
        };
    }

    // the starts and ends tapped on a widget (WidgetData) go to the page, which saves them as shifts
    private void sendTaps(androidx.browser.customtabs.CustomTabsSession s) {
        String taps = WidgetData.tapsMessage(getApplicationContext());
        if (s == null || taps == null) return;
        android.util.Log.i("ShaatiWidgets", "taps sent: " + s.postMessage(taps, null));
    }

    // asks Chrome for the channel; Chrome may still be warming up, so a refusal is tried again a few times
    private void requestChannel(final int attempt) {
        if (mChannelRequested) return;
        androidx.browser.customtabs.CustomTabsSession s = widgetSession();
        if (s != null) mChannelRequested = s.requestPostMessageChannel(SHAATI_ORIGIN, SHAATI_ORIGIN, new Bundle());
        android.util.Log.i("ShaatiWidgets", "channel request " + attempt + ": session " + (s != null) + ", accepted " + mChannelRequested);
        if (!mChannelRequested && attempt < 4) {
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> requestChannel(attempt + 1), 1500);
        }
    }

    // the launcher's session (it keeps it private): found by its type, which survives code shrinking
    private androidx.browser.customtabs.CustomTabsSession widgetSession() {
        if (mShaatiLauncher == null) return null;
        for (java.lang.reflect.Field f : com.google.androidbrowserhelper.trusted.TwaLauncher.class.getDeclaredFields()) {
            if (!androidx.browser.customtabs.CustomTabsSession.class.isAssignableFrom(f.getType())) continue;
            try {
                f.setAccessible(true);
                return (androidx.browser.customtabs.CustomTabsSession) f.get(mShaatiLauncher);
            } catch (Exception e) {
                return null;
            }
        }
        return null;
    }

    // Shaati: Chrome 152+ (CustomTabsConnection.receiveFile, crrev 8031565) takes the splash image only when the
    // calling app holds a recorded grant on its URI. Android records none for the provider's own app on a plain read
    // grant (the owner can read it anyway), so the transfer failed ("Failed to transfer splash image."), Chrome opened
    // its opaque tab and a white screen stood before the page's first paint (the user's phone, 23 Nov 2026). A
    // persistable grant to ourselves is recorded. The same fix as android-browser-helper PR #648 (merged 23 Nov 2026,
    // not in 2.7.4): drop this once a release that has it is in build.gradle.
    private void grantSplashToSelf() {
        try {
            java.io.File file = new java.io.File(new java.io.File(getFilesDir(), "twa_splash"), "splash_image.png");
            android.net.Uri uri = androidx.core.content.FileProvider.getUriForFile(this, getString(R.string.providerAuthority), file);
            grantUriPermission(getPackageName(), uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION
                    | android.content.Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        } catch (RuntimeException e) {
            android.util.Log.w("ShaatiSplash", "self-grant failed", e);
        }
    }
`);
  need('    protected void onCreate(Bundle savedInstanceState) {\n');
  src = src.replace('    protected void onCreate(Bundle savedInstanceState) {\n', '    protected void onCreate(Bundle savedInstanceState) {\n        grantSplashToSelf(); // before super.onCreate, which starts the splash transfer\n');
  src = src.replace('        super.onCreate(savedInstanceState);\n', `        super.onCreate(savedInstanceState);
        if (mAskNotifications && !isFinishing()) {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(ASKED, true).apply();
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, NOTIFICATION_REQUEST);
        }
`);
  fs.writeFileSync(file, src);
}

/**
 * The home-screen widgets (android/widgets): their Java classes and resources go into the project, each is
 * registered as an app-widget receiver, PostMessageService lets Chrome open the message channel the
 * widgets' numbers (and the starts and ends tapped on them) come through (LauncherActivity, above), and code shrinking keeps the launcher's session
 * field the bridge reads.
 */
function patchWidgets() {
  const SRC = path.join(ROOT, 'android', 'widgets');
  const main = path.join(TWA, 'app', 'src', 'main');
  const javaDir = path.join(main, 'java', ...APP.packageId.split('.'));
  // generate keeps the twa/ folder, so the files of an older widgets build stay there: an old w_bg.xml asked for
  // colours the new w_colors.xml no longer has and failed the 1.32.4 build. Every w_* resource and widget class is
  // removed first, so the project holds exactly what android/widgets holds.
  // the texts: every language holds every string, nothing is left written in the code (tools/android-strings-check.js)
  const texts = require('./android-strings-check').check();
  if (texts.problems.length) throw new Error('android/widgets texts:\n' + texts.problems.join('\n'));
  const resDir = path.join(main, 'res');
  // the translations (values-en, values-ru, ...) are w_strings.xml in their own folders: removed and copied like the rest
  for (const d of fs.readdirSync(resDir)) {
    const dir = path.join(resDir, d);
    if (fs.statSync(dir).isDirectory()) for (const f of fs.readdirSync(dir)) if (f.startsWith('w_')) fs.rmSync(path.join(dir, f));
  }
  for (const f of fs.readdirSync(javaDir)) if (/Widget\w*\.java$/.test(f)) fs.rmSync(path.join(javaDir, f));
  for (const f of fs.readdirSync(path.join(SRC, 'java'))) fs.copyFileSync(path.join(SRC, 'java', f), path.join(javaDir, f));
  for (const d of fs.readdirSync(path.join(SRC, 'res'))) {
    fs.mkdirSync(path.join(main, 'res', d), { recursive: true });
    for (const f of fs.readdirSync(path.join(SRC, 'res', d))) fs.copyFileSync(path.join(SRC, 'res', d, f), path.join(main, 'res', d, f));
  }
  const mf = path.join(main, 'AndroidManifest.xml');
  let m = fs.readFileSync(mf, 'utf8');
  if (!m.includes('</application>')) throw new Error('AndroidManifest.xml template changed');
  const receiver = (name, key) => `        <receiver android:name=".${name}" android:exported="false" android:label="@string/w_${key}_name">
            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/w_${key}_info" />
        </receiver>\n`;
  if (!m.includes('<application')) throw new Error('AndroidManifest.xml template changed: application');
  m = m.replace('<application', '<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />\n    <application');
  // the running shift as a Live Update on Android 16 and later (RunningNote): pinned on the lock screen, a chip up top
  m = m.replace('<application', '<uses-permission android:name="android.permission.POST_PROMOTED_NOTIFICATIONS" />\n    <application');
  // the suggestion at work (WorkGeo): precise location for the circle, background location so Android can tell the app
  // while it is closed. Asked only from WorkGeoActivity, after its disclosure, and only when the user turns it on.
  if (WORK_GEOFENCE) {
    m = m.replace('<application', `<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
    <uses-feature android:name="android.hardware.location" android:required="false" />
    <uses-feature android:name="android.hardware.location.gps" android:required="false" />
    <uses-feature android:name="android.hardware.location.network" android:required="false" />
    <application`);
    // the location permissions make Play assume GPS is required and hide the app from devices without it (8 dropped
    // in 13800/13900); the suggestion at work is optional, so the hardware is too (tests/arrive.test.js)
  }
  const geo = !WORK_GEOFENCE ? '' : `        <!-- the suggestion at work: saving the spot (the disclosure, then the permissions; src/app/arrive.js opens it),
             and the circle's crossings and the notification's "turn off" (WorkGeo) -->
        <activity android:name=".WorkGeoActivity" android:exported="true" android:theme="@style/WorkGeoTheme" android:excludeFromRecents="true" android:taskAffinity="">
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="shaati-geo" android:host="save" />
            </intent-filter>
        </activity>
        <receiver android:name=".WorkGeoReceiver" android:exported="false" />
`;
  m = m.replace('</application>', `        <!-- Google sign-in in Android's own account picker (SignInActivity; src/app/native-signin.js opens it). In the
             app's own task, over the app, see-through: no task switch, nothing moves. Android never makes it again for a
             turned phone or a new theme, so the picker's answer always finds it. -->
        <activity android:name=".SignInActivity" android:exported="true" android:theme="@style/SignInTheme"
            android:configChanges="orientation|screenSize|screenLayout|smallestScreenSize|uiMode|density|fontScale|locale|layoutDirection|keyboard|keyboardHidden|navigation">
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="shaati-signin" android:host="google" />
            </intent-filter>
        </activity>
        <!-- Shaati: the message channel the widgets' numbers come through, and the widgets -->
        <service android:name="androidx.browser.customtabs.PostMessageService" android:exported="true" />
        <!-- choosing a widget's look: the launcher opens it when a widget is added, and from the widget's settings -->
        <activity android:name=".WidgetStyleActivity" android:exported="true" android:theme="@style/WidgetPickTheme" android:excludeFromRecents="true" android:taskAffinity="">
            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_CONFIGURE" /></intent-filter>
        </activity>
${receiver('ShiftWidget', 'shift')}${receiver('MonthWidget', 'month')}${receiver('GoalWidget', 'goal')}${receiver('PaydayWidget', 'payday')}${receiver('ComboWidget', 'combo')}        <!-- the notifications at their time, also while the app is closed (NoteCenter): the alarm, and after a restart,
             an update or a new clock the alarms are set again -->
        <receiver android:name=".NoteAlarm" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
                <action android:name="android.intent.action.TIME_SET" />
                <action android:name="android.intent.action.TIMEZONE_CHANGED" />
            </intent-filter>
        </receiver>
        <!-- the quick-settings tile: start or end a shift from the panel at the top of the screen (ShiftTile) -->
        <service android:name=".ShiftTile" android:exported="true" android:label="@string/w_tile_name" android:icon="@drawable/w_ic_play" android:permission="android.permission.BIND_QUICK_SETTINGS_TILE">
            <intent-filter><action android:name="android.service.quicksettings.action.QS_TILE" /></intent-filter>
        </service>
${geo}    </application>`);
  // the widgets' pay snapshot stays out of the phone's backups (res/xml/w_backup_rules.xml, w_data_extraction.xml)
  if (!m.includes('android:allowBackup="true"')) throw new Error('AndroidManifest.xml template changed: allowBackup');
  m = m.replace('android:allowBackup="true"', 'android:allowBackup="true"\n        android:fullBackupContent="@xml/w_backup_rules"\n        android:dataExtractionRules="@xml/w_data_extraction"');
  fs.writeFileSync(mf, m);
  const gf = path.join(TWA, 'app', 'build.gradle');
  let g = fs.readFileSync(gf, 'utf8');
  if (!g.includes('            minifyEnabled true\n')) throw new Error('build.gradle template changed');
  g = g.replace('            minifyEnabled true\n', "            minifyEnabled true\n            proguardFiles 'shaati-rules.pro'\n");
  // Google Play's In-App Review (PlayReview.java, asked for by src/app/review.js)
  if (!g.includes('dependencies {\n')) throw new Error('build.gradle template changed: dependencies');
  g = g.replace('dependencies {\n', "dependencies {\n    implementation 'com.google.android.play:review:2.0.2'\n");
  // the geofence and the one reading of the spot (WorkGeo, WorkGeoActivity): Google Play services' location library,
  // always compiled in (the classes use it); with SHAATI_GEOFENCE=0 nothing calls it
  const abh = /^(\s*)implementation 'com\.google\.androidbrowserhelper:androidbrowserhelper:[^']+'\n/m;
  if (!abh.test(g)) throw new Error('build.gradle template changed: androidbrowserhelper');
  g = g.replace(abh, (line, sp) => `${line}${sp}implementation 'com.google.android.gms:play-services-location:21.3.0'\n`);
  // Google sign-in in Android's own account picker (SignInActivity): Credential Manager, its Google Play services part,
  // and Sign in with Google's option and token
  g = g.replace(abh, (line, sp) => `${line}${['androidx.credentials:credentials:1.5.0', 'androidx.credentials:credentials-play-services-auth:1.5.0', 'com.google.android.libraries.identity.googleid:googleid:1.1.1'].map((d) => `${sp}implementation '${d}'\n`).join('')}`);
  fs.writeFileSync(gf, g);
  fs.writeFileSync(path.join(TWA, 'app', 'shaati-rules.pro'), '# Shaati: the widgets bridge reads the launcher\'s session (LauncherActivity.widgetSession)\n-keepclassmembers class com.google.androidbrowserhelper.trusted.TwaLauncher { androidx.browser.customtabs.CustomTabsSession *; }\n'
    // Google sign-in (SignInActivity): Credential Manager finds its Google Play services part by its name
    + '-if class androidx.credentials.CredentialManager\n-keep class androidx.credentials.playservices.** { *; }\n');
}

/** The app is called "שעתי" on phones set to Hebrew (android/res/values-iw); the default name stays "Shaati", as the
 *  app calls itself in every other language (Arabic included). */
function patchNames() {
  const SRC = path.join(ROOT, 'android', 'res');
  const res = path.join(TWA, 'app', 'src', 'main', 'res');
  for (const d of fs.readdirSync(SRC)) {
    fs.mkdirSync(path.join(res, d), { recursive: true });
    for (const f of fs.readdirSync(path.join(SRC, d))) fs.copyFileSync(path.join(SRC, d, f), path.join(res, d, f));
  }
}

function buildEnv() {
  const pw = (fs.readFileSync(PASSWORDS, 'utf8').match(/Store password:\s*(\S+)/) || [])[1];
  if (!pw) throw new Error('password not found in ' + PASSWORDS);
  const env = Object.assign({}, process.env, {
    BUBBLEWRAP_KEYSTORE_PASSWORD: pw,
    BUBBLEWRAP_KEY_PASSWORD: pw,
    // antivirus HTTPS scanning: let Java/Gradle trust the Windows certificate store
    JAVA_TOOL_OPTIONS: '-Djavax.net.ssl.trustStoreType=Windows-ROOT',
  });
  // bubblewrap runs "gradlew.bat" and "jarsigner" by name; some shells don't search the current folder
  delete env.NoDefaultCurrentDirectoryInExePath;
  const cfg = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE || process.env.HOME, '.bubblewrap', 'config.json'), 'utf8'));
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  env[pathKey] = [TWA, path.join(cfg.jdkPath, 'bin'), env[pathKey]].join(path.delimiter);
  return { env, cfg };
}

/** The project's versionName, or null. build() names its files after package.json's version, so a project generated
 *  for an older version would ship old code under a new name (1.39.0 once held the 1.38.2 build). */
function projectVersion(dir) {
  const f = path.join(dir, 'app', 'build.gradle');
  const m = fs.existsSync(f) && fs.readFileSync(f, 'utf8').match(/versionName\s*=?\s*["']([^"']+)["']/);
  return m ? m[1] : null;
}

function build(outDir) {
  if (!outDir) {
    const v = projectVersion(TWA);
    if (v !== pkg.version) throw new Error(`the Android project is ${v || 'missing'}, not ${pkg.version}: run "node tools/android.js generate" first`);
  }
  const { env } = buildEnv();
  const r = spawnSync(process.platform === 'win32' ? 'bubblewrap.cmd' : 'bubblewrap', ['build', '--skipPwaValidation'], { cwd: TWA, env, stdio: 'inherit', shell: true });
  if (r.status !== 0) throw new Error('bubblewrap build failed');
  const out = outDir || path.join(HOME, 'release', pkg.version);
  fs.mkdirSync(out, { recursive: true });
  for (const [from, to] of [['app-release-bundle.aab', `shiftpay-${pkg.version}.aab`], ['app-release-signed.apk', `shiftpay-${pkg.version}.apk`]]) {
    fs.copyFileSync(path.join(TWA, from), path.join(out, to));
  }
  console.log('release files →', out);
}

/**
 * The video for Play's background-location declaration (play-store/APP-CONTENT.md 4.1), recorded by Firebase Test Lab:
 * the app with the geofence (generated and signed as for Play, in a project of its own: videotest/twa) and the test
 * APK that drives it (android/videotest; it instruments itself, so it needs no shared signature and runs on as the
 * app's permissions are taken back). Both go to release/video, never to a version's release folder.
 */
async function videotest() {
  if (!WORK_GEOFENCE) throw new Error('the video shows the geofence: run without SHAATI_GEOFENCE=0');
  TWA = path.join(HOME, 'videotest', 'twa');
  await generate();
  const out = path.join(HOME, 'release', 'video');
  build(out);
  const SRC = path.join(ROOT, 'android', 'videotest').split(path.sep).join('/');
  const mod = path.join(TWA, 'videotest');
  fs.mkdirSync(mod, { recursive: true });
  fs.writeFileSync(path.join(mod, 'build.gradle'), `apply plugin: 'com.android.application'
repositories { google(); mavenCentral() }
android {
    namespace 'io.github.leelor123.shifts.videotest'
    compileSdkVersion 36
    defaultConfig { applicationId 'io.github.leelor123.shifts.videotest'; minSdkVersion 24; targetSdkVersion 34; versionCode 1; versionName '1' }
    compileOptions { sourceCompatibility JavaVersion.VERSION_1_8; targetCompatibility JavaVersion.VERSION_1_8 }
    sourceSets { main { manifest.srcFile '${SRC}/AndroidManifest.xml'; java.srcDirs = ['${SRC}/java'] } }
    lint { abortOnError false; checkReleaseBuilds false }
}
dependencies {
    implementation 'androidx.test:runner:1.6.2'
    implementation 'androidx.test.ext:junit:1.2.1'
    implementation 'androidx.test.uiautomator:uiautomator:2.3.0'
    implementation 'junit:junit:4.13.2'
    implementation 'com.google.android.gms:play-services-location:21.3.0'
}
`);
  const sg = path.join(TWA, 'settings.gradle');
  if (!fs.readFileSync(sg, 'utf8').includes("':videotest'")) fs.appendFileSync(sg, "\ninclude ':videotest'\n");
  const { env, cfg } = buildEnv();
  Object.assign(env, { JAVA_HOME: cfg.jdkPath, ANDROID_HOME: cfg.androidSdkPath, ANDROID_SDK_ROOT: cfg.androidSdkPath });
  const g = spawnSync(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', [':videotest:assembleDebug'], { cwd: TWA, env, stdio: 'inherit', shell: true });
  if (g.status !== 0) throw new Error('test APK build failed');
  fs.copyFileSync(path.join(mod, 'build', 'outputs', 'apk', 'debug', 'videotest-debug.apk'), path.join(out, 'shaati-videotest.apk'));
  fs.renameSync(path.join(out, `shiftpay-${pkg.version}.apk`), path.join(out, 'shaati-video-app.apk'));
  fs.rmSync(path.join(out, `shiftpay-${pkg.version}.aab`), { force: true });
  console.log('video builds →', out, '(shaati-video-app.apk + shaati-videotest.apk: Firebase Test Lab, instrumentation test)');
}

function assetlinks() {
  const fps = JSON.parse(fs.readFileSync(FINGERPRINTS, 'utf8')).map((f) => f.sha256);
  // use_as_origin: the app may speak for the site in the widgets' message channel (LauncherActivity)
  const json = [{ relation: ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.use_as_origin'], target: { namespace: 'android_app', package_name: APP.packageId, sha256_cert_fingerprints: fps } }];
  console.log(JSON.stringify(json, null, 2));
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'generate') await generate();
  else if (cmd === 'build') build();
  else if (cmd === 'assetlinks') assetlinks();
  else if (cmd === 'videotest') await videotest();
  else console.log('usage: node tools/android.js generate | build | assetlinks | videotest');
})().catch((e) => { console.error(e.message || e); process.exit(1); });
