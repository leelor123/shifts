package io.github.leelor123.shifts;

import android.content.Context;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;

/**
 * The four looks a Shaati widget can wear, chosen per widget in WidgetStyleActivity: midnight and gold (the
 * app's pay card), clean (white by day, dark by night), the wallpaper's colours (Android 12+), and the Shaati
 * coin (warm cream by day, navy by night, with the coin reacting to the numbers).
 *
 * From Android 12 the colours are handed to the launcher as resources, so a widget follows the phone into dark
 * mode by itself; below 12 they are read once, when the widget is drawn.
 */
final class WidgetLook {
    static final int MIDNIGHT = 0, CLEAN = 1, WALLPAPER = 2, COIN = 3, SEA = 4, RAIN = 5;
    /** Each look's name (res/values/w_strings.xml and its translations), in the order of the numbers above. */
    static final int[] NAMES = { R.string.w_look_midnight, R.string.w_look_clean, R.string.w_look_wallpaper, R.string.w_look_coin, R.string.w_look_sea, R.string.w_look_rain };
    private static final String PREFS = "shaati_widget_looks";

    final int style;
    final int bg, chip, dot, text, sub, label, icon, track, fill;

    private WidgetLook(int style, int bg, int chip, int dot, int text, int sub, int label, int icon, int track, int fill) {
        this.style = style;
        this.bg = bg; this.chip = chip; this.dot = dot;
        this.text = text; this.sub = sub; this.label = label; this.icon = icon; this.track = track; this.fill = fill;
    }

    static WidgetLook of(int style) {
        switch (style) {
            case CLEAN:
                return new WidgetLook(CLEAN, R.drawable.w_bg_c, R.drawable.w_chip_c, R.drawable.w_dot_c, R.color.w_c_text, R.color.w_c_sub, R.color.w_c_label, R.color.w_c_icon, R.color.w_c_track, R.color.w_c_fill);
            case WALLPAPER:
                return new WidgetLook(WALLPAPER, R.drawable.w_bg_w, R.drawable.w_chip_w, R.drawable.w_dot_w, R.color.w_w_text, R.color.w_w_sub, R.color.w_w_label, R.color.w_w_icon, R.color.w_w_track, R.color.w_w_fill);
            case SEA:
                return new WidgetLook(SEA, R.drawable.w_bg_s, R.drawable.w_chip_s, R.drawable.w_dot_s, R.color.w_s_text, R.color.w_s_sub, R.color.w_s_label, R.color.w_s_icon, R.color.w_s_track, R.color.w_s_fill);
            case RAIN:
                return new WidgetLook(RAIN, R.drawable.w_bg_r, R.drawable.w_chip_r, R.drawable.w_dot_r, R.color.w_r_text, R.color.w_r_sub, R.color.w_r_label, R.color.w_r_icon, R.color.w_r_track, R.color.w_r_fill);
            case COIN:
                return new WidgetLook(COIN, R.drawable.w_bg_k, R.drawable.w_chip_k, R.drawable.w_dot_k, R.color.w_k_text, R.color.w_k_sub, R.color.w_k_label, R.color.w_k_icon, R.color.w_k_track, R.color.w_k_fill);
            default:
                return new WidgetLook(MIDNIGHT, R.drawable.w_bg_m, R.drawable.w_chip_m, R.drawable.w_dot_m, R.color.w_m_text, R.color.w_m_sub, R.color.w_m_label, R.color.w_m_icon, R.color.w_m_track, R.color.w_m_fill);
        }
    }

    /** The looks this phone can show (the wallpaper colours need Android 12). */
    static int[] available() {
        return Build.VERSION.SDK_INT >= 31 ? new int[] { MIDNIGHT, SEA, RAIN, CLEAN, WALLPAPER, COIN } : new int[] { MIDNIGHT, SEA, RAIN, CLEAN, COIN };
    }

    /** The look chosen for one widget on the home screen (midnight until one is chosen). */
    static WidgetLook forWidget(Context c, int id) {
        int s = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt("w" + id, MIDNIGHT);
        if (s == WALLPAPER && Build.VERSION.SDK_INT < 31) s = CLEAN;
        return of(s);
    }

    static void choose(Context c, int id, int style) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt("w" + id, style).apply();
    }

    static void forget(Context c, int id) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("w" + id).apply();
    }

    boolean coin() {
        return style == COIN;
    }

    /**
     * The widget's ground: its colours, and for the sea and the rain the moving scene over them (Android 12+, where the
     * launcher clips it to the rounded corners; below 12 the ground stays still).
     */
    void frame(RemoteViews v) {
        background(v, R.id.w_root, bg);
        boolean moving = Build.VERSION.SDK_INT >= 31;
        v.setViewVisibility(R.id.w_scene_sea, moving && style == SEA ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.w_scene_rain, moving && style == RAIN ? View.VISIBLE : View.GONE);
    }

    void background(RemoteViews v, int id, int drawable) {
        v.setInt(id, "setBackgroundResource", drawable);
    }

    void textColor(Context c, RemoteViews v, int id, int color) {
        if (Build.VERSION.SDK_INT >= 31) v.setColorStateList(id, "setTextColor", color);
        else v.setTextColor(id, c.getColor(color));
    }

    void iconColor(Context c, RemoteViews v, int id) {
        if (Build.VERSION.SDK_INT >= 31) v.setColorStateList(id, "setImageTintList", icon);
        else v.setInt(id, "setColorFilter", c.getColor(icon));
    }

    /** The progress bar in this look's colours (below Android 12 it keeps its own gold on grey). */
    void bar(RemoteViews v, int id) {
        if (Build.VERSION.SDK_INT < 31) return;
        v.setColorStateList(id, "setProgressTintList", fill);
        v.setColorStateList(id, "setProgressBackgroundTintList", track);
    }

    static final int[] FACES = { R.id.w_face_happy, R.id.w_face_wow, R.id.w_face_cool, R.id.w_face_party, R.id.w_face_sleepy };

    /** Shows the coin (in the coin look) with the face that fits (one of FACES), or hides it. */
    void coin(RemoteViews v, int face) {
        v.setViewVisibility(R.id.w_coin, coin() ? View.VISIBLE : View.GONE);
        for (int f : FACES) v.setViewVisibility(f, coin() && f == face ? View.VISIBLE : View.GONE);
    }

    /** The little clock with its turning second hand (w_clock_box), in this look's icon colour; the coin look has the coin, the sea its sun. */
    void dial(RemoteViews v) {
        // the sea has its sun in that corner, the coin look its coin
        v.setViewVisibility(R.id.w_clock_box, coin() || style == SEA ? View.GONE : View.VISIBLE);
        background(v, R.id.w_clock_box, dot);
        if (Build.VERSION.SDK_INT >= 31) v.setColorStateList(R.id.w_dial, "setIndeterminateTintList", icon);
    }
}
