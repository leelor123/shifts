package io.github.leelor123.shifts;

import android.app.Activity;
import android.util.Log;

import androidx.browser.customtabs.CustomTabsSession;

import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

/**
 * Google Play's In-App Review, asked for by the web app (src/app/review.js) over the widgets' message channel
 * (LauncherActivity, tools/android.js): the page sends "shaati:review" right after a good moment, and Google
 * decides whether its window shows (a quota, someone who already rated). Nothing in the app waits for it. The page
 * hears "shaati:review:done" when Google's flow ended (shown or not: Google never says), or "shaati:review:no" when
 * it could not be asked (no Play Store, an error), and then shows its own card instead.
 */
final class PlayReview {
    private PlayReview() {}

    private static boolean sAsking;

    static void ask(final Activity a, final CustomTabsSession s) {
        if (sAsking || a == null || a.isFinishing()) { reply(s, "shaati:review:no"); return; }
        sAsking = true;
        try {
            final ReviewManager m = ReviewManagerFactory.create(a.getApplicationContext());
            m.requestReviewFlow().addOnCompleteListener(task -> {
                if (!task.isSuccessful() || a.isFinishing()) { done(s, "shaati:review:no"); return; }
                ReviewInfo info = task.getResult();
                try {
                    m.launchReviewFlow(a, info).addOnCompleteListener(t -> done(s, "shaati:review:done"));
                } catch (Exception e) {
                    done(s, "shaati:review:no");
                }
            });
        } catch (Exception e) {
            done(s, "shaati:review:no");
        }
    }

    private static void done(CustomTabsSession s, String message) {
        sAsking = false;
        reply(s, message);
    }

    private static void reply(CustomTabsSession s, String message) {
        int sent = s == null ? -1 : s.postMessage(message, null);
        Log.i("ShaatiReview", message + " sent: " + sent);
    }
}
