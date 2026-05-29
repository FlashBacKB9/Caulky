import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, AlertTriangle, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getMovements } from '../api/movements'
import { useCurrency } from '../hooks/useCurrency'
import {
  readBudgets, getCurrentPeriod, calcSpending, getAmountForDate,
} from '../pages/Budgets'

interface Alert {
  id: string
  name: string
  pct: number
  spent: number
  limit: number
  level: 'warn' | 'over'
}

export default function BudgetAlerts() {
  const { fmt } = useCurrency()
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(false)
  const panelRef        = useRef<HTMLDivElement>(null)

  const { data: movements = [] } = useQuery({
    queryKey:  ['movements'],
    queryFn:   () => getMovements(),
    staleTime: 5 * 60 * 1000,
  })

  const alerts = useMemo((): Alert[] =>
    readBudgets().flatMap(b => {
      const { start, end } = getCurrentPeriod(
        b.period, b.customFrom, b.customTo,
        b.monthlyStartDay, b.weeklyStartDay, b.annualStartDate,
      )
      const limit = getAmountForDate(b.versions, end)
      if (!limit) return []
      const spent = calcSpending(movements, new Set(b.typeIds), start, end)
      const pct   = Math.round((spent / limit) * 100)
      if (pct < 80) return []
      return [{ id: b.id, name: b.name, pct, spent, limit, level: pct >= 105 ? 'over' : 'warn' }]
    }),
  [movements])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  if (alerts.length === 0 && !open) return null

  const showBadge  = !seen && alerts.length > 0
  const hasOver    = alerts.some(a => a.level === 'over')
  const badgeBg    = hasOver ? 'bg-red-500' : 'bg-amber-500'
  const bellColor  = showBadge
    ? hasOver ? 'text-red-500' : 'text-amber-500'
    : 'text-gray-400 dark:text-gray-500'

  const handleBell = () => {
    setOpen(o => !o)
    setSeen(true)
  }

  return createPortal(
    <div ref={panelRef} className="fixed top-4 right-4 z-[300] flex flex-col items-end gap-2">

      {/* Circular floating button */}
      <button
        onClick={handleBell}
        title="Alertas de presupuesto"
        className={`relative w-10 h-10 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-lg flex items-center justify-center transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${bellColor}`}
      >
        <Bell className="w-4 h-4" strokeWidth={1.5} />
        {showBadge && (
          <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full ${badgeBg} text-white text-[10px] font-bold flex items-center justify-center`}>
            {alerts.length}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="w-72 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <span className="text-sm font-semibold text-gray-800 dark:text-white">Alertas de presupuesto</span>
            <button
              onClick={() => setOpen(false)}
              className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-gray-50 dark:divide-gray-800/60 max-h-80 overflow-y-auto">
            {alerts.map(a => (
              <div key={a.id} className="px-4 py-3">
                <div className="flex items-start gap-2 mb-2">
                  <AlertTriangle
                    className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${a.level === 'over' ? 'text-red-500' : 'text-amber-500'}`}
                    strokeWidth={2}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{a.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 tabular-nums">
                      {fmt(a.spent)} / {fmt(a.limit)}
                    </p>
                  </div>
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${a.level === 'over' ? 'text-red-500 dark:text-red-400' : 'text-amber-500 dark:text-amber-400'}`}>
                    {a.pct}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${a.level === 'over' ? 'bg-red-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(a.pct, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="px-4 py-2.5 border-t border-gray-50 dark:border-gray-800/60">
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              {hasOver
                ? 'Algunos presupuestos han superado el límite'
                : 'Presupuestos próximos al límite (≥ 80%)'}
            </p>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
