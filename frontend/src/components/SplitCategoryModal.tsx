import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Search, X } from 'lucide-react'
import type { MovementType } from '../api/movementTypes'
import type { MovementSplit } from '../api/movements'
import { getGroups } from '../api/groups'
import { useCurrency } from '../hooks/useCurrency'
import { normalizeSplits } from '../utils/splits'
import { t } from '../utils/i18n'

/**
 * Reparto de un movimiento entre varias categorías, con un donut en vivo. Trabaja con importes
 * positivos; quien lo abre aplica el signo del movimiento. Los tipos con cuenta vinculada no
 * entran (moverían dinero entre cuentas) y no se mezclan ingresos con gastos.
 */
export default function SplitCategoryModal({ types, initial, onCancel, onSave }: {
  types: MovementType[]
  initial: MovementSplit[]
  onCancel: () => void
  onSave: (parts: MovementSplit[]) => void
}) {
  const { fmt } = useCurrency()
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: getGroups })
  const [amounts, setAmounts] = useState<Record<number, string>>(() =>
    Object.fromEntries(initial.map(p => [p.movement_type_id, String(Math.abs(p.money))])))
  const [query, setQuery] = useState('')

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onCancel() } }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [onCancel])

  const incomeGroupIds = useMemo(() => new Set(groups.filter(g => g.name === 'Ingreso').map(g => g.id)), [groups])
  const isIncome = (tp: MovementType) => incomeGroupIds.has(tp.income_expense_group_id)
  const usable = types.filter(tp => !tp.linked_account_id)
  const typeById = useMemo(() => new Map(types.map(tp => [tp.id, tp])), [types])

  const parts = normalizeSplits(
    Object.entries(amounts).map(([id, v]) => ({ movement_type_id: Number(id), money: Math.abs(parseFloat(v) || 0) })),
  )
  const total = parts.reduce((s, p) => s + p.money, 0)
  // Con la primera parte queda fijado si el reparto es de ingresos o de gastos
  const first = parts.length ? typeById.get(parts[0].movement_type_id) : undefined
  const lockedIncome = first ? isIncome(first) : null

  const byCategory = useMemo(() => {
    const q = query.trim().toLowerCase()
    const map: Record<string, MovementType[]> = {}
    for (const tp of usable) {
      if (q && !tp.name.toLowerCase().includes(q) && !tp.category.toLowerCase().includes(q)) continue
      ;(map[tp.category] ??= []).push(tp)
    }
    return map
  }, [usable, query])

  const slices = parts.map(p => {
    const tp = typeById.get(p.movement_type_id)
    return { id: p.movement_type_id, name: tp?.name ?? '?', value: p.money, color: tp?.color ?? '#6b7280' }
  })

  const INP = 'w-24 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg pl-2 pr-6 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 disabled:opacity-40'

  return (
    // Se pinta dentro de otros modales: el clic no debe llegar a su fondo (que los cerraría)
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onMouseDown={onCancel} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-white">{t('split.title')}</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500">{t('split.hint')}</p>
          </div>
          <button type="button" onClick={onCancel} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto sm:overflow-hidden grid sm:grid-cols-[1fr_220px]">
          {/* Donut: arriba en móvil, a la derecha en escritorio */}
          <div className="sm:order-2 p-4 sm:border-l border-b sm:border-b-0 border-gray-100 dark:border-gray-800 flex flex-col items-center">
            <div className="relative w-44 h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={slices.length ? slices : [{ id: 0, name: '', value: 1, color: '#e5e7eb' }]}
                    dataKey="value" innerRadius="62%" outerRadius="95%" paddingAngle={slices.length > 1 ? 2 : 0}
                    isAnimationActive={false} stroke="none">
                    {(slices.length ? slices : [{ id: 0, color: '#e5e7eb' }]).map(s => <Cell key={s.id} fill={s.color} />)}
                  </Pie>
                  {slices.length > 0 && <Tooltip formatter={(v) => fmt(Number(v))} />}
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] uppercase tracking-wide text-gray-400">{t('split.total')}</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-white tabular-nums">{fmt(total)}</span>
              </div>
            </div>
            <ul className="mt-3 w-full space-y-1">
              {slices.length === 0 && <li className="text-xs text-center text-gray-400 dark:text-gray-500">{t('split.empty')}</li>}
              {slices.map(s => (
                <li key={s.id} className="flex items-center gap-2 text-xs">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{s.name}</span>
                  <span className="text-gray-400 tabular-nums">{total ? Math.round(s.value / total * 100) : 0}%</span>
                  <span className="text-gray-700 dark:text-gray-200 tabular-nums">{fmt(s.value)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Categorías con su importe */}
          <div className="sm:order-1 flex flex-col min-h-0">
            <div className="px-4 pt-3 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('split.search')} autoFocus
                  className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600" />
              </div>
              {/* Siempre ocupa su hueco: si apareciera al teclear la primera cifra, la lista saltaría */}
              <p className={`text-[11px] text-gray-400 dark:text-gray-500 mt-1 ${lockedIncome === null ? 'invisible' : ''}`}>{t('split.mixed')}</p>
            </div>
            <div className="sm:overflow-y-auto sm:max-h-[55vh] px-4 pb-3 space-y-3">
              {Object.entries(byCategory).map(([cat, items]) => (
                <div key={cat}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">{cat}</p>
                  <div className="space-y-1">
                    {items.map(tp => {
                      const disabled = lockedIncome !== null && isIncome(tp) !== lockedIncome && !amounts[tp.id]
                      return (
                        <label key={tp.id} className={`flex items-center gap-2 rounded-lg px-2 py-1 ${disabled ? 'opacity-40' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'}`}>
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tp.color }} />
                          <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{tp.name}</span>
                          <span className="relative">
                            <input type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00" disabled={disabled}
                              value={amounts[tp.id] ?? ''} className={INP}
                              onChange={e => setAmounts(a => {
                                const next = { ...a }
                                if (e.target.value === '') delete next[tp.id]
                                else next[tp.id] = e.target.value
                                return next
                              })} />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">€</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-gray-800">
          <button type="button" onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            {t('common.cancel')}
          </button>
          <button type="button" disabled={parts.length === 0} onClick={() => onSave(parts)}
            className="px-4 py-2 text-sm rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium disabled:opacity-40">
            {t('common.save')}
          </button>
        </div>
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
