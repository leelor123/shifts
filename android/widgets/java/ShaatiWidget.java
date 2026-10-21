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

import org.json.JSONObject;

import java.util.Calendar;

/**
 * What every Shaati widget shares: drawing from the last snapshot (WidgetData), opening the app (straight
 * into starting or ending a shift), the running shift's clock (counted by the phone itself, so it ticks
 * without the app), and the days left until payday (counted on the phone, so it is right every morning).
 *
 * The snapshot (JSON, all money already written out by the app):
 *   v, at, period, periodTo (yyyy-mm-dd), gross, net, hours, shifts, today, pace,
 *   goal {pct, of, left}, payday {date, amount}, saving {name, pct, left},
 *   active {start (epoch ms), breakAt (epoch ms or 0), role, rate}
 */
abstract class ShaatiWidget extends AppWidgetProvider {
    static final String SITE = "https://leelor123.github.io/shifts/?source=twa";

    /** The widget's picture for this snapshot (null = the app was never opened since the widget was added). */
    abstract RemoteViews build(Context c, JSONObject d);

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        RemoteViews v = build(c, WidgetData.load(c));
        m.updateAppWidget(ids, v);
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

    /** "עוד 5 ימים למשכורת", "מחר משכורת", "היום משכורת! 🎉", or "" once it passed. */
    static String paydayText(JSONObject pay) {
        if (pay == null) return "";
        int n = daysUntil(pay.optString("date", ""));
        if (n == Integer.MIN_VALUE || n < 0) return "";
        if (n == 0) return "היום משכורת! 🎉";
        if (n == 1) return "מחר משכורת";
        return "עוד " + n + " ימים למשכורת";
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

    /** The start / end button and the clock of a widget that has one (ShiftWidget, ComboWidget). */
    static void shiftBlock(Context c, RemoteViews v, JSONObject d, int icon, int title, int clockId, int sub, int stop, int request) {
        JSONObject a = d == null ? null : d.optJSONObject("active");
        if (a != null) {
            boolean onBreak = a.optLong("breakAt", 0) > 0;
            v.setTextViewText(icon, onBreak ? "☕" : "⏱");
            v.setViewVisibility(title, View.GONE);
            v.setViewVisibility(clockId, View.VISIBLE);
            clock(v, clockId, a);
            text(v, sub, (onBreak ? "בהפסקה · " : "") + s(a, "role") + (s(a, "rate").isEmpty() ? "" : " · " + s(a, "rate")));
            v.setViewVisibility(stop, View.VISIBLE);
            v.setOnClickPendingIntent(stop, open(c, "stop", request + 1));
            v.setOnClickPendingIntent(icon, open(c, null, request + 2));
        } else {
            v.setTextViewText(icon, "▶");
            v.setViewVisibility(clockId, View.GONE);
            v.setViewVisibility(title, View.VISIBLE);
            v.setTextViewText(title, "התחל משמרת");
            text(v, sub, d == null ? "" : stale(d) ? "" : "היום " + s(d, "today") + " · החודש " + s(d, "gross"));
            v.setViewVisibility(stop, View.GONE);
            v.setOnClickPendingIntent(icon, open(c, "start", request + 3));
            v.setOnClickPendingIntent(title, open(c, "start", request + 3));
        }
    }
}
