package io.github.leelor123.shifts;

import android.content.Context;
import android.content.res.Configuration;
import android.view.View;

import java.util.HashMap;
import java.util.Locale;

/**
 * The language the widgets, their look picker, their toasts and the quick-settings tile speak: the app's own, which
 * the last snapshot carries (lang), whatever language the phone is set to (many Hebrew speakers keep their phones in
 * English). A snapshot from an app before this version carries none: Hebrew, as the widgets always were.
 *
 * Texts come from a Context set to that language (res/values/w_strings.xml, Hebrew, and values-en, -ru, -ar, -fr, -es,
 * -am); the direction comes from the layout chosen for it (w_*_rtl for Hebrew and Arabic, w_*_ltr for the others,
 * made from w_*.xml by tools/android-layouts.js), since the launcher draws the widget in the phone's language.
 */
final class WidgetLang {
    /** The languages the app speaks; tools/android-strings-check.js checks this list against the app and the folders. */
    static final String[] LANGS = { "he", "en", "ru", "ar", "fr", "es", "am" };
    static final String DEFAULT = "he";

    private WidgetLang() {}

    /** A language the app speaks, or Hebrew (none given, or one this build does not know). */
    static String of(String lang) {
        if (lang != null) for (String l : LANGS) if (l.equals(lang)) return l;
        return DEFAULT;
    }

    static boolean rtl(String lang) {
        return "he".equals(lang) || "ar".equals(lang);
    }

    private static final class Entry {
        final Configuration base;
        final Context context;

        Entry(Configuration base, Context context) {
            this.base = base;
            this.context = context;
        }
    }

    private static final HashMap<String, Entry> CACHE = new HashMap<>();

    /**
     * A Context for this language, kept per language and made again when the phone's own configuration changes
     * (night mode, font size), so the colours read below Android 12 follow it.
     */
    static synchronized Context context(Context c, String lang) {
        lang = of(lang);
        Context app = c.getApplicationContext() != null ? c.getApplicationContext() : c;
        Configuration now = app.getResources().getConfiguration();
        Entry e = CACHE.get(lang);
        if (e != null && e.base.equals(now)) return e.context;
        Configuration conf = new Configuration(now);
        Locale locale = new Locale(lang);
        conf.setLocale(locale);
        conf.setLayoutDirection(locale);
        Context lc = app.createConfigurationContext(conf);
        CACHE.put(lang, new Entry(new Configuration(now), lc));
        return lc;
    }

    /** The Context for the language of the last snapshot the app sent. */
    static Context context(Context c) {
        return context(c, WidgetData.lang(c));
    }

    /** The language a Context from context() was made for. */
    static String langOf(Context lc) {
        String l = lc.getResources().getConfiguration().getLocales().get(0).getLanguage();
        return of("iw".equals(l) ? "he" : l);
    }

    /** The layout for this Context's language: right to left (Hebrew, Arabic) or left to right. */
    static int layout(Context lc, int rtlLayout, int ltrLayout) {
        return rtl(langOf(lc)) ? rtlLayout : ltrLayout;
    }

    /** The direction for views built in code (the look picker). */
    static int direction(Context lc) {
        return rtl(langOf(lc)) ? View.LAYOUT_DIRECTION_RTL : View.LAYOUT_DIRECTION_LTR;
    }

    static int textDirection(Context lc) {
        return rtl(langOf(lc)) ? View.TEXT_DIRECTION_RTL : View.TEXT_DIRECTION_LTR;
    }

    /** The Locale of this Context's language (capital letters, as in ShaatiWidget.cap). */
    static Locale locale(Context lc) {
        return lc.getResources().getConfiguration().getLocales().get(0);
    }
}
