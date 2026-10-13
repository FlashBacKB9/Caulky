package app.caulky.mobile;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Color;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lo poco que la app web necesita de Android y no da Capacitor:
 * - el color de la franja de la barra de estado (la deja Android fuera de la WebView), y
 * - los datos que muestran los widgets del escritorio.
 */
@CapacitorPlugin(name = "CaulkyNative")
public class CaulkyNativePlugin extends Plugin {

    @PluginMethod
    public void setBarColor(PluginCall call) {
        String color = call.getString("color", "#ffffff");
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().getWindow().getDecorView().setBackgroundColor(Color.parseColor(color));
            } catch (IllegalArgumentException ignored) {
                // color no válido: se deja el que había
            }
            call.resolve();
        });
    }

    /** Ids de los widgets de presupuestos puestos en el escritorio (cada uno elige los suyos). */
    @PluginMethod
    public void listWidgets(PluginCall call) {
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        JSArray budgets = new JSArray();
        for (int id : manager.getAppWidgetIds(new ComponentName(getContext(), BudgetsWidget.class))) budgets.put(id);
        JSObject result = new JSObject();
        result.put("budgets", budgets);
        call.resolve(result);
    }

    @PluginMethod
    public void updateWidgets(PluginCall call) {
        String data = call.getString("data");
        if (data == null) {
            call.reject("Falta data");
            return;
        }
        Context context = getContext();
        WidgetData.save(context, data);
        WidgetUpdater.updateAll(context);
        call.resolve(new JSObject());
    }
}
