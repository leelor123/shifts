package io.github.leelor123.shifts;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

/** The next payday: how many days are left (counted on the phone each day) and about how much is coming. */
public class PaydayWidget extends ShaatiWidget {
    @Override
    RemoteViews build(Context c, JSONObject d) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.w_payday);
        v.setOnClickPendingIntent(R.id.w_root, open(c, null, 400));
        JSONObject p = d == null ? null : d.optJSONObject("payday");
        String when = paydayText(p);
        if (when.isEmpty()) {
            v.setTextViewText(R.id.w_title, "המשכורת הבאה");
            text(v, R.id.w_sub, d == null ? "פתחו את שעתי לעדכון" : "אין עדיין משמרות בתקופה הזו");
        } else {
            v.setTextViewText(R.id.w_title, when);
            text(v, R.id.w_sub, "כ-" + s(p, "amount") + " נטו");
        }
        return v;
    }
}
