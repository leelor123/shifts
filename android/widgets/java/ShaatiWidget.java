package io.github.leelor123.shifts;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.Calendar;

/**
 * What every Shaati widget shares: drawing from the last snapshot (WidgetData) in the look chosen for that
 * widget (WidgetLook), starting and ending a shift right on the home screen (WidgetData keeps the tap for the
 * app), opening the app, the running shift's clock
 * (counted by the phone itself, so it ticks without the app), and the days left until payday (counted on the
 * phone, so it is right every morning).
 *
 * The snapshot (JSON, all money already written out by the app):
 *   v, at, period, periodTo (yyyy-mm-dd), gross, net, hours, shifts, today, pace,
 *   goal {pct, of, left}, payday {date, amount}, saving {name, pct, left},
 *   active {start (epoch ms), breakAt (epoch ms or 0), role, rate}
 */
abstract class ShaatiWidget extends AppWidgetProvider {
    static final String SITE = "https://leelor123.github.io/shifts/?source=twa";

    /** The widget's picture for this snapshot (d null = the app was never opened since the widget was added). */
    abstract RemoteViews build(Context c, JSONObject d, WidgetLook l);

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        JSONObject d = WidgetData.load(c);
        for (int id : ids) m.updateAppWidget(id, build(c, d, WidgetLook.forWidget(c, id)));
    }

    /** A start or end button was tapped (tap(), below): done on the home screen, the app saves it when it opens. */
    static final String TAP = "io.github.leelor123.shifts.WIDGET_TAP";

    @Override
    public void onReceive(Context c, Intent i) {
        if (!TAP.equals(i.getAction())) { super.onReceive(c, i); return; }
        String type = i.getData() == null ? "" : i.getData().getLastPathSegment();
        JSONObject d = WidgetData.load(c);
        JSONObject a = d == null ? null : d.optJSONObject("active");
        if ("start".equals(type) && direct(d) && a == null && d.optJSONObject("next") != null) {
            WidgetData.tap(c, "start");
            Toast.makeText(c.getApplicationContext(), c.getString(R.string.w_started), Toast.LENGTH_SHORT).show();
        } else if ("stop".equals(type) && direct(d) && a != null) {
            long breakAt = a.optLong("breakAt", 0);
            long min = Math.max(0, ((breakAt > 0 ? breakAt : System.currentTimeMillis()) - a.optLong("start", 0) - a.optLong("breakMs", 0)) / 60000);
            WidgetData.tap(c, "stop");
            String hm = String.format(java.util.Locale.ROOT, "%d:%02d", min / 60, min % 60);
            Toast.makeText(c.getApplicationContext(), c.getString(R.string.w_ended, hm), Toast.LENGTH_LONG).show();
        } else {
            WidgetData.updateAll(c); // a tap the picture no longer matched (an old widget picture): draw it fresh
        }
    }

    /** The app that sent this snapshot saves the taps (snapshot "taps"); an older one never would, so it opens. */
    static boolean direct(JSONObject d) {
        return d != null && d.optInt("taps", 0) >= 1;
    }

    /** The start / end button: done right here, without opening the app. */
    static PendingIntent tap(Context c, String type, int request) {
        Intent i = new Intent(TAP, Uri.parse("shaati://widget/" + type), c, ShiftWidget.class);
        return PendingIntent.getBroadcast(c, request, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onDeleted(Context c, int[] ids) {
        for (int id : ids) WidgetLook.forget(c, id);
    }

    /** Opens Shaati; with an action ("start", "stop") the app does it as it opens. */
    static PendingIntent open(Context c, String action, int request) {
        Uri u = Uri.parse(SITE + (action == null ? "" : "&action=" + action));
        Intent i = new Intent(Intent.ACTION_VIEW, u, c, LauncherActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, request, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static String s(JSONObject o, String k) {
        return o == null ? "" : o.optString(k, "");
    }

    static void text(RemoteViews v, int id, String t) {
        v.setTextViewText(id, t);
        v.setViewVisibility(id, t == null || t.isEmpty() ? View.GONE : View.VISIBLE);
    }

    /** The parts that are not empty, with " · " between them. */
    static String join(String... parts) {
        StringBuilder b = new StringBuilder();
        for (String p : parts) {
            if (p == null || p.isEmpty()) continue;
            if (b.length() > 0) b.append(" · ");
            b.append(p);
        }
        return b.toString();
    }

    /** The first letter in capitals (the app's "the pay period" opens a label in English); scripts without case keep it. */
    static String cap(String t) {
        if (t == null || t.isEmpty()) return "";
        int n = Character.charCount(t.codePointAt(0));
        return t.substring(0, n).toUpperCase(java.util.Locale.getDefault()) + t.substring(n);
    }

    static int pct(JSONObject o) {
        return o == null ? 0 : Math.max(0, Math.min(100, o.optInt("pct", 0)));
    }

    /** True when the snapshot belongs to a pay period that has already ended (the app was not opened since). */
    static boolean stale(JSONObject d) {
        if (d == null) return true;
        String to = s(d, "periodTo");
        return to.length() == 10 && today().compareTo(to) > 0;
    }

    static String today() {
        Calendar k = Calendar.getInstance();
        return String.format(java.util.Locale.ROOT, "%04d-%02d-%02d", k.get(Calendar.YEAR), k.get(Calendar.MONTH) + 1, k.get(Calendar.DAY_OF_MONTH));
    }

    /** Whole days from today to a date (yyyy-mm-dd); negative once it has passed. */
    static int daysUntil(String date) {
        try {
            Calendar a = Calendar.getInstance();
            a.set(Calendar.HOUR_OF_DAY, 12); a.set(Calendar.MINUTE, 0); a.set(Calendar.SECOND, 0); a.set(Calendar.MILLISECOND, 0);
            Calendar b = (Calendar) a.clone();
            b.set(Integer.parseInt(date.substring(0, 4)), Integer.parseInt(date.substring(5, 7)) - 1, Integer.parseInt(date.substring(8, 10)));
            return Math.round((b.getTimeInMillis() - a.getTimeInMillis()) / 86400000f);
        } catch (Exception e) {
            return Integer.MIN_VALUE;
        }
    }

    static int daysToPayday(JSONObject d) {
        JSONObject p = d == null ? null : d.optJSONObject("payday");
        return p == null ? Integer.MIN_VALUE : daysUntil(p.optString("date", ""));
    }

    /** "5 days to payday", "payday tomorrow", "payday today" (res/values/w_strings.xml and its translations), or "" once it passed. */
    static String paydayText(Context c, JSONObject pay) {
        if (pay == null) return "";
        int n = daysUntil(pay.optString("date", ""));
        if (n == Integer.MIN_VALUE || n < 0) return "";
        if (n == 0) return c.getString(R.string.w_payday_today);
        if (n == 1) return c.getString(R.string.w_payday_tomorrow);
        // the number goes in as text, so its digits match the ones the app writes the amounts in
        return c.getResources().getQuantityString(R.plurals.w_payday_days, n, String.valueOf(n));
    }

    /**
     * The coin's face for this snapshot: wide eyes before the first numbers, asleep when the numbers are old,
     * sunglasses during a shift, a party hat on payday or when a goal is reached, otherwise a big smile.
     */
    static int face(JSONObject d) {
        if (d == null) return R.id.w_face_wow;
        if (stale(d)) return R.id.w_face_sleepy;
        if (d.optJSONObject("active") != null) return R.id.w_face_cool;
        if (daysToPayday(d) == 0 || pct(d.optJSONObject("goal")) >= 100 || pct(d.optJSONObject("saving")) >= 100) return R.id.w_face_party;
        return R.id.w_face_happy;
    }

    /**
     * The running shift's clock: the time worked (breaks left out), counted by the phone (elapsed-realtime
     * based, as Chronometer wants it); during a break it stands still at the time worked so far.
     */
    static void clock(RemoteViews v, int id, JSONObject active) {
        long start = active.optLong("start", 0), breaks = active.optLong("breakMs", 0), breakAt = active.optLong("breakAt", 0);
        long worked = (breakAt > 0 ? breakAt : System.currentTimeMillis()) - start - breaks;
        v.setChronometer(id, SystemClock.elapsedRealtime() - Math.max(0, worked), null, breakAt <= 0);
    }

    /**
     * The start / end row (ShiftWidget, ComboWidget): a round go button with the start, clock or coffee icon, the
     * title or the running clock, a line under it, and the end button while a shift runs. With coinRow (the
     * shift widget in the coin look) the coin takes the round button's place and the button moves to the end.
     */
    static void shiftBlock(Context c, RemoteViews v, JSONObject d, WidgetLook l, boolean coinRow, int request) {
        boolean coin = coinRow && l.coin();
        l.textColor(c, v, R.id.w_title, l.text);
        l.textColor(c, v, R.id.w_clock, l.text);
        l.textColor(c, v, R.id.w_sub, l.sub);
        if (coinRow) l.coin(v, face(d));
        v.setViewVisibility(R.id.w_go, coin ? View.GONE : View.VISIBLE);
        JSONObject a = d == null ? null : d.optJSONObject("active");
        if (a != null) {
            boolean onBreak = a.optLong("breakAt", 0) > 0;
            v.setImageViewResource(R.id.w_go_icon, onBreak ? R.drawable.w_ic_coffee : R.drawable.w_ic_clock);
            v.setContentDescription(R.id.w_go, c.getString(R.string.w_open));
            v.setViewVisibility(R.id.w_title, View.GONE);
            v.setViewVisibility(R.id.w_clock, View.VISIBLE);
            clock(v, R.id.w_clock, a);
            text(v, R.id.w_sub, join(onBreak ? c.getString(R.string.w_on_break) : "", s(a, "role"), s(a, "rate")));
            v.setViewVisibility(R.id.w_play, View.GONE);
            v.setViewVisibility(R.id.w_stop, View.VISIBLE);
            v.setOnClickPendingIntent(R.id.w_stop, direct(d) ? tap(c, "stop", request + 1) : open(c, "stop", request + 1));
            v.setOnClickPendingIntent(R.id.w_go, open(c, null, request + 2));
        } else {
            v.setImageViewResource(R.id.w_go_icon, R.drawable.w_ic_play);
            v.setContentDescription(R.id.w_go, c.getString(R.string.w_start));
            v.setViewVisibility(R.id.w_clock, View.GONE);
            v.setViewVisibility(R.id.w_title, View.VISIBLE);
            v.setTextViewText(R.id.w_title, c.getString(l.coin() ? R.string.w_start_coin : R.string.w_start));
            // today only once it has earned something: the line stays short enough for the month to fit whole
            String today = s(d, "today").matches(".*[1-9].*") ? c.getString(R.string.w_today, s(d, "today")) : "";
            text(v, R.id.w_sub, d == null || stale(d) ? "" : join(today, c.getString(R.string.w_this_month, s(d, "gross"))));
            v.setViewVisibility(R.id.w_stop, View.GONE);
            v.setViewVisibility(R.id.w_play, coin ? View.VISIBLE : View.GONE);
            // the role is known (the last one chosen, or the only one): started right here; otherwise (several roles,
            // none chosen yet, or an app from before this version) the app opens to ask
            PendingIntent start = direct(d) && d.optJSONObject("next") != null ? tap(c, "start", request + 3) : open(c, "start", request + 3);
            v.setOnClickPendingIntent(R.id.w_go, start);
            v.setOnClickPendingIntent(R.id.w_title, start);
            v.setOnClickPendingIntent(R.id.w_play, start);
        }
    }
}
