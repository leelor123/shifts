package io.github.leelor123.shifts;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Wakes NoteCenter up: at a notification's time (its own alarm), and when the phone forgets the alarms or their times
 * move: a restart (BOOT_COMPLETED), an update of the app (MY_PACKAGE_REPLACED), a new clock or time zone.
 */
public class NoteAlarm extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String a = i == null ? null : i.getAction();
        if (a == null) return;
        if (NoteCenter.ACTION.equals(a) || Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)
                || Intent.ACTION_TIME_CHANGED.equals(a) || Intent.ACTION_TIMEZONE_CHANGED.equals(a)) {
            final PendingResult r = goAsync();
            final Context app = c.getApplicationContext();
            new Thread(() -> {
                try {
                    NoteCenter.run(app);
                } finally {
                    r.finish();
                }
            }).start();
        }
    }
}
