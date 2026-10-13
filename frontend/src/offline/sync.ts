import api from '../api/client'
import { network, isNetworkError } from './adapter'
import { parseJson, readCache } from './cache'
import { setOnline } from './connectivity'
import { getOps, removeOp, splitPath, updateOp, type Op } from './outbox'

/**
 * Revisión y envío de los cambios hechos sin conexión. Antes de mandar nada se compara
 * cada cambio con lo que hay ahora en el servidor para avisar de duplicados y conflictos.
 */

export type ReviewKind = 'ok' | 'duplicate' | 'conflict' | 'missing' | 'error'

export interface FieldChange { field: string; mine: string; server?: string }

export interface ReviewItem {
  key: string
  ops: Op[]
  action: 'create' | 'update' | 'delete' | 'other'
  title: string
  detail: string
  changes: FieldChange[]
  kind: ReviewKind
  warning?: string
  defaultSelected: boolean
}

type Rec = Record<string, unknown>

const ENTITY: Record<string, string> = {
  '/movements': 'movimiento',
  '/movement-types': 'categoría',
  '/groups': 'grupo',
  '/templates': 'plantilla',
  '/real-accounts': 'cuenta real',
  '/accounts': 'cuenta',
}

const FIELD: Record<string, string> = {
  name: 'nombre', money: 'importe', date: 'fecha', bank_date: 'fecha banco',
  movement_type_id: 'categoría', account_id: 'cuenta', from_account_id: 'cuenta origen',
  notes: 'notas', paid: 'pagado', no_count: 'no contar', is_transfer: 'traspaso',
  is_shared: 'compartido', shared_between: 'entre', my_share: 'mi parte', splits: 'reparto',
  initial_balance: 'saldo inicial', color: 'color', icon: 'icono', category: 'tipo',
  income_expense_group_id: 'grupo', budget: 'presupuesto',
}

// ── Formato ───────────────────────────────────────────────────────────────────

const money = (v: unknown) => Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const day = (v: unknown) => {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v ?? '')
}

interface Lookups { types: Map<number, string>; accounts: Map<number, string> }

async function lookups(): Promise<Lookups> {
  const types = ((await readCache('/movement-types'))?.data as { id: number; name: string }[] | undefined) ?? []
  const summary = (await readCache('/accounts/summary'))?.data as { accounts?: { id: number; name: string }[] } | undefined
  return {
    types: new Map(types.map(t => [t.id, t.name])),
    accounts: new Map((summary?.accounts ?? []).map(a => [a.id, a.name])),
  }
}

