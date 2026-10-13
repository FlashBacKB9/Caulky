import { Capacitor } from '@capacitor/core'

/** Dentro de la APK (Capacitor). En la web normal todo lo de `offline/` queda apagado. */
export const isNative = Capacitor.isNativePlatform()

const DEV_FLAG = 'caulky-offline-dev'
const SERVER_KEY = 'caulky-server-url'

/**
 * Modo sin conexión activo: siempre en la APK. En el navegador solo para probarlo,
 * con `localStorage.setItem('caulky-offline-dev', '1')`.
 */
export const offlineEnabled = isNative || safeGet(DEV_FLAG) === '1'

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

/** Servidor de Caulky al que se conecta la APK, p. ej. http://192.168.1.11:8081 */
export function getServerUrl(): string {
  return (safeGet(SERVER_KEY) ?? '').replace(/\/+$/, '')
}

export function setServerUrl(url: string) {
  let u = url.trim().replace(/\/+$/, '')
  if (u && !/^https?:\/\//i.test(u)) u = 'http://' + u
  localStorage.setItem(SERVER_KEY, u)
}

/** Base de la API: relativa en la web, absoluta al servidor elegido en la APK. */
export function apiBase(): string {
  return isNative ? `${getServerUrl()}/api` : '/api'
}

/** URL absoluta para enlaces e imágenes que apuntan a la API (`/api/...` en la web). */
export function apiUrl(path: string): string {
  return apiBase() + path
}

/** Evento para pedir una sincronización (revisar pendientes o descargar todo). */
export const SYNC_NOW_EVENT = 'caulky-sync-now'
