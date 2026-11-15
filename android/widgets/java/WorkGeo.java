package io.github.leelor123.shifts;

import android.Manifest;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingClient;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;

import org.json.JSONObject;

import java.util.Calendar;

/**
 * A suggestion at work (opt-in; src/core/arrive.js is the same decision in the web app, and its test keeps the two in
 * step). The user saves the spot they stand on (WorkGeoActivity, after the disclosure and the permissions); it is kept
 * here, on the phone only, and Android watches a circle around it (a geofence). Staying inside a few minutes shows a
 * notification that suggests starting a shift; leaving while one runs shows one that suggests ending it. Nothing here
 * starts or ends a shift: the buttons open the app at ?action=start / ?action=stop, and the app asks once more.
 *
 * The spot never leaves the phone: it is not sent to the web page (the status message says only on, radius and the
 * permissions), not backed up (w_backup_rules.xml leaves this file out) and not sent anywhere else.
 */
final class WorkGeo {
    private static final String PREFS = "shaati_geo";
    static final String ACTION_FENCE = "io.github.leelor123.shifts.GEO_FENCE";
    static final String ACTION_OFF = "io.github.leelor123.shifts.GEO_OFF";
    private static final String FENCE = "work";
    static final String TAG_IN = "geo-arrive", TAG_OUT = "geo-leave", TAG_SUM = "geo-group";
    private static final String GROUP = "shaati-geo"; // not NoteCenter's group: the web app's "keep" never closes these
    private static final long MIN = 60000L;
    // the same numbers as src/core/arrive.js (tests/arrive.test.js)
    static final int[] RADII = { 150, 300, 500 };
    static final int DEFAULT_R = 300;
    static final long AWAY_MS = 30 * MIN;
    static final long LEAVE_GAP_MS = 60 * MIN;
    static final int DWELL_MS = 5 * 60000;
    private static final int COLOR = 0xFF2F5BD3;

    private WorkGeo() {}

    static int radius(String r) {
        try {
            int v = Integer.parseInt(r);
            for (int x : RADII) if (x == v) return v;
        } catch (Exception e) {
            // not a number: the default
        }
        return DEFAULT_R;
    }

    /** The same rule as Arrive.decide: "start", "stop" or null. */
    static String decide(boolean in, boolean active, long now, long lastInNote, long lastExit, long lastOutNote) {
        if (in) {
            if (active) return null;
            if (lastInNote > 0 && (lastExit < lastInNote || now - lastExit < AWAY_MS)) return null;
            return "start";
        }
        if (!active) return null;
        if (lastOutNote > 0 && now - lastOutNote < LEAVE_GAP_MS) return null;
        return "stop";
    }

