import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAccountsSummary, ACCOUNT_CATEGORIES, LIQUID_CATEGORIES, INVESTMENT_CATEGORIES, type Account } from '../api/accounts'
import { getMovements, type Movement } from '../api/movements'
import { getMovementTypes, type MovementType } from '../api/movementTypes'
import { getSummary as getInvestSummary } from '../api/investments'
import { useCurrency } from '../hooks/useCurrency'
import { TrendingUp, TrendingDown } from 'lucide-react'
import AppIcon from '../components/AppIcon'
import {
  ResponsiveContainer,
  LineChart, Line,
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine,
} from 'recharts'
import { t, getMonthNames } from '../utils/i18n'

const MONTHS_SHORT = getMonthNames('short')

function calcSpanishTax(gain: number): number {
  if (gain <= 0) return 0
  let remaining = gain
  let tax = 0
  const brackets = [[300000, 0.28], [200000, 0.27], [50000, 0.23], [6000, 0.21], [0, 0.19]] as const
  for (const [threshold, rate] of brackets) {
    if (remaining > threshold) {
      tax += (remaining - threshold) * rate
      remaining = threshold
    }
  }
  tax += remaining * 0.19
  return Math.round(tax * 100) / 100
}

function vehicleCurrentValue(acc: Account): number {
  if (acc.category !== 'vehiculo' || acc.depreciation_rate == null || acc.value_date == null) {
    return acc.balance
  }
  const yearsElapsed = (Date.now() - new Date(acc.value_date + 'T00:00:00').getTime()) / (365.25 * 24 * 3600 * 1000)
  const factor = Math.max(0, 1 - (acc.depreciation_rate / 100) * yearsElapsed)
  return Math.round(acc.initial_balance * factor * 100) / 100
}

function buildAccountHistory(
  acc: Account,
  sorted: Movement[],
  typeById: Record<number, MovementType>,
): { label: string; balance: number; year: number; month: number }[] {
  if (sorted.length === 0) return []
  const firstDate = new Date((sorted[0].bank_date ?? sorted[0].date) + 'T00:00:00')
  const now = new Date()
  let bal = acc.initial_balance
  let mi = 0
  const result: { label: string; balance: number; year: number; month: number }[] = []
  for (let y = firstDate.getFullYear(); y <= now.getFullYear(); y++) {
    const mStart = y === firstDate.getFullYear() ? firstDate.getMonth() : 0
    const mEnd   = y === now.getFullYear() ? now.getMonth() : 11
    for (let m = mStart; m <= mEnd; m++) {
      while (mi < sorted.length) {
        const mv = sorted[mi]
        const d = new Date((mv.bank_date ?? mv.date) + 'T00:00:00')
        if (d.getFullYear() > y || (d.getFullYear() === y && d.getMonth() > m)) break
        if (acc.is_main) {
          bal += mv.dinero
        } else {
          const t = mv.movement_type_id != null ? typeById[mv.movement_type_id] : null
          if (t?.linked_account_id === acc.id) bal += mv.money
        }
        mi++
      }
      result.push({
        label: `${MONTHS_SHORT[m]} '${String(y).slice(2)}`,
        balance: Math.round(bal * 100) / 100,
        year: y,
        month: m,
      })
    }
  }
  return result
}

