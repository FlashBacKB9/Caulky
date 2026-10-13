import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, CloudOff, Copy, Loader2, RefreshCw, Trash2, X } from 'lucide-react'
import { isOnline, probe, subscribe } from './connectivity'
import { getOps, subscribeOutbox } from './outbox'
import { lastFullSync } from './cache'
import { prefetchAll } from './prefetch'
import { buildReview, runSync, type ReviewItem, type ReviewKind } from './sync'

/**
 * Aviso de "sin conexión" arriba y, al recuperarla con cambios pendientes, la ventana para
 * revisarlos y elegir cuáles guardar en el servidor.
 */

function useOnline() {
  return useSyncExternalStore(subscribe, isOnline)
}

function usePendingCount() {
  return useSyncExternalStore(subscribeOutbox, () => getOps().length)
}

const fmtDate = (iso: string | null) => {
  if (!iso) return 'nunca'
  const d = new Date(iso)
  return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')
}

const KIND_STYLE: Record<ReviewKind, string> = {
  ok: 'border-gray-200 dark:border-gray-700',
  duplicate: 'border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/30',
  conflict: 'border-orange-300 dark:border-orange-700 bg-orange-50/60 dark:bg-orange-950/30',
  missing: 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50',
  error: 'border-red-300 dark:border-red-700 bg-red-50/60 dark:bg-red-950/30',
}

const KIND_BADGE: Record<ReviewKind, string | null> = {
  ok: null,
  duplicate: 'Posible duplicado',
  conflict: 'Conflicto',
  missing: 'Ya no existe',
  error: 'Error',
}

const ACTION_STYLE = {
  create: 'text-emerald-600 dark:text-emerald-400',
  update: 'text-blue-600 dark:text-blue-400',
  delete: 'text-red-600 dark:text-red-400',
  other: 'text-gray-600 dark:text-gray-300',
}

