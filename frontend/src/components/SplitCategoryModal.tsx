import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { Check, ChevronLeft, Search, X } from 'lucide-react'
import type { MovementType } from '../api/movementTypes'
import type { MovementSplit } from '../api/movements'
import { getGroups } from '../api/groups'
import { useCurrency } from '../hooks/useCurrency'
import { normalizeSplits } from '../utils/splits'
import { t } from '../utils/i18n'

const UNASSIGNED_COLOR = '#e5e7eb'
const round2 = (n: number) => Math.round(n * 100) / 100
const num = (v: string | undefined) => parseFloat(v ?? '') || 0

/**
 * Reparto de un movimiento entre varias categorías, en dos pasos: primero se eligen las
 * categorías y después se pone el importe de cada una con el donut del reparto encima.
 * La categoría que queda por rellenar se completa sola hasta el total.
 *
 * Trabaja con importes positivos; quien lo abre aplica el signo del movimiento. Los tipos con
 * cuenta vinculada no entran (moverían dinero entre cuentas) y no se mezclan ingresos con gastos.
 */
export default function SplitCategoryModal({ types, initial, total: initialTotal, onCancel, onSave }: {
  types: MovementType[]
  initial: MovementSplit[]
  /** Importe del movimiento (en positivo); 0 si aún no tiene */
  total: number
  onCancel: () => void
  onSave: (parts: MovementSplit[]) => void
}) {
  const { fmt } = useCurrency()
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: getGroups })

  // Editar un reparto ya hecho va directo a los importes; si no, se empieza eligiendo
  const editing = initial.length > 1
  const [step, setStep] = useState<'choose' | 'amounts'>(editing ? 'amounts' : 'choose')
  const [selected, setSelected] = useState<number[]>(() => initial.map(p => p.movement_type_id))
  const [amounts, setAmounts] = useState<Record<number, string>>(() =>
    editing ? Object.fromEntries(initial.map(p => [p.movement_type_id, String(Math.abs(p.money))])) : {})
  // Orden en que se han editado los importes: el menos reciente es el que se autocompleta
  const [edited, setEdited] = useState<number[]>(() => editing ? initial.map(p => p.movement_type_id) : [])
  const [totalStr, setTotalStr] = useState(() => {
    const tot = initialTotal || (editing ? initial.reduce((s, p) => s + Math.abs(p.money), 0) : 0)
    return tot ? String(round2(tot)) : ''
  })
  const [query, setQuery] = useState('')

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onCancel() } }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [onCancel])

  const incomeGroupIds = useMemo(() => new Set(groups.filter(g => g.name === 'Ingreso').map(g => g.id)), [groups])
  const isIncome = (tp: MovementType) => incomeGroupIds.has(tp.income_expense_group_id)
  const typeById = useMemo(() => new Map(types.map(tp => [tp.id, tp])), [types])
  const chosen = selected.map(id => typeById.get(id)).filter((tp): tp is MovementType => !!tp)
  // Con la primera categoría elegida queda fijado si el reparto es de ingresos o de gastos
  const lockedIncome = chosen.length ? isIncome(chosen[0]) : null

  const byCategory = useMemo(() => {
    const q = query.trim().toLowerCase()
    const map: Record<string, MovementType[]> = {}
    for (const tp of types) {
      if (tp.linked_account_id) continue
      if (q && !tp.name.toLowerCase().includes(q) && !tp.category.toLowerCase().includes(q)) continue
      ;(map[tp.category] ??= []).push(tp)
    }
    return map
  }, [types, query])

  // ── Paso 2: importes ────────────────────────────────────────────────────────
  const total = num(totalStr)
  const assigned = round2(selected.reduce((s, id) => s + num(amounts[id]), 0))
  // Sin total (movimiento aún sin importe) manda la suma de lo repartido
  const effectiveTotal = total || assigned
  const unassigned = round2(effectiveTotal - assigned)

  /** Completa hasta el total la categoría que toca: la única sin tocar o, si ya se tocaron
   *  todas, la editada hace más tiempo. Con varias sin tocar no se adivina nada. */
  const autofill = (next: Record<number, string>, order: number[], tot: number) => {
    const sel = selected
    if (!tot || sel.length < 2) return next
    const untouched = sel.filter(id => !order.includes(id))
    const target = untouched.length === 1 ? untouched[0]
      : untouched.length === 0 ? order.find(id => sel.includes(id)) : undefined
    if (target === undefined) return next
    const others = sel.filter(id => id !== target).reduce((s, id) => s + num(next[id]), 0)
    return { ...next, [target]: String(round2(Math.max(0, tot - others))) }
  }

  const setAmount = (id: number, v: string) => {
    const order = [...edited.filter(x => x !== id), id]
    setEdited(order)
    setAmounts(autofill({ ...amounts, [id]: v }, order, total))
  }

  const setTotal = (v: string) => {
    setTotalStr(v)
    setAmounts(a => autofill(a, edited, num(v)))
  }

  const goToAmounts = () => {
    // Al volver a elegir se conservan los importes de las categorías que siguen; las nuevas
    // empiezan vacías y lo que falte se ve como «sin asignar»
    const keep = (id: number) => selected.includes(id)
    setEdited(edited.filter(keep))
    setAmounts(Object.fromEntries(Object.entries(amounts).filter(([id]) => keep(Number(id)))))
    setStep('amounts')
  }

  const toggle = (id: number) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const parts = normalizeSplits(selected.map(id => ({ movement_type_id: id, money: num(amounts[id]) })))
  const canSave = parts.length > 0 && Math.abs(unassigned) < 0.005

  const slices = [
    ...chosen.map(tp => ({ id: tp.id, value: num(amounts[tp.id]), color: tp.color ?? '#6b7280' })).filter(s => s.value > 0),
    ...(unassigned > 0 ? [{ id: 0, value: unassigned, color: UNASSIGNED_COLOR }] : []),
  ]

  const BTN = 'px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
  const BTN_PRIMARY = 'px-4 py-2 text-sm rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium disabled:opacity-40'
  const INP = 'border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600'

  return (
    // Se pinta dentro de otros modales: el clic no debe llegar a su fondo (que los cerraría)
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onMouseDown={onCancel} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-full flex flex-col">
        <div className="flex items-center gap-2 px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800">
          {step === 'amounts' && (
            <button type="button" onClick={() => setStep('choose')} title={t('split.back')}
              className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600">
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white">{t('split.title')}</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {step === 'choose' ? t('split.choose') : t('split.amountsHint')}
            </p>
          </div>
          <button type="button" onClick={onCancel} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 'choose' ? (
          <>
            <div className="px-4 pt-3 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('split.search')} autoFocus
                  className={`${INP} w-full pl-8 pr-3 py-1.5 text-sm`} />
              </div>
              {/* Siempre ocupa su hueco: si apareciera al marcar la primera, la lista saltaría */}
              <p className={`text-[11px] text-gray-400 dark:text-gray-500 mt-1 ${lockedIncome === null ? 'invisible' : ''}`}>{t('split.mixed')}</p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 space-y-3">
              {Object.entries(byCategory).map(([cat, items]) => (
                <div key={cat}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">{cat}</p>
                  <div className="space-y-0.5">
                    {items.map(tp => {
                      const on = selected.includes(tp.id)
                      const disabled = !on && lockedIncome !== null && isIncome(tp) !== lockedIncome
                      return (
                        <button key={tp.id} type="button" disabled={disabled} onClick={() => toggle(tp.id)}
                          className={`w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                            on ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'} disabled:opacity-40 disabled:hover:bg-transparent`}>
                          <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            on ? 'border-transparent' : 'border-gray-300 dark:border-gray-600'}`}
                            style={on ? { backgroundColor: tp.color } : undefined}>
                            {on && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                          </span>
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tp.color }} />
                          <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{tp.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-gray-800">
              <button type="button" onClick={onCancel} className={BTN}>{t('common.cancel')}</button>
              <button type="button" disabled={selected.length < 2} onClick={goToAmounts} className={BTN_PRIMARY}>
                {t('split.next')}{selected.length ? ` (${selected.length})` : ''}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
              {/* Donut: el total siempre en el centro y, debajo, lo que falta por repartir */}
              <div className="relative w-48 h-48 mx-auto">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={slices.length ? slices : [{ id: 0, value: 1, color: UNASSIGNED_COLOR }]}
                      dataKey="value" innerRadius="64%" outerRadius="96%" paddingAngle={slices.length > 1 ? 2 : 0}
                      isAnimationActive={false} stroke="none">
                      {(slices.length ? slices : [{ id: 0, color: UNASSIGNED_COLOR }]).map(s => <Cell key={s.id} fill={s.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] uppercase tracking-wide text-gray-400">{t('split.total')}</span>
                  <span className="text-lg font-semibold text-gray-800 dark:text-white tabular-nums">{fmt(effectiveTotal)}</span>
                  {Math.abs(unassigned) >= 0.005 && (
                    <span className={`text-[11px] tabular-nums mt-0.5 ${unassigned < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                      {unassigned < 0 ? t('split.over') : t('split.unassigned')} {fmt(Math.abs(unassigned))}
                    </span>
                  )}
                </div>
              </div>

              <label className="mt-4 flex items-center justify-between gap-3 text-sm text-gray-600 dark:text-gray-400">
                {t('split.totalLabel')}
                <span className="relative">
                  <input type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00" value={totalStr}
                    onChange={e => setTotal(e.target.value)} className={`${INP} w-28 pl-2 pr-6 py-1 text-sm text-right`} />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">€</span>
                </span>
              </label>

              <div className="mt-3 space-y-1.5">
                {chosen.map((tp, i) => {
                  const v = num(amounts[tp.id])
                  return (
                    <label key={tp.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 bg-gray-50 dark:bg-gray-800/60">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tp.color }} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-gray-700 dark:text-gray-300 truncate">{tp.name}</span>
                        <span className="block text-[11px] text-gray-400 tabular-nums">{effectiveTotal ? Math.round(v / effectiveTotal * 100) : 0}%</span>
                      </span>
                      <span className="relative">
                        <input type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00" autoFocus={i === 0}
                          value={amounts[tp.id] ?? ''} onChange={e => setAmount(tp.id, e.target.value)}
                          className={`${INP} w-28 pl-2 pr-6 py-1 text-sm text-right`} />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">€</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-gray-800">
              <button type="button" onClick={onCancel} className={BTN}>{t('common.cancel')}</button>
              <button type="button" disabled={!canSave} onClick={() => onSave(parts)} className={BTN_PRIMARY}>
                {t('common.save')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Resumen del reparto bajo el selector de tipo; al pulsarlo se vuelve a abrir el reparto. */
export function SplitSummary({ splits, types, onEdit }: {
  splits: MovementSplit[]
  types: MovementType[]
  onEdit: () => void
}) {
  const { fmt } = useCurrency()
  const total = splits.reduce((s, p) => s + Math.abs(p.money), 0)
  return (
    <button type="button" onClick={onEdit} title={t('split.edit')}
      className="w-full text-left rounded-lg border border-dashed border-gray-200 dark:border-gray-700 px-2.5 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/60">
      <div className="flex h-1.5 rounded-full overflow-hidden mb-1.5">
        {splits.map(p => {
          const tp = types.find(x => x.id === p.movement_type_id)
          return <span key={p.movement_type_id} style={{ width: `${total ? Math.abs(p.money) / total * 100 : 0}%`, backgroundColor: tp?.color ?? '#6b7280' }} />
        })}
      </div>
      <div className="space-y-0.5">
        {splits.map(p => {
          const tp = types.find(x => x.id === p.movement_type_id)
          return (
            <div key={p.movement_type_id} className="flex items-center gap-1.5 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: tp?.color ?? '#6b7280' }} />
              <span className="flex-1 truncate text-gray-600 dark:text-gray-400">{tp?.name ?? '?'}</span>
              <span className="tabular-nums text-gray-700 dark:text-gray-300">{fmt(Math.abs(p.money))}</span>
            </div>
          )
        })}
      </div>
    </button>
  )
}
