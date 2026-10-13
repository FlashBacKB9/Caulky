package app.caulky.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Antes de super.onCreate: es cuando Capacitor crea el puente con sus plugins
        registerPlugin(CaulkyNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
