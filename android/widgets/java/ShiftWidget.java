package io.github.leelor123.shifts;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

/** "Start a shift" in one tap; while a shift runs, its clock and an "end" button. */
public class ShiftWidget extends ShaatiWidget {
    @Override
    RemoteViews build(Context c, JSONObject d, WidgetLook l) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.w_shift);
        l.background(v, R.id.w_root, l.bg);
        shiftBlock(c, v, d, l, true, 100);
        l.dial(v);
        // during a shift the end of the row holds the end button
        if (d != null && d.optJSONObject("active") != null) v.setViewVisibility(R.id.w_clock_box, android.view.View.GONE);
        v.setOnClickPendingIntent(R.id.w_root, open(c, null, 109));
        return v;
    }
}
