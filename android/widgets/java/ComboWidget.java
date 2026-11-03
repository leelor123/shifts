package io.github.leelor123.shifts;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

/** All together: start / end a shift with its clock, this month with the goal, and the next payday. */
public class ComboWidget extends ShaatiWidget {
    @Override
    RemoteViews build(Context c, JSONObject d, WidgetLook l) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.w_combo);
        l.background(v, R.id.w_root, l.bg);
        l.background(v, R.id.w_chip, l.chip);
        v.setOnClickPendingIntent(R.id.w_root, open(c, null, 500));
        shiftBlock(c, v, d, l, false, 510);
        MonthWidget.month(c, v, d, l);
        l.textColor(c, v, R.id.w_pay, l.label);
        text(v, R.id.w_pay, paydayText(d == null ? null : d.optJSONObject("payday")));
        l.coin(v, face(d));
        l.dial(v);
        return v;
    }
}
