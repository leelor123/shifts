package io.github.leelor123.shifts;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Intent;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.RemoteViews;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

/**
 * Choosing a widget look: opens when a Shaati widget is added to the home screen, and again from the widget
 * (long press, then its settings; Android 12+). Each look is shown as the real widget with the real numbers
 * (WidgetData; a sample month before the app was ever opened), and a tap keeps it for that one widget.
 */
public class WidgetStyleActivity extends Activity {
    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private ShaatiWidget provider;
    private JSONObject data;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        Bundle x = getIntent().getExtras();
        if (x != null) widgetId = x.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        setResult(RESULT_CANCELED, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
        AppWidgetProviderInfo info = widgetId == AppWidgetManager.INVALID_APPWIDGET_ID ? null : AppWidgetManager.getInstance(this).getAppWidgetInfo(widgetId);
        if (info == null || !getPackageName().equals(info.provider.getPackageName())) { finish(); return; }
        try {
            provider = (ShaatiWidget) Class.forName(info.provider.getClassName()).getDeclaredConstructor().newInstance();
        } catch (Exception e) {
            finish();
            return;
        }
        data = WidgetData.load(this);
        if (data == null) data = sample();
        setContentView(page(info));
    }

    private View page(AppWidgetProviderInfo info) {
        ScrollView scroll = new ScrollView(this);
        scroll.setFitsSystemWindows(true);
        scroll.setBackgroundColor(getColor(R.color.w_pick_bg));
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        col.setPadding(dp(20), dp(24), dp(20), dp(24));
        scroll.addView(col);

        TextView title = label("איך הווידג׳ט ייראה?", 24, R.color.w_pick_text, true);
        col.addView(title);
        TextView sub = label("אפשר לשנות אחר כך בלחיצה ארוכה על הווידג׳ט.", 15, R.color.w_pick_sub, false);
        sub.setPadding(0, dp(6), 0, dp(12));
        col.addView(sub);

        int current = WidgetLook.forWidget(this, widgetId).style;
        String kind = info.provider.getClassName();
        int h = kind.endsWith("ComboWidget") ? 176 : kind.endsWith("MonthWidget") ? 156 : 80;
        int w = kind.endsWith("MonthWidget") ? dp(156) : ViewGroup.LayoutParams.MATCH_PARENT;
        for (int style : WidgetLook.available()) col.addView(option(style, style == current, w, dp(h)));
        return scroll;
    }

    /** One look: the widget itself drawn in it, its name under it, the whole card one tap target. */
    private View option(final int style, boolean chosen, int w, int h) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.setPadding(dp(12), dp(12), dp(12), dp(10));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(getColor(R.color.w_pick_card));
        bg.setCornerRadius(dp(24));
        if (chosen) bg.setStroke(dp(2), getColor(R.color.w_pick_ring));
        card.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(12);
        card.setLayoutParams(lp);

        FrameLayout frame = new FrameLayout(this);
        RemoteViews rv = provider.build(this, data, WidgetLook.of(style));
        View preview = rv.apply(this, frame);
        frame.addView(preview, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        // a cover over the preview: its own buttons would open the app instead of choosing the look
        View cover = new View(this);
        frame.addView(cover, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        card.addView(frame, new LinearLayout.LayoutParams(w, h));

        TextView name = label(WidgetLook.NAMES[style], 16, R.color.w_pick_text, true);
        name.setGravity(Gravity.CENTER);
        name.setPadding(0, dp(10), 0, 0);
        card.addView(name);

        card.setContentDescription(WidgetLook.NAMES[style]);
        View.OnClickListener pick = v -> choose(style);
        card.setOnClickListener(pick);
        cover.setOnClickListener(pick);
        return card;
    }

    private void choose(int style) {
        WidgetLook.choose(this, widgetId, style);
        AppWidgetManager.getInstance(this).updateAppWidget(widgetId, provider.build(this, WidgetData.load(this), WidgetLook.of(style)));
        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
        finish();
    }

    private TextView label(String text, int sp, int color, boolean strong) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(getColor(color));
        t.setTextDirection(View.TEXT_DIRECTION_RTL);
        if (strong) t.setTypeface(Build.VERSION.SDK_INT >= 26 ? getResources().getFont(R.font.w_rubik_medium) : Typeface.DEFAULT_BOLD);
        return t;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private static String inDays(int n) {
        java.util.Calendar k = java.util.Calendar.getInstance();
        k.add(java.util.Calendar.DAY_OF_MONTH, n);
        return String.format(java.util.Locale.ROOT, "%04d-%02d-%02d", k.get(java.util.Calendar.YEAR), k.get(java.util.Calendar.MONTH) + 1, k.get(java.util.Calendar.DAY_OF_MONTH));
    }

    /** A month to show the looks on before the app has sent its first numbers (the widget itself keeps showing "₪—"). */
    private static JSONObject sample() {
        try {
            return new JSONObject("{\"v\":1,\"period\":\"החודש\",\"gross\":\"₪2,840\",\"net\":\"₪2,310\",\"hours\":\"41\",\"today\":\"₪0\",\"pace\":\"₪4,100\","
                    + "\"goal\":{\"pct\":64,\"of\":\"₪4,400\",\"left\":\"₪1,560\"}}")
                    .put("payday", new JSONObject().put("date", inDays(9)).put("amount", "₪2,310"));
        } catch (Exception e) {
            return null;
        }
    }
}
