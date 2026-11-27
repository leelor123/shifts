package io.github.leelor123.shifts;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

/**
 * The running shift, pinned while it runs (the user, 27 Nov 2026: "the running shift on the lock screen").
 *
 * Android gives a phone's lock screen no widgets of other apps; what it gives is a live notification: on Android 16 and
 * later a "Live Update" (requestPromotedOngoing: pinned at the top of the lock screen and of the shade, with a chip in the
 * status bar), below it an ongoing notification. The time counts by itself (a chronometer from the shift's start), with
 * the app closed too; the words (the start, about how much so far, a break) come from the web app with the widgets'
 * snapshot ("run", app/run-note.js), so they change when the app runs. Its "end shift" button is the widgets' own
 * (ShaatiWidget.tap): done at once on the phone, saved by the app when it opens.
 *
 * Shown only when the user turned it on (Settings › notifications, or the question at the first shift) and a shift
 * runs; closed as soon as there is none: the snapshot says so, or a stop was tapped on a widget, the tile or here
 * (WidgetData.updateAll runs this after each).
 */
final class RunningNote {
    static final String TAG = "shaati-running";
    private static final String CHANNEL = "shaati_running";
    private static final int COLOR = 0xFF2F5BD3;
    // Notification.EXTRA_REQUEST_PROMOTED_ONGOING (Android 16): asked through the extras, as NotificationCompat does
    private static final String PROMOTED = "android.requestPromotedOngoing";

    private RunningNote() {}

    /** Shows, updates or closes it to match the last snapshot and the taps since. */
    static void sync(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        try {
            JSONObject d = WidgetData.load(c);
            JSONObject a = d == null ? null : d.optJSONObject("active");
            JSONObject run = d == null ? null : d.optJSONObject("run");
            if (a == null || run == null || a.optLong("start", 0) <= 0 || a.optLong("start", 0) != run.optLong("start", -1)) {
                nm.cancel(TAG, 1);
                return;
            }
            post(c, nm, a, run);
        } catch (Exception e) {
            android.util.Log.w("ShaatiRun", "sync", e);
        }
    }

    private static void post(Context c, NotificationManager nm, JSONObject a, JSONObject run) {
        Context lc = WidgetLang.context(c);
        if (Build.VERSION.SDK_INT >= 26) {
            // low: no sound and no buzz each time the words change, and still shown in full (a Live Update must not be min)
            NotificationChannel ch = new NotificationChannel(CHANNEL, lc.getString(R.string.w_ch_run), NotificationManager.IMPORTANCE_LOW);
            ch.setDescription(lc.getString(R.string.w_ch_run_d));
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        long start = a.optLong("start");
        boolean onBreak = a.optLong("breakAt", 0) > 0 || run.optBoolean("onBreak", false);
        String title = run.optString("title"), body = run.optString("body");
        // on the lock screen of a phone that hides private content: the start and the time, never the amount
        Notification pub = base(c, lc, start, onBreak).setContentTitle(run.optString("pub", title)).build();
        NotificationCompat.Builder b = base(c, lc, start, onBreak)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPublicVersion(pub)
                .setLargeIcon(NoteCenter.bitmap(c, R.drawable.w_coin_happy))
                .addAction(0, lc.getString(R.string.w_geo_stop), ShaatiWidget.tap(c, "stop", 7401));
        Notification n = b.build();
        n.extras.putBoolean(PROMOTED, true);
        nm.notify(TAG, 1, n);
    }

    private static NotificationCompat.Builder base(Context c, Context lc, long start, boolean onBreak) {
        return new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification_icon)
                .setColor(COLOR)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setCategory("stopwatch")
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setContentIntent(NoteCenter.open(c, "./#home", 7400))
                // the time since the start counts by itself; on a break it stands still at the start
                .setWhen(start)
                .setShowWhen(true)
                .setUsesChronometer(!onBreak);
    }
}
