package io.github.leelor123.shifts;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

/** All together: start / end a shift with its clock, this month with the goal, and the next payday. */
public class ComboWidget extends ShaatiWidget {
    @Override
    RemoteViews build(Context c, JSONObject d) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.w_combo);
        v.setOnClickPendingIntent(R.id.w_root, open(c, null, 500));
        shiftBlock(c, v, d, R.id.w_icon, R.id.w_title, R.id.w_clock, R.id.w_sub, R.id.w_stop, 510);
        MonthWidget.month(v, d, R.id.w_label, R.id.w_amount, R.id.w_line, R.id.w_bar, R.id.w_goal);
        String pay = paydayText(d == null ? null : d.optJSONObject("payday"));
        text(v, R.id.w_pay, pay.isEmpty() ? "" : "💸 " + pay);
        return v;
    }
}
