import { idbAll, idbClear, idbDel, idbSet, OUTBOX } from './idb'

/** Cambio hecho sin conexión, pendiente de mandar al servidor. */
export interface Op {
  id: string
  seq: number
  createdAt: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Ruta de la API sin `/api` ni barra final, p. ej. `/movements/12` */
  path: string
  /** Ruta tal cual la pidió la app (algunas llevan barra final), para mandarla igual */
  url?: string
  body?: Record<string, unknown> | null
  /** POST: id provisional (negativo) con el que la app muestra el elemento nuevo */
  tempId?: number
  /** POST: el elemento tal y como se muestra mientras no se sincroniza */
  result?: Record<string, unknown>
  /** PUT/DELETE: cómo estaba el elemento antes del cambio (para detectar conflictos) */
  base?: Record<string, unknown> | null
  /** Último error al intentar mandarlo */
  error?: string
  /** Se intentó con conexión y no llegó respuesta: puede que el servidor ya lo tenga */
  uncertain?: boolean
}

type Listener = () => void
const listeners = new Set<Listener>()
let ops: Op[] = []
let loaded: Promise<void> | null = null

export function subscribeOutbox(l: Listener) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

function emit() { listeners.forEach(l => l()) }

export function loadOutbox(): Promise<void> {
  if (!loaded) {
    loaded = idbAll<Op>(OUTBOX)
      .then(all => { ops = all.sort((a, b) => a.seq - b.seq); emit() })
      .catch(() => { ops = [] })
  }
  return loaded
}

export function getOps(): Op[] { return ops }

/** Vuelve a leer la cola: la ventana flotante del widget también escribe en ella. */
export function reloadOutbox(): Promise<void> {
  loaded = null
  return loadOutbox()
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/** Ids provisionales negativos y únicos entre sesiones. */
export function nextTempId(): number {
  const n = Number(localStorage.getItem('caulky-offline-temp-id') ?? '0') - 1
  localStorage.setItem('caulky-offline-temp-id', String(n))
  return n
}

export function splitPath(path: string): { coll: string; id: number | null } {
  const m = path.match(/^(.*?)\/(-?\d+)\/?$/)
  return m ? { coll: m[1], id: Number(m[2]) } : { coll: path.replace(/\/+$/, ''), id: null }
}

async function save(op: Op) { await idbSet(OUTBOX, op.id, op) }
async function drop(op: Op) { await idbDel(OUTBOX, op.id) }

/**
 * Añade un cambio a la cola juntándolo con los anteriores sobre lo mismo: editar algo
 * creado sin conexión cambia su alta, borrarlo la anula, y varias ediciones seguidas
 * quedan en una sola.
 */
export async function enqueue(op: Omit<Op, 'seq'>): Promise<Op> {
  await loadOutbox()
  const { id } = splitPath(op.path)
  const seq = (ops.at(-1)?.seq ?? 0) + 1

  if (id !== null && id < 0) {
    const create = ops.find(o => o.method === 'POST' && o.tempId === id)
    if (create) {
      if (op.method === 'DELETE') {
        const gone = ops.filter(o => o === create || splitPath(o.path).id === id)
        ops = ops.filter(o => !gone.includes(o))
        await Promise.all(gone.map(drop))
      } else {
        create.body = { ...(create.body ?? {}), ...(op.body ?? {}) }
        create.result = { ...(create.result ?? {}), ...(op.body ?? {}) }
        await save(create)
      }
      emit()
      return create
    }
  }

  if (id !== null && (op.method === 'PUT' || op.method === 'PATCH' || op.method === 'DELETE')) {
    const prev = ops.filter(o => (o.method === 'PUT' || o.method === 'PATCH') && o.path === op.path)
    const base = prev[0]?.base ?? op.base
    if (op.method === 'DELETE') {
      ops = ops.filter(o => !prev.includes(o))
      await Promise.all(prev.map(drop))
    } else if (prev.length && prev[0].method === op.method) {
      const p = prev[0]
      p.body = { ...(p.body ?? {}), ...(op.body ?? {}) }
      await save(p)
      emit()
      return p
    }
    const full: Op = { ...op, base, seq }
    ops.push(full)
    await save(full)
    emit()
    return full
  }

  // Preferencias y otros "poner valor": vale el último
  if (op.method === 'PUT' && id === null) {
    const prev = ops.filter(o => o.method === 'PUT' && o.path === op.path)
    ops = ops.filter(o => !prev.includes(o))
    await Promise.all(prev.map(drop))
  }
  const full: Op = { ...op, seq }
  ops.push(full)
  await save(full)
  emit()
  return full
}

export async function removeOp(id: string) {
  const op = ops.find(o => o.id === id)
  ops = ops.filter(o => o.id !== id)
  if (op) await drop(op)
  emit()
}

export async function updateOp(op: Op) {
  await save(op)
  emit()
}

export async function clearOutbox() {
  ops = []
  await idbClear(OUTBOX)
  emit()
}
