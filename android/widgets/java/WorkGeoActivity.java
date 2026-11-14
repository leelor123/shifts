package io.github.leelor123.shifts;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.location.Location;
import android.os.Build;
import android.os.Bundle;
import android.widget.Toast;

import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;

/**
 * Saving the workplace spot (Settings › My work › A suggestion at work, src/app/arrive.js opens shaati-geo://save?r=…).
 * In this order, each step only after the one before it:
 *   1. the prominent disclosure, in the phone's own window: what the location is used for, that it is used in the
 *      background too, and that it stays on the phone. "Not now" ends here, with nothing asked and nothing saved;
 *   2. Android's precise-location permission;
 *   3. one reading of where the phone is now;
 *   4. from Android 10, "Allow all the time" (Android's own settings screen), after a line that says to pick it;
 *   5. the spot is saved on the phone and watched (WorkGeo.save).
 * Any link may open this screen (it has to be reachable from the page), so it never saves anything without these
 * steps and the user's own taps.
 */
public class WorkGeoActivity extends Activity {
    private static final int ASK_FINE = 7311, ASK_BACKGROUND = 7312;
    private int mRadius = WorkGeo.DEFAULT_R;
    private Location mSpot;
    private Context mLang;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        mRadius = WorkGeo.radius(getIntent() == null ? null : getIntent().getData());
        mLang = WidgetLang.context(this);
        if (savedInstanceState != null) { finish(); return; } // turned mid-way: begun again from the app
        new AlertDialog.Builder(this)
                .setTitle(mLang.getString(R.string.w_geo_disc_t))
                .setMessage(mLang.getString(R.string.w_geo_disc))
                .setPositiveButton(mLang.getString(R.string.w_geo_go), (d, w) -> askFine())
                .setNegativeButton(mLang.getString(R.string.w_geo_not_now), (d, w) -> finish())
                .setOnCancelListener(d -> finish())
                .show();
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
        new AlertDialog.Builder(this)
                .setTitle(mLang.getString(R.string.w_geo_always_t))
                .setMessage(mLang.getString(R.string.w_geo_always))
                .setPositiveButton(mLang.getString(R.string.w_geo_go), (d, w) -> {
                    if (Build.VERSION.SDK_INT >= 29) requestPermissions(new String[] { Manifest.permission.ACCESS_BACKGROUND_LOCATION }, ASK_BACKGROUND);
                    else done();
                })
                .setNegativeButton(mLang.getString(R.string.w_geo_not_now), (d, w) -> finish())
                .setOnCancelListener(d -> finish())
                .show();
    }

    private void done() {
        if (mSpot == null) { finish(); return; }
        boolean ok = WorkGeo.save(getApplicationContext(), mSpot.getLatitude(), mSpot.getLongitude(), mRadius);
        say(ok ? R.string.w_geo_saved : R.string.w_geo_need_always);
        finish();
    }
}
