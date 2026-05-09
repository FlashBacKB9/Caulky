import React, { useState, useMemo } from 'react'
import { syncPref } from '../utils/prefSync'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area,
  PieChart, Pie, Cell,
} from 'recharts'
import {
  Heart, Activity, Target, TrendingUp, Sparkles,
  Copy, Check, Settings, ChevronDown, ChevronUp, EyeOff, Eye, type LucideIcon,
} from 'lucide-react'
import { getMovements, type Movement } from '../api/movements'
import { getGroups, type Group } from '../api/groups'
import { getMovementTypes, type MovementType } from '../api/movementTypes'
import { getAccountsSummary, type Account } from '../api/accounts'
import { useCurrency } from '../hooks/useCurrency'
import { t, getMonthNames } from '../utils/i18n'

// ── Config ─────────────────────────────────────────────────────────────────────

const ANALYSIS_CONFIG_KEY = 'spendly-analysis-config'

interface AnalysisConfig {
  emergencyAccountId: number | null
  savingsGroupIds: number[]
  excludedMovementIds: number[]
}

function loadAnalysisConfig(): AnalysisConfig {
  try {
    const s = localStorage.getItem(ANALYSIS_CONFIG_KEY)
    if (s) return { emergencyAccountId: null, savingsGroupIds: [], excludedMovementIds: [], ...JSON.parse(s) }
  } catch {}
  return { emergencyAccountId: null, savingsGroupIds: [], excludedMovementIds: [] }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function filterMovements(movements: Movement[], start: string, end: string) {
  return movements.filter(m => !m.no_count && m.date >= start && m.date <= end)
}

// Exclude savings-group movements from BOTH income and expenses.
// This prevents savings account credits (e.g. transfer received from savings)
// from inflating income, and savings debits from inflating expenses.
function isSavingsMovement(
  m: Movement,
  typeGroupMap: Map<number, number>,
  savingsGroupIdSet: Set<number>,
): boolean {
  if (!m.movement_type_id || savingsGroupIdSet.size === 0) return false
  const gid = typeGroupMap.get(m.movement_type_id)
  return gid != null && savingsGroupIdSet.has(gid)
}

function sumRealIncome(
  movements: Movement[],
  typeGroupMap: Map<number, number>,
  savingsGroupIdSet: Set<number>,
): number {
  return movements
    .filter(m => m.dinero > 0 && !isSavingsMovement(m, typeGroupMap, savingsGroupIdSet))
    .reduce((s, m) => s + m.dinero, 0)
}

// Net savings = deposits (dinero < 0, savings group) minus withdrawals (dinero > 0, savings group).
// Using -m.dinero: deposits contribute positive, withdrawals contribute negative.
function sumActualSavings(
  movements: Movement[],
  typeGroupMap: Map<number, number>,
  savingsGroupIdSet: Set<number>,
): number {
  if (savingsGroupIdSet.size === 0) return 0
  return movements
    .filter(m => isSavingsMovement(m, typeGroupMap, savingsGroupIdSet))
    .reduce((s, m) => s - m.dinero, 0)
}

function buildRealExpenseMovements(
  movements: Movement[],
  typeGroupMap: Map<number, number>,
  savingsGroupIdSet: Set<number>,
): Movement[] {
  return movements.filter(m =>
    m.dinero < 0 && !isSavingsMovement(m, typeGroupMap, savingsGroupIdSet)
  )
}

function monthsInRange(start: string, end: string): number {
  const s = new Date(start)
  const e = new Date(end)
  return Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1)
}

const MONTHS_SHORT = getMonthNames('short')

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: '#1f2937',
  border: '1px solid #374151',
  borderRadius: 8,
  fontSize: 11,
  color: '#f9fafb',
}
const TOOLTIP_CURSOR = { fill: 'rgba(255,255,255,0.04)' }

// ── Shared UI ──────────────────────────────────────────────────────────────────

function DateRangeInputs({ start, end, onChange }: {
  start: string; end: string
  onChange: (s: string, e: string) => void
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <input type="date" value={start}
        onChange={ev => onChange(ev.target.value, end)}
        className="px-2 py-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs" />
      <span className="text-gray-400">–</span>
      <input type="date" value={end}
        onChange={ev => onChange(start, ev.target.value)}
        className="px-2 py-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs" />
    </div>
  )
}

function SectionCard({ title, icon: Icon, children }: {
  title: string; icon: LucideIcon; children: React.ReactNode
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" strokeWidth={1.5} />
        <h2 className="text-sm font-semibold text-gray-800 dark:text-white">{title}</h2>
      </div>
      {children}
    </div>
  )
}

// ── Config Panel ───────────────────────────────────────────────────────────────

