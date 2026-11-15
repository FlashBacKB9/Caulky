// Historial de actividad (Ajustes → Sistema): una fila por operación y, para el
// administrador, el botón «Deshacer». Lo que va en pareja (un movimiento y sus partes,
// una liquidación de tarjeta y la tarjeta…) se deshace junto: el backend lo agrupa en
// bloques y aquí se ve con el mismo número de bloque.
import { useMemo, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, RotateCcw, X, Undo2 } from 'lucide-react'
import axios from 'axios'
import {
  clearAuditLog, getAuditLog, getOperations, undoOperation,
  type AuditOperation, type AuditRow,
} from '../../api/auditLog'
import { getMovementTypes } from '../../api/movementTypes'
import { useAuth } from '../../context/AuthContext'
import { t } from '../../utils/i18n'

// ── Textos ────────────────────────────────────────────────────────────────────

const TABLE: Record<string, [string, string]> = {
  movements: ['movimiento', 'movimientos'],
  accounts: ['cuenta', 'cuentas'],
  movement_types: ['tipo', 'tipos'],
  income_expense_groups: ['grupo', 'grupos'],
  movement_splits: ['parte de movimiento', 'partes de movimiento'],
  movement_files: ['adjunto', 'adjuntos'],
  investment_funds: ['fondo', 'fondos'],
  investment_purchases: ['compra de fondo', 'compras de fondo'],
  movement_templates: ['plantilla', 'plantillas'],
  tickets: ['ticket', 'tickets'],
  real_accounts: ['cuenta real', 'cuentas reales'],
  real_account_accounts: ['enlace de cuenta real', 'enlaces de cuenta real'],
  item_category_rules: ['regla de ticket', 'reglas de ticket'],
}
// Femenino para concordar «creada/creadas»
const FEM = new Set(['accounts', 'movement_splits', 'investment_purchases', 'movement_templates',
  'real_accounts', 'item_category_rules'])
const VERB: Record<string, string> = { insert: 'cread', update: 'cambiad', delete: 'borrad' }

function tableName(table: string, n = 1) {
  const [one, many] = TABLE[table] ?? [table, table]
  return n === 1 ? one : many
}

function countText(table: string, action: string, n: number) {
  const end = (FEM.has(table) ? 'a' : 'o') + (n === 1 ? '' : 's')
  return `${n} ${tableName(table, n)} ${VERB[action] ?? action}${end}`
}

const FIELD: Record<string, string> = {
  name: 'Nombre', money: 'Importe', date: 'Fecha', bank_date: 'Fecha banco', notes: 'Notas',
  movement_type_id: 'Tipo', account_id: 'Cuenta', from_account_id: 'Desde la cuenta',
  paid: 'Pagado', no_count: 'No cuenta', is_transfer: 'Traspaso', is_shared: 'Compartido',
  shared_between: 'Entre', my_share: 'Mi parte', initial_balance: 'Saldo inicial',
  color: 'Color', icon: 'Icono', category: 'Categoría', sort_order: 'Orden', is_main: 'Principal',
  description: 'Descripción', credit_last_cycle_end: 'Último ciclo cobrado',
  credit_cycle_end: 'Fin del ciclo', credit_cycle_start: 'Inicio del ciclo', units: 'Participaciones',
  price_at_purchase: 'Precio de compra', income_expense_group_id: 'Grupo',
  linked_account_id: 'Cuenta enlazada', current_price: 'Precio actual',
}

const SOURCE: Record<string, string> = {
  user: 'Web', web: 'Web', api: 'Clave de API', auto: 'Automático', undo: 'Deshacer', ai: 'IA',
}

function fmtTs(iso: string) {
  // Las horas se guardan en UTC sin zona
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z')
  return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

type Names = { accounts: Map<number, string>; types: Map<number, string> }

function fmtValue(key: string, v: unknown, names: Names): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if ((key === 'account_id' || key === 'from_account_id' || key === 'linked_account_id') && typeof v === 'number')
    return names.accounts.get(v) ?? `#${v}`
  if (key === 'movement_type_id' && typeof v === 'number') return names.types.get(v) ?? `#${v}`
  if (typeof v === 'number' && /money|balance|share|price|amount|total/.test(key))
    return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && /date|cycle/.test(key))
    return `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`
  const s = String(v)
  return s.length > 60 ? s.slice(0, 57) + '…' : s
}

const SHOWN = ['money', 'date', 'account_id', 'movement_type_id']