function ReviewModal({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [items, setItems] = useState<ReviewItem[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  useEffect(() => {
    buildReview()
      .then(list => {
        setItems(list)
        setSelected(new Set(list.filter(i => i.defaultSelected).map(i => i.key)))
      })
      .catch(() => setError('No se pudo comparar con el servidor. Comprueba la conexión.'))
  }, [])

  const toggle = (key: string) => setSelected(s => {
    const n = new Set(s)
    if (n.has(key)) n.delete(key)
    else n.add(key)
    return n
  })

  const opIds = (keys: Set<string>) => new Set((items ?? []).filter(i => keys.has(i.key)).flatMap(i => i.ops.map(o => o.id)))

  async function save(keys: Set<string>) {
    setProgress([0, 1])
    const r = await runSync(opIds(keys), (d, t) => setProgress([d, t]))
    setProgress(null)
    const parts = []
    if (r.sent) parts.push(`${r.sent} guardado${r.sent === 1 ? '' : 's'}`)
    if (r.discarded) parts.push(`${r.discarded} descartado${r.discarded === 1 ? '' : 's'}`)
    if (r.failed) parts.push(`${r.failed} con error`)
    if (r.offline) parts.push('se perdió la conexión a mitad')
    onDone(parts.join(' · ') || 'Nada que sincronizar')
  }

  const total = items?.length ?? 0
  const nSel = (items ?? []).filter(i => selected.has(i.key)).length
  const busy = progress !== null

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={busy ? undefined : onClose} />
      <div className="relative bg-white dark:bg-gray-900 w-full sm:max-w-xl sm:mx-4 rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh] safe-bottom">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-white text-base">Cambios hechos sin conexión</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Vuelves a tener conexión. Elige qué cambios guardar en el servidor; los que no marques se descartan.
            </p>
          </div>
          {!busy && (
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Cerrar">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {error && <p className="text-sm text-red-600 dark:text-red-400 px-1">{error}</p>}
          {!items && !error && (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Comparando con el servidor…
            </div>
          )}
          {items?.map(item => {
            const on = selected.has(item.key)
            return (
              <label key={item.key}
                className={`flex gap-3 items-start rounded-xl border px-3 py-2.5 cursor-pointer ${KIND_STYLE[item.kind]} ${on ? '' : 'opacity-70'}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(item.key)} disabled={busy}
                  className="mt-1 w-4 h-4 accent-gray-800 dark:accent-white shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`text-xs font-semibold uppercase tracking-wide ${ACTION_STYLE[item.action]}`}>{item.title}</span>
                    {KIND_BADGE[item.kind] && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/70 dark:bg-black/30 text-amber-700 dark:text-amber-300 border border-current/20">
                        {KIND_BADGE[item.kind]}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 dark:text-gray-100 break-words">{item.detail || '—'}</p>
                  {item.changes.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {item.changes.map((c, i) => (
                        <li key={i} className="text-xs text-gray-600 dark:text-gray-300 break-words">
                          <span className="text-gray-400">{c.field}:</span> {c.mine}
                          {c.server !== undefined && (
                            <span className="text-orange-600 dark:text-orange-400"> (servidor: {c.server})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {item.warning && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300 flex gap-1">
                      {item.kind === 'duplicate'
                        ? <Copy className="w-3.5 h-3.5 shrink-0 mt-px" />
                        : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />}
                      <span>{item.warning}</span>
                    </p>
                  )}
                </div>
              </label>
            )
          })}
        </div>

        <div className="px-4 pt-3 pb-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
          {progress && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando {progress[0]} de {progress[1]}…
            </div>
          )}
          {confirmDiscard ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <p className="text-xs text-red-600 dark:text-red-400 flex-1 self-center">¿Descartar los {total} cambios? No se puede deshacer.</p>
              <button onClick={() => setConfirmDiscard(false)} className="px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200">Cancelar</button>
              <button onClick={() => save(new Set())} className="px-3 py-2 rounded-xl text-sm bg-red-600 text-white">Descartar todo</button>
            </div>
          ) : (
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button onClick={() => setConfirmDiscard(true)} disabled={busy || !items}
                className="px-3 py-2 rounded-xl text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40 flex items-center justify-center gap-1.5">
                <Trash2 className="w-4 h-4" /> Descartar todo
              </button>
              <div className="flex-1" />
              <button onClick={onClose} disabled={busy}
                className="px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-40">
                Más tarde
              </button>
              <button onClick={() => save(selected)} disabled={busy || !items}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 disabled:opacity-40 flex items-center justify-center gap-1.5">
                <Check className="w-4 h-4" />
                {nSel === total ? `Guardar ${nSel}` : `Guardar ${nSel} y descartar ${total - nSel}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SyncCenter() {
  const online = useOnline()
  const pending = usePendingCount()
  const qc = useQueryClient()
  const [reviewOpen, setReviewOpen] = useState(false)
  const [download, setDownload] = useState<[number, number] | null>(null)
  const [toast, setToast] = useState('')
  const [, setTick] = useState(0)

  const refreshAll = useCallback(() => {
    setDownload([0, 1])
    prefetchAll((d, t) => setDownload([d, t]))
      .finally(() => { setDownload(null); setTick(t => t + 1); qc.invalidateQueries() })
  }, [qc])

  // Al entrar con conexión o recuperarla: revisar lo pendiente o, si no hay, descargar todo
  useEffect(() => {
    let was: boolean | null = null
    const onChange = () => {
      const now = isOnline()
      const prev = was
      was = now
      if (!now) {
        if (prev) void qc.invalidateQueries()
        return
      }
      if (prev === true) return
      if (getOps().length) setReviewOpen(true)
      else refreshAll()
    }
    queueMicrotask(onChange)
    return subscribe(onChange)
  }, [qc, refreshAll])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <>
      {(!online || pending > 0 || download) && (
        <div className={`shrink-0 flex items-center gap-2 px-3 py-1.5 text-xs ${
          !online
            ? 'bg-gray-800 text-gray-100 dark:bg-gray-800'
            : pending > 0 ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
            : 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200'
        }`}>
          {!online ? <CloudOff className="w-3.5 h-3.5 shrink-0" />
            : download && !pending ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5 shrink-0" />}
          <span className="flex-1 min-w-0 truncate">
            {!online
              ? <span title="Datos de la última descarga">Sin conexión · {fmtDate(lastFullSync())}</span>
              : pending > 0
                ? <><b>{pending}</b> {pending === 1 ? 'cambio' : 'cambios'} sin sincronizar</>
                : <>Descargando datos para usar sin conexión… {download![0]}/{download![1]}</>}
          </span>
          {!online && pending > 0 && (
            <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-amber-400 text-gray-900 font-semibold">
              {pending} {pending === 1 ? 'pendiente' : 'pendientes'}
            </span>
          )}
          {!online && (
            <button onClick={() => { void probe() }} className="shrink-0 p-0.5" aria-label="Reintentar conexión" title="Reintentar">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          {online && pending > 0 && (
            <button onClick={() => setReviewOpen(true)} className="font-semibold underline underline-offset-2 shrink-0">Revisar</button>
          )}
        </div>
      )}

      {reviewOpen && online && (
        <ReviewModal
          onClose={() => setReviewOpen(false)}
          onDone={msg => { setReviewOpen(false); setToast(msg); refreshAll() }}
        />
      )}

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[110] px-4 py-2 rounded-xl bg-gray-900 text-white text-sm shadow-lg safe-bottom">
          {toast}
        </div>
      )}
    </>
  )
}
