package io.github.leelor123.shifts.videotest;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Rect;
import android.location.Location;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.util.Log;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
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
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * 1.39's several workplaces, on a real Android with Google Play services (Firebase Test Lab): two places saved by
 * their setup links (as the page opens them), p1 at A and p2 ("snif sheni", Hebrew) at B about 2 km north; both
 * circles registered; arriving at B shows the suggestion with p2's name as its sub-text and the start button; then
 * at A the suggestion for p1, whose "turn off" button removes p1 only, and p2 stays registered.
 * Location permissions are granted by the shell (the one-place test taps them); the disclosure is tapped.
 * Every check logs "CHECK <name>: true|false" under the tag ShaatiMulti.
 */
@RunWith(AndroidJUnit4.class)
public class MultiPlaceTest {
    private static final String TAG = "ShaatiMulti";
    private static final String APP = "io.github.leelor123.shifts";
    private static final String SELF = "io.github.leelor123.shifts.videotest";
    private static final double A_LAT = 32.07775, A_LNG = 34.77408;
    private static final double B_LAT = A_LAT + 0.018, B_LNG = A_LNG; // about 2 km north
    private static final double AWAY_LAT = A_LAT + 0.05;               // 3.5 km beyond B
    // "snif sheni" in Hebrew, written as escapes
    private static final String NAME2 = "סניף שני";
    private static final String NAME1 = "Main branch";
    private static final String DIR = "/sdcard/Download/shaati-video";

    private Instrumentation inst;
    private UiDevice d;
    private Context ctx;
    private FusedLocationProviderClient flp;
    private volatile double lat = A_LAT, lng = A_LNG;
    private volatile boolean mocking;
    private int failures;

    @Test
    public void severalWorkplaces() throws Exception {
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
        if (failures > 0) throw new AssertionError(failures + " check(s) failed, see CHECK lines in logcat");
    }

