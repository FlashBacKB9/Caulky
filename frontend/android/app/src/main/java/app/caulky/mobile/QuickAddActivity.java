package app.caulky.mobile;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.View;
import android.view.ViewParent;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

/**
 * Speedmode como ventana flotante. Carga la misma app web, que al ver el enlace
 * caulky://speedmode muestra solo el formulario rápido como tarjeta sobre fondo transparente.
 */
public class QuickAddActivity extends BridgeActivity {

    /** Capacitor cambia al tema normal de la app (fondo blanco) al arrancar: aquí se queda el flotante. */
    @Override
    public void setTheme(int resid) {
        super.setTheme(R.style.AppTheme_QuickAdd);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        makeTransparent();
    }

    @Override
    public void onStart() {
        super.onStart();
        makeTransparent();
    }

    /** WebView y contenedores transparentes: se ve lo que hay debajo, atenuado por la página. */
    private void makeTransparent() {
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        getWindow().getDecorView().setBackgroundColor(Color.TRANSPARENT);
        WebView webView = getBridge().getWebView();
        webView.setBackgroundColor(Color.TRANSPARENT);
        ViewParent parent = webView.getParent();
        while (parent instanceof View) {
            ((View) parent).setBackgroundColor(Color.TRANSPARENT);
            parent = parent.getParent();
        }
    }
}
