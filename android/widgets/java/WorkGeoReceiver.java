package io.github.leelor123.shifts;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;

/**
 * The workplace circle's crossings from Google Play services (WorkGeo.watch), and the "turn off" button on its
 * notifications. Not exported: only this app's own pending intents reach it.
 */
public class WorkGeoReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String a = i == null ? null : i.getAction();
        final Context app = c.getApplicationContext();
        if (WorkGeo.ACTION_OFF.equals(a)) {
            WorkGeo.off(app);
            return;
        }
        if (!WorkGeo.ACTION_FENCE.equals(a)) return;
        GeofencingEvent ev = GeofencingEvent.fromIntent(i);
        if (ev == null || ev.hasError()) return;
        int t = ev.getGeofenceTransition();
        if (t != Geofence.GEOFENCE_TRANSITION_DWELL && t != Geofence.GEOFENCE_TRANSITION_EXIT) return;
        final boolean in = t == Geofence.GEOFENCE_TRANSITION_DWELL;
        final PendingResult r = goAsync();
        new Thread(() -> {
            try {
                WorkGeo.crossing(app, in);
            } finally {
                r.finish();
            }
        }).start();
    }
}