function ConfigPanel({ config, onChange, accounts, groups, types, allExpenseMovements, fmt }: {
  config: AnalysisConfig
  onChange: (c: AnalysisConfig) => void
  accounts: Account[]
  groups: Group[]
  types: MovementType[]
  allExpenseMovements: Movement[]
  fmt: (v: number) => string
}) {
  const [open, setOpen] = useState(false)

  const expenseGroups = useMemo(() => {
    const usedGroupIds = new Set(types.map(t => t.income_expense_group_id))
    return groups.filter(g => !g.is_total && usedGroupIds.has(g.id))
  }, [groups, types])

  function toggleGroup(id: number) {
    const ids = config.savingsGroupIds.includes(id)
      ? config.savingsGroupIds.filter(x => x !== id)
      : [...config.savingsGroupIds, id]
    onChange({ ...config, savingsGroupIds: ids })
  }

  function toggleExclusion(id: number) {
    const ids = config.excludedMovementIds.includes(id)
      ? config.excludedMovementIds.filter(x => x !== id)
      : [...config.excludedMovementIds, id]
    onChange({ ...config, excludedMovementIds: ids })
  }

  const topMovements = useMemo(() =>
    [...allExpenseMovements].sort((a, b) => a.dinero - b.dinero).slice(0, 10),
    [allExpenseMovements]
  )

  const adjustments = config.savingsGroupIds.length + (config.emergencyAccountId != null ? 1 : 0) + config.excludedMovementIds.length

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span className="font-medium text-gray-600 dark:text-gray-300">{t('analysis.config')}</span>
          {adjustments > 0 && (
            <span className="bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded text-xs font-medium">
              {adjustments} ajuste{adjustments !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {open
          ? <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.5} />
          : <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-gray-100 dark:border-gray-800 pt-4">
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('analysis.emergencyFund')}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
              {t('analysis.emergencyFundDesc')}
            </p>
            <select
              value={config.emergencyAccountId ?? ''}
              onChange={e => onChange({ ...config, emergencyAccountId: e.target.value ? Number(e.target.value) : null })}
              className="text-xs px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 w-full max-w-sm"
            >
              <option value="">{t('analysis.allAccounts')} ({fmt(accounts.reduce((s, a) => s + a.balance, 0))})</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} — {fmt(a.balance)}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('analysis.savingsCategories')}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
              {t('analysis.savingsCategoriesDesc')}
            </p>
            <div className="flex flex-wrap gap-2">
              {expenseGroups.length === 0
                ? <p className="text-xs text-gray-400">{t('analysis.noCategories')}</p>
                : expenseGroups.map(g => {
                    const selected = config.savingsGroupIds.includes(g.id)
                    return (
                      <button
                        key={g.id}
                        onClick={() => toggleGroup(g.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                          selected
                            ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                      >
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                        {g.name}
                      </button>
                    )
                  })}
            </div>
          </div>

          {topMovements.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('analysis.bigExpenses')}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                {t('analysis.bigExpensesDesc')}
              </p>
              <div className="space-y-1.5">
                {topMovements.map(m => {
                  const excluded = config.excludedMovementIds.includes(m.id)
                  return (
                    <div
                      key={m.id}
                      className={`flex items-center gap-3 text-xs rounded-lg px-3 py-2 transition-opacity ${
                        excluded ? 'bg-gray-50/50 dark:bg-gray-800/30 opacity-50' : 'bg-gray-50 dark:bg-gray-800'
                      }`}
                    >
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.color || '#9ca3af' }} />
                      <span className={`flex-1 truncate ${excluded ? 'line-through text-gray-400 dark:text-gray-600' : 'text-gray-700 dark:text-gray-300'}`}>
                        {m.name}
                      </span>
                      <span className="text-gray-400 dark:text-gray-500 shrink-0">{m.date.slice(0, 7)}</span>
                      <span className={`font-medium shrink-0 ${excluded ? 'text-gray-400 dark:text-gray-600' : 'text-red-500'}`}>
                        {fmt(Math.abs(m.dinero))}
                      </span>
                      <button
                        onClick={() => toggleExclusion(m.id)}
                        title={excluded ? t('analysis.include') : t('analysis.exclude')}
                        className="shrink-0 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      >
                        {excluded
                          ? <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                          : <EyeOff className="w-3.5 h-3.5" strokeWidth={1.5} />}
                      </button>
                    </div>
                  )
                })}
              </div>
              {config.excludedMovementIds.length > 0 && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                  {`${config.excludedMovementIds.length} ${t('analysis.excluded')}`}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 1. Salud Financiera ────────────────────────────────────────────────────────

function SaludFinanciera({ realExpenseMovements, incomeMovementsCount, income, realExpenses, actualSavings, savingsRate, emergencyBalance, avgMonthlyExpenses, months, typeNameMap, fmt }: {
  realExpenseMovements: Movement[]
  incomeMovementsCount: number
  income: number
  realExpenses: number
  actualSavings: number
  savingsRate: number
  emergencyBalance: number
  avgMonthlyExpenses: number
  months: number
  typeNameMap: Map<number, string>
  fmt: (v: number) => string
}) {
  const emergencyMonths = avgMonthlyExpenses > 0 ? emergencyBalance / avgMonthlyExpenses : 0
  const ratio = realExpenses > 0 ? income / realExpenses : 0

  const topCat = useMemo(() => {
    const map = new Map<string, number>()
    realExpenseMovements.forEach(m => {
      const typeName = m.movement_type_id
        ? (typeNameMap.get(m.movement_type_id) ?? m.label ?? t('analysis.noCategory'))
        : (m.label ?? t('analysis.noCategory'))
      map.set(typeName, (map.get(typeName) ?? 0) + Math.abs(m.dinero))
    })
    if (map.size === 0) return null
    return [...map.entries()].reduce((a, b) => b[1] > a[1] ? b : a)
  }, [realExpenseMovements, typeNameMap])

  const metrics = [
    {
      label: t('analysis.savingsRate'),
      value: `${savingsRate.toFixed(1)}%`,
      sub: savingsRate >= 20 ? 'Excelente (obj. >20%)' : savingsRate >= 10 ? 'Buena (obj. >20%)' : savingsRate >= 0 ? 'Mejorable (obj. >20%)' : 'Sin datos de ahorro',
      color: savingsRate >= 20 ? 'text-green-500' : savingsRate >= 10 ? 'text-yellow-500' : savingsRate >= 0 ? 'text-orange-500' : 'text-gray-400',
      detail: income > 0 ? `De cada 100€ ingresados, destinas ${savingsRate.toFixed(0)}€ al ahorro` : '',
    },
    {
      label: t('analysis.emergencyMonths'),
      value: `${emergencyMonths.toFixed(1)} meses`,
      sub: emergencyMonths >= 6 ? 'Suficiente (obj. >6m)' : emergencyMonths >= 3 ? 'Mínimo (obj. >6m)' : 'Insuficiente (obj. >6m)',
      color: emergencyMonths >= 6 ? 'text-green-500' : emergencyMonths >= 3 ? 'text-yellow-500' : 'text-red-500',
      detail: `${fmt(emergencyBalance)} ÷ ${fmt(avgMonthlyExpenses)}/mes`,
    },
    {
      label: t('analysis.incomeRatio'),
      value: ratio.toFixed(2),
      sub: ratio >= 1.2 ? 'Saludable (obj. >1.2)' : ratio >= 1 ? 'Ajustado' : 'Deficitario',
      color: ratio >= 1.2 ? 'text-green-500' : ratio >= 1 ? 'text-yellow-500' : 'text-red-500',
      detail: `Por €1 de gasto real, ingresas €${ratio.toFixed(2)}`,
    },
    {
      label: t('analysis.monthlySavings'),
      value: fmt(actualSavings / months),
      sub: months === 1 ? t('analysis.monthsAnalyzed').replace('{n}', String(months)) : t('analysis.monthsAnalyzedP').replace('{n}', String(months)),
      color: actualSavings >= 0 ? 'text-green-500' : 'text-red-500',
      detail: `${fmt(income / months)} ing. · ${fmt(avgMonthlyExpenses)} gastos`,
    },
    {
      label: t('analysis.topExpense'),
      value: topCat ? topCat[0] : '—',
      sub: topCat ? fmt(topCat[1]) : t('analysis.noExpenseData'),
      color: 'text-gray-700 dark:text-gray-200',
      detail: topCat && realExpenses > 0 ? `${((topCat[1] / realExpenses) * 100).toFixed(0)}% del total de gastos` : '',
    },
    {
      label: t('analysis.totalSavings'),
      value: fmt(actualSavings),
      sub: actualSavings >= 0 ? t('analysis.accumulatedSavings') : t('analysis.noSavingsRecorded'),
      color: actualSavings >= 0 ? 'text-green-500' : 'text-gray-400',
      detail: income > 0 ? `${fmt(income)} ingresos · ${fmt(actualSavings)} ahorrados` : '',
    },
  ]

  const summary = useMemo(() => {
    if (income === 0) return t('analysis.noIncomeMsg')
    const parts: string[] = []
    if (savingsRate >= 20) {
      parts.push(`Estás ahorrando el ${savingsRate.toFixed(0)}% de tus ingresos, por encima del 20% recomendado.`)
    } else if (savingsRate >= 10) {
      parts.push(`Tu tasa de ahorro del ${savingsRate.toFixed(0)}% es positiva pero no llega al objetivo del 20%.`)
    } else if (savingsRate > 0) {
      parts.push(`Tu tasa de ahorro del ${savingsRate.toFixed(0)}% es baja. Revisa si puedes reducir alguna categoría de gasto.`)
    } else {
      parts.push('No hay movimientos de ahorro registrados en el período. Configura tus categorías de ahorro arriba.')
    }
    if (emergencyMonths >= 6) {
      parts.push(`El fondo de emergencia cubre ${emergencyMonths.toFixed(1)} meses de gastos — situación sólida.`)
    } else if (emergencyMonths >= 3) {
      parts.push(`El fondo de emergencia cubre ${emergencyMonths.toFixed(1)} meses; el objetivo recomendado son 6 meses.`)
    } else {
      parts.push(`El fondo de emergencia solo cubre ${emergencyMonths.toFixed(1)} meses. Prioriza construirlo hasta los 6 meses mínimos.`)
    }
    if (topCat) {
      parts.push(`Tu mayor tipo de gasto es "${topCat[0]}" con ${fmt(topCat[1])} (${realExpenses > 0 ? ((topCat[1] / realExpenses) * 100).toFixed(0) : 0}% del total).`)
    }
    return parts.join(' ')
  }, [income, savingsRate, actualSavings, emergencyMonths, topCat, realExpenses, fmt])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {metrics.map(m => (
          <div key={m.label} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3.5">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{m.label}</p>
            <p className={`text-base font-bold truncate ${m.color}`}>{m.value}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{m.sub}</p>
            {m.detail && <p className="text-xs text-gray-400 dark:text-gray-600 mt-1 leading-snug">{m.detail}</p>}
          </div>
        ))}
      </div>
      <div className="bg-blue-50 dark:bg-blue-950 rounded-xl px-4 py-3 text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
        {summary}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 text-right">
        {incomeMovementsCount} movimiento{incomeMovementsCount !== 1 ? 's' : ''} de ingreso ·{' '}
        {realExpenseMovements.length} de gasto real usados en el cálculo
      </p>
    </div>
  )
}

// ── 2. Patrones de Gasto por Mes ──────────────────────────────────────────────

function PatronesDeGasto({ realExpenseMovements, fmt }: {
  realExpenseMovements: Movement[]
  fmt: (v: number) => string
}) {
  const byCalendarMonth = useMemo(() => {
    const monthData = new Map<number, { total: number; years: Set<number> }>()
    for (let i = 1; i <= 12; i++) monthData.set(i, { total: 0, years: new Set() })

    realExpenseMovements.forEach(m => {
      const parts = m.date.split('-')
      const year = Number(parts[0])
      const mo = Number(parts[1])
      const d = monthData.get(mo)!
      d.total += Math.abs(m.dinero)
      d.years.add(year)
    })

    return Array.from(monthData.entries()).map(([mo, { total, years }]) => ({
      label: MONTHS_SHORT[mo - 1],
      avg: years.size > 0 ? total / years.size : 0,
      yearsCount: years.size,
    }))
  }, [realExpenseMovements])

  if (realExpenseMovements.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">Sin gastos en el período seleccionado</p>
  }

  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Media de gasto por mes del año, promediada entre todos los años del rango. Los movimientos excluidos en la configuración no se cuentan.
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={byCalendarMonth} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={36} />
          <Tooltip
            formatter={(v) => fmt(v as number)}
            labelFormatter={(l, payload) => {
              const p = payload?.[0]?.payload as { yearsCount?: number } | undefined
              return `${l}${p?.yearsCount && p.yearsCount > 1 ? ` (media ${p.yearsCount} años)` : ''}`
            }}
            contentStyle={TOOLTIP_STYLE}
            cursor={TOOLTIP_CURSOR}
          />
          <Bar dataKey="avg" name="Media gastos" fill="#60a5fa" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── 3. Regla 50/30/20 ─────────────────────────────────────────────────────────

type RuleBucket = 'necesidades' | 'deseos' | 'ahorro' | 'unassigned'
const RULE_KEY = 'spendly-5030-assignment'

const BUCKETS: { id: RuleBucket; labelKey: string; target: number; color: string; textColor: string }[] = [
  { id: 'necesidades', labelKey: 'analysis.bucketNeeds',   target: 50, color: '#3b82f6', textColor: 'text-blue-600 dark:text-blue-400' },
  { id: 'deseos',      labelKey: 'analysis.bucketWants',   target: 30, color: '#8b5cf6', textColor: 'text-violet-600 dark:text-violet-400' },
  { id: 'ahorro',      labelKey: 'analysis.bucketSavings', target: 20, color: '#22c55e', textColor: 'text-green-600 dark:text-green-400' },
]

function Regla502030({ realExpenseMovements, groups, types, actualSavings, fmt }: {
  realExpenseMovements: Movement[]
  groups: Group[]
  types: MovementType[]
  actualSavings: number
  fmt: (v: number) => string
}) {
  const [assignment, setAssignment] = useState<Record<number, RuleBucket>>(() => {
    try {
      const s = localStorage.getItem(RULE_KEY)
      return s ? JSON.parse(s) : {}
    } catch { return {} }
  })

  function assign(groupId: number, bucket: RuleBucket) {
    const next = { ...assignment, [groupId]: bucket }
    setAssignment(next)
    syncPref(RULE_KEY, JSON.stringify(next))
  }

  const byBucket = useMemo(() => {
    const map: Record<RuleBucket, number> = { necesidades: 0, deseos: 0, ahorro: actualSavings, unassigned: 0 }
    realExpenseMovements.forEach(m => {
      if (m.movement_type_id == null) { map.unassigned += Math.abs(m.dinero); return }
      const t = types.find(t => t.id === m.movement_type_id)
      if (!t) { map.unassigned += Math.abs(m.dinero); return }
      const bucket: RuleBucket = assignment[t.income_expense_group_id] ?? 'unassigned'
      map[bucket] += Math.abs(m.dinero)
    })
    return map
  }, [realExpenseMovements, types, assignment, actualSavings])

  const expenseGroups = useMemo(() => {
    const usedGroupIds = new Set(types.map(t => t.income_expense_group_id))
    return groups.filter(g => !g.is_total && usedGroupIds.has(g.id))
  }, [groups, types])

  const total = byBucket.necesidades + byBucket.deseos + byBucket.ahorro + byBucket.unassigned

  const pieData = useMemo(() => {
    const slices = [
      ...BUCKETS.map(b => ({ name: t(b.labelKey), value: byBucket[b.id], color: b.color, target: b.target, textColor: b.textColor })),
      ...(byBucket.unassigned > 0 ? [{ name: t('analysis.unassigned'), value: byBucket.unassigned, color: '#f59e0b', target: 0, textColor: 'text-yellow-600 dark:text-yellow-400' }] : []),
    ]
    return slices.filter(s => s.value > 0)
  }, [byBucket])

  const [assignOpen, setAssignOpen] = useState(false)

  if (total === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">{t('analysis.noDataPeriod')}</p>
  }

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 dark:bg-blue-950 rounded-xl px-4 py-3 text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
        La regla 50/30/20 sugiere destinar el <strong>50%</strong> de tus ingresos a <strong>necesidades</strong> (vivienda, alimentación, transporte), el <strong>30%</strong> a <strong>deseos</strong> (ocio, restaurantes, compras) y el <strong>20%</strong> a <strong>ahorro</strong>. Aquí se muestra la distribución real de tu dinero. El ahorro se detecta automáticamente desde las categorías marcadas como ahorro en la configuración.
      </div>

      <div className="flex flex-col sm:flex-row gap-5 items-center">
        <div className="shrink-0">
          <ResponsiveContainer width={200} height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                dataKey="value"
                strokeWidth={2}
                stroke="transparent"
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => fmt(v as number)}
                contentStyle={TOOLTIP_STYLE}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex-1 space-y-2.5 w-full">
          {pieData.map(entry => {
            const pct = total > 0 ? (entry.value / total) * 100 : 0
            const over = entry.target > 0 && pct > entry.target
            const under = entry.target > 0 && pct < entry.target
            return (
              <div key={entry.name} className="flex items-center gap-3 text-xs">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                <span className={`w-24 font-medium shrink-0 ${entry.textColor}`}>{entry.name}</span>
                <span className="text-gray-600 dark:text-gray-300 w-12 text-right shrink-0 font-medium">{pct.toFixed(1)}%</span>
                <span className="text-gray-400 dark:text-gray-500 flex-1">{fmt(entry.value)}</span>
                {entry.target > 0 && (
                  <span className={`shrink-0 ${over ? 'text-red-400' : under ? 'text-gray-400 dark:text-gray-500' : 'text-green-500'}`}>
                    {over ? `+${(pct - entry.target).toFixed(0)}% obj.` : under ? `obj. ${entry.target}%` : '✓'}
                  </span>
                )}
              </div>
            )
          })}
          <p className="text-xs text-gray-400 dark:text-gray-500 pt-1 border-t border-gray-100 dark:border-gray-800">
            Total: {fmt(total)}
          </p>
        </div>
      </div>

      <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setAssignOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <span className="font-medium text-gray-600 dark:text-gray-300">{t('analysis.sectionAssignment')}</span>
          {assignOpen ? <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.5} /> : <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />}
        </button>
        {assignOpen && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-800">
        {expenseGroups.length === 0 ? (
          <p className="text-xs text-gray-400">{t('analysis.noExpenseCategories')}</p>
        ) : (
          <div className="space-y-1.5 mt-2">
            {expenseGroups.map(g => (
              <div key={g.id} className="flex items-center justify-between gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                  <span className="text-xs text-gray-700 dark:text-gray-300">{g.name}</span>
                </div>
                <select
                  value={assignment[g.id] ?? 'unassigned'}
                  onChange={e => assign(g.id, e.target.value as RuleBucket)}
                  className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"
                >
                  <option value="unassigned">{t('analysis.unassigned')}</option>
                  {BUCKETS.map(b => <option key={b.id} value={b.id}>{t(b.labelKey)}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
        </div>
        )}
      </div>
    </div>
  )
}

// ── 4. Proyección de Patrimonio ───────────────────────────────────────────────

function ProyeccionPatrimonio({ monthlySavings, totalBalance, fmt }: {
  monthlySavings: number; totalBalance: number; fmt: (v: number) => string
}) {
  const points = useMemo(() =>
    Array.from({ length: 13 }, (_, i) => ({
      label: i === 0 ? t('analysis.today') : `+${i}m`,
      balance: totalBalance + monthlySavings * i,
    })),
    [monthlySavings, totalBalance]
  )

  const positive = monthlySavings >= 0

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Basado en {fmt(monthlySavings)}/mes de ahorro y {fmt(totalBalance)} de patrimonio actual
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={points} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={positive ? '#60a5fa' : '#f87171'} stopOpacity={0.3} />
              <stop offset="95%" stopColor={positive ? '#60a5fa' : '#f87171'} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={40} />
          <Tooltip formatter={(v) => fmt(v as number)} contentStyle={TOOLTIP_STYLE} cursor={TOOLTIP_CURSOR} />
          <Area type="monotone" dataKey="balance" name="Patrimonio"
            stroke={positive ? '#60a5fa' : '#f87171'} fill="url(#projGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-3 gap-3 text-center">
        {[3, 6, 12].map(m => (
          <div key={m} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">En {m} meses</p>
            <p className={`text-sm font-bold mt-0.5 ${totalBalance + monthlySavings * m >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
              {fmt(totalBalance + monthlySavings * m)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 5. Prompt IA ──────────────────────────────────────────────────────────────

function PromptIA({ allMovements, typeGroupMap, savingsGroupIdSet, excludedMovementIds, fmt }: {
  allMovements: Movement[]
  typeGroupMap: Map<number, number>
  savingsGroupIdSet: Set<number>
  excludedMovementIds: number[]
  fmt: (v: number) => string
}) {
  const now = new Date()
  const [start, setStart] = useState(localDateStr(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [end,   setEnd]   = useState(localDateStr(now))
  const [copied, setCopied] = useState(false)

  function handleCopy(text: string) {
    function fallback() {
      const el = document.createElement('textarea')
      el.value = text
      el.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true); setTimeout(() => setCopied(false), 2000)
      }).catch(fallback)
    } else {
      fallback()
    }
  }

  const movements = useMemo(() => filterMovements(allMovements, start, end), [allMovements, start, end])

  const excludedIdSet = useMemo(() => new Set(excludedMovementIds), [excludedMovementIds])

  const realExpenseMovements = useMemo(
    () => buildRealExpenseMovements(movements, typeGroupMap, savingsGroupIdSet)
           .filter(m => !excludedIdSet.has(m.id)),
    [movements, typeGroupMap, savingsGroupIdSet, excludedIdSet]
  )

  const income        = useMemo(() => sumRealIncome(movements, typeGroupMap, savingsGroupIdSet), [movements, typeGroupMap, savingsGroupIdSet])
  const actualSavings = useMemo(() => sumActualSavings(movements, typeGroupMap, savingsGroupIdSet), [movements, typeGroupMap, savingsGroupIdSet])
  const realExpenses  = useMemo(() => realExpenseMovements.reduce((s, m) => s + Math.abs(m.dinero), 0), [realExpenseMovements])
  const savingsRate   = income > 0 ? (actualSavings / income) * 100 : 0

  const excludedInPeriod = useMemo(
    () => allMovements.filter(m => excludedIdSet.has(m.id) && m.date >= start && m.date <= end),
    [allMovements, excludedIdSet, start, end]
  )

  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    realExpenseMovements.forEach(m => {
      const label = m.label || t('analysis.noCategory')
      map.set(label, (map.get(label) ?? 0) + Math.abs(m.dinero))
    })
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [realExpenseMovements])

  const topExpenses = useMemo(() =>
    [...realExpenseMovements].sort((a, b) => a.dinero - b.dinero).slice(0, 10),
    [realExpenseMovements]
  )

  const hasSavingsFilter = savingsGroupIdSet.size > 0

  const prompt = useMemo(() => {
    if (movements.length === 0) return 'Sin datos para el período seleccionado. Elige un rango con movimientos.'

    const excludedSection = excludedInPeriod.length > 0 ? [
      '',
      '### Gastos excluidos manualmente del análisis',
      '(Gastos puntuales que el usuario consideró no representativos)',
      ...excludedInPeriod.map((m, i) =>
        `${i + 1}. ${m.name} — ${fmt(Math.abs(m.dinero))} (${m.date})`
      ),
    ] : []

    return [
      `Actúa como un asesor financiero personal experto. Analiza mis finanzas del ${start} al ${end} y dame un informe completo con recomendaciones accionables.`,
      '',
      '## CONTEXTO SOBRE LOS DATOS',
      '',
      hasSavingsFilter
        ? 'Los datos ya están filtrados: las transferencias a cuentas de ahorro/inversión están excluidas de los gastos. La tasa de ahorro se calcula directamente sobre los movimientos de ahorro registrados.'
        : 'AVISO: Esta aplicación puede registrar transferencias a cuentas de ahorro propias como "gastos". Si ves categorías relacionadas con ahorro o inversión, esos importes son en realidad ahorro, no consumo. Ajusta tu análisis si detectas este patrón.',
      '',
      '## DATOS FINANCIEROS',
      '',
      '### Resumen del período',
      `- Ingresos totales: ${fmt(income)}`,
      `- Gastos reales (consumo): ${fmt(realExpenses)}`,
      `- Ahorro registrado: ${fmt(actualSavings)}`,
      `- Tasa de ahorro: ${savingsRate.toFixed(1)}%`,
      `- Total movimientos: ${movements.length}`,
      '',
      '### Gastos por categoría',
      ...byCategory.map(([cat, amount]) =>
        `- ${cat}: ${fmt(amount)}${income > 0 ? ` (${((amount / income) * 100).toFixed(1)}% sobre ingresos)` : ''}`
      ),
      '',
      '### Top 10 gastos individuales',
      ...topExpenses.map((m, i) =>
        `${i + 1}. ${m.name} — ${fmt(Math.abs(m.dinero))} (${m.date})${m.label ? ` [${m.label}]` : ''}`
      ),
      ...excludedSection,
      '',
      '## ANÁLISIS SOLICITADO',
      '',
      'Por favor proporciona:',
      '1. **Evaluación general** de mi situación financiera en este período',
      '2. **Tasa de ahorro real** — si es adecuada y cómo mejorarla',
      '3. **Análisis de gastos** — categorías preocupantes y por qué',
      '4. **3 recomendaciones concretas** y fáciles de implementar',
      '5. **Alertas** — patrones o gastos que deberían preocuparme',
      '6. **Proyección** — si continúo así, ¿dónde estaré en 6 y 12 meses?',
    ].join('\n')
  }, [movements, realExpenseMovements, start, end, income, realExpenses, actualSavings, savingsRate, byCategory, topExpenses, excludedInPeriod, fmt, hasSavingsFilter])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <DateRangeInputs
          start={start} end={end}
          onChange={(s, e) => { setStart(s); setEnd(e) }}
        />
        <span className="text-xs text-gray-400 dark:text-gray-500">{movements.length} movimientos</span>
      </div>

      <div className="relative">
        <pre className="scrollbar-none bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono max-h-80 overflow-y-auto leading-relaxed border border-gray-100 dark:border-gray-700">
          {prompt}
        </pre>
        <button
          onClick={() => handleCopy(prompt)}
          className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors shadow-sm"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? t('analysis.copied') : t('analysis.copy')}
        </button>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Pega este prompt en ChatGPT, Claude u otro asistente de IA para obtener un análisis personalizado.
      </p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Analysis() {
  const { fmt } = useCurrency()
  const now = new Date()

  const [rangeStart, setRangeStart] = useState(localDateStr(new Date(now.getFullYear(), now.getMonth() - 2, 1)))
  const [rangeEnd,   setRangeEnd]   = useState(localDateStr(now))
  const [analysisConfig, setAnalysisConfig] = useState<AnalysisConfig>(loadAnalysisConfig)

  function updateConfig(c: AnalysisConfig) {
    setAnalysisConfig(c)
    syncPref(ANALYSIS_CONFIG_KEY, JSON.stringify(c))
  }

  const { data: allMovements = [] } = useQuery({ queryKey: ['movements'], queryFn: () => getMovements() })
  const { data: groups = [] }       = useQuery({ queryKey: ['groups'],    queryFn: getGroups })
  const { data: types = [] }        = useQuery({ queryKey: ['movement-types'], queryFn: getMovementTypes })
  const { data: accountsSummary }   = useQuery({ queryKey: ['accounts-summary'], queryFn: getAccountsSummary })

  const savingsGroupIdSet = useMemo(
    () => new Set(analysisConfig.savingsGroupIds),
    [analysisConfig.savingsGroupIds]
  )

  const typeGroupMap = useMemo(() => {
    const map = new Map<number, number>()
    types.forEach(t => map.set(t.id, t.income_expense_group_id))
    return map
  }, [types])

  const movements = useMemo(
    () => filterMovements(allMovements, rangeStart, rangeEnd),
    [allMovements, rangeStart, rangeEnd]
  )

  const excludedIdSet = useMemo(
    () => new Set(analysisConfig.excludedMovementIds),
    [analysisConfig.excludedMovementIds]
  )

  const allExpenseMovements = useMemo(
    () => buildRealExpenseMovements(movements, typeGroupMap, savingsGroupIdSet),
    [movements, typeGroupMap, savingsGroupIdSet]
  )

  const realExpenseMovements = useMemo(
    () => allExpenseMovements.filter(m => !excludedIdSet.has(m.id)),
    [allExpenseMovements, excludedIdSet]
  )

  const typeNameMap = useMemo(() => {
    const map = new Map<number, string>()
    types.forEach(t => map.set(t.id, t.name))
    return map
  }, [types])

  const income = useMemo(
    () => sumRealIncome(movements, typeGroupMap, savingsGroupIdSet),
    [movements, typeGroupMap, savingsGroupIdSet]
  )
  const actualSavings = useMemo(
    () => sumActualSavings(movements, typeGroupMap, savingsGroupIdSet),
    [movements, typeGroupMap, savingsGroupIdSet]
  )
  const realExpenses = useMemo(
    () => realExpenseMovements.reduce((s, m) => s + Math.abs(m.dinero), 0),
    [realExpenseMovements]
  )
  const savingsRate  = income > 0 ? (actualSavings / income) * 100 : 0
  const totalBalance = accountsSummary?.total ?? 0
  const months       = monthsInRange(rangeStart, rangeEnd)

  const emergencyBalance = useMemo(() => {
    if (analysisConfig.emergencyAccountId == null) return totalBalance
    return accountsSummary?.accounts.find(a => a.id === analysisConfig.emergencyAccountId)?.balance ?? 0
  }, [analysisConfig.emergencyAccountId, accountsSummary, totalBalance])

  const incomeMovementsCount = useMemo(
    () => movements.filter(m => m.dinero > 0 && !isSavingsMovement(m, typeGroupMap, savingsGroupIdSet)).length,
    [movements, typeGroupMap, savingsGroupIdSet]
  )
  const avgMonthlyExpenses = realExpenses / months
  const monthlySavings     = actualSavings / months

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">{t('analysis.title')}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Métricas y patrones de tus finanzas</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Período global:</span>
          <DateRangeInputs
            start={rangeStart} end={rangeEnd}
            onChange={(s, e) => { setRangeStart(s); setRangeEnd(e) }}
          />
        </div>
      </div>

      <ConfigPanel
        config={analysisConfig}
        onChange={updateConfig}
        accounts={accountsSummary?.accounts ?? []}
        groups={groups}
        types={types}
        allExpenseMovements={allExpenseMovements}
        fmt={fmt}
      />

      <SectionCard title={t('analysis.sectionHealth')} icon={Heart}>
        <SaludFinanciera
          realExpenseMovements={realExpenseMovements}
          incomeMovementsCount={incomeMovementsCount}
          income={income}
          realExpenses={realExpenses}
          actualSavings={actualSavings}
          savingsRate={savingsRate}
          emergencyBalance={emergencyBalance}
          avgMonthlyExpenses={avgMonthlyExpenses}
          months={months}
          typeNameMap={typeNameMap}
          fmt={fmt}
        />
      </SectionCard>

      <SectionCard title={t('analysis.sectionPatterns')} icon={Activity}>
        <PatronesDeGasto realExpenseMovements={realExpenseMovements} fmt={fmt} />
      </SectionCard>

      <SectionCard title={t('analysis.section5020')} icon={Target}>
        <Regla502030
          realExpenseMovements={realExpenseMovements}
          groups={groups}
          types={types}
          actualSavings={actualSavings}
          fmt={fmt}
        />
      </SectionCard>

      <SectionCard title={t('analysis.sectionProjection')} icon={TrendingUp}>
        <ProyeccionPatrimonio monthlySavings={monthlySavings} totalBalance={totalBalance} fmt={fmt} />
      </SectionCard>

      <SectionCard title={t('analysis.sectionPrompt')} icon={Sparkles}>
        <PromptIA
          allMovements={allMovements}
          typeGroupMap={typeGroupMap}
          savingsGroupIdSet={savingsGroupIdSet}
          excludedMovementIds={analysisConfig.excludedMovementIds}
          fmt={fmt}
        />
      </SectionCard>
    </div>
  )
}
