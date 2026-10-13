import { App as CapApp } from '@capacitor/app'
import { isNative } from './platform'

/**
 * Speedmode flotante de la APK: el widget y el acceso directo abren `caulky://speedmode`
 * en una ventana Android transparente, y la app muestra solo el formulario rápido como
 * tarjeta encima de lo que haya en pantalla.
 */

let floating = false

export const isFloatingQuickAdd = () => floating

/** Se llama al arrancar, antes de pintar: si viene del widget, abre directamente /speedmode. */
export async function detectFloating() {
  if (!isNative) return
  const launch = await CapApp.getLaunchUrl().catch(() => undefined)
  if (!launch?.url?.startsWith('caulky://speedmode')) return
  floating = true
  document.documentElement.classList.add('floating-quickadd')
  window.history.replaceState(null, '', '/speedmode')
}

/** Cierra la ventana flotante (no la app principal, que va en otra tarea). */
export function closeFloating() {
  void CapApp.exitApp()
}