function CT({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  const { fmt } = useCurrency()
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg px-3 py-2 text-sm">
      {label && <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-gray-500 dark:text-gray-400 text-xs">{p.name}:</span>
          <span className="font-semibold tabular-nums text-gray-900 dark:text-white text-xs">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function AccountsPage() {
  const { fmt, fmtK } = useCurrency()

  const { data: summary, isLoading: loadingAccounts } = useQuery({
    queryKey: ['accounts-summary'],
    queryFn: getAccountsSummary,
  })
  const { data: movements = [], isLoading: loadingMovements } = useQuery({
    queryKey: ['movements'],
    queryFn: () => getMovements(),
  })
  const { data: movementTypes = [] } = useQuery({
    queryKey: ['movement-types'],
    queryFn: getMovementTypes,
  })
  const { data: investSummary } = useQuery({
    queryKey: ['investment-summary'],
    queryFn: getInvestSummary,
  })

  const [selectedYear, setSelectedYear] = useState<number | null>(new Date().getFullYear())
  const [viewMode, setViewMode] = useState<'lines' | 'stacked'>('lines')

  const accounts = useMemo(() => summary?.accounts ?? [], [summary])

  const typeById = useMemo(
    () => Object.fromEntries(movementTypes.map(t => [t.id, t])),
    [movementTypes],
  )
  const sorted = useMemo(
    () => [...movements].sort((a, b) => (a.bank_date ?? a.date).localeCompare(b.bank_date ?? b.date)),
    [movements],
  )

  const histories = useMemo(
    () => accounts.map(acc => ({ acc, rows: buildAccountHistory(acc, sorted, typeById) })),
    [accounts, sorted, typeById],
  )

  const availableYears = useMemo(() => {
    if (sorted.length === 0) return []
    const first = new Date(sorted[0].date + 'T00:00:00').getFullYear()
    const last  = new Date().getFullYear()
    return Array.from({ length: last - first + 1 }, (_, i) => first + i)
  }, [sorted])

  const filteredHistories = useMemo(
    () => histories.map(({ acc, rows }) => ({
      acc,
      rows: selectedYear ? rows.filter(r => r.year === selectedYear) : rows,
    })),
    [histories, selectedYear],
  )

  const periodChange = useMemo(() => {
    const map: Record<number, number> = {}
    for (const { acc, rows } of histories) {
      if (!selectedYear) {
        map[acc.id] = acc.balance - acc.initial_balance
      } else {
        const prevRows = rows.filter(r => r.year === selectedYear - 1)
        const startBal = prevRows.length > 0 ? prevRows[prevRows.length - 1].balance : acc.initial_balance
        const yearRows = rows.filter(r => r.year === selectedYear)
        const endBal = yearRows.length > 0 ? yearRows[yearRows.length - 1].balance : acc.balance
        map[acc.id] = Math.round((endBal - startBal) * 100) / 100
      }
    }
    return map
  }, [histories, selectedYear])

  const evolutionData = useMemo(() => {
    if (filteredHistories.length === 0 || filteredHistories[0].rows.length === 0) return []
    return filteredHistories[0].rows.map((refRow, i) => {
      const entry: Record<string, number | string> = { label: refRow.label }
      for (const { acc, rows } of filteredHistories) entry[acc.name] = rows[i]?.balance ?? 0
      return entry
    })
  }, [filteredHistories])

  const monthlyChangeData = useMemo(() => {
    if (filteredHistories.length === 0 || filteredHistories[0].rows.length === 0) return []
    return filteredHistories[0].rows.map((refRow, rowIdx) => {
      const entry: Record<string, number | string> = { label: refRow.label }
      for (const { acc, rows } of filteredHistories) {
        const fullRows = histories.find(h => h.acc.id === acc.id)?.rows ?? []
        const fullIdx  = fullRows.findIndex(r => r.year === refRow.year && r.month === refRow.month)
        const prevBal  = fullIdx > 0 ? fullRows[fullIdx - 1].balance : acc.initial_balance
        entry[acc.name] = Math.round(((rows[rowIdx]?.balance ?? 0) - prevBal) * 100) / 100
      }
      return entry
    })
  }, [filteredHistories, histories])

  const distributionData = useMemo(
    () => accounts.map(acc => ({ name: acc.name, value: Math.max(0, acc.balance), color: acc.color })),
    [accounts],
  )

  // Investment breakdown
  const investAccounts    = accounts.filter(a => INVESTMENT_CATEGORIES.includes(a.category as typeof INVESTMENT_CATEGORIES[number]))
  const investedBalance   = investAccounts.reduce((s, a) => s + a.balance, 0)
  const investCurrentVal  = investSummary?.total_current_value ?? null
  const investGainBruto   = investCurrentVal != null ? investCurrentVal - investedBalance : null
  const investTax         = investGainBruto != null ? calcSpanishTax(investGainBruto) : null
  const investNetGain     = investGainBruto != null && investTax != null ? investGainBruto - investTax : null
  const hasInvestGain     = investGainBruto != null && investGainBruto !== 0

  // Vehicle effective values (depreciated)
  const vehicleEffective  = accounts
    .filter(a => a.category === 'vehiculo')
    .reduce((s, a) => s + vehicleCurrentValue(a), 0)

  // Total patrimony uses investment current value (if known) and vehicle depreciated value
  const nonInvestNonVeh   = accounts
    .filter(a => !INVESTMENT_CATEGORIES.includes(a.category as typeof INVESTMENT_CATEGORIES[number]) && a.category !== 'vehiculo')
    .reduce((s, a) => s + a.balance, 0)
  const totalBalance      = nonInvestNonVeh + (investCurrentVal ?? investedBalance) + vehicleEffective
  const totalChange       = accounts.reduce((s, a) => s + (periodChange[a.id] ?? 0), 0)

  const hasNonLiquid      = accounts.some(a => a.category === 'inmueble' || a.category === 'vehiculo' || INVESTMENT_CATEGORIES.includes(a.category as typeof INVESTMENT_CATEGORIES[number]))
  const liquidBalance     = accounts.filter(a => LIQUID_CATEGORIES.includes(a.category as typeof LIQUID_CATEGORIES[number])).reduce((s, a) => s + a.balance, 0)
  const liquidChange      = accounts.filter(a => LIQUID_CATEGORIES.includes(a.category as typeof LIQUID_CATEGORIES[number])).reduce((s, a) => s + (periodChange[a.id] ?? 0), 0)

  if (loadingAccounts || loadingMovements) {
    return (
      <div className="p-6 flex items-center justify-center h-96">
        <span className="text-sm text-gray-400 dark:text-gray-500">{t('common.loading')}</span>
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center h-96">
        <span className="text-sm text-gray-400 dark:text-gray-500">{t('accounts.noAccounts')}</span>
      </div>
    )
  }

  const PANEL = 'bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm'
  const TITLE = 'text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500'
  const GRID  = '#e5e7eb'
  const TICK  = { fontSize: 11, fill: '#9ca3af' }

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-5">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('accounts.title')}</h1>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setSelectedYear(null)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              selectedYear === null
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t('accounts.all')}
          </button>
          {availableYears.map(y => (
            <button
              key={y}
              onClick={() => setSelectedYear(y)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                selectedYear === y
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* ── Total card ─────────────────────────────────────────────── */}
      <div className={`${PANEL} p-5`}>
        <div className="flex items-start gap-4">
          {/* Left: total amount */}
          <div className="flex-1 min-w-0">
            <p className={`${TITLE} mb-2`}>{t('accounts.totalWealth')}</p>
            <p className="text-3xl font-bold tabular-nums text-gray-900 dark:text-white">
              {fmt(totalBalance)}
            </p>
            <div className={`flex items-center gap-1.5 mt-1 text-sm font-semibold ${totalChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {totalChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{totalChange >= 0 ? '+' : ''}{fmt(totalChange)} {t('accounts.fromStart')}</span>
            </div>
          </div>

          {/* Right: investment gain breakdown */}
          {hasInvestGain && (
            <div className="shrink-0 text-right space-y-0.5 border-l border-gray-100 dark:border-gray-800 pl-4">
              <p className={`${TITLE} mb-1.5`}>{t('accounts.investBreakdown')}</p>
              <div className={`text-sm font-semibold tabular-nums ${investGainBruto! >= 0 ? 'text-green-500 dark:text-green-400' : 'text-red-500'}`}>
                {investGainBruto! >= 0 ? '+' : ''}{fmt(investGainBruto!)}
                <span className="text-xs font-normal text-gray-400 dark:text-gray-500 ml-1">{t('accounts.investGain')}</span>
              </div>
              <div className="text-sm font-semibold tabular-nums text-amber-500 dark:text-amber-400">
                -{fmt(investTax!)}
                <span className="text-xs font-normal text-gray-400 dark:text-gray-500 ml-1">{t('accounts.investTax')}</span>
              </div>
              <div className={`text-sm font-semibold tabular-nums ${investNetGain! >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                {investNetGain! >= 0 ? '+' : ''}{fmt(investNetGain!)}
                <span className="text-xs font-normal text-gray-400 dark:text-gray-500 ml-1">{t('accounts.investNet')}</span>
              </div>
            </div>
          )}
        </div>

        {hasNonLiquid && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-6">
            <div className="flex-1">
              <p className={`${TITLE} mb-1`}>{t('accounts.liquidBalance')}</p>
              <p className="text-xl font-semibold tabular-nums text-gray-900 dark:text-white">{fmt(liquidBalance)}</p>
            </div>
            <div className={`text-sm font-medium ${liquidChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {liquidChange >= 0 ? '+' : ''}{fmt(liquidChange)} {t('accounts.fromStart')}
            </div>
          </div>
        )}
      </div>

      {/* ── Account cards grouped by category ──────────────────────── */}
      {(() => {
        const rendered = new Set<string>()
        return ACCOUNT_CATEGORIES.flatMap(cat => {
          if (rendered.has(cat.value)) return []

          // Merge inmueble + vehiculo into one "Bienes" group
          const isBienes = cat.value === 'inmueble' || cat.value === 'vehiculo'
          const groupValues = isBienes ? ['inmueble', 'vehiculo'] : [cat.value]
          const catAccounts = accounts.filter(a => groupValues.includes(a.category))
          if (catAccounts.length === 0) return []
          groupValues.forEach(v => rendered.add(v))

          const isInvestCat = INVESTMENT_CATEGORIES.includes(cat.value as typeof INVESTMENT_CATEGORIES[number])
          const catTotal = isInvestCat
            ? (investCurrentVal ?? catAccounts.reduce((s, a) => s + a.balance, 0))
            : catAccounts.reduce((s, a) => s + (a.category === 'vehiculo' ? vehicleCurrentValue(a) : a.balance), 0)
          const catChange = catAccounts.reduce((s, a) => s + (periodChange[a.id] ?? 0), 0)
          const groupLabel = isBienes ? t('accounts.bienesGroup') : t(cat.labelKey)

          return [(
            <div key={isBienes ? 'bienes' : cat.value} className="space-y-3">
              <div className="flex items-baseline justify-between px-1">
                <h2 className={TITLE}>{groupLabel}</h2>
                <div className="flex items-baseline gap-3">
                  <span className="text-base font-semibold tabular-nums text-gray-900 dark:text-white">{fmt(catTotal)}</span>
                  {isInvestCat && investGainBruto != null ? (
                    <span className={`text-xs font-medium ${investGainBruto >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {investGainBruto >= 0 ? '+' : ''}{fmt(investGainBruto)}
                    </span>
                  ) : (
                    <span className={`text-xs font-medium ${catChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {catChange >= 0 ? '+' : ''}{fmt(catChange)}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {catAccounts.map(acc => {
                  const change = periodChange[acc.id] ?? 0
                  const isVehicle = acc.category === 'vehiculo'
                  const currentVal = isVehicle ? vehicleCurrentValue(acc) : acc.balance
                  return (
                    <div key={acc.id} className={`${PANEL} p-4 relative overflow-hidden`}>
                      <div className="absolute inset-y-0 left-0 w-1 rounded-l-2xl" style={{ background: acc.color }} />
                      <div className="pl-2">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                            style={{ backgroundColor: acc.color + '20' }}>
                            <AppIcon name={acc.icon} className="w-3.5 h-3.5" style={{ color: acc.color }} strokeWidth={1.5} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`${TITLE} truncate`}>{acc.name}</p>
                            {isBienes && (
                              <p className="text-xs text-gray-300 dark:text-gray-600 truncate">
                                {acc.category === 'vehiculo' ? t('account.category.vehiculo') : t('account.category.inmueble')}
                              </p>
                            )}
                          </div>
                        </div>
                        <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white mb-1">
                          {fmt(currentVal)}
                        </p>
                        {isVehicle && acc.depreciation_rate != null ? (
                          <div className="space-y-0.5 text-xs text-gray-400 dark:text-gray-500">
                            <div>{t('accounts.vehicleCurrentVal')}</div>
                            <div>{t('accounts.deprecPerYear')}: <span className="font-semibold">{acc.depreciation_rate}%</span></div>
                            {acc.initial_balance !== currentVal && (
                              <div className="text-red-400">{t('invest.invested')}: {fmt(acc.initial_balance)}</div>
                            )}
                          </div>
                        ) : isInvestCat && investCurrentVal != null ? (
                          <div className="space-y-0.5 text-xs text-gray-400 dark:text-gray-500">
                            <div>{t('invest.invested')}: <span className="font-semibold text-gray-600 dark:text-gray-300 tabular-nums">{fmt(acc.balance)}</span></div>
                            <div>{t('invest.currentValue')}: <span className="font-semibold text-gray-600 dark:text-gray-300 tabular-nums">{fmt(investCurrentVal)}</span></div>
                          </div>
                        ) : (
                          <div className={`flex items-center gap-1 text-xs font-medium ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            <span>{change >= 0 ? '+' : ''}{fmt(change)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )]
        })
      })()}

      {/* ── Evolution chart ────────────────────────────────────────── */}
      <div className={`${PANEL} p-5`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={TITLE}>{t('accounts.balanceEvolution')}</h2>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            {(['lines', 'stacked'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewMode === mode
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {mode === 'lines' ? t('accounts.lines') : t('accounts.stacked')}
              </button>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          {viewMode === 'lines' ? (
            <LineChart data={evolutionData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={fmtK} tick={TICK} axisLine={false} tickLine={false} width={54} />
              <Tooltip content={<CT />} />
              {accounts.length > 1 && (
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} iconType="circle" iconSize={8} />
              )}
              {accounts.map(acc => (
                <Line
                  key={acc.id}
                  type="monotone"
                  dataKey={acc.name}
                  stroke={acc.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: acc.color }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          ) : (
            <AreaChart data={evolutionData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={fmtK} tick={TICK} axisLine={false} tickLine={false} width={54} />
              <Tooltip content={<CT />} />
              {accounts.length > 1 && (
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} iconType="circle" iconSize={8} />
              )}
              {accounts.map(acc => (
                <Area
                  key={acc.id}
                  type="monotone"
                  dataKey={acc.name}
                  stroke={acc.color}
                  fill={acc.color}
                  fillOpacity={0.2}
                  strokeWidth={2}
                  stackId="stack"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: acc.color }}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* ── Monthly change + Distribution ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Monthly change */}
        <div className={`${PANEL} p-5 lg:col-span-2`}>
          <h2 className={`${TITLE} mb-4`}>{t('accounts.monthlyChg')}</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyChangeData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtK} tick={TICK} axisLine={false} tickLine={false} width={54} />
              <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />
              <Tooltip content={<CT />} />
              {accounts.length > 1 && (
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
              )}
              {accounts.map(acc => (
                <Bar
                  key={acc.id}
                  dataKey={acc.name}
                  fill={acc.color}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={32}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Distribution */}
        <div className={`${PANEL} p-5`}>
          <h2 className={`${TITLE} mb-4`}>{t('accounts.distribution')}</h2>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={distributionData}
                cx="50%"
                cy="50%"
                innerRadius={44}
                outerRadius={70}
                dataKey="value"
                paddingAngle={2}
                isAnimationActive={false}
              >
                {distributionData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip content={<CT />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-3 space-y-2">
            {distributionData.map(d => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                  <span className="text-gray-600 dark:text-gray-400">{d.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium tabular-nums text-gray-900 dark:text-white">{fmt(d.value)}</span>
                  <span className="text-gray-400 dark:text-gray-500 w-9 text-right">
                    {totalBalance > 0 ? Math.round(d.value / totalBalance * 100) : 0}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
