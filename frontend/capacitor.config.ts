import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.caulky.mobile',
  appName: 'Caulky',
  webDir: 'dist',
  server: {
    // http: el servidor de casa suele ir sin HTTPS y una página https no puede llamarlo
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    // Peticiones por HTTP nativo: sin CORS y con la cookie de sesión guardada en el móvil
    CapacitorHttp: { enabled: true },
    CapacitorCookies: { enabled: true },
    // Android deja fuera de la app la franja de las barras del sistema (así nada fijo queda
    // debajo); su color lo pone la app con CaulkyNative.setBarColor
    SystemBars: { insetsHandling: 'native' },
  },
}

export default config
