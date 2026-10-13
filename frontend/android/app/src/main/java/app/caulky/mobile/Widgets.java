package app.caulky.mobile;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Dibuja todos los widgets. Cada uno se adapta al tamaño: pequeño (1x1) muestra solo la
 * cifra principal; más grande añade filas (cuentas, presupuestos...) hasta llenar el hueco.
 */
final class Widgets {

    static final String QUICKADD = "quickadd";
    static final String ACCOUNTS = "accounts";
    static final String BUDGETS = "budgets";
    static final String MONTH = "month";

    /** Por debajo de esto (dp) se usa el diseño pequeño. */
    private static final int SMALL_W = 130;
    private static final int SMALL_H = 110;
    /** Ancho (dp) a partir del cual el de añadir rápido muestra el texto. */
    private static final int QUICKADD_WIDE_W = 150;

    private static final int[] WIDTHS = { 40, 130, 250 };
    private static final int[] HEIGHTS = { 40, 110, 180, 260, 340 };

    private Widgets() {}

    static void update(Context context, AppWidgetManager manager, int id, String kind) {
        JSONObject data = WidgetData.load(context);
        WidgetStyle style = WidgetStyle.from(data);
        RemoteViews views;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+: se dan varios diseños por tamaño y el sistema elige el que cabe
            Map<SizeF, RemoteViews> bySize = new LinkedHashMap<>();
            if (QUICKADD.equals(kind)) {
                bySize.put(new SizeF(40f, 40f), build(context, kind, data, style, 40, 40, id));
                bySize.put(new SizeF(QUICKADD_WIDE_W, 40f), build(context, kind, data, style, QUICKADD_WIDE_W, 40, id));
            } else {
                for (int w : WIDTHS) for (int h : HEIGHTS) {
                    bySize.put(new SizeF(w, h), build(context, kind, data, style, w, h, id));
                }
            }
            views = new RemoteViews(bySize);
        } else {
            Bundle o = manager.getAppWidgetOptions(id);
            int w = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 40);
            int h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 40);
            views = build(context, kind, data, style, w, h, id);
        }
        manager.updateAppWidget(id, views);
    }

    private static RemoteViews build(Context context, String kind, JSONObject data, WidgetStyle style, int w, int h, int id) {
        if (QUICKADD.equals(kind)) return quickAdd(context, style, w >= QUICKADD_WIDE_W);

        JSONObject block = data.optJSONObject(kind);
        if (block == null) block = new JSONObject();
        if (BUDGETS.equals(kind)) {
            block = budgetsFor(block, data, id);
            // 2x1: un solo presupuesto con su barra
            if (w >= SMALL_W && h < SMALL_H) return oneBudget(context, block, style);
        }
        boolean small = w < SMALL_W || h < SMALL_H;
        RemoteViews v = new RemoteViews(context.getPackageName(), small ? R.layout.widget_small : R.layout.widget_card);
        paintBackground(v, style);

        String title = block.optString("title", defaultTitle(kind));
        if (small) title = block.optString("smallTitle", title);
        v.setTextViewText(R.id.title, title);
        v.setTextColor(R.id.title, style.muted);
        v.setTextViewText(R.id.big, block.optString(small ? "smallBig" : "big", block.optString("big", "—")));
        v.setTextColor(R.id.big, block.optBoolean(small ? "smallOver" : "bigOver", false) ? style.over : style.text);
        String sub = small ? block.optString("smallSub", "") : block.optString("sub", "");
        if (data.optJSONObject(kind) == null) sub = "Abre Caulky para cargar los datos";
        v.setTextViewText(R.id.sub, sub);
        v.setTextColor(R.id.sub, style.muted);
        v.setViewVisibility(R.id.sub, sub.isEmpty() ? View.GONE : View.VISIBLE);

        if (!small) {
            v.removeAllViews(R.id.rows);
            JSONArray items = block.optJSONArray("items");
            boolean bars = BUDGETS.equals(kind);
            int rowH = bars ? 38 : 24;
            int room = Math.max(0, (h - 100) / rowH);
            int n = items == null ? 0 : Math.min(items.length(), room);
            for (int i = 0; i < n; i++) {
                JSONObject item = items.optJSONObject(i);
                if (item != null) v.addView(R.id.rows, bars ? barRow(context, item, style) : valueRow(context, item, style));
            }
        }
        v.setOnClickPendingIntent(R.id.widget_root, openApp(context, kind));
        return v;
    }

    /**
     * Presupuestos que enseña este widget: los elegidos para él en la app (en ese orden) o,
     * si no se eligió ninguno, todos, del más gastado al menos. La cifra grande y el 1x1
     * son del primero.
     */
    private static JSONObject budgetsFor(JSONObject block, JSONObject data, int id) {
        JSONArray all = block.optJSONArray("items");
        if (all == null || all.length() == 0) return block;
        JSONObject selections = data.optJSONObject("budgetSelection");
        JSONArray chosen = selections == null ? null : selections.optJSONArray(String.valueOf(id));
        JSONArray items = new JSONArray();
        if (chosen != null && chosen.length() > 0) {
            for (int i = 0; i < chosen.length(); i++) {
                String want = chosen.optString(i);
                for (int j = 0; j < all.length(); j++) {
                    JSONObject it = all.optJSONObject(j);
                    if (it != null && want.equals(it.optString("id"))) items.put(it);
                }
            }
        }
        if (items.length() == 0) items = all;
        try {
            JSONObject out = new JSONObject(block.toString());
            out.put("items", items);
            JSONObject first = items.getJSONObject(0);
            int pct = first.optInt("pctRaw", first.optInt("pct", 0));
            boolean over = first.optBoolean("over", false);
            int overCount = 0;
            for (int i = 0; i < items.length(); i++) if (items.getJSONObject(i).optBoolean("over", false)) overCount++;
            out.put("big", pct + "% " + first.optString("name"));
            out.put("bigOver", over);
            out.put("sub", overCount > 0 ? overCount + (overCount == 1 ? " pasado" : " pasados") + " del límite" : "Todo dentro del límite");
            out.put("smallBig", pct + "%");
            out.put("smallOver", over);
            out.put("smallSub", first.optString("name"));
            return out;
        } catch (org.json.JSONException e) {
            return block;
        }
    }

    /** Presupuesto en 2x1: nombre y porcentaje, barra, y gastado / límite. */
    private static RemoteViews oneBudget(Context context, JSONObject block, WidgetStyle style) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_budget_one);
        paintBackground(v, style);
        JSONArray items = block.optJSONArray("items");
        JSONObject item = items != null && items.length() > 0 ? items.optJSONObject(0) : null;
        if (item == null) {
            v.setTextViewText(R.id.name, "Presupuestos");
            v.setTextViewText(R.id.pct, "");
            v.setTextViewText(R.id.value, block.has("items") ? "Sin presupuestos" : "Abre Caulky para cargar los datos");
            v.setProgressBar(R.id.bar, 100, 0, false);
        } else {
            boolean over = item.optBoolean("over", false);
            v.setTextViewText(R.id.name, item.optString("name"));
            v.setTextViewText(R.id.pct, item.optInt("pctRaw", item.optInt("pct", 0)) + "%");
            v.setTextColor(R.id.pct, over ? style.over : style.text);
            v.setTextViewText(R.id.value, item.optString("value"));
            v.setProgressBar(R.id.bar, 100, Math.max(0, Math.min(100, item.optInt("pct", 0))), false);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                v.setColorStateList(R.id.bar, "setProgressTintList", ColorStateList.valueOf(over ? style.over : style.accent));
                v.setColorStateList(R.id.bar, "setProgressBackgroundTintList", ColorStateList.valueOf(style.track));
            }
        }
        v.setTextColor(R.id.name, style.text);
        v.setTextColor(R.id.value, style.muted);
        v.setOnClickPendingIntent(R.id.widget_root, openApp(context, BUDGETS));
        return v;
    }

    private static RemoteViews valueRow(Context context, JSONObject item, WidgetStyle style) {
        RemoteViews r = new RemoteViews(context.getPackageName(), R.layout.widget_row_value);
        r.setTextViewText(R.id.name, item.optString("name"));
        r.setTextColor(R.id.name, style.text);
        r.setTextViewText(R.id.value, item.optString("value"));
        r.setTextColor(R.id.value, item.optBoolean("over", false) ? style.over : style.text);
        String dot = item.optString("color", "");
        if (dot.isEmpty()) {
            r.setViewVisibility(R.id.dot, View.GONE);
        } else {
            r.setTextColor(R.id.dot, parse(dot, style.muted));
        }
        return r;
    }

    private static RemoteViews barRow(Context context, JSONObject item, WidgetStyle style) {
        RemoteViews r = new RemoteViews(context.getPackageName(), R.layout.widget_row_bar);
        boolean over = item.optBoolean("over", false);
        r.setTextViewText(R.id.name, item.optString("name"));
        r.setTextColor(R.id.name, style.text);
        r.setTextViewText(R.id.value, item.optString("value"));
        r.setTextColor(R.id.value, over ? style.over : style.muted);
        r.setProgressBar(R.id.bar, 100, Math.max(0, Math.min(100, item.optInt("pct", 0))), false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            r.setColorStateList(R.id.bar, "setProgressTintList", ColorStateList.valueOf(over ? style.over : style.accent));
            r.setColorStateList(R.id.bar, "setProgressBackgroundTintList", ColorStateList.valueOf(style.track));
        }
        return r;
    }

    private static RemoteViews quickAdd(Context context, WidgetStyle style, boolean wide) {
        RemoteViews v = new RemoteViews(context.getPackageName(), wide ? R.layout.widget_quickadd : R.layout.widget_quickadd_small);
        paintBackground(v, style);
        v.setInt(R.id.plus_circle, "setColorFilter", style.accent);
        v.setInt(R.id.plus_icon, "setColorFilter", style.accentText);
        if (wide) {
            v.setTextColor(R.id.title, style.text);
            v.setTextColor(R.id.sub, style.muted);
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("caulky://speedmode"), context, QuickAddActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        v.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(
            context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return v;
    }

    /** Fondo: una forma redondeada blanca teñida con el color y la opacidad elegidos. */
    private static void paintBackground(RemoteViews v, WidgetStyle style) {
        v.setInt(R.id.bg, "setColorFilter", style.bg);
        v.setInt(R.id.bg, "setImageAlpha", style.bgAlpha);
    }

    private static PendingIntent openApp(Context context, String kind) {
        String path;
        int code;
        switch (kind) {
            case ACCOUNTS: path = "cuentas"; code = 1; break;
            case BUDGETS: path = "budgets"; code = 2; break;
            default: path = ""; code = 3; break;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("caulky://open/" + path), context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static String defaultTitle(String kind) {
        switch (kind) {
            case ACCOUNTS: return "Cuentas";
            case BUDGETS: return "Presupuestos";
            default: return "Este mes";
        }
    }

    private static int parse(String color, int fallback) {
        try {
            return Color.parseColor(color);
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }
}