    private void prepare() {
        sh("svc power stayon true");
        sh("settings put system screen_off_timeout 1800000");
        sh("input keyevent KEYCODE_WAKEUP");
        sh("wm dismiss-keyguard");
        sh("cmd location set-location-enabled true");
        sh("am force-stop " + APP);
        sh("pm grant " + APP + " android.permission.POST_NOTIFICATIONS");
        sh("pm grant " + APP + " android.permission.ACCESS_FINE_LOCATION");
        sh("pm grant " + APP + " android.permission.ACCESS_COARSE_LOCATION");
        sh("pm grant " + APP + " android.permission.ACCESS_BACKGROUND_LOCATION");
        sh("pm grant " + SELF + " android.permission.ACCESS_FINE_LOCATION");
        sh("pm grant " + SELF + " android.permission.ACCESS_COARSE_LOCATION");
        sh("appops set " + SELF + " android:mock_location allow");
        sh("appops set com.android.shell android:mock_location allow");
        for (String p : new String[] { "gps", "network" }) {
            sh("cmd location providers add-test-provider " + p);
            sh("cmd location providers set-test-provider-enabled " + p + " true");
        }
        sh("rm -rf " + DIR);
        sh("mkdir -p " + DIR);
        d.pressHome();
        pause(1500);
    }

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
        pause(5000);
    }

    private void flow() throws Exception {
        // 1. p1 at A
        Log.i(TAG, "step: save p1 at A");
        save("p1", NAME1);
        // 2. p2 at B
        lat = B_LAT;
        lng = B_LNG;
        pause(12000);
        Log.i(TAG, "step: save p2 at B");
        save("p2", NAME2);
        pause(4000);
        String fences = geofences("both");
        check("both circles registered (p1 and p2)", hasFence(fences, "p1") && hasFence(fences, "p2"));

        // 3. away, then at B and staying: the suggestion for p2
        lat = AWAY_LAT;
        Log.i(TAG, "step: away");
        SystemClock.sleep(150000);
        lat = B_LAT;
        Log.i(TAG, "step: at B");
        String note = waitNote(13, false);
        check("arrival notification at B", note != null);
        if (note != null) {
            logNote(note);
            check("notification sub-text is p2's name (dumpsys)", subText(note, NAME2));
            UiObject2 start = openNote();
            check("start button shown", start != null);
            check("p2's name on the screen", d.findObject(By.pkg("com.android.systemui").text(NAME2)) != null
                    || d.findObject(By.pkg("com.android.systemui").textContains(NAME2)) != null);
            Log.i(TAG, "shade:" + screenTexts());
            d.pressBack();
            pause(1500);
            d.pressHome();
            pause(1500);
        }

        // 4. at A: the suggestion for p1, and its "turn off" button removes p1 only
        lat = A_LAT;
        Log.i(TAG, "step: at A");
        String note1 = waitNote(11, true);
        check("arrival notification at A", note1 != null);
        boolean tapped = false;
        if (note1 != null) {
            logNote(note1);
            check("notification sub-text is p1's name (dumpsys)", subText(note1, NAME1));
            openNote();
            UiObject2 off = d.findObject(By.pkg("com.android.systemui").text(Pattern.compile("(?i)turn off suggestions")));
            if (off != null) { off.click(); tapped = true; }
            Log.i(TAG, "turn off tapped: " + tapped + screenTexts());
            pause(6000);
            d.pressHome();
            pause(1500);
        }
        check("p1's turn off button tapped", tapped);
        String after = geofences("after-off");
        check("p1 gone from the circles", !hasFence(after, "p1"));
        check("p2 still registered", hasFence(after, "p2"));
        check("p1's notification closed", !sh("dumpsys notification --noredact").contains("geo-arrive"));
    }

    /** The setup link, as the page opens it, then the disclosure's Continue (and Play services' window, if any). */
    private void save(String id, String name) {
        String url = "shaati-geo://save?r=300&id=" + id + "&n=" + Uri.encode(name) + "&e=emp" + id;
        ctx.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        UiObject2 go = d.wait(Until.findObject(By.pkg(APP).res("android:id/button1")), 25000);
        if (go == null) { check("disclosure shown for " + id, false); return; }
        pause(1500);
        go.click();
        // Google Play services' window for Google Location Accuracy (after a 1000 refusal): its "turn on"
        long end = SystemClock.uptimeMillis() + 20000;
        while (SystemClock.uptimeMillis() < end) {
            UiObject2 b = d.findObject(By.pkg("com.google.android.gms").text(Pattern.compile("(?i)turn on|ok|agree|yes")));
            if (b != null) { Log.i(TAG, "Play services window: " + b.getText()); b.click(); pause(3000); }
            if (d.findObject(By.pkg(APP)) == null && d.findObject(By.pkg("com.google.android.gms").clickable(true)) == null) break;
            pause(800);
        }
        pause(2500);
        Log.i(TAG, "saved " + id + ": screen" + screenTexts());
    }

    /** Google Play services' geofence dumps: saved to the pulled folder, and the lines about this app logged. */
    private String geofences(String label) {
        StringBuilder all = new StringBuilder();
        String[] cmds = {
                "dumpsys activity service com.google.android.gms/com.google.android.location.internal.GoogleLocationManagerService",
                "dumpsys location",
        };
        for (String c : cmds) all.append("#### ").append(c).append('\n').append(sh(c)).append('\n');
        String s = all.toString();
        sh("mkdir -p " + DIR);
        try {
            java.io.File f = new java.io.File(ctx.getExternalFilesDir(null), "geo-" + label + ".txt");
            try (java.io.FileOutputStream o = new java.io.FileOutputStream(f)) { o.write(s.getBytes("UTF-8")); }
            sh("cp " + f.getAbsolutePath() + " " + DIR + "/geo-" + label + ".txt");
        } catch (Exception e) {
            Log.w(TAG, "dump file", e);
        }
        int n = 0;
        for (String line : s.split("\n")) {
            if (n > 80) break;
            String l = line.trim();
            if (l.length() > 400) l = l.substring(0, 400);
            if ((l.contains(APP) && !l.contains(SELF)) || l.matches("(?i).*geofenc.*") && (l.contains("p1") || l.contains("p2"))) {
                Log.i(TAG, "fence[" + label + "] " + l);
                n++;
            }
        }
        Log.i(TAG, "fence[" + label + "] dump length " + s.length());
        return s;
    }

    /** A circle with this request id in the dump of this app's geofences. */
    private static boolean hasFence(String dump, String id) {
        for (String l : dump.split("\n")) {
            if (!l.matches("(?i).*geofenc.*") && !l.contains("io.github.leelor123.shifts")) continue;
            if (Pattern.compile("(?i)(requestid|id)[=: \"]+" + id + "\\b").matcher(l).find() || l.contains("\"" + id + "\"")
                    || l.contains("[" + id + "]") || l.contains(" " + id + " ") || l.contains("=" + id + ",") || l.contains("=" + id + " ")) return true;
        }
        return false;
    }

    /** Waits (minutes) for the app's arrival notification; its dumpsys record, or null. */
    private String waitNote(int minutes, boolean goneFirst) {
        // the suggestion before (another place) closes first: leaving its circle cancels it
        long gone = SystemClock.uptimeMillis() + 4 * 60000L;
        while (goneFirst && SystemClock.uptimeMillis() < gone && sh("dumpsys notification --noredact").contains("geo-arrive")) SystemClock.sleep(5000);
        Log.i(TAG, "earlier suggestion closed: " + !sh("dumpsys notification --noredact").contains("geo-arrive"));
        long until = SystemClock.uptimeMillis() + minutes * 60000L;
        while (SystemClock.uptimeMillis() < until) {
            String s = sh("dumpsys notification --noredact");
            if (s.contains("geo-arrive")) return s;
            SystemClock.sleep(10000);
        }
        return null;
    }

    /** A sub-text line in the dump that carries the name. */
    private static boolean subText(String dump, String name) {
        for (String l : dump.split("\n")) if (l.contains("subText") && l.contains(name)) return true;
        return false;
    }

    private void logNote(String dump) {
        String[] lines = dump.split("\n");
        for (int i = 0; i < lines.length; i++) {
            if (!lines[i].contains("geo-arrive")) continue;
            for (int j = i; j < Math.min(lines.length, i + 60); j++) {
                String l = lines[j].trim();
                if (l.contains("tag=geo") || l.startsWith("android.title") || l.startsWith("android.text") || l.startsWith("android.subText")
                        || l.contains("actions=") || l.matches("\\[\\d+\\].*")) Log.i(TAG, "note: " + l);
            }
            return;
        }
    }

    /** The shade, the suggestion opened with its buttons: the start button, or null. */
    private UiObject2 openNote() {
        int h = d.getDisplayHeight();
        d.openNotification();
        UiObject2 note = d.wait(Until.findObject(By.textStartsWith("Arrived at work?")), 10000);
        pause(2000);
        Pattern startP = Pattern.compile("(?i)start shift");
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
        return d.findObject(By.pkg("com.android.systemui").text(startP));
    }

    private void check(String what, boolean ok) {
        Log.i(TAG, "CHECK " + what + ": " + ok);
        if (!ok) failures++;
    }

    private String screenTexts() {
        StringBuilder s = new StringBuilder();
        try {
            for (UiObject2 o : d.findObjects(By.pkg(Pattern.compile(".*")))) {
                String t = o.getText(), c = o.getContentDescription();
                if (t != null && !t.isEmpty()) s.append(" [").append(t.length() > 40 ? t.substring(0, 40) : t).append(']');
                else if (c != null && !c.isEmpty()) s.append(" {").append(c.length() > 40 ? c.substring(0, 40) : c).append('}');
            }
        } catch (Exception ignored) { }
        return s.toString();
    }

    private static void pause(long ms) {
        SystemClock.sleep(ms);
    }

    private String sh(String cmd) {
        StringBuilder out = new StringBuilder();
        try {
            ParcelFileDescriptor pfd = inst.getUiAutomation().executeShellCommand(cmd);
            try (InputStream in = new FileInputStream(pfd.getFileDescriptor())) {
                byte[] buf = new byte[8192];
                int n;
                java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
                while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                out.append(b.toString("UTF-8"));
            }
            pfd.close();
        } catch (Exception e) {
            Log.w(TAG, "sh " + cmd, e);
        }
        return out.toString();
    }
}
