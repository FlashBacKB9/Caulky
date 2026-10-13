package app.caulky.mobile;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/**
 * "Configurar" de un widget (al mantenerlo pulsado): acepta el widget y abre la app en
 * Ajustes → Widgets, donde se eligen los colores de todos.
 */
public class WidgetConfigActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        int id = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id));
        WidgetUpdater.updateAll(this);

        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse("caulky://open/settings?tab=widgets"), this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(open);
        finish();
    }
}
