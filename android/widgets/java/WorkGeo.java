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

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

import java.util.Calendar;

/**
 * A suggestion at work (opt-in; src/core/arrive.js is the same decision in the web app, and its test keeps the two in
 * step). The user saves the spot they stand on (WorkGeoActivity, after the disclosure and the permissions); it is kept
 * here, on the phone only, and Android watches a circle around it (a geofence). Staying inside a few minutes shows a
 * notification that suggests starting a shift; leaving while one runs shows one that suggests ending it. Nothing here
 * starts or ends a shift: the buttons open the app at ?action=start / ?action=stop, and the app asks once more.
 *
 * Up to MAX_PLACES workplaces, each its own circle with its own name and employer (Arrive.MAX_PLACES on the page): the
 * suggestion says which place, and its start button starts the shift at that employer. An app before 1.39 kept one
 * spot in plain keys; it becomes the place "work" on the first read (places()).
 *
 * The spot never leaves the phone: it is not sent to the web page (the status message says only on, radius and the
 * permissions), not backed up (w_backup_rules.xml leaves this file out) and not sent anywhere else.
 */
final class WorkGeo {
    private static final String PREFS = "shaati_geo";
    static final String ACTION_FENCE = "io.github.leelor123.shifts.GEO_FENCE";
    static final String ACTION_OFF = "io.github.leelor123.shifts.GEO_OFF";
    // the arrival suggestion's "no, thanks" (1.45): only closes it; the place keeps its suggestions
    static final String ACTION_NO = "io.github.leelor123.shifts.GEO_NO";
    static final int MAX_PLACES = 3;
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

    // apply everywhere here (27 Nov 2026): every reader is in this process and sees the change at once; the writes reach
    // the disk in order, and a receiver's end (the geofence's, NoteAlarm's) waits for them
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

    /** A place's id: "work" (the one place of an app before 1.39) or p1..p3 (Arrive.PLACE_ID). */
    static boolean validId(String id) {
        return id != null && (id.equals("work") || id.equals("p1") || id.equals("p2") || id.equals("p3"));
    }

