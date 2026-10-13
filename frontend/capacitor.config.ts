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
    // Con WebView reciente la app ocupa también la franja de la barra de estado (ver index.css)
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
  },
}

export default config
