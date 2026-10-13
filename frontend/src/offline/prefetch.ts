import api from '../api/client'
import { cachedKeys, markFullSync, readCache } from './cache'
import { filesEnabled, storedFiles } from './files'
import { isOnline } from './connectivity'

/**
 * Descarga completa para usar la app sin conexión: todas las listas, las estadísticas de
 * cada año con movimientos y, además, cualquier otra consulta que ya se hubiera abierto.
 */

const BASE = [
  '/users/me',
  '/preferences',
  '/movements',
  '/movement-types',
  '/groups',
  '/accounts/summary',
  '/accounts/credit-cycles',
  '/templates',
  '/real-accounts',
  '/investments/funds',
  '/investments/summary',
  '/tickets',
  '/admin/public-settings',
]

/** Consultas que no se repiten aunque se hayan abierto: de un solo uso o pesadas. */
const SKIP = [/^\/tickets\/\d+\/ocr-text/, /^\/tickets\/gemini-models/, /^\/audit-log/, /^\/backup/, /^\/ai\//, /^\/api-keys/]

let running: Promise<void> | null = null
type Progress = (done: number, total: number) => void

async function getQuiet(key: string) {
  try { await api.get(key) } catch { /* se queda con la copia anterior */ }
}

async function getFile(path: string) {
  try { await api.get(path, { responseType: 'blob' }) } catch { /* se intentará la próxima vez */ }
}

/** Rutas de adjuntos de movimientos y tickets que faltan en el móvil. */
async function missingFiles(): Promise<string[]> {
  const have = new Set(await storedFiles())
  const paths: string[] = []
  const movements = (await readCache('/movements'))?.data as { files?: { id: number }[] }[] | undefined
  for (const m of movements ?? []) for (const f of m.files ?? []) paths.push(`/movements/files/${f.id}/download`)
  const tickets = (await readCache('/tickets'))?.data as { id: number }[] | undefined
  for (const t of tickets ?? []) paths.push(`/tickets/${t.id}/file`)
  return paths.filter(p => !have.has(p))
}

async function pool(keys: string[], size: number, onDone: () => void, fetchOne: (key: string) => Promise<void> = getQuiet) {
  let i = 0
  const worker = async () => {
    while (i < keys.length && isOnline()) {
      const k = keys[i++]
      await fetchOne(k)
      onDone()
    }
  }
  await Promise.all(Array.from({ length: size }, worker))
}

export function prefetchAll(onProgress?: Progress): Promise<void> {
  if (running) return running
  running = (async () => {
    const years = new Set<number>([new Date().getFullYear()])
    try {
      const { data } = await api.get<{ date: string }[]>('/movements')
      for (const m of data) {
        const y = Number(String(m.date).slice(0, 4))
        if (y) years.add(y)
      }
    } catch { /* sin movimientos no hay años que añadir */ }

    const keys = new Set(BASE.filter(k => k !== '/movements'))
    const thisYear = new Date().getFullYear()
    for (const y of years) {
      keys.add(`/stats/annual?year=${y}`)
      // El panel pide el año entero y cada mes; se descargan el año actual y el anterior
      if (y >= thisYear - 1) {
        keys.add(`/stats/dashboard?year=${y}`)
        for (let m = 1; m <= 12; m++) keys.add(`/stats/dashboard?month=${m}&year=${y}`)
      }
    }
    for (const k of await cachedKeys().catch(() => [] as string[])) {
      if (!SKIP.some(re => re.test(k))) keys.add(k)
    }

    const list = [...keys]
    let total = list.length + 1
    let done = 1
    onProgress?.(done, total)
    await pool(list, 4, () => onProgress?.(++done, total))
    // Después, con las listas ya al día, los adjuntos que aún no están en el móvil
    const files = filesEnabled() ? await missingFiles().catch(() => [] as string[]) : []
    total += files.length
    await pool(files, 2, () => onProgress?.(++done, total), getFile)
    if (isOnline()) markFullSync()
  })().finally(() => { running = null })
  return running
}
