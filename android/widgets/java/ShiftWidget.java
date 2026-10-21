package io.github.leelor123.shifts;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

/** "Start a shift" in one tap; while a shift runs, its clock and an "end" button. */
public class ShiftWidget extends ShaatiWidget {
    @Override
    RemoteViews build(Context c, JSONObject d) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.w_shift);
        shiftBlock(c, v, d, R.id.w_icon, R.id.w_title, R.id.w_clock, R.id.w_sub, R.id.w_stop, 100);
        v.setOnClickPendingIntent(R.id.w_root, open(c, null, 109));
        return v;
    }
}
