package app.caulky.mobile;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.widget.RemoteViews;
import java.util.HashMap;
import java.util.Map;

/**
 * Widget del escritorio: abre speedmode flotante. En 1x1 es solo el botón "+"; si se
 * estira a lo ancho muestra también el texto.
 */
public class QuickAddWidget extends AppWidgetProvider {

    /** Ancho (dp) a partir del cual cabe el diseño con texto. */
    private static final int WIDE_MIN_DP = 150;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int id : widgetIds) update(context, manager, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        update(context, manager, id);
    }

    private static void update(Context context, AppWidgetManager manager, int id) {
        RemoteViews small = views(context, R.layout.widget_quickadd_small);
        RemoteViews wide = views(context, R.layout.widget_quickadd);
        RemoteViews result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+: el sistema elige el diseño según el tamaño real
            Map<SizeF, RemoteViews> bySize = new HashMap<>();
            bySize.put(new SizeF(40f, 40f), small);
            bySize.put(new SizeF(WIDE_MIN_DP, 40f), wide);
            result = new RemoteViews(bySize);
        } else {
            int minWidth = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
            result = minWidth >= WIDE_MIN_DP ? wide : small;
        }
        manager.updateAppWidget(id, result);
    }

    private static RemoteViews views(Context context, int layout) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("caulky://speedmode"), context, QuickAddActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        PendingIntent pending = PendingIntent.getActivity(
            context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        RemoteViews v = new RemoteViews(context.getPackageName(), layout);
        v.setOnClickPendingIntent(R.id.widget_root, pending);
        return v;
    }
}
