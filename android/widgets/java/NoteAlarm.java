package io.github.leelor123.shifts;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Wakes NoteCenter up when the phone forgets the alarms or their times move: a restart (BOOT_COMPLETED), an update of
 * the app (MY_PACKAGE_REPLACED), a new clock or time zone. Exported for these system broadcasts only (only Android may
 * send them); the app's own alarms go to NoteWake, which is not exported, and anything else is ignored here.
 */
public class NoteAlarm extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String a = i == null ? null : i.getAction();
        if (!(Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)
                || Intent.ACTION_TIME_CHANGED.equals(a) || Intent.ACTION_TIMEZONE_CHANGED.equals(a))) return;
        final PendingResult r = goAsync();
        final Context app = c.getApplicationContext();
        new Thread(() -> {
            try {
                // an update from a version whose alarms pointed here: those are cancelled, NoteCenter sets them anew
                if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) NoteCenter.dropOldAlarms(app);
                NoteCenter.run(app);
                // Android forgets geofences on a restart and an update: the workplace circle is watched again (WorkGeo)
                WorkGeo.restore(app);
                RunningNote.sync(app);
            } finally {
                r.finish();
            }
        }).start();
    }
}