function rowDetail(r: AuditRow, names: Names): string {
  if (r.action === 'update' && r.changes) {
    return Object.entries(r.changes)
      .map(([k, [a, b]]) => `${FIELD[k] ?? k}: ${fmtValue(k, a, names)} → ${fmtValue(k, b, names)}`)
      .join(' · ')
  }
  return SHOWN.filter(k => r.data[k] !== undefined && r.data[k] !== null)
    .map(k => `${FIELD[k]}: ${fmtValue(k, r.data[k], names)}`).join(' · ')
}

function headline(op: AuditOperation): string {
  if (op.summaries.length) {
    const first = op.summaries[0].summary
    return op.summaries.length > 1 ? `${first} (y ${op.summaries.length - 1} más)` : first
  }
  return op.counts.map(c => countText(c.table, c.action, c.count)).join(' · ')
}

function rowTitle(r: AuditRow) {
  const name = tableName(r.table)
  return name[0].toUpperCase() + name.slice(1) + (r.label ? ` «${r.label}»` : ` #${r.row_id}`)
}

const ACTION_MARK: Record<string, { sign: string; cls: string }> = {
  insert: { sign: '+', cls: 'text-green-600 dark:text-green-400' },
  update: { sign: '~', cls: 'text-blue-600 dark:text-blue-400' },
  delete: { sign: '−', cls: 'text-red-600 dark:text-red-400' },
}

// ── Confirmación ──────────────────────────────────────────────────────────────

interface UndoRequest {
  op: AuditOperation
  ids?: number[]          // filas sueltas (con su bloque); sin ids, la operación entera
  rows: AuditRow[]        // lo que se va a deshacer (para explicarlo)
}

function explain(req: UndoRequest): string[] {
  const tally = new Map<string, number>()
  const add = (key: string, n: number) => tally.set(key, (tally.get(key) ?? 0) + n)
  if (req.ids) {
    for (const r of req.rows) if (!r.restored_at) add(`${r.table}|${r.action}`, 1)
  } else {
    for (const c of req.op.counts) add(`${c.table}|${c.action}`, c.count - c.restored)
  }
  const out: string[] = []
  for (const [key, n] of tally) {
    if (!n) continue
    const [table, action] = key.split('|')
    const what = `${n} ${tableName(table, n)}`
    if (action === 'insert') out.push(`Se borrará${n > 1 ? 'n' : ''} ${what} que se cre${n > 1 ? 'aron' : 'ó'}`)
    if (action === 'delete') out.push(`Volverá${n > 1 ? 'n' : ''} ${what} que se borr${n > 1 ? 'aron' : 'ó'}`)
    if (action === 'update') out.push(`${what[0].toUpperCase() + what.slice(1)} recuperará${n > 1 ? 'n' : ''} su valor anterior`)
  }
  return out
}