    /** The app's one night rule (src/core/moments.js quietHour): 23:00 to 06:00. */
    static boolean quietHour(long ms) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(ms);
        int h = c.get(Calendar.HOUR_OF_DAY);
        return h >= 23 || h < 6;
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean hasFine(Context c) {
        return c.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    static boolean hasBackground(Context c) {
        if (Build.VERSION.SDK_INT < 29) return hasFine(c);
        return c.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    static boolean on(Context c) {
        return prefs(c).getBoolean("on", false);
    }

    private static PendingIntent fenceIntent(Context c) {
        Intent i = new Intent(c, WorkGeoReceiver.class).setAction(ACTION_FENCE);
        // Google Play services fills in the crossing: mutable from Android 12
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        return PendingIntent.getBroadcast(c, 7320, i, flags);
    }

    /** The answer from Google Play services: the circle is watched, or not (its status code, e.g. 1000). */
    interface Done { void result(boolean ok, int code); }

    /** Where a status change goes while the app is open (LauncherActivity: to the page). */
    interface Sink { void send(String status); }
    static volatile Sink sink;

    // Google Play services' last answer for the circle: watched, refused, or not known yet (asked, no answer)
    static final int FENCE_OK = 1, FENCE_UNKNOWN = 0, FENCE_REFUSED = -1;

    /** Saves the spot and asks Android to watch it (WorkGeoActivity, once both permissions are there). done hears
     *  whether Google Play services accepted the circle: "saved" is said only then. */
    static boolean save(Context c, double lat, double lng, int r, Done done) {
        prefs(c).edit().putString("lat", Double.toString(lat)).putString("lng", Double.toString(lng)).putInt("r", r)
                .putBoolean("on", true).putInt("fence", FENCE_UNKNOWN)
                .putLong("lastInNote", 0).putLong("lastExit", 0).putLong("lastOutNote", 0).commit();
        return watch(c, done);
    }

    static int fence(Context c) {
        return prefs(c).getInt("fence", FENCE_UNKNOWN);
    }

    /** Asks Android to watch the saved circle (again after a restart or an update: Android forgets geofences then). */
    static boolean watch(Context c, Done done) {
        SharedPreferences p = prefs(c);
        if (!p.getBoolean("on", false) || !hasFine(c) || !hasBackground(c)) return false;
        double lat, lng;
        try {
            lat = Double.parseDouble(p.getString("lat", ""));
            lng = Double.parseDouble(p.getString("lng", ""));
        } catch (Exception e) {
            return false;
        }
        Geofence g = new Geofence.Builder()
                .setRequestId(FENCE)
                .setCircularRegion(lat, lng, p.getInt("r", DEFAULT_R))
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_DWELL | Geofence.GEOFENCE_TRANSITION_EXIT)
                .setLoiteringDelay(DWELL_MS)
                .build();
        // no crossing on the moment it is saved: the user stands at the spot and starts the shift themselves
        GeofencingRequest req = new GeofencingRequest.Builder().setInitialTrigger(0).addGeofence(g).build();
        try {
            GeofencingClient gc = LocationServices.getGeofencingClient(c);
            final Context app = c.getApplicationContext();
            // the answer is kept: the status says "on" only for a circle Google Play services accepted. It refuses with
            // 1000 (GEOFENCE_NOT_AVAILABLE) when Google Location Accuracy is off; the app then said "saved" and "on"
            // and no suggestion ever came (Firebase Test Lab, Android 16 image, 15 Nov 2026)
            gc.addGeofences(req, fenceIntent(c))
                    .addOnSuccessListener(v -> answered(app, true, 0, done))
                    .addOnFailureListener(e -> {
                        android.util.Log.w("ShaatiGeo", "watch failed", e);
                        answered(app, false, e instanceof com.google.android.gms.common.api.ApiException
                                ? ((com.google.android.gms.common.api.ApiException) e).getStatusCode() : -1, done);
                    });
            return true;
        } catch (SecurityException e) {
            return false;
        }
    }

    private static void answered(Context c, boolean ok, int code, Done done) {
        if (!on(c)) return; // turned off meanwhile
        prefs(c).edit().putInt("fence", ok ? FENCE_OK : FENCE_REFUSED).commit();
        if (done != null) done.result(ok, code);
        Sink s = sink;
        String st = status(c);
        if (s != null && st != null) {
            try {
                s.send(st);
            } catch (Exception e) {
                // the page asks again when it comes back to the front
            }
        }
    }

    /** After a restart or an update (NoteAlarm), and on each open of the app: a refusal shows as needing attention. */
    static void restore(Context c) {
        if (on(c)) watch(c, null);
    }

    /** Turns it off: stops watching, forgets the spot, closes our notifications. */
    static void off(Context c) {
        try {
            LocationServices.getGeofencingClient(c).removeGeofences(fenceIntent(c));
        } catch (Exception e) {
            // nothing was watched
        }
        prefs(c).edit().clear().commit();
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(TAG_IN, 1);
            nm.cancel(TAG_OUT, 1);
            nm.cancel(TAG_SUM, 1);
        }
    }

    /** Whether a shift runs now, as the widgets see it (the last snapshot with the taps since). */
    private static boolean active(Context c) {
        JSONObject o = WidgetData.load(c);
        return o != null && o.optJSONObject("active") != null;
    }

    /** One crossing from Android (WorkGeoReceiver). */
    static void crossing(Context c, boolean in) {
        if (!on(c)) return;
        SharedPreferences p = prefs(c);
        long now = System.currentTimeMillis();
        boolean act = active(c);
        String d = decide(in, act, now, p.getLong("lastInNote", 0), p.getLong("lastExit", 0), p.getLong("lastOutNote", 0));
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        SharedPreferences.Editor e = p.edit();
        if (!in) {
            e.putLong("lastExit", now);
            if (nm != null) cancel(nm, TAG_IN); // left: "start a shift?" is no longer true
        } else if (nm != null) cancel(nm, TAG_OUT);
        if ("start".equals(d)) e.putLong("lastInNote", now);
        if ("stop".equals(d)) e.putLong("lastOutNote", now);
        e.commit();
        if (d != null && nm != null) post(c, nm, "start".equals(d), now);
    }

    /** A new snapshot from the app (WidgetData.save): a suggestion the shift already answered is closed. */
    static void sync(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (active(c)) cancel(nm, TAG_IN);
        else cancel(nm, TAG_OUT);
    }

