package app.caulky.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Datos de los widgets: los manda la app web ya formateados (importes con su moneda, y
 * ocultos si está el modo privacidad), así los widgets solo los pintan.
 */
final class WidgetData {

    private static final String PREFS = "caulky_widgets";
    private static final String KEY = "data";

    private WidgetData() {}

    static void save(Context context, String json) {
        prefs(context).edit().putString(KEY, json).apply();
    }

    /** Datos guardados, o un objeto vacío si la app aún no los ha mandado. */
    static JSONObject load(Context context) {
        String raw = prefs(context).getString(KEY, null);
        if (raw == null) return new JSONObject();
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
