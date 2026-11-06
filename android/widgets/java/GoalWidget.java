package io.github.leelor123.shifts;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

/** The goal: what you are saving up for (when there is one), or this month goal, or where the month is heading. */
public class GoalWidget extends ShaatiWidget {
    @Override
    RemoteViews build(Context c, JSONObject d, WidgetLook l) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.w_goal);
        l.frame(v);
        l.background(v, R.id.w_icon_box, l.dot);
        l.iconColor(c, v, R.id.w_icon);
        l.textColor(c, v, R.id.w_title, l.text);
        l.textColor(c, v, R.id.w_pct, l.label);
        l.textColor(c, v, R.id.w_sub, l.sub);
        l.bar(v, R.id.w_bar);
        l.coin(v, face(d));
        v.setViewVisibility(R.id.w_icon_box, l.coin() ? View.GONE : View.VISIBLE);
        v.setOnClickPendingIntent(R.id.w_root, open(c, null, 300));
        JSONObject sv = d == null ? null : d.optJSONObject("saving");
        JSONObject g = d == null || stale(d) ? null : d.optJSONObject("goal");
        if (sv != null) {
            int pct = pct(sv);
            v.setImageViewResource(R.id.w_icon, pct >= 100 ? R.drawable.w_ic_trophy : R.drawable.w_ic_target);
            v.setTextViewText(R.id.w_title, s(sv, "name"));
            v.setTextViewText(R.id.w_pct, pct + "%");
            v.setViewVisibility(R.id.w_bar, View.VISIBLE);
            v.setProgressBar(R.id.w_bar, 100, pct, false);
            text(v, R.id.w_sub, pct >= 100 ? c.getString(R.string.w_enough) : c.getString(R.string.w_more, s(sv, "left")));
        } else if (g != null) {
            int pct = pct(g);
            v.setImageViewResource(R.id.w_icon, pct >= 100 ? R.drawable.w_ic_trophy : R.drawable.w_ic_target);
            v.setTextViewText(R.id.w_title, c.getString(R.string.w_goal_of, s(g, "of")));
            v.setTextViewText(R.id.w_pct, pct + "%");
            v.setViewVisibility(R.id.w_bar, View.VISIBLE);
            v.setProgressBar(R.id.w_bar, 100, pct, false);
            text(v, R.id.w_sub, pct >= 100 ? c.getString(R.string.w_goal_passed) : c.getString(R.string.w_goal_left, s(g, "left")));
        } else {
            boolean old = d == null || stale(d);
            v.setImageViewResource(R.id.w_icon, R.drawable.w_ic_trend);
            v.setTextViewText(R.id.w_title, c.getString(old ? R.string.w_goal_mine : R.string.w_forecast));
            v.setTextViewText(R.id.w_pct, old ? "" : s(d, "pace"));
            v.setViewVisibility(R.id.w_bar, View.GONE);
            text(v, R.id.w_sub, c.getString(old ? R.string.w_open_update : R.string.w_goal_hint));
        }
        return v;
    }
}
