package io.github.leelor123.shifts;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Toast;

import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;

/**
 * Saving the workplace spot (Settings › My work › Suggestion when you arrive at work, src/app/arrive.js opens
 * shaati-geo://save?r=…). In this order, each step only after the one before it:
 *   1. the prominent disclosure, in Shaati's own window (WorkGeoDialog: its colours and icon, not Android's look):
 *      what the location is used for, that it is used in the background too, and that it stays on the phone.
 *      "Not now" ends here, with nothing asked and nothing saved;
 *   2. Android's precise-location permission;
 *   3. one reading of where the phone is now;
 *   4. from Android 10, "Allow all the time" (Android's own settings screen), after a line that says to pick it,
 *      from Android 11 with Android's own name for that choice (getBackgroundPermissionOptionLabel);
 *   5. the spot is saved on the phone and Android is asked to watch it (WorkGeo.save), and the screen waits for Google
 *      Play services' answer. A refusal (1000 when Google Location Accuracy is off) brings Play services' own window
 *      to turn the needed location setting on, then one more try; refused again, the feature is turned off and a line
 *      says why, so the app never shows "on" for a circle nobody watches;
 *   6. the suggestion is a notification: if Shaati's notifications are off, a line says so and asks for them
 *      (Android 13's notification permission, or the app's notification settings), before the "saved" line.
 * Any link may open this screen (it has to be reachable from the page), so it never saves anything without these
 * steps and the user's own taps.
 */
