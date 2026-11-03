package io.github.leelor123.shifts;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

/** The next payday: how many days are left (counted on the phone each day) and about how much is coming. */
public class PaydayWidget extends ShaatiWidget {
    @Override
    RemoteViews build(Context c, JSONObject d, WidgetLook l) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.w_payday);
        l.background(v, R.id.w_root, l.bg);
        l.background(v, R.id.w_icon_box, l.dot);
        l.iconColor(c, v, R.id.w_icon);
        l.textColor(c, v, R.id.w_title, l.text);
        l.textColor(c, v, R.id.w_sub, l.label);
        v.setOnClickPendingIntent(R.id.w_root, open(c, null, 400));
        JSONObject p = d == null ? null : d.optJSONObject("payday");
        String when = paydayText(p);
        int days = daysToPayday(d);
        // the coin: a party hat on the day, wide eyes in the last three days (and before the first numbers)
        l.coin(v, when.isEmpty() ? (d == null ? R.id.w_face_wow : R.id.w_face_happy)
                : days == 0 ? R.id.w_face_party : days <= 3 ? R.id.w_face_wow : R.id.w_face_happy);
        l.dial(v);
        v.setViewVisibility(R.id.w_icon_box, l.coin() ? View.GONE : View.VISIBLE);
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
