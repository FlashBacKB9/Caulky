import { App as CapApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import api from '../api/client'
import { isNetworkError, network } from './adapter'
import { startConnectivity } from './connectivity'
import { loadOutbox, reloadOutbox } from './outbox'
import { closeFloating, detectFloating, isFloatingQuickAdd } from './floating'
import { apiBase, getServerUrl, isNative } from './platform'

/** Comprueba si el servidor contesta (ruta pública y ligera). */
async function serverReachable(): Promise<boolean> {
  if (isNative && !getServerUrl()) return false
  try {
    await api.get('/admin/public-settings', { adapter: network, timeout: 5000, baseURL: apiBase() })
    return true
  } catch (e) {
    // Cualquier respuesta (aunque sea un error) es que el servidor está ahí
    return !isNetworkError(e)
  }
}

/** Arranque del modo sin conexión, antes de pintar la app. */
export async function bootOffline() {
  await detectFloating()
  await loadOutbox()
  // Sin esperar más de unos segundos: sin servidor se arranca con la copia local
  await Promise.race([startConnectivity(serverReachable), new Promise(r => setTimeout(r, 6000))])

  if (!isNative) return
  document.documentElement.classList.add('native-app')
  // Fuente incluida en la APK: sin conexión no se puede bajar de Google Fonts
  void import('@fontsource/ibm-plex-mono/400.css')
  void import('@fontsource/ibm-plex-mono/500.css')
  void import('@fontsource/ibm-plex-mono/600.css')
  void import('@fontsource/ibm-plex-mono/700.css')

  // Lo que se añade desde el widget (otra ventana) entra en la cola compartida
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void reloadOutbox()
  })

  CapApp.addListener('backButton', ({ canGoBack }) => {
    if (isFloatingQuickAdd() && !document.querySelector('.fixed.inset-0 .fixed.inset-0')) { closeFloating(); return }
    // Primero cerrar lo que esté abierto (menú lateral, ventanas), luego volver atrás
    const overlays = [...document.querySelectorAll<HTMLElement>('.fixed.inset-0')]
    if (overlays.length) {
      const esc = () => new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      document.activeElement?.dispatchEvent(esc())
      window.dispatchEvent(esc())
      setTimeout(() => {
        // Lo que no se cierra con Escape se cierra pulsando su fondo oscuro
        const still = overlays.filter(o => o.isConnected)
        const top = still.at(-1)
        const backdrop = top?.matches('[class*="bg-black"]') ? top : top?.querySelector<HTMLElement>(':scope > [class*="bg-black"]')
        backdrop?.click()
      }, 60)
      return
    }
    if (canGoBack && window.location.pathname !== '/') window.history.back()
    else void CapApp.exitApp()
  })

  const syncBar = () => {
    // Con WebView reciente la franja de la barra la pinta la app (color de la cabecera);
    // con una antigua la pinta Android en blanco y los iconos tienen que ser oscuros
    const appDrawsBar = parseFloat(getComputedStyle(document.body).paddingTop) > 0
    const dark = appDrawsBar && document.documentElement.classList.contains('dark')
    StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {})
  }
  syncBar()
  window.addEventListener('resize', syncBar)
  new MutationObserver(syncBar).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
}
