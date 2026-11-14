package io.github.leelor123.shifts;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.service.notification.StatusBarNotification;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Shaati's notifications, shown by the phone itself at their time, also while the app is closed (9 Nov 2026: they came
 * only when the app was opened; Chrome never lets the web app look in the background inside this app).
 *
 * The web app works out, while open, the notifications of the coming week in words (src/core/noteplan.js) and sends the
 * list over the widgets' message channel ({"notes": 1, "plan": [...]}, LauncherActivity); what it sends now comes the
 * same way ({"notes": 1, "show": [...]}). The list is kept here and the phone's alarm wakes this up for the next one
 * (NoteAlarm), and again after a restart, an update or a change of the clock. Each tag is shown once; one that comes
 * late (the phone was off) is shown only while it still makes sense ("until").
 *
 * A note: { at, tag, type, title, body, sub, ch: "shifts" | "money", url, when, until, acts: [{ id, title, url }] }.
 */
final class NoteCenter {
    private static final String PREFS = "shaati_notes";
    private static final String PLAN = "plan";
    private static final String SHOWN = "shown";
    static final String ACTION = "io.github.leelor123.shifts.NOTE_ALARM";
    private static final String GROUP = "shaati";
    private static final String SUMMARY = "shaati-summary";
    private static final long MIN = 60000L, DAY = 24 * 60 * MIN;
    /** Close enough to the time: shown now. */
    private static final long EARLY = 30000L;
    private static final int COLOR = 0xFF2F5BD3;
    private static final String SITE = "https://leelor123.github.io/shifts/";

    private NoteCenter() {}

    /** A message from the web app (LauncherActivity): the list of the coming days, the ones to show now, or both. */
    static void receive(Context c, String json) {
        JSONObject o;
        try {
            o = new JSONObject(json);
        } catch (Exception e) {
            return;
        }
        if (o.optInt("notes", 0) < 1) return;
        JSONArray plan = o.optJSONArray("plan");
        if (plan != null) prefs(c).edit().putString(PLAN, plan.toString()).apply();
        JSONArray keep = o.optJSONArray("keep");
        if (keep != null) closeGone(c, keep);
        JSONArray show = o.optJSONArray("show");
        if (show != null) for (int i = 0; i < show.length(); i++) {
            JSONObject n = show.optJSONObject(i);
            if (n != null && !shown(c, n.optString("tag"))) post(c, n);
        }
        run(c);
    }

    /** Shows what is due and sets the alarm for the next one (the alarm, a restart and every new list come here). */
    static void run(Context c) {
        long now = System.currentTimeMillis(), next = Long.MAX_VALUE;
        JSONArray plan = plan(c);
        for (int i = 0; i < plan.length(); i++) {
            JSONObject n = plan.optJSONObject(i);
            if (n == null) continue;
            String tag = n.optString("tag");
            if (tag.isEmpty() || shown(c, tag)) continue;
            long at = n.optLong("at", 0), until = n.optLong("until", at + DAY);
            if (at <= now + EARLY) {
                if (now <= until) post(c, n);
                else mark(c, tag); // too late to make sense (the phone was off): never shown
            } else if (at < next) next = at;
        }
        schedule(c, next);
    }

