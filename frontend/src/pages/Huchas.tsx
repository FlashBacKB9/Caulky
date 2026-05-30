import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PiggyBank, Target, CalendarDays, TrendingUp, ChevronDown, ChevronRight, Pencil, Check } from 'lucide-react'
import { getAccountsSummary, type Account } from '../api/accounts'
import { getMovements, type Movement } from '../api/movements'
import { getMovementTypes, type MovementType } from '../api/movementTypes'
import { useCurrency } from '../hooks/useCurrency'
import { useDateFormat } from '../hooks/useDateFormat'
import { t } from '../utils/i18n'
import AppIcon from '../components/AppIcon'

// ── Config persistence ────────────────────────────────────────────────────────

interface HuchaConfig {
  goal:        number
  targetDate?: string  // YYYY-MM-DD
  monthly?:    number  // monthly contribution target
}

const CONFIG_KEY = 'huchas-config'

function loadConfig(): Record<number, HuchaConfig> {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY) ?? '{}') } catch { return {} }
}
function saveConfig(c: Record<number, HuchaConfig>) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(c))
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayStr() { return new Date().toLocaleDateString('en-CA') }
function addMonths(d: Date, n: number) {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}
function monthsBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()))
}
function fmtRelativeDate(dateStr: string): string {
  const d    = new Date(dateStr + 'T00:00:00')
  const now  = new Date()
  const months = monthsBetween(now, d)
  if (months < 1)   return 'este mes'
  if (months < 12)  return `en ${months} mes${months > 1 ? 'es' : ''}`
  const yrs = Math.floor(months / 12)
  const rem = months % 12
  return rem === 0 ? `en ${yrs} año${yrs > 1 ? 's' : ''}` : `en ${yrs}a ${rem}m`
}

// ── HuchaCard ─────────────────────────────────────────────────────────────────

