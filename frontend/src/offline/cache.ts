import { CACHE, idbClear, idbGet, idbKeys, idbSet } from './idb'
import { getOps, splitPath, type Op } from './outbox'

/** Copia local de las respuestas GET de la API, con los cambios pendientes encima. */

export interface Cached { data: unknown; savedAt: string }
type Params = Record<string, unknown> | undefined

export function cacheKey(path: string, params?: Params): string {
  const clean = path.replace(/\/+$/, '') || '/'
  const entries = Object.entries(params ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
  if (!entries.length) return clean
  return clean + '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
}

/** Axios entrega la respuesta al adaptador sin convertir: el JSON llega como texto. */
export function parseJson(data: unknown): unknown {
  if (typeof data !== 'string' || !data) return data
  try { return JSON.parse(data) } catch { return data }
}

export async function readCache(path: string, params?: Params): Promise<Cached | undefined> {
  const hit = await idbGet<Cached>(CACHE, cacheKey(path, params))
  return hit && { ...hit, data: parseJson(hit.data) }
}

export async function writeCache(path: string, params: Params, data: unknown) {
  await idbSet(CACHE, cacheKey(path, params), { data: parseJson(data), savedAt: new Date().toISOString() })
}

export const clearCache = () => idbClear(CACHE)
export const cachedKeys = () => idbKeys(CACHE)

/** Fecha de la última descarga completa. */
export function lastFullSync(): string | null {
  return localStorage.getItem('caulky-offline-last-sync')
}
export function markFullSync() {
  localStorage.setItem('caulky-offline-last-sync', new Date().toISOString())
}

// ── Movimientos: lo que el servidor calcula al devolverlos ─────────────────────

interface TypeLite { id: number; income_expense_group_id: number }
interface GroupLite { id: number; name: string; color: string }

async function groupOf(typeId: unknown): Promise<GroupLite | null> {
  if (typeof typeId !== 'number') return null
  const types = (await readCache('/movement-types'))?.data as TypeLite[] | undefined
  const groups = (await readCache('/groups'))?.data as GroupLite[] | undefined
  const t = types?.find(x => x.id === typeId)
  return groups?.find(g => g.id === t?.income_expense_group_id) ?? null
}

/** Rellena `dinero`, `label` y `color` como hace el backend (`_enrich`). */
export async function enrichMovement(mv: Record<string, unknown>): Promise<Record<string, unknown>> {
  const g = await groupOf(mv.movement_type_id)
  const money = Number(mv.money ?? 0)
  const income = g?.name === 'Ingreso'
  let dinero = money < 0 ? Math.abs(money) : income ? Math.abs(money) : -Math.abs(money)
  let label = money < 0 ? 'Devolución' : income ? 'Ingreso' : 'Gasto'
  if (mv.credit_cycle_end) { dinero = 0; label = 'Liquidación' }
  return { ...mv, dinero, label, color: g?.color ?? '#6b7280' }
}

/** Busca un elemento en las listas guardadas (para saber cómo estaba antes de editarlo). */
export async function findCachedItem(coll: string, id: number): Promise<Record<string, unknown> | null> {
  if (coll === '/accounts') {
    const summary = (await readCache('/accounts/summary'))?.data as { accounts?: { id: number }[] } | undefined
    return (summary?.accounts?.find(a => a.id === id) as Record<string, unknown> | undefined) ?? null
  }
  const single = (await readCache(`${coll}/${id}`))?.data as Record<string, unknown> | undefined
  if (single && typeof single === 'object') return single
  const list = (await readCache(coll))?.data
  if (Array.isArray(list)) {
    const hit = list.find((x: { id?: number }) => x?.id === id)
    if (hit) return hit as Record<string, unknown>
  }
  // Cualquier otra lista guardada de la misma colección (p. ej. /movements?year=2025)
  for (const key of await cachedKeys()) {
    if (!key.startsWith(coll + '?')) continue
    const l = parseJson((await idbGet<Cached>(CACHE, key))?.data)
    if (Array.isArray(l)) {
      const hit = l.find((x: { id?: number }) => x?.id === id)
      if (hit) return hit as Record<string, unknown>
    }
  }
  return null
}

// ── Respuestas deducidas de otras ─────────────────────────────────────────────

function movementMatches(mv: { date?: unknown; movement_type_id?: unknown }, params: Params): boolean {
  const year = Number(params?.year ?? 0)
  const month = Number(params?.month ?? 0)
  const d = String(mv.date ?? '')
  // Igual que el backend: con mes, "desde el día 1 de ese mes"
  if (year && !month && (d < `${year}-01-01` || d > `${year}-12-31`)) return false
  if (year && month && (d < `${year}-${String(month).padStart(2, '0')}-01` || d > `${year}-12-31`)) return false
  if (params?.unassigned && String(params.unassigned) !== 'false' && mv.movement_type_id != null) return false
  return true
}

/** Sin copia exacta de una consulta, intenta sacarla de otra (los movimientos de un año de la lista completa). */
export async function deriveFromCache(path: string, params: Params): Promise<Cached | undefined> {
  const { coll, id } = splitPath(path)
  if (coll === '/movements' && id === null) {
    const all = await readCache('/movements')
    if (all && Array.isArray(all.data)) {
      return { ...all, data: all.data.filter((m: Record<string, unknown>) => movementMatches(m, params)) }
    }
  }
  if (id !== null) {
    const item = await findCachedItem(coll, id)
    if (item) return { data: item, savedAt: lastFullSync() ?? new Date().toISOString() }
  }
  return undefined
}

// ── Cambios pendientes por encima de lo descargado ────────────────────────────

const normalize = (p: string) => p.replace(/\/+$/, '')

/** Devuelve `data` con los cambios sin sincronizar aplicados; `null` si el elemento se borró. */
export async function applyOverlay(path: string, params: Params, data: unknown, ops: Op[] = getOps()): Promise<unknown> {
  if (!ops.length) return data
  const p = normalize(path)

  if (p === '/preferences' && data && typeof data === 'object' && !Array.isArray(data)) {
    const out = { ...(data as Record<string, unknown>) }
    for (const op of ops) {
      if (op.method === 'PUT' && op.path.startsWith('/preferences/')) {
        out[decodeURIComponent(op.path.slice('/preferences/'.length))] = (op.body as { value?: unknown })?.value
      }
    }
    return out
  }

  if (p === '/accounts/summary' && data && typeof data === 'object') {
    const summary = data as { accounts?: Record<string, unknown>[] }
    if (!Array.isArray(summary.accounts)) return data
    const accounts = summary.accounts.map(a => {
      const edits = ops.filter(o => o.method === 'PUT' && o.path === `/accounts/${a.id}`)
      return edits.reduce((acc, o) => ({ ...acc, ...(o.body ?? {}) }), a)
    })
    return { ...summary, accounts }
  }

  if (Array.isArray(data)) {
    let list = [...data] as Record<string, unknown>[]
    let touched = false
    for (const op of ops) {
      const { coll, id } = splitPath(op.path)
      if (op.method === 'POST' && normalize(op.path) === p && op.result) {
        if (p === '/movements' && !movementMatches(op.result, params)) continue
        list.push(op.result)
        touched = true
      } else if (id !== null && coll === p) {
        if (op.method === 'DELETE') list = list.filter(x => x.id !== id)
        else list = await Promise.all(list.map(async x => {
          if (x.id !== id) return x
          const merged = { ...x, ...(op.body ?? {}) }
          return p === '/movements' ? enrichMovement(merged) : merged
        }))
        touched = true
      }
    }
    if (touched && p === '/movements') {
      list.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
    }
    return list
  }

  const { coll, id } = splitPath(p)
  if (id !== null && data && typeof data === 'object') {
    let item: Record<string, unknown> | null = data as Record<string, unknown>
    for (const op of ops) {
      if (normalize(op.path) !== p) continue
      if (op.method === 'DELETE') item = null
      else if (item && (op.method === 'PUT' || op.method === 'PATCH')) item = { ...item, ...(op.body ?? {}) }
    }
    if (item && coll === '/movements') item = await enrichMovement(item)
    return item
  }
  return data
}

/** Un elemento creado sin conexión (id negativo) solo existe en la cola. */
export function pendingCreate(path: string): Record<string, unknown> | null {
  const { id } = splitPath(path)
  if (id === null || id >= 0) return null
  return getOps().find(o => o.method === 'POST' && o.tempId === id)?.result ?? null
}