function show(field: string, v: unknown, lk: Lookups): string {
  if (v === null || v === undefined || v === '') return '—'
  if (field === 'money' || field === 'my_share' || field === 'initial_balance' || field === 'budget') return money(v)
  if (field === 'date' || field === 'bank_date') return day(v)
  if (field === 'movement_type_id') return lk.types.get(Number(v)) ?? (Number(v) < 0 ? 'nueva (sin sincronizar)' : `#${v}`)
  if (field === 'account_id' || field === 'from_account_id') return lk.accounts.get(Number(v)) ?? `#${v}`
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  if (field === 'splits' && Array.isArray(v)) return `${v.length} partes`
  return String(v)
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
  || (typeof a === 'number' || typeof b === 'number') && Number(a) === Number(b)

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()

/** Mismo movimiento: misma fecha, importe y nombre. */
function sameMovement(a: Rec, b: Rec): boolean {
  return String(a.date) === String(b.date) && Number(a.money) === Number(b.money) && norm(a.name) === norm(b.name)
}

function describe(rec: Rec | null | undefined, coll: string): string {
  if (!rec) return ''
  if (coll === '/movements') return [rec.name, rec.money != null ? money(rec.money) : null, rec.date ? day(rec.date) : null].filter(Boolean).join(' · ')
  return String(rec.name ?? '')
}

// ── Estado actual del servidor ────────────────────────────────────────────────

async function serverList(coll: string): Promise<Rec[] | null> {
  try {
    if (coll === '/accounts') {
      const { data } = await api.get('/accounts/summary', { adapter: network })
      return (parseJson(data) as { accounts: Rec[] }).accounts
    }
    const data = parseJson((await api.get(coll, { adapter: network })).data)
    return Array.isArray(data) ? data as Rec[] : null
  } catch (e) {
    if (isNetworkError(e)) throw e
    return null
  }
}

// ── Revisión ──────────────────────────────────────────────────────────────────

export async function buildReview(): Promise<ReviewItem[]> {
  const ops = getOps()
  const lk = await lookups()
  const colls = new Set(ops.map(o => splitPath(o.path).coll).filter(c => ENTITY[c]))
  const server = new Map<string, Rec[] | null>()
  for (const c of colls) server.set(c, await serverList(c))

  const items: ReviewItem[] = []
  const prefs = ops.filter(o => o.path.startsWith('/preferences/'))
  if (prefs.length) {
    items.push({
      key: 'prefs', ops: prefs, action: 'other',
      title: 'Ajustes de la app',
      detail: `${prefs.length} ${prefs.length === 1 ? 'ajuste cambiado' : 'ajustes cambiados'} (orden, columnas, panel...)`,
      changes: [], kind: 'ok', defaultSelected: true,
    })
  }

  for (const op of ops) {
    if (op.path.startsWith('/preferences/')) continue
    const { coll, id } = splitPath(op.path)
    const entity = ENTITY[coll] ?? 'elemento'
    const list = server.get(coll) ?? null
    const current = id !== null && list ? list.find(x => x.id === id) ?? null : null
    const item: ReviewItem = {
      key: op.id, ops: [op], action: 'other', title: '', detail: '', changes: [],
      kind: 'ok', defaultSelected: true,
    }

    if (op.method === 'POST') {
      const body = (op.body ?? {}) as Rec
      item.action = 'create'
      item.title = `Nuevo ${entity}`
      item.detail = describe(op.result ?? body, coll)
      const isMv = coll === '/movements'
      const match = (x: Rec) => isMv ? sameMovement(x, body) : norm(x.name) === norm(body.name)
      const twin = ops.find(o => o !== op && o.method === 'POST' && o.path === op.path && o.seq < op.seq && match((o.body ?? {}) as Rec))
      if (list?.some(match)) {
        item.kind = 'duplicate'
        item.warning = isMv
          ? 'Ya hay en el servidor un movimiento con la misma fecha, importe y nombre. Probablemente ya se guardó.'
          : `Ya existe en el servidor un ${entity} con ese nombre.`
        item.defaultSelected = false
      } else if (twin) {
        item.kind = 'duplicate'
        item.warning = 'Está repetido en tus cambios pendientes (¿lo añadiste dos veces?).'
        item.defaultSelected = false
      }
    } else if (op.method === 'DELETE') {
      item.action = 'delete'
      item.title = `Eliminar ${entity}`
      item.detail = describe(op.base ?? current, coll)
      if (list && !current) {
        item.kind = 'missing'
        item.warning = 'Ya no existe en el servidor: no hay nada que borrar.'
        item.defaultSelected = false
      } else if (current && op.base && Object.keys(op.base).some(k => k in current && !same(op.base![k], current[k]) && FIELD[k])) {
        item.kind = 'conflict'
        item.warning = 'Se modificó en el servidor después de que lo borraras aquí.'
      }
    } else {
      const body = (op.body ?? {}) as Rec
      item.action = 'update'
      item.title = `Editar ${entity}`
      item.detail = describe({ ...(op.base ?? current ?? {}), ...body }, coll)
      const conflicts: string[] = []
      for (const [k, v] of Object.entries(body)) {
        if (op.base && same(op.base[k], v)) continue
        const change: FieldChange = { field: FIELD[k] ?? k, mine: show(k, v, lk) }
        if (current && op.base && k in current && !same(op.base[k], current[k]) && !same(current[k], v)) {
          change.server = show(k, current[k], lk)
          conflicts.push(change.field)
        }
        if (FIELD[k] || change.server) item.changes.push(change)
      }
      if (list && id !== null && !current) {
        item.kind = 'missing'
        item.warning = 'Se borró en el servidor. Si lo guardas dará error; mejor descártalo.'
        item.defaultSelected = false
      } else if (conflicts.length) {
        item.kind = 'conflict'
        item.warning = `También se cambió en el servidor (${conflicts.join(', ')}). Si lo guardas, se queda tu versión.`
      }
    }

    if (op.uncertain && item.kind === 'ok' && op.method === 'POST') {
      item.warning = 'Se intentó guardar con mala conexión; no se encontró en el servidor.'
    }
    if (op.error) {
      item.kind = item.kind === 'ok' ? 'error' : item.kind
      item.warning = `El servidor lo rechazó la última vez: ${op.error}`
    }
    items.push(item)
  }
  return items
}

// ── Envío ─────────────────────────────────────────────────────────────────────

/** Cambia los ids provisionales (negativos) por los que dio el servidor al crear. */
function remap(value: unknown, ids: Map<number, number>, key = ''): unknown {
  if (Array.isArray(value)) return value.map(v => remap(v, ids, key))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v, ids, k)]))
  }
  if (typeof value === 'number' && value < 0 && (key.endsWith('_id') || key.endsWith('ids') || key === 'id')) {
    return ids.get(value) ?? value
  }
  return value
}