public class WorkGeoActivity extends Activity {
    private static final int ASK_FINE = 7311, ASK_BACKGROUND = 7312, ASK_NOTES = 7313, ASK_ACCURACY = 7314;
    private int mRadius = WorkGeo.DEFAULT_R;
    private Location mSpot;
    private Context mLang;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        mRadius = WorkGeo.radius(getIntent() == null ? null : getIntent().getData());
        mLang = WidgetLang.context(this);
        if (savedInstanceState != null) { finish(); return; } // turned mid-way: begun again from the app
        dialog()
                .setTitle(mLang.getString(R.string.w_geo_disc_t))
                .setMessage(mLang.getString(R.string.w_geo_disc))
                .setPositiveButton(mLang.getString(R.string.w_geo_go), (d, w) -> askFine())
                .setNegativeButton(mLang.getString(R.string.w_geo_not_now), (d, w) -> finish())
                .setOnCancelListener(d -> finish())
                .show();
    }

    /** Shaati's own window: its theme (WorkGeoDialog in w_styles.xml) and the app icon. */
    private AlertDialog.Builder dialog() {
        return new AlertDialog.Builder(this).setIcon(getApplicationInfo().icon);
    }

    private void say(int res) {
        Toast.makeText(getApplicationContext(), mLang.getString(res), Toast.LENGTH_LONG).show();
    }

    private void askFine() {
        if (WorkGeo.hasFine(this)) { locate(); return; }
        requestPermissions(new String[] { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, ASK_FINE);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == ASK_FINE) {
            if (WorkGeo.hasFine(this)) locate();
            else { say(R.string.w_geo_need_precise); finish(); }
        } else if (requestCode == ASK_BACKGROUND) {
            if (WorkGeo.hasBackground(this)) done();
            else { say(R.string.w_geo_need_always); finish(); }
        } else if (requestCode == ASK_NOTES) {
            // refused for good earlier, Android answers at once without a window: the app's notification settings instead
            if (!notesOn() && !shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) openNoteSettings();
            saved();
        }
    }

    private void locate() {
        try {
            LocationServices.getFusedLocationProviderClient(this)
                    .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, new CancellationTokenSource().getToken())
                    .addOnCompleteListener(t -> {
                        Location l = t.isSuccessful() ? t.getResult() : null;
                        if (l == null) { say(R.string.w_geo_no_fix); finish(); return; }
                        mSpot = l;
                        askBackground();
                    });
        } catch (SecurityException e) {
            say(R.string.w_geo_need_precise);
            finish();
        }
    }

    private void askBackground() {
        if (WorkGeo.hasBackground(this)) { done(); return; }
        dialog()
                .setTitle(mLang.getString(R.string.w_geo_always_t))
                .setMessage(alwaysLine())
                .setPositiveButton(mLang.getString(R.string.w_geo_go), (d, w) -> {
                    if (Build.VERSION.SDK_INT >= 29) requestPermissions(new String[] { Manifest.permission.ACCESS_BACKGROUND_LOCATION }, ASK_BACKGROUND);
                    else done();
                })
                .setNegativeButton(mLang.getString(R.string.w_geo_not_now), (d, w) -> finish())
                .setOnCancelListener(d -> finish())
                .show();
    }

    /** The line before "Allow all the time": from Android 11 it names the choice as the phone's next screen does. */
    private String alwaysLine() {
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                CharSequence label = getPackageManager().getBackgroundPermissionOptionLabel();
                if (label != null && label.length() > 0) return mLang.getString(R.string.w_geo_always_x, label);
            } catch (Exception ignored) {
                // the fixed line below
            }
        }
        return mLang.getString(R.string.w_geo_always); // Android 10: the fixed name
    }

    private void done() {
        if (mSpot == null) { finish(); return; }
        boolean asked = WorkGeo.save(getApplicationContext(), mSpot.getLatitude(), mSpot.getLongitude(), mRadius,
                (ok, code) -> runOnUiThread(() -> watched(ok, code, false)));
        if (!asked) { say(R.string.w_geo_need_always); finish(); }
    }

    /** Google Play services' answer: watched (on to the notifications check), or refused (the location setting). */
    private void watched(boolean ok, int code, boolean again) {
        if (isFinishing() || isDestroyed()) return;
        if (ok) { notesStep(); return; }
        android.util.Log.w("ShaatiGeo", "circle refused: " + code + (again ? " (after the settings)" : ""));
        if (again) { refused(); return; }
        askAccuracy();
    }

    /** Play services' own window for the location setting a geofence needs (Google Location Accuracy), then a retry. */
    private void askAccuracy() {
        com.google.android.gms.location.LocationRequest lr =
                new com.google.android.gms.location.LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10000).build();
        com.google.android.gms.location.LocationSettingsRequest req = new com.google.android.gms.location.LocationSettingsRequest.Builder()
                .addLocationRequest(lr).setAlwaysShow(true).build();
        LocationServices.getSettingsClient(this).checkLocationSettings(req)
                .addOnSuccessListener(this, r -> retry()) // the settings are right already: one more try
                .addOnFailureListener(this, e -> {
                    if (e instanceof com.google.android.gms.common.api.ResolvableApiException) {
                        try {
                            ((com.google.android.gms.common.api.ResolvableApiException) e).startResolutionForResult(this, ASK_ACCURACY);
                            return;
                        } catch (Exception x) {
                            android.util.Log.w("ShaatiGeo", "location settings window", x);
                        }
                    }
                    refused();
                });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != ASK_ACCURACY) return;
        if (resultCode == RESULT_OK) retry();
        else refused();
    }

    private void retry() {
        boolean asked = WorkGeo.watch(getApplicationContext(), (ok, code) -> runOnUiThread(() -> watched(ok, code, true)));
        if (!asked) refused();
    }

    /** Still refused: the feature stays off (nothing on the page says "on") and the line says what to turn on. */
    private void refused() {
        WorkGeo.off(getApplicationContext());
        say(R.string.w_geo_no_fence);
        finish();
    }

    private void notesStep() {
        if (notesOn()) { saved(); return; }
        // the suggestion is a notification: with Shaati's notifications off it would never be seen
        dialog()
                .setTitle(mLang.getString(R.string.w_geo_notes_t))
                .setMessage(mLang.getString(R.string.w_geo_notes))
                .setPositiveButton(mLang.getString(R.string.w_geo_go), (d, w) -> askNotes())
                .setNegativeButton(mLang.getString(R.string.w_geo_not_now), (d, w) -> saved())
                .setOnCancelListener(d -> saved())
                .show();
    }

    /** Whether Shaati's notifications can show (NotificationManager.areNotificationsEnabled, Android 7+). */
    private boolean notesOn() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        return nm == null || nm.areNotificationsEnabled();
    }

    private void askNotes() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, ASK_NOTES);
            return;
        }
        openNoteSettings(); // allowed but turned off in the phone's settings, or before Android 13
        saved();
    }

    private void openNoteSettings() {
        try {
            Intent i = Build.VERSION.SDK_INT >= 26
                    ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())
                    : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getPackageName(), null));
            startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception e) {
            android.util.Log.w("ShaatiGeo", "note settings", e);
        }
    }

    /** The spot is saved: the line says so, or that no suggestion can come while the notifications stay off. */
    private void saved() {
        say(notesOn() ? R.string.w_geo_saved : R.string.w_geo_need_notes);
        finish();
    }
}