function UndoModal({ req, onClose }: { req: UndoRequest; onClose: () => void }) {
  const qc = useQueryClient()
  const [problems, setProblems] = useState<string[] | null>(null)
  const mut = useMutation({
    mutationFn: () => undoOperation(req.ids ? { ids: req.ids } : { group_id: req.op.group_id! }),
    onSuccess: () => {
      // Puede haber cambiado cualquier cosa: movimientos, cuentas, tipos…
      qc.invalidateQueries()
      onClose()
    },
    onError: (err: unknown) => {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : null
      if (detail && typeof detail === 'object' && Array.isArray(detail.problems)) setProblems(detail.problems)
      else setProblems([typeof detail === 'string' ? detail : 'No se pudo deshacer'])
    },
  })
  const lines = explain(req)
  const extra = req.ids ? req.rows.length - req.ids.length : 0
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => !mut.isPending && onClose()}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <Undo2 className="w-4 h-4 text-amber-600" strokeWidth={1.5} />
            </div>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
              {req.ids ? 'Deshacer estas filas' : 'Deshacer la operación'}
            </h2>
          </div>
          <button onClick={onClose} disabled={mut.isPending} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 disabled:opacity-40">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm">
          {req.ids
            ? <ul className="text-gray-700 dark:text-gray-200 space-y-0.5">
                {req.rows.map(r => <li key={r.id}>{rowTitle(r)}</li>)}
              </ul>
            : <p className="text-gray-700 dark:text-gray-200">{headline(req.op)}</p>}
          <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1 list-disc pl-4">
            {lines.map(l => <li key={l}>{l}</li>)}
          </ul>
          {extra > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
              Van en pareja con otras {extra === 1 ? 'una fila' : `${extra} filas`} de esta operación: se deshacen juntas para no dejar nada a medias.
            </p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Va todo o nada: si algo no se puede deshacer, no se toca nada. Deshacer también queda en el historial.
          </p>
          {problems && (
            <div className="text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 space-y-1">
              <p className="font-semibold">No se ha deshecho nada:</p>
              <ul className="list-disc pl-4 space-y-0.5">{problems.map(p => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
        </div>
        <div className="px-5 pb-5 flex justify-end gap-2">
          <button onClick={onClose} disabled={mut.isPending}
            className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40">
            {problems ? 'Cerrar' : t('common.cancel')}
          </button>
          {!problems && (
            <button onClick={() => mut.mutate()} disabled={mut.isPending}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-40 transition-colors">
              {mut.isPending ? 'Deshaciendo…' : 'Deshacer'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Una operación ─────────────────────────────────────────────────────────────

const BUNDLE_COLORS = ['border-sky-400', 'border-violet-400', 'border-amber-400', 'border-emerald-400', 'border-rose-400', 'border-teal-400']

function StateChip({ op }: { op: AuditOperation }) {
  const base = 'text-[11px] px-1.5 py-0.5 rounded-md whitespace-nowrap'
  if (op.state === 'done') return <span className={`${base} bg-gray-100 dark:bg-gray-800 text-gray-500`}>Deshecha</span>
  if (op.state === 'partial') return <span className={`${base} bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400`}>Deshecha en parte</span>
  if (op.state === 'old') return <span title={op.reason ?? ''} className={`${base} text-gray-400 dark:text-gray-500 cursor-help`}>No se puede deshacer</span>
  return null
}

function OperationItem({ op, isAdmin, names, onUndo }: {
  op: AuditOperation; isAdmin: boolean; names: Names; onUndo: (r: UndoRequest) => void
}) {
  const [open, setOpen] = useState(false)
  const canUndo = isAdmin && (op.state === 'ok' || op.state === 'partial') && !!op.group_id
  const perRow = canUndo && (op.bundles ?? 0) > 1
  const expandable = op.rows.length > 0 || !!op.reason
  const isUndo = op.state === 'undo'

  const undoRows = (r: AuditRow) => {
    const same = op.rows.filter(x => x.bundle === r.bundle && !x.restored_at)
    onUndo({ op, ids: [r.id], rows: same })
  }

  return (
    <div className="px-3 py-2">
      <div className="flex items-start gap-2">
        <button onClick={() => expandable && setOpen(o => !o)}
          className={`mt-0.5 shrink-0 text-gray-400 ${expandable ? 'hover:text-gray-600 dark:hover:text-gray-300' : 'opacity-0 cursor-default'}`}
          aria-label={open ? 'Ocultar detalle' : 'Ver detalle'}>
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        <div className="min-w-0 flex-1">
          <p className={`text-xs leading-5 break-words ${op.state === 'done' ? 'text-gray-400 dark:text-gray-500 line-through decoration-gray-300 dark:decoration-gray-600' : isUndo ? 'text-amber-700 dark:text-amber-400' : 'text-gray-700 dark:text-gray-200'}`}>
            {headline(op)}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            {fmtTs(op.created_at)} · {SOURCE[op.source] ?? op.source}
            {op.total_rows > 0 && ` · ${op.total_rows} ${op.total_rows === 1 ? 'fila' : 'filas'}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StateChip op={op} />
          {canUndo && (
            <button onClick={() => onUndo({ op, rows: op.rows })}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <RotateCcw className="w-3 h-3" />
              {op.state === 'partial' ? 'Deshacer el resto' : 'Deshacer'}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-2 ml-5 space-y-1">
          {op.reason && <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">{op.reason}</p>}
          {op.rows.map(r => {
            const mark = ACTION_MARK[r.action]
            const color = r.bundle ? BUNDLE_COLORS[(r.bundle - 1) % BUNDLE_COLORS.length] : 'border-gray-200 dark:border-gray-700'
            const detail = rowDetail(r, names)
            return (
              <div key={r.id} className={`flex items-start gap-2 border-l-2 pl-2 ${perRow ? color : 'border-gray-200 dark:border-gray-700'} ${r.restored_at ? 'opacity-50' : ''}`}>
                <span className={`font-mono text-xs w-3 shrink-0 ${mark?.cls ?? ''}`}>{mark?.sign}</span>
                <div className="min-w-0 flex-1 text-[11px] leading-4">
                  <span className="text-gray-600 dark:text-gray-300">
                    {rowTitle(r)}
                  </span>
                  {detail && <span className="text-gray-400 dark:text-gray-500"> · {detail}</span>}
                  {r.restored_at && <span className="text-gray-400"> · deshecho</span>}
                </div>
                {perRow && !r.restored_at && (
                  <button onClick={() => undoRows(r)} title={`Bloque ${r.bundle}: deshace esta fila y las que van con ella`}
                    className="shrink-0 text-[11px] text-gray-400 hover:text-amber-600 dark:hover:text-amber-400">
                    Deshacer{op.rows.filter(x => x.bundle === r.bundle).length > 1 ? ` (bloque ${r.bundle})` : ''}
                  </button>
                )}
              </div>
            )
          })}
          {op.total_rows > op.rows.length && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 pl-2">
              y {op.total_rows - op.rows.length} filas más (se deshacen con la operación entera)
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sección ───────────────────────────────────────────────────────────────────

export default function ActivityLog() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const isAdmin = !!user?.is_superuser
  const [pending, setPending] = useState<UndoRequest | null>(null)

  const q = useInfiniteQuery({
    queryKey: ['audit-operations'],
    queryFn: ({ pageParam }) => getOperations(pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: last => last.next_before ?? undefined,
  })
  const ops = useMemo(() => q.data?.pages.flatMap(p => p.operations) ?? [], [q.data])

  const { data: types = [] } = useQuery({ queryKey: ['movement-types'], queryFn: getMovementTypes })
  const { data: accountsSummary } = useQuery({
    queryKey: ['accounts-summary'],
    queryFn: () => import('../../api/accounts').then(m => m.getAccountsSummary()),
  })
  const names: Names = useMemo(() => ({
    accounts: new Map((accountsSummary?.accounts ?? []).map(a => [a.id, a.name])),
    types: new Map(types.map(tp => [tp.id, tp.name])),
  }), [accountsSummary, types])

  const clearMut = useMutation({
    mutationFn: clearAuditLog,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-operations'] }),
  })

  const download = async () => {
    const entries = await getAuditLog({ limit: 500 })
    const lines = entries
      .map(e => `${e.created_at.replace('T', ' ').slice(0, 19)}  [${e.action.toUpperCase()}]  ${e.summary}`)
      .join('\n')
    const blob = new Blob([lines], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activity-${new Date().toISOString().slice(0, 10)}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasOld = ops.some(o => o.state === 'old' && o.group_id === null && o.source !== 'ai')

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {q.isLoading ? '…' : `${ops.length}${q.hasNextPage ? '+' : ''} operaciones`}
        </span>
        <div className="flex items-center gap-3">
          <button onClick={() => q.refetch()} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            {t('settings.refresh')}
          </button>
          {ops.length > 0 && (
            <button onClick={download} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              {t('settings.download')}
            </button>
          )}
          {ops.length > 0 && (
            <button
              onClick={() => { if (confirm(t('settings.clearActivityConfirm') + '\n\nSin historial ya no se podrá deshacer nada de lo anterior.')) clearMut.mutate() }}
              className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors"
            >
              {t('settings.clearAll')}
            </button>
          )}
        </div>
      </div>

      {isAdmin && hasOld && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
          Lo registrado antes de poder deshacer se sigue viendo, pero no se puede deshacer: entonces el historial no guardaba la fila entera.
        </p>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800 max-h-[32rem] overflow-y-auto">
        {q.isLoading
          ? <p className="px-3 py-3 text-xs text-gray-400">{t('common.loading')}</p>
          : ops.length === 0
            ? <p className="px-3 py-3 text-xs text-gray-400">{t('settings.noActivity')}</p>
            : ops.map(op => (
              <OperationItem key={op.key} op={op} isAdmin={isAdmin} names={names} onUndo={setPending} />
            ))}
        {q.hasNextPage && (
          <div className="px-3 py-2 text-center">
            <button onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}
              className="text-xs text-blue-500 hover:text-blue-600 disabled:opacity-50">
              {q.isFetchingNextPage ? t('common.loading') : 'Cargar más'}
            </button>
          </div>
        )}
      </div>

      {pending && <UndoModal req={pending} onClose={() => setPending(null)} />}
    </div>
  )
}
