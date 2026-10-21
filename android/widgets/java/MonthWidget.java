package io.github.leelor123.shifts;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

/** This month so far: the gross, the net and the hours, the way to the goal and where the month is heading. */
public class MonthWidget extends ShaatiWidget {
    @Override
    RemoteViews build(Context c, JSONObject d) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.w_month);
        month(v, d, R.id.w_label, R.id.w_amount, R.id.w_line, R.id.w_bar, R.id.w_goal);
        v.setOnClickPendingIntent(R.id.w_root, open(c, null, 200));
        return v;
    }

    /** The month block (shared with ComboWidget). */
    static void month(RemoteViews v, JSONObject d, int label, int amount, int line, int bar, int goal) {
        if (d == null || stale(d)) {
            v.setTextViewText(label, d == null ? "החודש שלי" : "חודש חדש התחיל");
            v.setTextViewText(amount, "₪—");
            text(v, line, "פתחו את שעתי לעדכון");
            v.setViewVisibility(bar, View.GONE);
            text(v, goal, "");
            return;
        }
        v.setTextViewText(label, s(d, "period") + " עד עכשיו");
        v.setTextViewText(amount, s(d, "gross"));
        text(v, line, "נטו " + s(d, "net") + " · " + s(d, "hours") + " שעות");
        JSONObject g = d.optJSONObject("goal");
        String pace = s(d, "pace");
        if (g != null) {
            v.setViewVisibility(bar, View.VISIBLE);
            v.setProgressBar(bar, 100, Math.max(0, Math.min(100, g.optInt("pct", 0))), false);
            text(v, goal, g.optInt("pct", 0) + "% מיעד " + s(g, "of") + (pace.isEmpty() ? "" : " · צפי " + pace));
        } else {
            v.setViewVisibility(bar, View.GONE);
            text(v, goal, pace.isEmpty() ? "" : "צפי לסוף החודש: " + pace);
        }
    }
}
