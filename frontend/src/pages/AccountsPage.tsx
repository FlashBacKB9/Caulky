import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAccountsSummary, type Account } from '../api/accounts'
import { getMovements, type Movement } from '../api/movements'
import { getMovementTypes, type MovementType } from '../api/movementTypes'
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

const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

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

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)
  const totalChange  = totalBalance - accounts.reduce((s, a) => s + a.initial_balance, 0)

  if (loadingAccounts || loadingMovements) {
    return (
      <div className="p-6 flex items-center justify-center h-96">
        <span className="text-sm text-gray-400 dark:text-gray-500">Cargando...</span>
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center h-96">
        <span className="text-sm text-gray-400 dark:text-gray-500">No hay cuentas configuradas.</span>
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
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Cuentas</h1>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setSelectedYear(null)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              selectedYear === null
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            Todo
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
      <div className={`${PANEL} p-5 flex items-center gap-6`}>
        <div className="flex-1">
          <p className={`${TITLE} mb-2`}>Patrimonio total</p>
          <p className="text-3xl font-bold tabular-nums text-gray-900 dark:text-white">
            {fmt(totalBalance)}
          </p>
        </div>
        <div className={`flex items-center gap-1.5 text-sm font-semibold ${totalChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {totalChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          <span>{totalChange >= 0 ? '+' : ''}{fmt(totalChange)} desde inicio</span>
        </div>
      </div>

      {/* ── Account cards ──────────────────────────────────────────── */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {accounts.map(acc => {
          const change = acc.balance - acc.initial_balance
          return (
            <div key={acc.id} className={`${PANEL} p-4 relative overflow-hidden`}>
              <div className="absolute inset-y-0 left-0 w-1 rounded-l-2xl" style={{ background: acc.color }} />
              <div className="pl-2">
                <div className="flex items-center gap-1.5 mb-3">
                  <AppIcon name={acc.icon} className="w-3.5 h-3.5 shrink-0" style={{ color: acc.color }} />
                  <p className={`${TITLE} truncate`}>{acc.name}</p>
                </div>
                <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white mb-1">
                  {fmt(acc.balance)}
                </p>
                <div className={`flex items-center gap-1 text-xs font-medium ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  <span>{change >= 0 ? '+' : ''}{fmt(change)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Evolution chart ────────────────────────────────────────── */}
      <div className={`${PANEL} p-5`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={TITLE}>Evolución del balance</h2>
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
                {mode === 'lines' ? 'Líneas' : 'Apilado'}
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
          <h2 className={`${TITLE} mb-4`}>Cambio mensual</h2>
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
          <h2 className={`${TITLE} mb-4`}>Distribución actual</h2>
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
