import { Network } from '@capacitor/network'
import { isNative } from './platform'

/**
 * ¿Llega la app al servidor? No basta con tener red: puede haber wifi y el servidor
 * (en casa) no estar al alcance. Se marca sin conexión al fallar una petición y se
 * vuelve a probar al recuperar red y cada poco mientras tanto.
 */

type Listener = () => void

let online = isNative ? false : navigator.onLine
let checked = !isNative
const listeners = new Set<Listener>()
let probeFn: (() => Promise<boolean>) | null = null
let timer: ReturnType<typeof setInterval> | null = null

export function isOnline() { return online }
export function wasChecked() { return checked }

export function subscribe(l: Listener) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export function setOnline(value: boolean) {
  checked = true
  // Aunque no cambie: al arrancar sin conexión también hay que ir reintentando
  if (!value) startRetrying()
  else stopRetrying()
  if (online === value) return
  online = value
  listeners.forEach(l => l())
}

function startRetrying() {
  if (timer) return
  timer = setInterval(() => { void probe() }, 20_000)
}

function stopRetrying() {
  if (timer) clearInterval(timer)
  timer = null
}

/** Prueba si el servidor responde y actualiza el estado. */
export async function probe(): Promise<boolean> {
  if (!probeFn) return online
  let ok: boolean
  try { ok = await probeFn() } catch { ok = false }
  setOnline(ok)
  return ok
}

/** Arranca la vigilancia de la red; `fn` comprueba si el servidor contesta. */
export function startConnectivity(fn: () => Promise<boolean>) {
  probeFn = fn
  if (isNative) {
    Network.addListener('networkStatusChange', s => {
      if (s.connected) void probe()
      else setOnline(false)
    })
  } else {
    window.addEventListener('online', () => { void probe() })
    window.addEventListener('offline', () => setOnline(false))
  }
  // Al volver a la app desde segundo plano
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void probe()
  })
  return probe()
}