function HuchaCard({
  account, movements, types, config, onSaveConfig,
}: {
  account: Account
  movements: Movement[]
  types: MovementType[]
  config: HuchaConfig | undefined
  onSaveConfig: (c: HuchaConfig) => void
}) {
  const { fmt } = useCurrency()
  const { fmtDate } = useDateFormat()

  const [editing,    setEditing]    = useState(false)
  const [expanded,   setExpanded]   = useState(false)
  const [draftGoal,  setDraftGoal]  = useState(String(config?.goal ?? ''))
  const [draftDate,  setDraftDate]  = useState(config?.targetDate ?? '')
  const [draftMonth, setDraftMonth] = useState(String(config?.monthly ?? ''))

  const balance = account.balance
  const goal    = config?.goal ?? 0

  // Contributions: movements linked to this account (savings type linked)
  const linkedTypeIds = useMemo(
    () => new Set(types.filter(tp => tp.linked_account_id === account.id).map(tp => tp.id)),
    [types, account.id],
  )
  const contributions = useMemo(
    () => movements
      .filter(mv => mv.movement_type_id != null && linkedTypeIds.has(mv.movement_type_id) && mv.money > 0)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10),
    [movements, linkedTypeIds],
  )

  const pct = goal > 0 ? Math.min(100, (balance / goal) * 100) : 0
  const remaining = Math.max(0, goal - balance)

  // Projections
  const monthly     = config?.monthly
  const targetDate  = config?.targetDate
  const today       = new Date()

  const projectedDate: string | null = useMemo(() => {
    if (!monthly || monthly <= 0 || remaining <= 0) return null
    const months = Math.ceil(remaining / monthly)
    return addMonths(today, months).toLocaleDateString('en-CA')
  }, [monthly, remaining])

  const monthlyNeeded: number | null = useMemo(() => {
    if (!targetDate || balance >= goal) return null
    const months = monthsBetween(today, new Date(targetDate + 'T00:00:00'))
    if (months <= 0) return null
    return Math.ceil(remaining / months)
  }, [targetDate, remaining, goal, balance])

  const saveEdit = () => {
    const g = parseFloat(draftGoal.replace(',', '.'))
    if (!isNaN(g) && g > 0) {
      onSaveConfig({
        goal: g,
        targetDate: draftDate || undefined,
        monthly: draftMonth ? parseFloat(draftMonth.replace(',', '.')) : undefined,
      })
    }
    setEditing(false)
  }

  const cancelEdit = () => {
    setDraftGoal(String(config?.goal ?? ''))
    setDraftDate(config?.targetDate ?? '')
    setDraftMonth(String(config?.monthly ?? ''))
    setEditing(false)
  }

  const inputCls = 'border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-full'

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden"
      style={{ borderLeftColor: account.color, borderLeftWidth: 4 }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: account.color + '20' }}>
          <AppIcon name={account.icon} className="w-5 h-5" style={{ color: account.color }} strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white truncate">{account.name}</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 tabular-nums mt-0.5">
            {fmt(balance)} {goal > 0 && <span>/ {fmt(goal)}</span>}
          </p>
        </div>
        <button onClick={() => setEditing(e => !e)}
          className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-300 rounded-lg transition-colors">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Progress bar */}
      {goal > 0 && (
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-400">{pct.toFixed(0)}%</span>
            <span className="text-xs text-gray-400 tabular-nums">{fmt(remaining)} restante</span>
          </div>
          <div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: account.color }} />
          </div>
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-50 dark:border-gray-800 space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <Target className="w-3 h-3" /> Objetivo (€)
            </label>
            <input type="number" step="0.01" value={draftGoal} onChange={e => setDraftGoal(e.target.value)}
              placeholder="ej. 3000" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <CalendarDays className="w-3 h-3" /> Fecha objetivo
              </label>
              <input type="date" value={draftDate} onChange={e => setDraftDate(e.target.value)}
                min={todayStr()} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Aportación/mes (€)
              </label>
              <input type="number" step="0.01" value={draftMonth} onChange={e => setDraftMonth(e.target.value)}
                placeholder="ej. 200" className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={cancelEdit} className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700">
              {t('common.cancel')}
            </button>
            <button onClick={saveEdit}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors">
              {t('common.save')}
            </button>
          </div>
        </div>
      )}

      {/* Projections */}
      {goal > 0 && balance < goal && !editing && (
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Monthly needed to reach date */}
          {targetDate && monthlyNeeded !== null && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
              <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">
                Para llegar el {fmtDate(targetDate)}
              </p>
              <p className="text-lg font-bold tabular-nums text-blue-700 dark:text-blue-300">
                {fmt(monthlyNeeded)}<span className="text-sm font-normal">/mes</span>
              </p>
            </div>
          )}
          {/* Date if contributing monthly */}
          {monthly != null && projectedDate && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3">
              <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1">
                Aportando {fmt(monthly)}/mes
              </p>
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                {fmtRelativeDate(projectedDate)}
              </p>
              <p className="text-[11px] text-emerald-500 dark:text-emerald-400/70 tabular-nums">{fmtDate(projectedDate)}</p>
            </div>
          )}
          {/* If neither configured yet */}
          {!targetDate && !monthly && (
            <div className="col-span-2 text-xs text-gray-400 dark:text-gray-500 italic">
              Configura una fecha objetivo o aportación mensual para ver proyecciones.
            </div>
          )}
        </div>
      )}

      {/* Completed */}
      {goal > 0 && balance >= goal && !editing && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-3 py-2.5">
            <Check className="w-4 h-4 text-emerald-500 shrink-0" strokeWidth={2.5} />
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">¡Objetivo alcanzado!</p>
          </div>
        </div>
      )}

      {/* Contribution history (collapsible) */}
      {contributions.length > 0 && !editing && (
        <div className="border-t border-gray-50 dark:border-gray-800">
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {contributions.length} aportación{contributions.length !== 1 ? 'es' : ''}
          </button>
          {expanded && (
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {contributions.map(mv => (
                <div key={mv.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums w-20 shrink-0">
                    {fmtDate(mv.bank_date ?? mv.date)}
                  </span>
                  <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate">{mv.name}</span>
                  <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                    +{fmt(mv.money)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Huchas() {
  const { data: summary }  = useQuery({ queryKey: ['accounts-summary'], queryFn: getAccountsSummary })
  const { data: movements = [] } = useQuery({ queryKey: ['movements'], queryFn: () => getMovements() })
  const { data: types = [] }     = useQuery({ queryKey: ['movement-types'], queryFn: getMovementTypes })
  const { fmt } = useCurrency()

  const [configs, setConfigs] = useState<Record<number, HuchaConfig>>(loadConfig)

  const huchas = useMemo(
    () => (summary?.accounts ?? []).filter(a => a.category === 'hucha'),
    [summary],
  )

  const updateConfig = (id: number, c: HuchaConfig) => {
    const next = { ...configs, [id]: c }
    setConfigs(next)
    saveConfig(next)
  }

  // Summary stats
  const totalBalance = huchas.reduce((s, a) => s + a.balance, 0)
  const totalGoal    = huchas.reduce((s, a) => s + (configs[a.id]?.goal ?? 0), 0)
  const totalPct     = totalGoal > 0 ? Math.min(100, (totalBalance / totalGoal) * 100) : 0

  return (
    <div className="p-3 md:p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <PiggyBank className="w-6 h-6 text-pink-500" strokeWidth={1.5} />
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Huchas</h1>
      </div>

      {huchas.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-pink-50 dark:bg-pink-900/20 flex items-center justify-center">
            <PiggyBank className="w-8 h-8 text-pink-400" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-700 dark:text-gray-200">No tienes ninguna hucha</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 max-w-xs">
              Crea una cuenta de tipo <strong>Hucha</strong> en Ajustes → Cuentas para empezar.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Global summary */}
          {totalGoal > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm px-5 py-4">
              <div className="flex items-end justify-between mb-2">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Total ahorrado</p>
                  <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white mt-0.5">{fmt(totalBalance)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">de {fmt(totalGoal)}</p>
                  <p className="text-lg font-bold text-pink-500 tabular-nums">{totalPct.toFixed(0)}%</p>
                </div>
              </div>
              <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div className="h-full rounded-full bg-pink-500 transition-all duration-500"
                  style={{ width: `${totalPct}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-2">{fmt(Math.max(0, totalGoal - totalBalance))} restante entre todas las huchas</p>
            </div>
          )}

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {huchas.map(account => (
              <HuchaCard
                key={account.id}
                account={account}
                movements={movements}
                types={types}
                config={configs[account.id]}
                onSaveConfig={c => updateConfig(account.id, c)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
