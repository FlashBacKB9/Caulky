import { FILES, idbGet, idbKeys, idbSet, idbClear, idbAll } from './idb'

/**
 * Adjuntos de movimientos y fotos/PDF de tickets guardados en el móvil para verlos sin
 * conexión. Se guardan por su ruta de la API (`/movements/files/3/download`).
 */

const SETTING = 'caulky-offline-files'

/** Descargar adjuntos (por defecto sí). */
export function filesEnabled(): boolean {
  return localStorage.getItem(SETTING) !== 'off'
}

export function setFilesEnabled(on: boolean) {
  localStorage.setItem(SETTING, on ? 'on' : 'off')
}

/** Rutas de adjunto que se guardan. */
export function isFilePath(path: string): boolean {
  return /^\/movements\/files\/\d+\/download$/.test(path) || /^\/tickets\/\d+\/file$/.test(path)
}

export const readFile = (path: string) => idbGet<Blob>(FILES, path)
export const writeFile = (path: string, blob: Blob) => idbSet(FILES, path, blob)
export const storedFiles = () => idbKeys(FILES)
export const clearFiles = () => idbClear(FILES)

/** Número de adjuntos guardados y lo que ocupan. */
export async function filesUsage(): Promise<{ count: number; bytes: number }> {
  const all = await idbAll<Blob>(FILES).catch(() => [] as Blob[])
  return { count: all.length, bytes: all.reduce((n, b) => n + (b?.size ?? 0), 0) }
}
