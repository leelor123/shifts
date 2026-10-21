package io.github.leelor123.shifts;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONObject;

/**
 * Shaati's home-screen widgets: the numbers they show are the last snapshot the web app sent over the
 * message channel (see LauncherActivity), kept here on the phone. The app sends a new one whenever its
 * data changes or it comes to the front; the widgets show the last one until then.
 */
final class WidgetData {
    private static final String PREFS = "shaati_widgets";
    private static final String KEY = "snapshot";
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
        p.edit().putString(KEY, json).apply();
        updateAll(c);
    }

    static JSONObject load(Context c) {
        String s = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
        if (s == null) return null;
        try {
            return new JSONObject(s);
        } catch (Exception e) {
            return null;
        }
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
    }
}