function remapPath(path: string, ids: Map<number, number>) {
  return path.replace(/\/(-\d+)(?=\/|$)/g, (m, n) => ids.has(Number(n)) ? `/${ids.get(Number(n))}` : m)
}

export interface SyncResult { sent: number; failed: number; discarded: number; offline: boolean }

function errorText(e: unknown): string {
  const d = (e as { response?: { data?: { detail?: unknown }; status?: number } })?.response
  if (typeof d?.data?.detail === 'string') return d.data.detail
  if (d?.data?.detail) return JSON.stringify(d.data.detail).slice(0, 200)
  return d?.status ? `error ${d.status}` : 'error desconocido'
}

/** Manda los cambios elegidos en el orden en que se hicieron y descarta los demás. */
export async function runSync(selected: Set<string>, onProgress?: (done: number, total: number) => void): Promise<SyncResult> {
  const ops = [...getOps()]
  const send = ops.filter(o => selected.has(o.id))
  const ids = new Map<number, number>()
  const res: SyncResult = { sent: 0, failed: 0, discarded: 0, offline: false }

  for (const op of ops.filter(o => !selected.has(o.id))) {
    await removeOp(op.id)
    res.discarded++
  }

  let done = 0
  for (const op of send) {
    onProgress?.(done, send.length)
    const url = remapPath(op.url ?? op.path, ids)
    try {
      const r = await api.request({
        method: op.method, url, data: op.body == null ? undefined : remap(op.body, ids), adapter: network,
      })
      const created = parseJson(r.data) as { id?: unknown } | null
      if (op.method === 'POST' && op.tempId != null && typeof created?.id === 'number') ids.set(op.tempId, created.id)
      await removeOp(op.id)
      res.sent++
    } catch (e) {
      if (isNetworkError(e)) {
        // Puede que llegara: se marca para comprobar duplicados la próxima vez
        op.uncertain = true
        await updateOp(op)
        setOnline(false)
        res.offline = true
        break
      }
      // Borrar algo que ya no existe es justo lo que se quería
      if (op.method === 'DELETE' && (e as { response?: { status?: number } })?.response?.status === 404) {
        await removeOp(op.id)
        res.sent++
      } else {
        op.error = errorText(e)
        await updateOp(op)
        res.failed++
      }
    }
    done++
  }
  // Lo que quedó pendiente pasa a apuntar a los ids reales de lo que sí se creó
  if (ids.size) {
    for (const op of getOps()) {
      const path = remapPath(op.path, ids)
      const body = op.body == null ? op.body : remap(op.body, ids) as Op['body']
      if (path !== op.path || !same(body, op.body)) {
        op.path = path
        op.url = op.url && remapPath(op.url, ids)
        op.body = body
        await updateOp(op)
      }
    }
  }
  onProgress?.(done, send.length)
  return res
}
