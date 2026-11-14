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
import androidx.test.uiautomator.Direction;
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

    @Test
    public void locationDeclarationVideo() throws Exception {
        inst = InstrumentationRegistry.getInstrumentation();
        ctx = inst.getContext();
        d = UiDevice.getInstance(inst);
        prepare();
        startMock();
        try {
            flow();
        } finally {
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
        pause(STEP);
        english.click();
        tap("Just look around (sample data)", 45000);
        tap("Continue as a guest, without an account", 30000);
        tap("Continue as a guest", 15000);
        tap("I have read and agree to the terms of use and the privacy policy", 20000);
        tap("Agree and continue", 10000);
        waitFor("Start shift", 30000);
        pause(STEP + 1000);

        // 2. Settings › My work › Suggestion when you arrive at work: Off
        bottom("Settings").click();
        tap("My work", 15000);
        UiObject2 row = waitFor("Suggestion when you arrive at work", 15000);
        pause(STEP);
        row.click();
        UiObject2 save = scrollTo("Save where I am now as my workplace");
        pause(STEP + 1000);

        // 3-4. the disclosure, then "Not now": nothing is asked, the app keeps working
        save.click();
        UiObject2 notNow = waitDialog("android:id/button2");
        pause(STEP + 3000); // time to read the disclosure
        notNow.click();
        pause(STEP);
        int h = d.getDisplayHeight(), w = d.getDisplayWidth();
        d.swipe(w / 2, h * 3 / 5, w / 2, h * 2 / 5, 40);
        pause(1500);
        d.swipe(w / 2, h * 2 / 5, w / 2, h * 3 / 5, 40);
        pause(STEP);

        // 5. again: the disclosure, then "Continue"
        save = scrollTo("Save where I am now as my workplace");
        save.click();
        UiObject2 go = waitDialog("android:id/button1");
        pause(STEP + 1500);
        go.click();

        // 6. Android's prompt: Precise, While using the app
        UiObject2 fine = d.wait(Until.findObject(By.res("com.android.permissioncontroller:id/permission_location_accuracy_radio_fine")), 15000);
        if (fine != null && !fine.isChecked()) { pause(1200); fine.click(); }
        UiObject2 whileUsing = d.wait(Until.findObject(By.res("com.android.permissioncontroller:id/permission_allow_foreground_only_button")), 15000);
        if (whileUsing == null) fail("Android's location prompt did not appear");
        pause(STEP);
        whileUsing.click();

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

        // 8. the toast and "On"
        UiObject2 on = d.wait(Until.findObject(By.text("On")), 20000);
        if (on == null) on = d.wait(Until.findObject(By.desc("On")), 3000);
        Log.i(TAG, "section shows On: " + (on != null));
        pause(STEP + 3000);
        if (on == null) fail("the section never showed On");

        // 9. the app is closed (swiped away from the recent apps)
        d.pressRecentApps();
        pause(STEP);
        d.swipe(w / 2, h / 2, w / 2, h / 12, 25);
        pause(1500);
        d.pressHome();
        pause(STEP);

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

        // 11. the notification, on the screen
        d.openNotification();
        UiObject2 note = d.wait(Until.findObject(By.text("Arrived at work?")), 10000);
        pause(STEP);
        if (note != null && d.findObject(By.text("Turn off suggestions")) == null) {
            note.swipe(Direction.DOWN, 0.6f);
            pause(1500);
        }
        pause(8000);
    }

    // ---- helpers

    private void tap(String text, long timeout) {
        UiObject2 o = waitFor(text, timeout);
        pause(STEP);
        o.click();
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
        pause(STEP);
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
