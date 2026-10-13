import { App as CapApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import api from '../api/client'
import { isNetworkError, network } from './adapter'
import { startConnectivity } from './connectivity'
import { loadOutbox, reloadOutbox } from './outbox'
import { closeFloating, detectFloating, isFloatingQuickAdd } from './floating'
import { apiBase, getServerUrl, isNative } from './platform'
import { CaulkyNative } from './native'
import { pushWidgets } from './widgets'

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

  // Abrir la app en una pantalla concreta desde un widget: caulky://open/<ruta>
  const openPath = (url?: string) => {
    if (!url?.startsWith('caulky://open/')) return
    const path = '/' + url.slice('caulky://open/'.length)
    window.history.pushState(null, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
  if (!isFloatingQuickAdd()) {
    const launch = await CapApp.getLaunchUrl().catch(() => undefined)
    if (launch?.url?.startsWith('caulky://open/')) {
      window.history.replaceState(null, '', '/' + launch.url.slice('caulky://open/'.length))
    }
    CapApp.addListener('appUrlOpen', e => openPath(e.url))
  }

  // La ventana flotante es transparente: ni barra ni widgets desde ella
  if (isFloatingQuickAdd()) return

  // Android deja fuera de la app la franja de la barra de estado: se pinta del color de la cabecera
  const syncBar = () => {
    const dark = document.documentElement.classList.contains('dark')
    CaulkyNative.setBarColor({ color: dark ? '#111827' : '#ffffff' }).catch(() => {})
    StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {})
  }
  syncBar()
  new MutationObserver(syncBar).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

  // Widgets del escritorio: se refrescan al salir de la app y al cambiar el modo privacidad
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void pushWidgets()
  })
  window.addEventListener('caulky-privacy-change', () => { void pushWidgets() })
  void pushWidgets()
}
