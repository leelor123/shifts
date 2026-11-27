package io.github.leelor123.shifts;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * The app's own alarms (not exported: no other app can send these): a notification's time (NoteCenter.ACTION) and the
 * running shift's bar moving on (RunningNote.TICK). The phone's own wake-ups (a restart, an update, a new clock) come
 * through NoteAlarm, which takes only those. Until 27 Nov 2026 one exported receiver took both, so any app on the phone
 * could make Shaati run its notifications at will (security audit).
 */
public class NoteWake extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String a = i == null ? null : i.getAction();
        if (a == null) return;
        final Context app = c.getApplicationContext();
        // the running shift's bar moves on (RunningNote): its own alarm, while a shift runs (Android 16 and later)
        if (RunningNote.TICK.equals(a)) { RunningNote.sync(app); return; }
        if (!NoteCenter.ACTION.equals(a)) return;
        final PendingResult r = goAsync();
        new Thread(() -> {
            try {
                NoteCenter.run(app);
            } finally {
                r.finish();
            }
        }).start();
    }
}
