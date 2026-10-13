package app.caulky.mobile;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.os.Bundle;

/** Proveedores de los widgets y repintado de todos cuando la app manda datos o colores nuevos. */
final class WidgetUpdater {

    private WidgetUpdater() {}

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        refresh(context, manager, QuickAddWidget.class, Widgets.QUICKADD);
        refresh(context, manager, AccountsWidget.class, Widgets.ACCOUNTS);
        refresh(context, manager, BudgetsWidget.class, Widgets.BUDGETS);
        refresh(context, manager, MonthWidget.class, Widgets.MONTH);
    }

    private static void refresh(Context context, AppWidgetManager manager, Class<?> provider, String kind) {
        for (int id : manager.getAppWidgetIds(new ComponentName(context, provider))) {
            Widgets.update(context, manager, id, kind);
        }
    }

    /** Base común: repinta al añadirse y al cambiar de tamaño. */
    abstract static class Base extends AppWidgetProvider {
        abstract String kind();

        @Override
        public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
            for (int id : ids) Widgets.update(context, manager, id, kind());
        }

        @Override
        public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
            Widgets.update(context, manager, id, kind());
        }
    }
}
