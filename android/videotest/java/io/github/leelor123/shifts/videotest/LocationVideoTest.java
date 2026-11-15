package io.github.leelor123.shifts.videotest;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Rect;
import android.location.Location;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.util.Log;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.BySelector;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.tasks.Tasks;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.FileInputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * The video for Google Play's background-location declaration (play-store/APP-CONTENT.md section 4.1), recorded by
 * Firebase Test Lab while this test drives the real Shaati app the way a person would, slowly enough to follow:
 * the first open (notifications, English, sample data as a guest), Settings › My work › "Suggestion when you arrive
 * at work" (Off), the disclosure and "Not now", the disclosure again and "Continue", Android's precise location
 * prompt, "One more step", Android's "Allow all the time", the "saved" toast and "On", the app closed, then the phone
 * leaves the workplace and comes back and stays: the app's own geofence shows its own "Arrived at work?"
 * notification. Nothing is drawn by this test: it only taps, and moves the phone's location with Android's mock
 * location (Google Play services' mock mode and the location test providers), which the app cannot tell from GPS.
 */
@RunWith(AndroidJUnit4.class)
public class LocationVideoTest {
    private static final String TAG = "ShaatiVideo";
    private static final String APP = "io.github.leelor123.shifts";
    private static final String SELF = "io.github.leelor123.shifts.videotest";
    private static final String[] PERMS = {
            "android.permission.POST_NOTIFICATIONS",
            "android.permission.ACCESS_FINE_LOCATION",
            "android.permission.ACCESS_COARSE_LOCATION",
            "android.permission.ACCESS_BACKGROUND_LOCATION",
    };
    // a public spot in Tel Aviv (Dizengoff Square), and a point about 3.3 km north of it, outside every radius
    private static final double WORK_LAT = 32.07775, WORK_LNG = 34.77408;
    private static final double AWAY_LAT = WORK_LAT + 0.03;
    private static final long STEP = 2200; // the pause after each screen, so a viewer can read it

    private Instrumentation inst;
    private UiDevice d;
    private Context ctx;
    private FusedLocationProviderClient flp;
    private volatile double lat = WORK_LAT, lng = WORK_LNG;
    private volatile boolean mocking;

    // the video itself: Android's own screen recorder (full size, smooth), in parts of 3 minutes, which Test Lab
    // brings back from this folder (directoriesToPull); its own video is lower in size and frame rate
    private static final String REC = "/sdcard/Download/shaati-video";
    private volatile boolean recording;
    private Thread recorder;

    private void recStart() {
        if (recording) return;
        recording = true;
        recorder = new Thread(() -> {
            int n = 0;
            while (recording) {
                String file = REC + "/part-" + System.currentTimeMillis() + ".mp4";
                Log.i(TAG, "recording " + file);
                sh("screenrecord --bit-rate 8000000 --time-limit 180 " + file);
                n++;
            }
        }, "screenrecord");
        recorder.setDaemon(true);
        recorder.start();
        pause(800);
    }

    private void recStop() {
        if (!recording) return;
        recording = false;
        sh("pkill -INT screenrecord");
        try { recorder.join(8000); } catch (InterruptedException ignored) { }
        pause(500);
    }

    @Test
    public void locationDeclarationVideo() throws Exception {
        inst = InstrumentationRegistry.getInstrumentation();
        ctx = inst.getContext();
        d = UiDevice.getInstance(inst);
        prepare();
        startMock();
        sh("rm -rf " + REC);
        sh("mkdir -p " + REC);
        recStart();
        try {
            flow();
        } finally {
            recStop();
            mocking = false;
            try { Tasks.await(flp.setMockMode(false), 10, TimeUnit.SECONDS); } catch (Exception ignored) { }
        }
    }

    /** The phone as after a fresh install: none of the app's permissions, the screen kept on, location on. */
    private void prepare() {
        sh("svc power stayon true");
        sh("settings put system screen_off_timeout 1800000");
        sh("input keyevent KEYCODE_WAKEUP");
        sh("wm dismiss-keyguard");
        sh("cmd location set-location-enabled true");
        sh("am force-stop " + APP);
        for (String p : PERMS) {
            sh("pm revoke " + APP + " " + p);
            sh("pm clear-permission-flags " + APP + " " + p + " user-set user-fixed");
        }
        // this test moves the location: Android's mock-location app, with location permission for Play services' mock mode
        sh("pm grant " + SELF + " android.permission.ACCESS_FINE_LOCATION");
        sh("pm grant " + SELF + " android.permission.ACCESS_COARSE_LOCATION");
        sh("appops set " + SELF + " android:mock_location allow");
        sh("appops set com.android.shell android:mock_location allow");
        for (String p : new String[] { "gps", "network" }) {
            sh("cmd location providers add-test-provider " + p);
            sh("cmd location providers set-test-provider-enabled " + p + " true");
        }
        d.pressHome();
        pause(1500);
    }

    /** Every second the same place goes to Play services' fused location (mock mode) and to Android's providers. */
    private void startMock() throws Exception {
        flp = LocationServices.getFusedLocationProviderClient(ctx);
        try {
            Tasks.await(flp.setMockMode(true), 15, TimeUnit.SECONDS);
            Log.i(TAG, "mock mode on");
        } catch (Exception e) {
            Log.w(TAG, "mock mode", e);
        }
        mocking = true;
        Thread t = new Thread(() -> {
            int n = 0;
            while (mocking) {
                double a = lat, o = lng;
                Location l = new Location("gps");
                l.setLatitude(a);
                l.setLongitude(o);
                l.setAccuracy(4f);
                l.setAltitude(20);
                l.setTime(System.currentTimeMillis());
                l.setElapsedRealtimeNanos(SystemClock.elapsedRealtimeNanos());
                try { flp.setMockLocation(l); } catch (Exception e) { if (n % 30 == 0) Log.w(TAG, "mock location", e); }
                if (n % 2 == 0) {
                    for (String p : new String[] { "gps", "network" }) {
                        sh("cmd location providers set-test-provider-location " + p + " --location " + a + "," + o + " --accuracy 4");
                    }
                }
                n++;
                SystemClock.sleep(1000);
            }
        }, "mock-location");
        t.setDaemon(true);
        t.start();
        pause(3000);
    }

    private void flow() throws Exception {
        // 1. the launcher opens Shaati
        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(APP);
        if (open == null) fail("Shaati is not installed");
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        ctx.startActivity(open);
        // Android 13+: the app asks for notifications on its first open (LauncherActivity)
        UiObject2 allow = d.wait(Until.findObject(By.res("com.android.permissioncontroller:id/permission_allow_button")), 20000);
        if (allow != null) { pause(STEP); allow.click(); }
        int h = d.getDisplayHeight(), w = d.getDisplayWidth();
        // geoOnly (a dry run of the Android half on a test phone whose old Chrome cannot open the app's channel): the
        // app's own screen is opened by its link, as the page's button does; never used for the video
        boolean geo = "true".equals(InstrumentationRegistry.getArguments().getString("geoOnly"));
        if (!geo) {
            // the first open: the languages screen (after the opening show); Chrome's own first-run screen if it has one
            long end = SystemClock.uptimeMillis() + 90000;
            UiObject2 english = null;
            while (SystemClock.uptimeMillis() < end && (english = find("English")) == null) {
                for (String b : new String[] { "Use without an account", "No thanks", "No, thanks", "Accept & continue", "Continue", "Got it" }) {
                    UiObject2 o = findIn("com.android.chrome", b);
                    if (o != null) { o.click(); pause(1500); }
                }
                pause(1000);
            }
            if (english == null) fail("the languages screen did not appear");
            tap("English", 5000);
            // a test phone's Chrome sometimes stalls on the opening after the language moves the page: opened again
            for (int i = 0; i < 3 && waitQuiet("Just look around (sample data)", 40000) == null; i++) {
                Log.i(TAG, "the welcome screen did not come: Chrome and the app opened again");
                sh("am force-stop com.android.chrome");
                pause(1500);
                ctx.startActivity(open);
            }
            // each tap again until the next screen shows (a tap can land while the page redraws, e.g. as it takes the
            // app's channel right after the language move)
            advance("Just look around (sample data)", "Continue as a guest, without an account");
            advance("Continue as a guest, without an account", "Continue as a guest?");
            // the dialog's button, by its exact name (the link above starts with the same words)
            for (int i = 0; i < 3 && waitQuiet("I have read and agree to the terms of use and the privacy policy", i == 0 ? 1 : 6000) == null; i++) {
                pause(STEP);
                press(() -> { UiObject2 g = d.findObject(By.text("Continue as a guest")); return g != null ? g : d.findObject(By.desc("Continue as a guest")); }, "the guest dialog's button");
            }
            tap("I have read and agree to the terms of use and the privacy policy", 20000);
            advance("Agree and continue", "Start shift");
            pause(STEP);
            // the first open moved to the English page after the channel to the app was made: the app is closed and opened
            // again from the launcher, as on the next day, so the page and the app talk (LauncherActivity's hello)
            boolean ready = false;
            for (int take = 1; take <= 4 && !ready; take++) {
                closeApp(w, h);
                // and Chrome stopped too, as after a night or a restart: the app's page then loads afresh (the English page,
                // straight from the app's worker) and takes the app's channel; a page kept in memory may not get it again
                sh("am force-stop com.android.chrome");
                pause(1500);
                Log.i(TAG, "take " + take + ": the launcher opens Shaati");
                ctx.startActivity(open);
                waitFor("Start shift", 60000);
                pause(STEP + 1000);
                // 2. Settings › My work › Suggestion when you arrive at work: Off (the app answered the page)
                // a tap can land on a toast or while the page redraws: again until the next screen shows
                for (int i = 0; i < 3; i++) {
                    press(() -> bottom("Settings"), "Settings");
                    if (waitQuiet("My work", 6000) != null) break;
                    Log.i(TAG, "tapped again: Settings");
                }
                pause(STEP);
                advance("My work", "Suggestion when you arrive at work");
                pause(1500);
                // the row reads "Suggestion when you arrive at work Off" (the page's sub-line joins the title in Chrome)
                ready = d.findObject(By.textEndsWith("arrive at work Off")) != null || d.findObject(By.descEndsWith("arrive at work Off")) != null
                        || d.findObject(By.text("Off")) != null;
                Log.i(TAG, "take " + take + ": the app answered the page: " + ready);
            }
            if (!ready) fail("the page never heard from the app (no Off under the suggestion)");
            pause(STEP);
            advance("Suggestion when you arrive at work", "Radius around the spot");
            scrollTo("Save where I am now as my workplace");
            pause(STEP + 1000);
        } else {
            pause(8000);
        }

        Log.i(TAG, "step: disclosure");
        // 3-4. the disclosure, then "Not now": nothing is asked, the app keeps working
        save(geo);
        UiObject2 notNow = waitDialog("android:id/button2");
        pause(STEP + 3000); // time to read the disclosure
        notNow.click();
        pause(STEP);
        d.swipe(w / 2, h * 3 / 5, w / 2, h * 2 / 5, 40);
        pause(1500);
        d.swipe(w / 2, h * 2 / 5, w / 2, h * 3 / 5, 40);
        pause(STEP);

        Log.i(TAG, "step: again");
        // 5. again: the disclosure, then "Continue"
        if (!geo) scrollTo("Save where I am now as my workplace");
        pause(1200);
        save(geo);
        UiObject2 go = waitDialog("android:id/button1");
        pause(STEP + 1500);
        go.click();

        Log.i(TAG, "step: precise prompt");
        // 6. Android's prompt: Precise, While using the app
        UiObject2 fine = d.wait(Until.findObject(By.res("com.android.permissioncontroller:id/permission_location_accuracy_radio_fine")), 15000);
        if (fine != null && !fine.isChecked()) { pause(1200); fine.click(); }
        UiObject2 whileUsing = d.wait(Until.findObject(By.res("com.android.permissioncontroller:id/permission_allow_foreground_only_button")), 15000);
        if (whileUsing == null) whileUsing = d.wait(Until.findObject(By.textContains("While using the app")), 5000);
        if (whileUsing == null) fail("Android's location prompt did not appear");
        pause(STEP);
        whileUsing.click();

        Log.i(TAG, "step: one more step");
        // 7. "One more step" › Continue › Android's settings: Allow all the time › back
        UiObject2 more = waitDialog("android:id/button1");
        pause(STEP + 1500);
        more.click();
        UiObject2 always = d.wait(Until.findObject(By.res("com.android.permissioncontroller:id/allow_always_radio_button")), 15000);
        if (always == null) always = d.wait(Until.findObject(By.textContains("all the time")), 5000);
        if (always == null) fail("Android's location settings did not open");
        pause(STEP);
        always.click();
        pause(STEP);
        d.pressBack();

        Log.i(TAG, "step: saved");
        // 8. the toast and "On"
        UiObject2 on = null;
        for (int i = 0; i < 16 && on == null; i++) {
            on = d.findObject(By.text("On"));
            if (on == null) on = d.findObject(By.textStartsWith("On "));
            if (on == null) on = d.findObject(By.textContains("of the spot you saved"));
            if (on == null) SystemClock.sleep(500);
        }
        Log.i(TAG, "section shows On: " + (on != null)); // the notification below is the proof either way
        pause(STEP + 3000);

        Log.i(TAG, "step: closed");
        // 9. the app is closed (swiped away from the recent apps)
        closeApp(w, h);

        pause(4000);
        recStop(); // the home screen while the phone travels: the recorder rests (Test Lab's own video keeps it all)
        // the phone leaves the workplace, and comes back and stays: Android's geofence sees both
        lat = AWAY_LAT;
        Log.i(TAG, "away");
        SystemClock.sleep(150000);
        lat = WORK_LAT;
        Log.i(TAG, "back at work");
        long until = SystemClock.uptimeMillis() + 14 * 60000L;
        boolean seen = false;
        while (SystemClock.uptimeMillis() < until) {
            if (sh("dumpsys notification --noredact").contains("geo-arrive")) { seen = true; break; }
            SystemClock.sleep(10000);
        }
        Log.i(TAG, "arrival notification: " + seen);
        if (!seen) fail("no arrival notification within 14 minutes");

        Log.i(TAG, "step: notification");
        // 11. the notification, on the screen
        recStart();
        pause(2500); // the notification arrived on the home screen
        d.openNotification();
        UiObject2 note = d.wait(Until.findObject(By.textStartsWith("Arrived at work?")), 10000);
        pause(STEP);
        // opened, with its buttons: the expand arrow next to it, or a pull down on it
        java.util.regex.Pattern startP = java.util.regex.Pattern.compile("(?i)start shift");
        for (int i = 0; i < 3 && note != null && d.findObject(By.pkg("com.android.systemui").text(startP)) == null; i++) {
            Rect nr = note.getVisibleBounds();
            UiObject2 best = null;
            for (UiObject2 e : d.findObjects(By.res("android:id/expand_button"))) {
                if (best == null || Math.abs(e.getVisibleBounds().centerY() - nr.centerY()) < Math.abs(best.getVisibleBounds().centerY() - nr.centerY())) best = e;
            }
            if (best != null && Math.abs(best.getVisibleBounds().centerY() - nr.centerY()) < h / 8) best.click();
            else d.drag(nr.centerX(), nr.centerY(), nr.centerX(), nr.centerY() + h / 6, 40);
            pause(1500);
            note = d.findObject(By.textStartsWith("Arrived at work?"));
        }
        UiObject2 start = d.findObject(By.pkg("com.android.systemui").text(startP));
        Log.i(TAG, "notification opened with its buttons: " + (start != null) + screenTexts());
        pause(STEP + 2500); // the suggestion and its two buttons, to read
        // "Start shift": the app opens and asks once more (nothing starts without that answer)
        if (start != null) {
            start.click();
            pause(9000);
        } else {
            pause(6000);
        }
    }

    // ---- helpers

    /** The section's "Save where I am now as my workplace" (geoOnly: the same link the button opens). */
    private void save(boolean geo) {
        if (!geo) { press(() -> find("Save where I am now as my workplace"), "Save"); return; }
        ctx.startActivity(new Intent(Intent.ACTION_VIEW, android.net.Uri.parse("shaati-geo://save?r=300")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    }

    /** Swiped away from the recent apps, then the home screen. */
    private void closeApp(int w, int h) throws Exception {
        d.pressRecentApps();
        pause(STEP);
        // Shaati's own card, found by its name and brought to the middle (Android's settings page for "Allow all the
        // time" leaves a Settings card in front of it), then swiped away
        boolean gone = false;
        for (int i = 0; i < 5 && !gone; i++) {
            UiObject2 label = shaatiCard();
            if (label == null) {
                Log.i(TAG, "recents: no Shaati card on screen:" + screenTexts());
                d.swipe(w / 5, h / 2, w * 4 / 5, h / 2, 40);
                pause(1200);
                continue;
            }
            Rect r = label.getVisibleBounds();
            if (Math.abs(r.centerX() - w / 2) > w / 5) {
                int dx = Math.min(Math.abs(r.centerX() - w / 2), w * 3 / 5);
                if (r.centerX() > w / 2) d.swipe(w / 2 + dx / 2, h / 2, w / 2 - dx / 2, h / 2, 40);
                else d.swipe(w / 2 - dx / 2, h / 2, w / 2 + dx / 2, h / 2, 40);
                pause(1200);
                continue;
            }
            pause(800);
            // the name sits above the card: the swipe starts in the card's middle and flicks it off the top
            d.swipe(r.centerX(), h / 2, r.centerX(), 0, 12);
            pause(1200);
            gone = shaatiCard() == null || Math.abs(shaatiCard().getVisibleBounds().centerX() - w / 2) > w / 5;
            gone = true;
        }
        Log.i(TAG, "recents: Shaati swiped away: " + gone);
        pause(1500);
        d.pressHome();
        pause(STEP);
    }

    private UiObject2 shaatiCard() {
        for (BySelector b : new BySelector[] { By.desc("Shaati"), By.text("Shaati"), By.descStartsWith("Shaati"), By.descContains("Shaati"), By.textStartsWith("Shaati") }) {
            for (UiObject2 o : d.findObjects(b)) {
                if (APP.equals(o.getApplicationPackage()) || "com.android.chrome".equals(o.getApplicationPackage())) continue; // the page itself
                return o;
            }
        }
        return null;
    }

    private String screenTexts() {
        StringBuilder s = new StringBuilder();
        try {
            for (UiObject2 o : d.findObjects(By.pkg(java.util.regex.Pattern.compile(".*")))) {
                String t = o.getText(), c = o.getContentDescription();
                if (t != null && !t.isEmpty()) s.append(" [").append(t.length() > 40 ? t.substring(0, 40) : t).append(']');
                else if (c != null && !c.isEmpty()) s.append(" {").append(c.length() > 40 ? c.substring(0, 40) : c).append('}');
            }
        } catch (Exception ignored) { }
        return s.toString();
    }

    private void tap(String text, long timeout) {
        waitFor(text, timeout);
        noTranslate();
        pause(STEP);
        // the page may redraw during the pause: found again just before the tap, and tapped where it is
        for (int i = 0; i < 4; i++) {
            UiObject2 o = find(text);
            if (o == null) { SystemClock.sleep(700); continue; }
            try {
                Rect r = o.getVisibleBounds();
                d.click(r.centerX(), r.centerY());
                return;
            } catch (androidx.test.uiautomator.StaleObjectException e) {
                SystemClock.sleep(500);
            }
        }
        fail("could not tap: " + text);
    }

    /** Taps what finder finds, found again on each try (the page may redraw), where it is on the screen. */
    private void press(java.util.concurrent.Callable<UiObject2> finder, String what) {
        for (int i = 0; i < 5; i++) {
            try {
                UiObject2 o = finder.call();
                if (o != null) {
                    Rect r = o.getVisibleBounds();
                    d.click(r.centerX(), r.centerY());
                    return;
                }
            } catch (Exception e) {
                Log.w(TAG, "press " + what, e);
            }
            SystemClock.sleep(700);
        }
        fail("could not tap: " + what);
    }

    /** Taps text, again (up to three times) until next is on the screen. */
    private void advance(String text, String next) {
        for (int i = 0; i < 3; i++) {
            tap(text, 45000);
            if (waitQuiet(next, 8000) != null) return;
            Log.i(TAG, "tapped again: " + text);
        }
        waitFor(next, 15000);
    }

    private UiObject2 waitQuiet(String text, long timeout) {
        long end = SystemClock.uptimeMillis() + timeout;
        while (SystemClock.uptimeMillis() < end) {
            UiObject2 o = find(text);
            if (o != null && o.getVisibleBounds().height() > 0) return o;
            SystemClock.sleep(500);
        }
        return null;
    }

    /** Chrome's "Translate page?" offer (it takes the page for Arabic): swiped off the top of the screen. */
    private void noTranslate() {
        try {
            UiObject2 t = d.findObject(By.pkg("com.android.chrome").textContains("Translate page"));
            if (t == null) return;
            Rect r = t.getVisibleBounds();
            d.swipe(r.centerX(), r.centerY(), r.centerX(), 0, 10);
            pause(600);
        } catch (Exception ignored) { }
    }

    private UiObject2 waitFor(String text, long timeout) {
        long end = SystemClock.uptimeMillis() + timeout;
        while (SystemClock.uptimeMillis() < end) {
            UiObject2 o = find(text);
            if (o != null) return o;
            SystemClock.sleep(500);
        }
        fail("not on the screen: " + text);
        return null;
    }

    /** The text as a whole node, its content description, or the start of a longer label (web buttons). */
    private UiObject2 find(String text) {
        for (BySelector s : new BySelector[] { By.text(text), By.desc(text), By.textStartsWith(text), By.descStartsWith(text) }) {
            UiObject2 o = d.findObject(s);
            if (o != null) return o;
        }
        return null;
    }

    private UiObject2 findIn(String pkg, String text) {
        UiObject2 o = d.findObject(By.pkg(pkg).text(text));
        return o != null ? o : d.findObject(By.pkg(pkg).desc(text));
    }

    /** The lowest match on the screen: the bottom bar's tab, not a heading with the same word. */
    private UiObject2 bottom(String text) {
        waitFor(text, 15000);
        UiObject2 best = null;
        List<UiObject2> all = new ArrayList<>(d.findObjects(By.text(text)));
        all.addAll(d.findObjects(By.desc(text)));
        all.addAll(d.findObjects(By.textStartsWith(text)));
        for (UiObject2 o : all) {
            Rect r = o.getVisibleBounds();
            if (best == null || r.centerY() > best.getVisibleBounds().centerY()) best = o;
        }
        return best;
    }

    private UiObject2 scrollTo(String text) {
        int h = d.getDisplayHeight(), w = d.getDisplayWidth();
        for (int i = 0; i < 8; i++) {
            UiObject2 o = find(text);
            if (o != null) {
                Rect r = o.getVisibleBounds();
                if (r.bottom < h * 0.85) return o;
            }
            d.swipe(w / 2, h * 7 / 10, w / 2, h * 4 / 10, 45);
            pause(900);
        }
        return waitFor(text, 5000);
    }

    /** A button of the app's own dialog (WorkGeoActivity). */
    private UiObject2 waitDialog(String res) {
        UiObject2 o = d.wait(Until.findObject(By.pkg(APP).res(res)), 25000);
        if (o == null) fail("the app's dialog did not appear (" + res + ")");
        return o;
    }

    private static void pause(long ms) {
        SystemClock.sleep(ms);
    }

    /** A shell command (as Android's shell user) and its output. */
    private String sh(String cmd) {
        StringBuilder out = new StringBuilder();
        try {
            ParcelFileDescriptor pfd = inst.getUiAutomation().executeShellCommand(cmd);
            try (InputStream in = new FileInputStream(pfd.getFileDescriptor())) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.append(new String(buf, 0, n));
            }
            pfd.close();
        } catch (Exception e) {
            Log.w(TAG, "sh " + cmd, e);
        }
        return out.toString();
    }

    /** Stops the test with the step and every text on the screen, so the report says where it stood. */
    private void fail(String why) {
        StringBuilder s = new StringBuilder(why).append(" | screen:");
        try {
            for (UiObject2 o : d.findObjects(By.pkg(java.util.regex.Pattern.compile(".*")))) {
                String t = o.getText(), c = o.getContentDescription();
                if (t != null && !t.isEmpty()) s.append(" [").append(t.length() > 60 ? t.substring(0, 60) : t).append(']');
                else if (c != null && !c.isEmpty()) s.append(" {").append(c.length() > 60 ? c.substring(0, 60) : c).append('}');
            }
        } catch (Exception ignored) { }
        Log.e(TAG, s.toString());
        throw new AssertionError(s.toString());
    }
}