    private static PendingIntent offIntent(Context c) {
        Intent i = new Intent(c, WorkGeoReceiver.class).setAction(ACTION_OFF);
        return PendingIntent.getBroadcast(c, 7321, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** One suggestion closed, and the group's summary with it when no suggestion is left. */
    private static void cancel(NotificationManager nm, String tag) {
        nm.cancel(tag, 1);
        try {
            for (android.service.notification.StatusBarNotification n : nm.getActiveNotifications()) {
                if (TAG_IN.equals(n.getTag()) || TAG_OUT.equals(n.getTag())) return;
            }
        } catch (Exception e) {
            // the summary stays; Android closes it with its last child
        }
        nm.cancel(TAG_SUM, 1);
    }

    private static void post(Context c, NotificationManager nm, boolean start, long now) {
        try {
            NoteCenter.channels(c, nm);
            Context lc = WidgetLang.context(c);
            String title = lc.getString(start ? R.string.w_geo_in_t : R.string.w_geo_out_t);
            String body = lc.getString(start ? R.string.w_geo_in_b : R.string.w_geo_out_b);
            String tag = start ? TAG_IN : TAG_OUT;
            boolean quiet = quietHour(now);
            NotificationCompat.Builder b = new NotificationCompat.Builder(c, "shaati_shifts")
                    .setSmallIcon(R.drawable.ic_notification_icon)
                    .setColor(COLOR)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setAutoCancel(true)
                    .setGroup(GROUP)
                    .setCategory(NotificationCompat.CATEGORY_REMINDER)
                    // at night it still comes (a night shift starts then), without sound or vibration
                    .setPriority(quiet ? NotificationCompat.PRIORITY_LOW : NotificationCompat.PRIORITY_HIGH)
                    .setSilent(quiet)
                    .setContentIntent(NoteCenter.open(c, "./#home", tag.hashCode()))
                    .setTimeoutAfter((start ? 3 * 60 : 2 * 60) * MIN)
                    .setWhen(now)
                    .setShowWhen(true)
                    .addAction(0, lc.getString(start ? R.string.w_geo_start : R.string.w_geo_stop),
                            NoteCenter.open(c, start ? "./?action=start" : "./?action=stop", tag.hashCode() + 1))
                    .addAction(0, lc.getString(R.string.w_geo_off), offIntent(c));
            nm.notify(tag, 1, b.build());
            // the group's own summary: without one, Android (16 and later) folds a lone grouped notification into one
            // bundle with the app's other notifications, collapsed, and the suggestion's buttons are hidden (Test Lab,
            // Pixel 11, 15 Nov 2026). With it the suggestion stands on its own, opened with its buttons when on top.
            nm.notify(TAG_SUM, 1, new NotificationCompat.Builder(c, "shaati_shifts")
                    .setSmallIcon(R.drawable.ic_notification_icon)
                    .setColor(COLOR)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setGroup(GROUP)
                    .setGroupSummary(true)
                    .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
                    .setAutoCancel(true)
                    .setSilent(true)
                    .setCategory(NotificationCompat.CATEGORY_REMINDER)
                    .setContentIntent(NoteCenter.open(c, "./#home", TAG_SUM.hashCode()))
                    .setTimeoutAfter((start ? 3 * 60 : 2 * 60) * MIN)
                    .build());
        } catch (Exception e) {
            android.util.Log.w("ShaatiGeo", "post", e);
        }
    }

    /** Whether a message from the web app is for this ({"geo":1,...}). */
    static boolean isGeo(String message) {
        return message != null && message.startsWith("{\"geo\"");
    }

    /** A message from the web app: {"geo":1,"ask":1} or {"geo":1,"off":1}. The answer is the status (no spot in it). */
    static String receive(Context c, String json) {
        JSONObject o;
        try {
            o = new JSONObject(json);
        } catch (Exception e) {
            return null;
        }
        if (o.optInt("geo", 0) < 1) return null;
        if (o.optInt("off", 0) == 1) off(c);
        // Android drops geofences when the phone's location is turned off and on again: each open of the app watches
        // the circle again (the same id replaces the old one)
        else restore(c);
        return status(c);
    }

    static String status(Context c) {
        try {
            boolean fine = hasFine(c), bg = hasBackground(c);
            // on, as far as the user can tell: the spot is saved and Android may still watch it
            boolean refused = fence(c) == FENCE_REFUSED;
            // attn: saved and allowed, but Google Play services refused to watch the circle (Location Accuracy off)
            return new JSONObject().put("geo", 1).put("on", on(c) && fine && bg && !refused).put("r", prefs(c).getInt("r", DEFAULT_R))
                    .put("saved", on(c)).put("fg", fine).put("bg", bg).put("attn", on(c) && fine && bg && refused).toString();
        } catch (Exception e) {
            return null;
        }
    }

    /** The radius a setup link asks for (shaati-geo://save?r=300). */
    static int radius(Uri u) {
        return radius(u == null ? null : u.getQueryParameter("r"));
    }
}
