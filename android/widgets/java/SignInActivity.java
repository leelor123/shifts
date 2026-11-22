package io.github.leelor123.shifts;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;

import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;

import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import org.json.JSONObject;

/**
 * Google sign-in in Android's own account picker (Credential Manager, "Sign in with Google"), for the web app in this
 * app (src/app/native-signin.js). The web way leaves the app's address for firebaseapp.com and accounts.google.com, and
 * Chrome then shows its address bar over the app: the app looked like it ran inside Google. Here the picker is
 * Android's and the app's address never changes; the page signs in to Firebase with the ID token (signInWithCredential).
 *
 * The page asks in two steps, both needed:
 *   1. over the widgets' channel, {"signin":1,"ask":1,"n":<nonce>} (LauncherActivity hands it to expect());
 *   2. from the tap, shaati-signin://google?n=<nonce>, which opens this screen (Chrome opens an app's screen only from
 *      a tap). It goes on only for the nonce the page sent over the channel in the last minute, each nonce once, so no
 *      other site or app can bring the picker up.
 * This screen has nothing of its own on the screen (SignInTheme: see-through, no animation in or out). It says it is
 * open ({"signin":1,"open":1,"n":…}), asks the picker for an ID token for Shaati's Google sign-in (the Firebase
 * project's web client, the token's "aud") with the nonce signed into it, and answers once:
 *   {"signin":1,"n":…,"t":<ID token>}, or {"signin":1,"n":…,"err":"cancel"} (the picker was closed), or
 *   {"signin":1,"n":…,"err":"fail","why":…} (no Google Play services, this app's key not registered with Google,
 *   no network, …: the page signs in the web way then).
 * The token goes only to the page over the channel (Chrome checked the site's Digital Asset Links for it), never into
 * an address, the log, a file or anything kept.
 *
 * Google knows this app by its package and its signing key's SHA-1: both keys (the upload key and Play's app-signing
 * key) are registered in Firebase (project shiftpay-70ab6, the Android app "Shaati Android"), which made the Android
 * OAuth clients. A key Google does not know gives "fail", never a stuck screen.
 */
public class SignInActivity extends Activity {
    private static final String TAG = "ShaatiSignIn";
    // Shaati's Google sign-in: the Firebase project's web client (public; node tools/fbapi.js googleclient prints it)
    static final String WEB_CLIENT = "147711002217-h79bh92gdh33o9b6sppigku6d15r10hq.apps.googleusercontent.com";
    private static final long ASK_FOR_MS = 60000L;

    /** Where the answers go while the app is open (LauncherActivity: to the page, over the channel). */
    interface Sink { void send(String message); }
    static volatile Sink sink;

    private static String sExpected;
    private static long sExpectedAt;

    /** The page's nonce: 16 to 64 url-safe characters (native-signin.js makes 22). */
    static boolean validNonce(String n) {
        return n != null && n.matches("[A-Za-z0-9_-]{16,64}");
    }

    /** A message from the page about signing in ({"signin":1,…}). */
    static boolean isSignIn(String message) {
        return message != null && message.startsWith("{\"signin\":1");
    }

    /** The page's ask over the channel: the one nonce this screen may go on with, for a minute. */
    static void expect(String message) {
        try {
            JSONObject o = new JSONObject(message);
            String n = o.optString("n", "");
            if (o.optInt("ask") != 1 || !validNonce(n)) return;
            synchronized (SignInActivity.class) {
                sExpected = n;
                sExpectedAt = SystemClock.elapsedRealtime();
            }
        } catch (Exception e) {
            // not an ask
        }
    }

    /** true once for the nonce the page asked with, within the minute. */
    private static synchronized boolean take(String n) {
        boolean ok = n != null && n.equals(sExpected) && SystemClock.elapsedRealtime() - sExpectedAt < ASK_FOR_MS;
        if (ok) sExpected = null;
        return ok;
    }

    private final Handler mMain = new Handler(Looper.getMainLooper());
    private String mNonce;
    private boolean mAnswered;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Uri u = getIntent() == null ? null : getIntent().getData();
        mNonce = u == null ? null : u.getQueryParameter("n");
        // made again by Android (the picker of the first one still answers through the sink) or not from the page
        if (savedInstanceState != null || !validNonce(mNonce)) { finish(); return; }
        waitForAsk(0);
    }

    // the page's ask (over the channel) and this screen (through Chrome) race each other: the ask is waited for, 2 s
    private void waitForAsk(int attempt) {
        if (isFinishing()) return;
        if (take(mNonce)) { pick(); return; }
        if (attempt >= 20) {
            Log.i(TAG, "no ask from the page: closed");
            finish();
            return;
        }
        mMain.postDelayed(() -> waitForAsk(attempt + 1), 100);
    }

    private void pick() {
        send(message("open", 1));
        try {
            GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(WEB_CLIENT).setNonce(mNonce).build();
            GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
            CredentialManager.create(this).getCredentialAsync(this, request, new CancellationSignal(),
                    ContextCompat.getMainExecutor(this),
                    new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                        @Override
                        public void onResult(GetCredentialResponse response) {
                            token(response.getCredential());
                        }

                        @Override
                        public void onError(GetCredentialException e) {
                            boolean cancel = e instanceof GetCredentialCancellationException;
                            Log.i(TAG, (cancel ? "closed: " : "failed: ") + e.getType());
                            answer(cancel ? error("cancel", null) : error("fail", e.getType() + " " + e.getMessage()));
                        }
                    });
        } catch (Exception e) {
            // no Credential Manager on this phone, or it refused the ask itself
            Log.i(TAG, "failed to ask: " + e.getClass().getSimpleName());
            answer(error("fail", e.getClass().getSimpleName()));
        }
    }

    private void token(Credential c) {
        if (c instanceof CustomCredential && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(c.getType())) {
            try {
                String t = GoogleIdTokenCredential.createFrom(((CustomCredential) c).getData()).getIdToken();
                Log.i(TAG, "token received (" + t.length() + " chars)");
                answer(message("t", t));
                return;
            } catch (Exception e) {
                answer(error("fail", "parse " + e.getClass().getSimpleName()));
                return;
            }
        }
        answer(error("fail", "type " + (c == null ? "none" : c.getType())));
    }

    /** {"signin":1,"n":<nonce>}, and one more field when given. */
    private JSONObject message(String key, Object value) {
        JSONObject o = new JSONObject();
        try {
            o.put("signin", 1);
            o.put("n", mNonce);
            if (key != null) o.put(key, value);
        } catch (Exception e) {
            // never: plain values
        }
        return o;
    }

    private JSONObject error(String err, String why) {
        JSONObject o = message(null, null);
        try {
            o.put("err", err);
            if (why != null) o.put("why", why.length() > 160 ? why.substring(0, 160) : why);
        } catch (Exception e) {
            // never: plain values
        }
        return o;
    }

    private void send(JSONObject o) {
        Sink s = sink;
        if (s != null) s.send(o.toString());
        else Log.i(TAG, "no channel to the page");
    }

    /** The one answer, then this screen closes (the app under it was never covered). */
    private void answer(JSONObject o) {
        if (mAnswered) return;
        mAnswered = true;
        send(o);
        finish();
    }

    @Override
    public void finish() {
        super.finish();
        overridePendingTransition(0, 0);
    }
}
