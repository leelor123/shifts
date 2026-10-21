/* Google Play build (Trusted Web Activity via Bubblewrap). Dev tool, not part of the app.
 *   node tools/android.js generate     regenerate the Android project from the live web manifest
 *   node tools/android.js build        build + sign the .aab (upload to Play) and .apk (sideload test)
 *   node tools/android.js assetlinks   print assetlinks.json for the fingerprints in android/fingerprints.json
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
const TWA = path.join(HOME, 'twa');
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
  const tm = new core.TwaManifest(Object.assign(base, {
    packageId: APP.packageId,
    host: APP.host,
    launcherName: APP.launcherName,
    startUrl: APP.startUrl,
    themeColor: '#1D4A4F', themeColorDark: '#0F1413',
    navigationColor: '#F6F4EE', navigationColorDark: '#0F1413',
    navigationDividerColor: '#E3DFD4', navigationDividerColorDark: '#26302E',
    backgroundColor: '#0D2B6B', // same navy as the opening animation: no flash between them
    monochromeIconUrl: `https://${APP.host}${APP.scope}icon-mono-512.png`, // notification icon
    enableNotifications: true,
    // Google Play Billing (Digital Goods API + Payment Request) for the optional Shaati Plus purchase (src/app/plus.js)
    features: { playBilling: { enabled: true } },
    orientation: 'portrait',
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
  await new core.TwaGenerator().createTwaProject(TWA, tm, new core.ConsoleLog('generate'));
  patchLauncher();
  patchWidgets();
  await shared.generateManifestChecksumFile(file, TWA);
  fs.mkdirSync(path.join(ROOT, 'android'), { recursive: true });
  // keep a copy in the repo (no secrets in it: only the keystore's location)
  fs.copyFileSync(file, path.join(ROOT, 'android', 'twa-manifest.json'));
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
                return mShaatiLauncher = new com.google.androidbrowserhelper.trusted.TwaLauncher(this, CHROME,
                        com.google.androidbrowserhelper.trusted.SessionStore.makeSessionId(getTaskId()),
                        new com.google.androidbrowserhelper.trusted.SharedPreferencesTokenStore(this));
            }
        } catch (PackageManager.NameNotFoundException e) {
            // not installed: fall back to the default browser
        }
        return mShaatiLauncher = super.createTwaLauncher();
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
                if (navigationEvent == NAVIGATION_FINISHED && !mChannelRequested) {
                    androidx.browser.customtabs.CustomTabsSession s = widgetSession();
                    if (s != null) mChannelRequested = s.requestPostMessageChannel(SHAATI_ORIGIN, SHAATI_ORIGIN, new Bundle());
                }
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
                if (s != null) s.postMessage("shaati:widgets", null);
            }

            @Override
            public void onPostMessage(String message, Bundle extras) {
                if (inner != null) inner.onPostMessage(message, extras);
                WidgetData.save(getApplicationContext(), message);
            }
        };
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
`);
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
 * widgets' numbers come through (LauncherActivity, above), and code shrinking keeps the launcher's session
 * field the bridge reads.
 */
function patchWidgets() {
  const SRC = path.join(ROOT, 'android', 'widgets');
  const main = path.join(TWA, 'app', 'src', 'main');
  const javaDir = path.join(main, 'java', ...APP.packageId.split('.'));
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
  m = m.replace('</application>', `        <!-- Shaati: the message channel the widgets' numbers come through, and the widgets -->
        <service android:name="androidx.browser.customtabs.PostMessageService" android:exported="true" />
${receiver('ShiftWidget', 'shift')}${receiver('MonthWidget', 'month')}${receiver('GoalWidget', 'goal')}${receiver('PaydayWidget', 'payday')}${receiver('ComboWidget', 'combo')}    </application>`);
  fs.writeFileSync(mf, m);
  const gf = path.join(TWA, 'app', 'build.gradle');
  let g = fs.readFileSync(gf, 'utf8');
  if (!g.includes('            minifyEnabled true\n')) throw new Error('build.gradle template changed');
  g = g.replace('            minifyEnabled true\n', "            minifyEnabled true\n            proguardFiles 'shaati-rules.pro'\n");
  fs.writeFileSync(gf, g);
  fs.writeFileSync(path.join(TWA, 'app', 'shaati-rules.pro'), '# Shaati: the widgets bridge reads the launcher\'s session (LauncherActivity.widgetSession)\n-keepclassmembers class com.google.androidbrowserhelper.trusted.TwaLauncher { androidx.browser.customtabs.CustomTabsSession *; }\n');
}

function build() {
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
  const r = spawnSync(process.platform === 'win32' ? 'bubblewrap.cmd' : 'bubblewrap', ['build', '--skipPwaValidation'], { cwd: TWA, env, stdio: 'inherit', shell: true });
  if (r.status !== 0) throw new Error('bubblewrap build failed');
  const out = path.join(HOME, 'release', pkg.version);
  fs.mkdirSync(out, { recursive: true });
  for (const [from, to] of [['app-release-bundle.aab', `shiftpay-${pkg.version}.aab`], ['app-release-signed.apk', `shiftpay-${pkg.version}.apk`]]) {
    fs.copyFileSync(path.join(TWA, from), path.join(out, to));
  }
  console.log('release files →', out);
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
  else console.log('usage: node tools/android.js generate | build | assetlinks');
})().catch((e) => { console.error(e.message || e); process.exit(1); });