    /**
     * The next wake-up. Exact when the phone allows it (below Android 12, or the user allowed alarms); otherwise two:
     * a window just before the time (the phone keeps it outside its deep sleep) that sets a close one, and an alarm that
     * may run in deep sleep too, for the time itself.
     */
    private static void schedule(Context c, long at) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent near = alarm(c, 0), early = alarm(c, 1);
        am.cancel(early);
        if (at == Long.MAX_VALUE) {
            am.cancel(near);
            return;
        }
        long lead = at - System.currentTimeMillis();
        try {
            if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, near);
                return;
            }
        } catch (SecurityException e) {
            // not allowed after all: the inexact ones below
        }
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, near);
        if (lead > 15 * MIN) am.setWindow(AlarmManager.RTC_WAKEUP, at - 10 * MIN, 10 * MIN, early);
    }

    private static PendingIntent alarm(Context c, int code) {
        Intent i = new Intent(c, NoteAlarm.class).setAction(ACTION);
        return PendingIntent.getBroadcast(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** The address a tap opens, inside the app (always on Shaati's own site; anything else opens the home screen). */
    private static Uri address(String url) {
        Uri base = Uri.parse(SITE);
        String u = url == null ? "" : url;
        if (u.startsWith("./")) u = SITE + u.substring(2);
        Uri r = Uri.parse(u);
        if (!"https".equals(r.getScheme()) || !base.getHost().equals(r.getHost()) || r.getPath() == null || !r.getPath().startsWith("/shifts/")) r = Uri.parse(SITE + "#home");
        // the page knows it runs inside the app (no website checkout, the widgets' channel)
        return r.buildUpon().appendQueryParameter("source", "twa").build();
    }

    static PendingIntent open(Context c, String url, int code) {
        Intent i = new Intent(Intent.ACTION_VIEW, address(url), c, LauncherActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** The coin of Shaati in the mood of the news: cool before a shift, sleepy for a timer left on, party for good news. */
    private static int coin(String type) {
        switch (type) {
            case "upcoming": return R.drawable.w_coin_cool;
            case "timer": return R.drawable.w_coin_sleepy;
            case "confirmDone": case "backup": return R.drawable.w_coin_happy;
            case "payslipDue": case "taxrefund": case "holidayPay": return R.drawable.w_coin_wow;
            default: return R.drawable.w_coin_party;
        }
    }

    private static Bitmap bitmap(Context c, int res) {
        try {
            Drawable d = c.getDrawable(res);
            if (d == null) return null;
            int s = (int) (64 * c.getResources().getDisplayMetrics().density);
            Bitmap b = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
            Canvas cv = new Canvas(b);
            // the coin is a little taller than wide: centred in the square
            int w = s * d.getIntrinsicWidth() / Math.max(1, d.getIntrinsicHeight());
            d.setBounds((s - w) / 2, 0, (s + w) / 2, s);
            d.draw(cv);
            return b;
        } catch (Exception e) {
            return null;
        }
    }

    static void channels(Context c, NotificationManager nm) {
        if (Build.VERSION.SDK_INT < 26) return;
        Context lc = WidgetLang.context(c);
        NotificationChannel s = new NotificationChannel("shaati_shifts", lc.getString(R.string.w_ch_shifts), NotificationManager.IMPORTANCE_HIGH);
        s.setDescription(lc.getString(R.string.w_ch_shifts_d));
        NotificationChannel m = new NotificationChannel("shaati_money", lc.getString(R.string.w_ch_money), NotificationManager.IMPORTANCE_DEFAULT);
        m.setDescription(lc.getString(R.string.w_ch_money_d));
        // made again with each one: the names follow the app's language
        nm.createNotificationChannel(s);
        nm.createNotificationChannel(m);
    }

    /** Shows one note now, in Shaati's look, and remembers its tag. */
    static void post(Context c, JSONObject n) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        String tag = n.optString("tag");
        if (nm == null || tag.isEmpty()) return;
        try {
            channels(c, nm);
            boolean shift = "shifts".equals(n.optString("ch"));
            String body = n.optString("body");
            long when = n.optLong("when", 0);
            NotificationCompat.Builder b = new NotificationCompat.Builder(c, shift ? "shaati_shifts" : "shaati_money")
                    .setSmallIcon(R.drawable.ic_notification_icon)
                    .setColor(COLOR)
                    .setContentTitle(n.optString("title"))
                    .setContentText(body)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setAutoCancel(true)
                    .setGroup(GROUP)
                    .setCategory(shift ? NotificationCompat.CATEGORY_REMINDER : NotificationCompat.CATEGORY_EVENT)
                    .setPriority(shift ? NotificationCompat.PRIORITY_HIGH : NotificationCompat.PRIORITY_DEFAULT)
                    .setContentIntent(open(c, n.optString("url"), tag.hashCode()))
                    .setWhen(when > 0 ? when : System.currentTimeMillis())
                    .setShowWhen(true);
            String sub = n.optString("sub");
            if (!sub.isEmpty()) b.setSubText(sub);
            Bitmap coin = bitmap(c, coin(n.optString("type")));
            if (coin != null) b.setLargeIcon(coin);
            JSONArray acts = n.optJSONArray("acts");
            if (acts != null) for (int i = 0; i < acts.length() && i < 2; i++) {
                JSONObject a = acts.optJSONObject(i);
                if (a != null) b.addAction(0, a.optString("title"), open(c, a.optString("url"), tag.hashCode() + 1 + i));
            }
            nm.notify(tag, 1, b.build());
            mark(c, tag);
            summary(c, nm);
        } catch (Exception e) {
            android.util.Log.w("ShaatiNotes", "post " + tag, e);
        }
    }

    /**
     * Closes each of ours on the screen whose reason is gone: the web app sends the tags still true now ("keep") whenever
     * it checks (the payslip came in, the shift was confirmed, the timer stopped: 9 Nov 2026, the payslip notification
     * stayed after the payslip was uploaded). Only ours (the "shaati" group); what Chrome shows for the web app stays.
     */
    private static void closeGone(Context c, JSONArray keep) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || Build.VERSION.SDK_INT < 23) return;
        java.util.HashSet<String> stay = new java.util.HashSet<>();
        for (int i = 0; i < keep.length(); i++) stay.add(keep.optString(i));
        int left = 0;
        for (StatusBarNotification s : nm.getActiveNotifications()) {
            String tag = s.getTag();
            if (tag == null || SUMMARY.equals(tag) || !GROUP.equals(s.getNotification().getGroup())) continue;
            if (stay.contains(tag)) left++;
            else nm.cancel(tag, s.getId());
        }
        if (left < 2) nm.cancel(SUMMARY, 1);
    }

    /** Two or more of ours on the screen: one group under Shaati's name, not a row of loose ones. */
    private static void summary(Context c, NotificationManager nm) {
        if (Build.VERSION.SDK_INT < 24) return;
        int ours = 0;
        for (StatusBarNotification s : nm.getActiveNotifications()) if (s.getTag() != null && !SUMMARY.equals(s.getTag()) && GROUP.equals(s.getNotification().getGroup())) ours++;
        if (ours < 2) return;
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, "shaati_money")
                .setSmallIcon(R.drawable.ic_notification_icon)
                .setColor(COLOR)
                .setGroup(GROUP)
                .setGroupSummary(true)
                .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
                .setAutoCancel(true)
                .setContentIntent(open(c, "./#home", 7300));
        nm.notify(SUMMARY, 1, b.build());
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONArray plan(Context c) {
        try {
            return new JSONArray(prefs(c).getString(PLAN, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static JSONObject shownList(Context c) {
        try {
            return new JSONObject(prefs(c).getString(SHOWN, "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static boolean shown(Context c, String tag) {
        return shownList(c).has(tag);
    }

    /** Remembers a tag as shown (a week is enough: the web app never sends an older one). */
    private static void mark(Context c, String tag) {
        JSONObject o = shownList(c);
        long now = System.currentTimeMillis();
        try {
            o.put(tag, now);
            JSONObject keep = new JSONObject();
            for (java.util.Iterator<String> it = o.keys(); it.hasNext(); ) {
                String k = it.next();
                if (now - o.optLong(k, 0) < 8 * DAY) keep.put(k, o.optLong(k, 0));
            }
            prefs(c).edit().putString(SHOWN, keep.toString()).commit();
        } catch (Exception e) {
            // a broken list: started again
            prefs(c).edit().putString(SHOWN, "{}").apply();
        }
    }

    /** Whether a message from the web app is for this (the widgets get the others). */
    static boolean isNotes(String message) {
        return message != null && message.startsWith("{\"notes\"");
    }
}
