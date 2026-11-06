package io.github.leelor123.shifts;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

/** This month so far: the gross, the net and the hours, the way to the goal and where the month is heading. */
public class MonthWidget extends ShaatiWidget {
    @Override
    RemoteViews build(Context c, JSONObject d, WidgetLook l) {
        RemoteViews v = new RemoteViews(c.getPackageName(), WidgetLang.layout(c, R.layout.w_month_rtl, R.layout.w_month_ltr));
        l.frame(v);
        month(c, v, d, l);
        l.coin(v, face(d));
        l.dial(v);
        v.setOnClickPendingIntent(R.id.w_root, open(c, null, 200));
        return v;
    }

    /** The month block (shared with ComboWidget): w_label, w_amount, w_line, w_bar, w_goal. */
    static void month(Context c, RemoteViews v, JSONObject d, WidgetLook l) {
        l.textColor(c, v, R.id.w_label, l.label);
        l.textColor(c, v, R.id.w_amount, l.text);
        l.textColor(c, v, R.id.w_line, l.sub);
        l.textColor(c, v, R.id.w_goal, l.sub);
        l.bar(v, R.id.w_bar);
        if (d == null || stale(d)) {
            v.setTextViewText(R.id.w_label, c.getString(d == null ? R.string.w_month_mine : R.string.w_month_new));
            v.setTextViewText(R.id.w_amount, "₪—");
            text(v, R.id.w_line, c.getString(R.string.w_open_update));
            v.setViewVisibility(R.id.w_bar, View.GONE);
            text(v, R.id.w_goal, "");
            return;
        }
        v.setTextViewText(R.id.w_label, cap(c, c.getString(R.string.w_so_far, s(d, "period"))));
        v.setTextViewText(R.id.w_amount, s(d, "gross"));
        text(v, R.id.w_line, c.getString(R.string.w_net_hours, s(d, "net"), s(d, "hours")));
        JSONObject g = d.optJSONObject("goal");
        String pace = s(d, "pace");
        if (g != null) {
            v.setViewVisibility(R.id.w_bar, View.VISIBLE);
            v.setProgressBar(R.id.w_bar, 100, pct(g), false);
            text(v, R.id.w_goal, c.getString(R.string.w_goal_pct, String.valueOf(g.optInt("pct", 0)), s(g, "of")));
        } else {
            v.setViewVisibility(R.id.w_bar, View.GONE);
            text(v, R.id.w_goal, pace.isEmpty() ? "" : c.getString(R.string.w_forecast_is, pace));
        }
    }
}
