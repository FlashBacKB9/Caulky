package app.caulky.mobile;

import android.graphics.Color;
import org.json.JSONObject;

/**
 * Colores de los widgets, elegidos en la app (Ajustes → Widgets). Por defecto el estilo
 * Nothing: gris oscuro, blanco y el rojo solo para pasarse de presupuesto.
 */
final class WidgetStyle {

    final int bg;
    final int bgAlpha;
    final int text;
    final int muted;
    final int accent;
    final int accentText;
    final int track;
    final int over;

    private WidgetStyle(JSONObject s) {
        bg = color(s, "bg", "#1C1C1E");
        bgAlpha = Math.max(0, Math.min(255, s.optInt("bgAlpha", 255)));
        text = color(s, "text", "#FFFFFF");
        muted = color(s, "muted", "#8E8E93");
        accent = color(s, "accent", "#FFFFFF");
        accentText = color(s, "accentText", "#1C1C1E");
        track = color(s, "track", "#3A3A3C");
        over = color(s, "over", "#D71921");
    }

    static WidgetStyle from(JSONObject data) {
        JSONObject s = data.optJSONObject("style");
        return new WidgetStyle(s != null ? s : new JSONObject());
    }

    private static int color(JSONObject s, String key, String fallback) {
        try {
            return Color.parseColor(s.optString(key, fallback));
        } catch (IllegalArgumentException e) {
            return Color.parseColor(fallback);
        }
    }
}
