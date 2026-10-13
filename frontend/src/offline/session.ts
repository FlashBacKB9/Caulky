import { clearCache } from './cache'
import { clearOutbox, getOps } from './outbox'
import { offlineEnabled } from './platform'

/** Al cerrar sesión no deben quedar en el móvil los datos ni los cambios de esa cuenta. */
export async function clearOfflineData() {
  await Promise.all([clearCache().catch(() => {}), clearOutbox().catch(() => {})])
  localStorage.removeItem('caulky-offline-last-sync')
}

const USER_KEY = 'caulky-offline-user'

/** Al entrar con otra cuenta se borra la copia local de la anterior. */
export async function onLoggedIn(userId: string) {
  if (!offlineEnabled) return
  if (localStorage.getItem(USER_KEY) !== userId) await clearOfflineData()
  localStorage.setItem(USER_KEY, userId)
}

/** Cerrar sesión borra los cambios sin sincronizar: se pide confirmación si los hay. */
export function confirmLogout(): boolean {
  const n = getOps().length
  if (!n) return true
  return window.confirm(`Tienes ${n} ${n === 1 ? 'cambio' : 'cambios'} sin sincronizar. Si cierras sesión se perderán. ¿Cerrar sesión igualmente?`)
}
