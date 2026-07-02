import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { getMovementTypes } from '../../api/movementTypes'
import { getMovements } from '../../api/movements'
import { Section } from './shared'

// ── Suscripciones ─────────────────────────────────────────────────────────────

export type SubPeriod = 'mensual' | 'anual'
export interface SubEntry { period: SubPeriod }
const SUBS_CFG_KEY = 'suscripciones-config'
const SUBS_IDS_KEY = 'suscripciones-ids'  // legacy

export function loadSubsConfig(): Record<number, SubEntry> {
  try {
    const raw = localStorage.getItem(SUBS_CFG_KEY)
    if (raw) return JSON.parse(raw)
    // Migrate from old number[] format
    const legacy = JSON.parse(localStorage.getItem(SUBS_IDS_KEY) ?? '[]')
    if (Array.isArray(legacy) && legacy.length > 0) {
      const migrated: Record<number, SubEntry> = {}
      legacy.forEach((id: number) => { migrated[id] = { period: 'mensual' } })
      localStorage.setItem(SUBS_CFG_KEY, JSON.stringify(migrated))
      return migrated
    }
    return {}
  } catch { return {} }
}
function saveSubsConfig(cfg: Record<number, SubEntry>) {
  localStorage.setItem(SUBS_CFG_KEY, JSON.stringify(cfg))
}

function detectSuggestions(movements: { date: string; dinero: number; movement_type_id?: number | null }[], excluded: Set<number>): number[] {
  const byType: Record<number, string[]> = {}
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 18)
  for (const mv of movements) {
    if (!mv.movement_type_id || mv.dinero >= 0 || excluded.has(mv.movement_type_id)) continue
    if (new Date(mv.date + 'T00:00:00') < cutoff) continue
    ;(byType[mv.movement_type_id] ??= []).push(mv.date)
  }
  return Object.entries(byType).flatMap(([tid, dates]) => {
    if (dates.length < 2) return []
    const sorted = [...dates].sort()
    const intervals = sorted.slice(1).map((d, i) =>
      (new Date(d + 'T00:00:00').getTime() - new Date(sorted[i] + 'T00:00:00').getTime()) / 86400000
    )
    const avg = intervals.reduce((s, x) => s + x, 0) / intervals.length
    const ok = (avg >= 25 && avg <= 40) || (avg >= 340 && avg <= 390)
    return ok ? [Number(tid)] : []
  })
}

function SubscripcionesSection() {
  const { data: types = [] }     = useQuery({ queryKey: ['movement-types'], queryFn: getMovementTypes })
  const { data: movements = [] } = useQuery({ queryKey: ['movements'],      queryFn: () => getMovements(), staleTime: 5 * 60 * 1000 })
  const [config, setConfig]      = useState<Record<number, SubEntry>>(loadSubsConfig)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const activeIds = useMemo(() => new Set(Object.keys(config).map(Number)), [config])

  const expenseTypes = useMemo(() => types.filter(tp => {
    const cat = tp.category?.toLowerCase() ?? ''
    return cat !== 'ingreso' && cat !== 'ahorro' && tp.income_expense_group_id != null
  }), [types])

  const suggestions = useMemo(
    () => detectSuggestions(movements, activeIds),
    [movements, activeIds]
  )

  const typeMap = useMemo(() => Object.fromEntries(types.map(tp => [tp.id, tp])), [types])

  const toggleSub = (id: number, defaultPeriod: SubPeriod = 'mensual') => {
    setConfig(prev => {
      const next = { ...prev }
      if (next[id]) delete next[id]
      else next[id] = { period: defaultPeriod }
      saveSubsConfig(next)
      return next
    })
  }

  const setPeriod = (id: number, period: SubPeriod) => {
    setConfig(prev => {
      const next = { ...prev, [id]: { period } }
      saveSubsConfig(next)
      return next
    })
  }

  const periodBtn = (id: number, p: SubPeriod) => (
    <button
      key={p}
      onClick={() => setPeriod(id, p)}
      className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors ${
        config[id]?.period === p
          ? 'bg-blue-500 text-white'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
      }`}
    >
      {p === 'mensual' ? 'Mensual' : 'Anual'}
    </button>
  )

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Elige qué subtipos son suscripciones y si se cobran mensual o anualmente.
      </p>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
        {expenseTypes.length === 0 && (
          <p className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">No hay subtipos de gasto definidos.</p>
        )}
        {expenseTypes.map(tp => {
          const active = activeIds.has(tp.id)
          return (
            <div key={tp.id} className="flex items-center gap-2 px-4 py-2.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tp.color }} />
              <span className="flex-1 text-sm text-gray-700 dark:text-gray-200 truncate">{tp.name}</span>
              {active && (
                <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5 shrink-0">
                  {periodBtn(tp.id, 'mensual')}
                  {periodBtn(tp.id, 'anual')}
                </div>
              )}
              <button
                onClick={() => toggleSub(tp.id)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none shrink-0 ${active ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${active ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Auto-suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowSuggestions(v => !v)}
            className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            {suggestions.length} sugerencia{suggestions.length !== 1 ? 's' : ''} detectada{suggestions.length !== 1 ? 's' : ''}
            {showSuggestions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showSuggestions && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 divide-y divide-blue-100 dark:divide-blue-800/50">
              {suggestions.map(id => {
                const tp = typeMap[id]
                if (!tp) return null
                return (
                  <div key={id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tp.color }} />
                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-200">{tp.name}</span>
                    <span className="text-xs text-blue-500 dark:text-blue-400 shrink-0">recurrente</span>
                    <button onClick={() => toggleSub(id, 'mensual')}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors">
                      Añadir
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tab entry point ────────────────────────────────────────────────────────────

export default function SuscripcionesTab() {
  return (
    <Section title="Suscripciones">
      <SubscripcionesSection />
    </Section>
  )
}
