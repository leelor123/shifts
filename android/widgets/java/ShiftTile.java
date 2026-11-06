package io.github.leelor123.shifts;

import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

import org.json.JSONObject;

/**
 * Shaati's quick-settings tile (the panel pulled down from the top of the screen): "start shift", or, while a shift
 * runs, "end shift". It does what the shift widget's button does (ShaatiWidget.onReceive): the tap is kept on the
 * phone and the app saves it when it opens; when the widget would open the app instead (several roles and none chosen
 * yet, or a snapshot from an app before the widgets' taps), the tile opens the app with the same action.
 */
public class ShiftTile extends TileService {
    @Override
    public void onStartListening() {
        show();
    }

    @Override
    public void onClick() {
        JSONObject d = WidgetData.load(this);
        JSONObject a = d == null ? null : d.optJSONObject("active");
        String type = a != null ? "stop" : "start";
        boolean here = ShaatiWidget.direct(d) && (a != null || d.optJSONObject("next") != null);
        if (here) {
            Intent i = new Intent(ShaatiWidget.TAP, Uri.parse("shaati://widget/" + type), this, ShiftWidget.class);
            sendBroadcast(i);
        } else {
            PendingIntent p = ShaatiWidget.open(this, type, 9100);
            if (Build.VERSION.SDK_INT >= 34) startActivityAndCollapse(p);
            else {
                try {
                    p.send();
                } catch (Exception e) {
                    // the app could not be opened: nothing to undo
                }
            }
        }
        show();
    }

    /** The tile's look: on while a shift runs (with how it started), off otherwise. */
    private void show() {
        Tile t = getQsTile();
        if (t == null) return;
        JSONObject d = WidgetData.load(this);
        JSONObject a = d == null ? null : d.optJSONObject("active");
        t.setState(a != null ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        t.setLabel(getString(a != null ? R.string.w_end_shift : R.string.w_start));
        t.setIcon(Icon.createWithResource(this, a != null ? R.drawable.w_ic_clock : R.drawable.w_ic_play));
        if (Build.VERSION.SDK_INT >= 29) {
            String role = a != null ? a.optString("role", "") : "";
            t.setSubtitle(a != null ? (role.isEmpty() ? getString(R.string.w_running) : role) : getString(R.string.w_app));
        }
        t.updateTile();
    }
}
