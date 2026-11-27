package io.github.leelor123.shifts;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.drawable.Icon;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.util.Collections;

/**
 * The running shift, pinned while it runs (the user, 27 Nov 2026: "the running shift on the lock screen", and then "it
 * does not look like much": the first look was plain text, the live time glued to a title with a time in it).
 *
 * Android gives a phone's lock screen no widgets of other apps; it gives a live notification. On Android 16 and later it
 * is a Live Update (requestPromotedOngoing) in Android's own progress look (Notification.ProgressStyle): a bar from the
 * shift's start to its usual length, with Shaati's coin riding on it; below 16 an ongoing notification with the same
 * words. The time counts by itself (a chronometer from the start). The bar moves on every few minutes from an alarm here,
 * with the app closed too; the words (the role, the start, about how much so far, a break) come from the web app with the
 * widgets' snapshot ("run", app/run-note.js), so the amount changes when the app runs. Its "end shift" button is the
 * widgets' own (ShaatiWidget.tap): done at once on the phone, saved by the app when it opens.
 *
 * Shown only when the user turned it on (Settings › notifications, or the question at the first shift) and a shift runs;
 * closed as soon as there is none: the snapshot says so, or a stop was tapped on a widget, the tile or here
 * (WidgetData.updateAll runs this after each).
 */
final class RunningNote {
    static final String TAG = "shaati-running";
    static final String TICK = "io.github.leelor123.shifts.RUN_TICK";
    // v2: default importance (it sorts above the day's other notifications; each showing is silent): a channel's
    // importance cannot be raised once made, so the first one (low, 1.46.0) is left behind
    private static final String CHANNEL = "shaati_running_v2";
    private static final int COLOR = 0xFF2F5BD3;
    private static final long MIN = 60000L;
    /** The bar moves on this often while the app is closed (an inexact alarm: the phone groups it with others). */
    private static final long EVERY = 5 * MIN;
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
                tick(c, false);
                return;
            }
            post(c, nm, a, run);
            tick(c, true);
        } catch (Exception e) {
            android.util.Log.w("ShaatiRun", "sync", e);
        }
    }

    /** The alarm that moves the bar on while the shift runs (NoteAlarm hands it back to sync). */
    private static void tick(Context c, boolean on) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(c, NoteAlarm.class).setAction(TICK);
        PendingIntent p = PendingIntent.getBroadcast(c, 7402, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (on) am.setAndAllowWhileIdle(AlarmManager.RTC, System.currentTimeMillis() + EVERY, p);
        else am.cancel(p);
    }

    private static void post(Context c, NotificationManager nm, JSONObject a, JSONObject run) {
        Context lc = WidgetLang.context(c);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, lc.getString(R.string.w_ch_run), NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription(lc.getString(R.string.w_ch_run_d));
            ch.setShowBadge(false);
            ch.setSound(null, null);
            ch.enableVibration(false);
            nm.createNotificationChannel(ch);
            try { nm.deleteNotificationChannel("shaati_running"); } catch (Exception e) { /* none */ }
        }
        long start = a.optLong("start"), now = System.currentTimeMillis();
        boolean onBreak = a.optLong("breakAt", 0) > 0 || run.optBoolean("onBreak", false);
        String title = run.optString("title"), body = run.optString("body"), pub = run.optString("pub", title);
        long total = Math.max(60 * MIN, run.optLong("total", 8 * 60 * MIN));
        Bitmap coin = NoteCenter.bitmap(c, R.drawable.w_coin_happy);
        PendingIntent stop = ShaatiWidget.tap(c, "stop", 7401), open = NoteCenter.open(c, "./#home", 7400);
        Notification n;
        if (Build.VERSION.SDK_INT >= 36) {
            // Android's own live look: the bar from the start to the usual length, the coin riding on it
            int max = (int) (total / MIN), done = (int) Math.min(max, Math.max(0, (now - start) / MIN));
            Notification.ProgressStyle ps = new Notification.ProgressStyle()
                    .setStyledByProgress(true)
                    .setProgressSegments(Collections.singletonList(new Notification.ProgressStyle.Segment(max).setColor(COLOR)))
                    .setProgress(done);
            if (coin != null) ps.setProgressTrackerIcon(Icon.createWithBitmap(coin));
            Notification.Builder pb = platform(c, start, onBreak, open).setContentTitle(pub);
            Notification.Builder b = platform(c, start, onBreak, open)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(ps)
                    .setPublicVersion(pb.build())
                    .addAction(new Notification.Action.Builder(null, lc.getString(R.string.w_geo_stop), stop).build());
            // the coin rides on the bar: no second one in the corner
            n = b.build();
        } else {
            Notification pubN = compat(c, start, onBreak, open).setContentTitle(pub).build();
            NotificationCompat.Builder b = compat(c, start, onBreak, open)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setPublicVersion(pubN)
                    .setLargeIcon(coin)
                    .addAction(0, lc.getString(R.string.w_geo_stop), stop);
            n = b.build();
        }
        n.extras.putBoolean(PROMOTED, true);
        nm.notify(TAG, 1, n);
    }

    private static Notification.Builder platform(Context c, long start, boolean onBreak, PendingIntent open) {
        return new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification_icon)
                .setColor(COLOR)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_STOPWATCH)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .setContentIntent(open)
                .setWhen(start)
                .setShowWhen(true)
                .setUsesChronometer(!onBreak);
    }

    private static NotificationCompat.Builder compat(Context c, long start, boolean onBreak, PendingIntent open) {
        return new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification_icon)
                .setColor(COLOR)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setCategory("stopwatch")
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setContentIntent(open)
                // the time since the start counts by itself; on a break it stands still at the start
                .setWhen(start)
                .setShowWhen(true)
                .setUsesChronometer(!onBreak);
    }
}
