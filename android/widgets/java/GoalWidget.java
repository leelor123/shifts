package io.github.leelor123.shifts;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

/** The goal: what you are saving up for (when there is one), or this month's goal, or where the month is heading. */
public class GoalWidget extends ShaatiWidget {
    @Override
    RemoteViews build(Context c, JSONObject d) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.w_goal);
        v.setOnClickPendingIntent(R.id.w_root, open(c, null, 300));
        JSONObject sv = d == null ? null : d.optJSONObject("saving");
        JSONObject g = d == null || stale(d) ? null : d.optJSONObject("goal");
        if (sv != null) {
            int pct = Math.max(0, Math.min(100, sv.optInt("pct", 0)));
            v.setTextViewText(R.id.w_icon, pct >= 100 ? "🎉" : "🎯");
            v.setTextViewText(R.id.w_title, s(sv, "name"));
            v.setTextViewText(R.id.w_pct, pct + "%");
            v.setViewVisibility(R.id.w_bar, View.VISIBLE);
            v.setProgressBar(R.id.w_bar, 100, pct, false);
            text(v, R.id.w_sub, pct >= 100 ? "יש לך מספיק! 🎉" : "עוד " + s(sv, "left"));
        } else if (g != null) {
            int pct = Math.max(0, Math.min(100, g.optInt("pct", 0)));
            v.setTextViewText(R.id.w_icon, pct >= 100 ? "🏆" : "🎯");
            v.setTextViewText(R.id.w_title, "יעד " + s(g, "of"));
            v.setTextViewText(R.id.w_pct, pct + "%");
            v.setViewVisibility(R.id.w_bar, View.VISIBLE);
            v.setProgressBar(R.id.w_bar, 100, pct, false);
            text(v, R.id.w_sub, pct >= 100 ? "עברת את היעד! 🎉" : "עוד " + s(g, "left") + " ליעד");
        } else {
            v.setTextViewText(R.id.w_icon, "📈");
            v.setTextViewText(R.id.w_title, d == null || stale(d) ? "היעד שלי" : "צפי לסוף החודש");
            v.setTextViewText(R.id.w_pct, d == null || stale(d) ? "" : s(d, "pace"));
            v.setViewVisibility(R.id.w_bar, View.GONE);
            text(v, R.id.w_sub, d == null || stale(d) ? "פתחו את שעתי לעדכון" : "אפשר להגדיר יעד בהגדרות › יעדים");
        }
        return v;
    }
}
