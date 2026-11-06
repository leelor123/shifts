package io.github.leelor123.shifts;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Shaati's home-screen widgets: the numbers they show are the last snapshot the web app sent over the
 * message channel (see LauncherActivity), kept here on the phone. The app sends a new one whenever its
 * data changes or it comes to the front; the widgets show the last one until then.
 *
 * The start and end buttons work without opening the app: each tap is kept here (taps: {id, type, at}) and the
 * widgets draw the snapshot as if the app had done it already. The app gets the taps when it opens or comes back
 * to the front (LauncherActivity), does them at their own times, and its next snapshot says the last one it did
 * (wid); those are dropped then.
 */
final class WidgetData {
    private static final String PREFS = "shaati_widgets";
    private static final String KEY = "snapshot";
    private static final String TAPS = "taps";
    static final Class<?>[] WIDGETS = { ShiftWidget.class, MonthWidget.class, GoalWidget.class, PaydayWidget.class, ComboWidget.class };

    private WidgetData() {}

    /** Keep a snapshot from the app (JSON) and redraw every widget on the home screen. */
    static void save(Context c, String json) {
        try {
            JSONObject o = new JSONObject(json);
            if (o.optInt("v", 0) < 1) return; // only real snapshots
        } catch (Exception e) {
            return;
        }
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (json.equals(p.getString(KEY, null))) return;
        p.edit().putString(KEY, json).commit();
        // the taps the app has done (or, wiped, never will): gone
        JSONObject o = raw(c);
        long done = o == null ? Long.MAX_VALUE : o.optLong("wid", 0);
        JSONArray left = new JSONArray(), all = taps(p);
        for (int i = 0; i < all.length(); i++) {
            JSONObject t = all.optJSONObject(i); // a broken entry (never written by this code) is dropped, not a crash
            if (t != null && t.optLong("id", 0) > done) left.put(t);
        }
        if (left.length() != all.length()) p.edit().putString(TAPS, left.toString()).commit();
        updateAll(c);
    }

    /** The last snapshot as the app sent it, or null (none yet, or the app holds no data). */
    private static JSONObject raw(Context c) {
        String s = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
        if (s == null) return null;
        try {
            JSONObject o = new JSONObject(s);
            // the app no longer holds any data (signed out, everything deleted): the widgets go back to their first look
            return o.optBoolean("empty", false) ? null : o;
        } catch (Exception e) {
            return null;
        }
    }

    /** The app's language as the last snapshot says it (also an empty one); none (an older app, or nothing yet): Hebrew. */
    static String lang(Context c) {
        String s = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
        if (s == null) return WidgetLang.DEFAULT;
        try {
            return WidgetLang.of(new JSONObject(s).optString("lang", WidgetLang.DEFAULT));
        } catch (Exception e) {
            return WidgetLang.DEFAULT;
        }
    }

    /** What the widgets show: the last snapshot, with the starts and ends tapped since then. */
    static JSONObject load(Context c) {
        JSONObject o = raw(c);
        if (o == null) return null;
        JSONArray t = pending(c);
        try {
            for (int i = 0; i < t.length(); i++) {
                JSONObject tap = t.getJSONObject(i);
                if ("stop".equals(tap.optString("type"))) o.remove("active");
                else if (o.optJSONObject("active") == null && o.optJSONObject("next") != null) {
                    JSONObject n = o.getJSONObject("next");
                    o.put("active", new JSONObject().put("start", tap.optLong("at")).put("breakAt", 0).put("breakMs", 0)
                            .put("role", n.optString("role", "")).put("rate", n.optString("rate", "")));
                }
            }
        } catch (Exception e) {
            // a broken tap: the snapshot as it is
        }
        return o;
    }

    private static JSONArray taps(SharedPreferences p) {
        try {
            return new JSONArray(p.getString(TAPS, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    /** The taps the app has not done yet, oldest first. */
    static JSONArray pending(Context c) {
        JSONObject o = raw(c);
        long done = o == null ? 0 : o.optLong("wid", 0);
        JSONArray all = taps(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)), left = new JSONArray();
        for (int i = 0; i < all.length(); i++) if (all.optJSONObject(i) != null && all.optJSONObject(i).optLong("id", 0) > done) left.put(all.optJSONObject(i));
        return left;
    }

    /** The message that hands the app its taps ({"taps": [...]}), or null when there are none. */
    static String tapsMessage(Context c) {
        JSONArray t = pending(c);
        if (t.length() == 0) return null;
        try {
            return new JSONObject().put("taps", t).toString();
        } catch (Exception e) {
            return null;
        }
    }

    /** Keeps a start or end tapped now, and redraws the widgets. */
    static void tap(Context c, String type) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray all = taps(p);
        long now = System.currentTimeMillis(), id = now;
        for (int i = 0; i < all.length(); i++) {
            JSONObject t = all.optJSONObject(i);
            if (t != null) id = Math.max(id, t.optLong("id", 0) + 1);
        }
        try {
            all.put(new JSONObject().put("id", id).put("type", type).put("at", now));
        } catch (Exception e) {
            return;
        }
        p.edit().putString(TAPS, all.toString()).commit();
        updateAll(c);
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (Class<?> k : WIDGETS) {
            int[] ids = m.getAppWidgetIds(new ComponentName(c, k));
            if (ids == null || ids.length == 0) continue;
            Intent i = new Intent(c, k).setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            c.sendBroadcast(i);
        }
        // the quick-settings tile shows the same shift: it is asked to look again
        if (android.os.Build.VERSION.SDK_INT >= 24) {
            try {
                android.service.quicksettings.TileService.requestListeningState(c, new ComponentName(c, ShiftTile.class));
            } catch (Exception e) {
                // no tile added, or the system refused: it reads the shift the next time it is shown
            }
        }
    }
}