    /** A name as the page sends it (Arrive.cleanName): one line, at most 30 characters. */
    static String cleanName(String n) {
        if (n == null) return "";
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < n.length(); i++) {
            char ch = n.charAt(i);
            b.append(ch < 32 || ch == 127 ? ' ' : ch);
        }
        String t = b.toString().replaceAll("\\s+", " ").trim();
        if (t.length() <= 30) return t;
        // never half of a character (an emoji is two chars)
        return t.substring(0, Character.isHighSurrogate(t.charAt(29)) ? 29 : 30);
    }

    /** An employer id (Arrive.cleanEmp); anything else: none. */
    static String cleanEmp(String e) {
        return e != null && e.matches("[A-Za-z0-9_-]{1,40}") ? e : "";
    }

    /** The saved places, the old single spot turned into the place "work". */
    static List<JSONObject> places(Context c) {
        SharedPreferences p = prefs(c);
        List<JSONObject> out = new ArrayList<>();
        String raw = p.getString("places", null);
        if (raw == null) {
            if (!p.getBoolean("on", false) || !p.contains("lat")) return out;
            try {
                out.add(new JSONObject().put("id", "work").put("lat", Double.parseDouble(p.getString("lat", "")))
                        .put("lng", Double.parseDouble(p.getString("lng", ""))).put("r", p.getInt("r", DEFAULT_R))
                        .put("n", "").put("e", "").put("lastInNote", p.getLong("lastInNote", 0))
                        .put("lastExit", p.getLong("lastExit", 0)).put("lastOutNote", p.getLong("lastOutNote", 0)));
            } catch (Exception e) {
                return out;
            }
            write(c, out);
            return out;
        }
        try {
            JSONArray a = new JSONArray(raw);
            for (int i = 0; i < a.length() && out.size() < MAX_PLACES; i++) {
                JSONObject o = a.optJSONObject(i);
                if (o != null && validId(o.optString("id"))) out.add(o);
            }
        } catch (Exception e) {
            // unreadable: no places
        }
        return out;
    }

    private static void write(Context c, List<JSONObject> list) {
        JSONArray a = new JSONArray();
        for (JSONObject o : list) a.put(o);
        prefs(c).edit().putString("places", a.toString()).putBoolean("on", !list.isEmpty())
                .remove("lat").remove("lng").remove("r").remove("lastInNote").remove("lastExit").remove("lastOutNote").apply();
    }

    private static int find(List<JSONObject> list, String id) {
        for (int i = 0; i < list.size(); i++) if (id.equals(list.get(i).optString("id"))) return i;
        return -1;
    }

    /** The id a new place takes (Arrive.nextId), or null when MAX_PLACES are saved. */
    static String nextId(List<JSONObject> list) {
        if (list.size() >= MAX_PLACES) return null;
        for (int i = 1; i <= MAX_PLACES; i++) if (find(list, "p" + i) < 0) return "p" + i;
        return null;
    }

    /** Whether a setup link may save: it names a saved place (saved again), or there is room for a new one. */
    static boolean canSave(Context c, String id) {
        List<JSONObject> list = places(c);
        return (validId(id) && find(list, id) >= 0) || nextId(list) != null;
    }

    /** Saves one place and asks Android to watch all of them (WorkGeoActivity, once both permissions are there).
     *  done hears whether Google Play services accepted the circles: "saved" is said only then. The id says which
     *  place to save again; none (or one not saved) is a new place. The answer is the place's id, or null. */
    static String save(Context c, String id, double lat, double lng, int r, String name, String emp, Done done) {
        List<JSONObject> list = places(c);
        int at = validId(id) ? find(list, id) : -1;
        if (at < 0) {
            id = nextId(list);
            if (id == null) return null;
        }
        try {
            JSONObject o = new JSONObject().put("id", id).put("lat", lat).put("lng", lng).put("r", r)
                    .put("n", cleanName(name)).put("e", cleanEmp(emp)).put("lastInNote", 0).put("lastExit", 0).put("lastOutNote", 0);
            if (at >= 0) list.set(at, o);
            else list.add(o);
        } catch (Exception e) {
            return null;
        }
        write(c, list);
        prefs(c).edit().putInt("fence", FENCE_UNKNOWN).apply();
        return watch(c, done) ? id : null;
    }

    /** A saved place as it is now (a copy), or null. */
    static JSONObject place(Context c, String id) {
        if (!validId(id)) return null;
        List<JSONObject> list = places(c);
        int at = find(list, id);
        try {
            return at < 0 ? null : new JSONObject(list.get(at).toString());
        } catch (Exception e) {
            return null;
        }
    }

    /** Saving a place again failed (Google Play services refused): the place it was before comes back, watched as
     *  before, instead of being lost. */
    static void putBack(Context c, JSONObject prev) {
        List<JSONObject> list = places(c);
        int at = find(list, prev.optString("id"));
        if (at >= 0) list.set(at, prev);
        else if (list.size() < MAX_PLACES) list.add(prev);
        write(c, list);
        restore(c);
    }

    static int fence(Context c) {
        return prefs(c).getInt("fence", FENCE_UNKNOWN);
    }

    /** Asks Android to watch the saved circles (again after a restart or an update: Android forgets geofences then). */
    static boolean watch(Context c, Done done) {
        List<JSONObject> list = places(c);
        if (list.isEmpty() || !hasFine(c) || !hasBackground(c)) return false;
        // no crossing on the moment it is saved: the user stands at the spot and starts the shift themselves
        GeofencingRequest.Builder rb = new GeofencingRequest.Builder().setInitialTrigger(0);
        for (JSONObject o : list) {
            rb.addGeofence(new Geofence.Builder()
                    .setRequestId(o.optString("id"))
                    .setCircularRegion(o.optDouble("lat"), o.optDouble("lng"), o.optInt("r", DEFAULT_R))
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_DWELL | Geofence.GEOFENCE_TRANSITION_EXIT)
                    .setLoiteringDelay(DWELL_MS)
                    .build());
        }
        GeofencingRequest req = rb.build();
        try {
            GeofencingClient gc = LocationServices.getGeofencingClient(c);
            final Context app = c.getApplicationContext();
            // the answer is kept: the status says "on" only for circles Google Play services accepted. It refuses with
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
        prefs(c).edit().putInt("fence", ok ? FENCE_OK : FENCE_REFUSED).apply();
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

    /** Turns one place off (its id), or all of them (null): stops watching it and forgets it. With no place left,
     *  everything is forgotten and our notifications close. */
    static void off(Context c, String id) {
        List<JSONObject> list = places(c);
        int at = validId(id) ? find(list, id) : -1;
        if (id != null && at < 0) return; // not a saved place: nothing to turn off
        if (at >= 0) list.remove(at);
        if (id == null || list.isEmpty()) {
            try {
                LocationServices.getGeofencingClient(c).removeGeofences(fenceIntent(c));
            } catch (Exception e) {
                // nothing was watched
            }
            prefs(c).edit().clear().apply();
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(TAG_IN, 1);
                nm.cancel(TAG_OUT, 1);
                nm.cancel(TAG_SUM, 1);
            }
            return;
        }
        try {
            List<String> gone = new ArrayList<>();
            gone.add(id);
            LocationServices.getGeofencingClient(c).removeGeofences(gone);
        } catch (Exception e) {
            // not watched
        }
        write(c, list);
        // its suggestion, if one is up, is no longer true
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null && id.equals(prefs(c).getString("noteFor", ""))) {
            cancel(nm, TAG_IN);
            cancel(nm, TAG_OUT);
        }
    }

    /** Whether a shift runs now, as the widgets see it (the last snapshot with the taps since). */
    private static boolean active(Context c) {
        JSONObject o = WidgetData.load(c);
        return o != null && o.optJSONObject("active") != null;
    }

    /** One crossing from Android (WorkGeoReceiver), for the places it names (their ids). */
    static void crossing(Context c, boolean in, List<String> ids) {
        if (!on(c)) return;
        List<JSONObject> list = places(c);
        long now = System.currentTimeMillis();
        boolean act = active(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        JSONObject note = null;
        String d = null;
        try {
            for (String id : ids) {
                int at = find(list, id);
                if (at < 0) continue;
                JSONObject o = list.get(at);
                String x = decide(in, act, now, o.optLong("lastInNote"), o.optLong("lastExit"), o.optLong("lastOutNote"));
                if (!in) o.put("lastExit", now);
                // one notification for the crossing: only the place it names counts as suggested (two overlapping
                // circles: the other one's suggestion is not used up by a notification nobody saw)
                if (x != null && d == null) {
                    d = x;
                    note = o;
                    o.put("start".equals(x) ? "lastInNote" : "lastOutNote", now);
                }
            }
        } catch (Exception e) {
            android.util.Log.w("ShaatiGeo", "crossing", e);
        }
        write(c, list);
        if (nm != null) {
            // left the place the suggestion is about: "start a shift?" is no longer true (another place's stays)
            if (!in) { if (ids.contains(prefs(c).getString("noteFor", ""))) cancel(nm, TAG_IN); }
            else cancel(nm, TAG_OUT);
        }
        if (d != null && nm != null) {
            prefs(c).edit().putString("noteFor", note.optString("id")).apply();
            post(c, nm, "start".equals(d), now, note.optString("id"), note.optString("n"), note.optString("e"));
        }
    }

    /** A new snapshot from the app (WidgetData.save): a suggestion the shift already answered is closed. */
    static void sync(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (active(c)) cancel(nm, TAG_IN);
        else cancel(nm, TAG_OUT);
    }

    /** The notification's "turn off" button: that place only (the other places keep their suggestions). */
    private static PendingIntent offIntent(Context c, String id) {
        Intent i = new Intent(c, WorkGeoReceiver.class).setAction(ACTION_OFF).putExtra("id", id);
        // a request code per place: one shared code let the newest notification's place replace an older one's
        return PendingIntent.getBroadcast(c, 7321 + (id == null ? 0 : id.hashCode()), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** The arrival suggestion's "no, thanks": it closes, and nothing else changes. */
    private static PendingIntent noIntent(Context c) {
        Intent i = new Intent(c, WorkGeoReceiver.class).setAction(ACTION_NO);
        return PendingIntent.getBroadcast(c, 7318, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** "No, thanks" pressed: the arrival suggestion goes (with the group's summary when it was the last). */
    static void dismiss(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) cancel(nm, TAG_IN);
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

    private static void post(Context c, NotificationManager nm, boolean start, long now, String id, String name, String emp) {
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
                    // arriving (the user, 26 Nov 2026): "start a shift" or "no, thanks". The start opens the app at
                    // ?action=arrive with this moment (t) and the place's employer: the app asks when the person came and
                    // whether they are still at work (app/arrive.js App.arriveSheet). Leaving: "end the shift" or turn
                    // that place's suggestions off.
                    .addAction(0, lc.getString(start ? R.string.w_geo_start : R.string.w_geo_stop),
                            NoteCenter.open(c, start ? "./?action=arrive&t=" + now + (emp.isEmpty() ? "" : "&emp=" + Uri.encode(emp)) : "./?action=stop", tag.hashCode() + 1))
                    .addAction(0, lc.getString(start ? R.string.w_geo_no : R.string.w_geo_off), start ? noIntent(c) : offIntent(c, id));
            // which place, when it has a name (the user's own word for it, e.g. the employer)
            if (!name.isEmpty()) b.setSubText(name);
            // the coin of Shaati, as on every other notification of the app (NoteCenter): cool arriving, happy leaving
            android.graphics.Bitmap coin = NoteCenter.bitmap(c, start ? R.drawable.w_coin_cool : R.drawable.w_coin_happy);
            if (coin != null) b.setLargeIcon(coin);
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
        if (o.optInt("off", 0) == 1) off(c, o.has("id") ? o.optString("id") : null);
        // Android drops geofences when the phone's location is turned off and on again: each open of the app watches
        // the circle again (the same id replaces the old one)
        else restore(c);
        return status(c);
    }

    static String status(Context c) {
        try {
            boolean fine = hasFine(c), bg = hasBackground(c);
            // on, as far as the user can tell: a place is saved and Android may still watch it
            boolean refused = fence(c) == FENCE_REFUSED;
            List<JSONObject> list = places(c);
            JSONArray ps = new JSONArray();
            // each place's id, radius, name and employer: never its spot
            for (JSONObject o : list) ps.put(new JSONObject().put("id", o.optString("id")).put("r", o.optInt("r", DEFAULT_R))
                    .put("n", o.optString("n")).put("e", o.optString("e")));
            int r = list.isEmpty() ? DEFAULT_R : list.get(0).optInt("r", DEFAULT_R);
            // attn: saved and allowed, but Google Play services refused to watch the circles (Location Accuracy off)
            return new JSONObject().put("geo", 1).put("on", on(c) && fine && bg && !refused).put("r", r)
                    .put("saved", on(c)).put("fg", fine).put("bg", bg).put("attn", on(c) && fine && bg && refused)
                    .put("places", ps).put("max", MAX_PLACES).toString();
        } catch (Exception e) {
            return null;
        }
    }

    /** The radius a setup link asks for (shaati-geo://save?r=300). */
    static int radius(Uri u) {
        return radius(u == null ? null : u.getQueryParameter("r"));
    }
}
