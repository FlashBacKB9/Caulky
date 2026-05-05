import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts'
import {
  Heart, Activity, GitCompare, Shuffle, Target, TrendingUp, Sparkles,
  Copy, Check, type LucideIcon,
} from 'lucide-react'
import { getMovements, type Movement } from '../api/movements'
import { getGroups, type Group } from '../api/groups'
import { getMovementTypes, type MovementType } from '../api/movementTypes'
import { getAccountsSummary } from '../api/accounts'
import { useCurrency } from '../hooks/useCurrency'

// ── Helpers ────────────────────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function filterMovements(movements: Movement[], start: string, end: string) {
  return movements.filter(m => !m.no_count && m.date >= start && m.date <= end)
}

function sumIncome(movements: Movement[]) {
  return movements.filter(m => m.dinero > 0).reduce((s, m) => s + m.dinero, 0)
}

function sumExpenses(movements: Movement[]) {
  return movements.filter(m => m.dinero < 0).reduce((s, m) => s + Math.abs(m.dinero), 0)
}

function monthKey(date: string) {
  return date.slice(0, 7)
}

function monthsInRange(start: string, end: string): number {
  const s = new Date(start)
  const e = new Date(end)
  const diff = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1
  return Math.max(1, diff)
}

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
  title: string
  icon: LucideIcon
  children: React.ReactNode
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

// ── 1. Salud Financiera ────────────────────────────────────────────────────────

function SaludFinanciera({ movements, income, expenses, savings, savingsRate, totalBalance, fmt }: {
  movements: Movement[]; income: number; expenses: number; savings: number
  savingsRate: number; totalBalance: number; fmt: (v: number) => string
}) {
  const months = Math.max(1, new Set(movements.map(m => monthKey(m.date))).size)
  const avgMonthlyExpenses = expenses / months
  const emergencyMonths = avgMonthlyExpenses > 0 ? totalBalance / avgMonthlyExpenses : 0
  const ratio = expenses > 0 ? income / expenses : 0

  const metrics = [
    {
      label: 'Tasa de ahorro',
      value: `${savingsRate.toFixed(1)}%`,
      sub: savingsRate >= 20 ? 'Excelente' : savingsRate >= 10 ? 'Buena' : 'Mejorable',
      color: savingsRate >= 20 ? 'text-green-500' : savingsRate >= 10 ? 'text-yellow-500' : 'text-red-500',
    },
    {
      label: 'Fondo emergencia',
      value: `${emergencyMonths.toFixed(1)} meses`,
      sub: emergencyMonths >= 6 ? 'Suficiente' : emergencyMonths >= 3 ? 'Mínimo' : 'Insuficiente',
      color: emergencyMonths >= 6 ? 'text-green-500' : emergencyMonths >= 3 ? 'text-yellow-500' : 'text-red-500',
    },
    {
      label: 'Ratio ingreso/gasto',
      value: ratio.toFixed(2),
      sub: ratio >= 1.2 ? 'Saludable' : ratio >= 1 ? 'Ajustado' : 'Deficitario',
      color: ratio >= 1.2 ? 'text-green-500' : ratio >= 1 ? 'text-yellow-500' : 'text-red-500',
    },
    {
      label: 'Ahorro neto',
      value: fmt(savings),
      sub: `${fmt(income)} ingresos`,
      color: savings >= 0 ? 'text-green-500' : 'text-red-500',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {metrics.map(m => (
        <div key={m.label} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3.5">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{m.label}</p>
          <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{m.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ── 2. Patrones de Gasto ───────────────────────────────────────────────────────

const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function PatronesDeGasto({ movements, fmt }: { movements: Movement[]; fmt: (v: number) => string }) {
  const expenses = movements.filter(m => m.dinero < 0)

  const byDay = DAYS_ES.map((label, i) => {
    const dayMovs = expenses.filter(m => {
      const d = new Date(m.date + 'T12:00:00')
      return (d.getDay() + 6) % 7 === i
    })
    const total = dayMovs.reduce((s, m) => s + Math.abs(m.dinero), 0)
    const count = new Set(dayMovs.map(m => m.date)).size || 1
    return { label, total, avg: total / count }
  })

  const maxTotal = Math.max(...byDay.map(d => d.total), 1)

  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Gasto total por día de la semana</p>
      <div className="space-y-2.5">
        {byDay.map(({ label, total }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="text-xs text-gray-500 dark:text-gray-400 w-7 shrink-0">{label}</span>
            <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-5 overflow-hidden">
              <div
                className="h-5 rounded-full bg-blue-400 dark:bg-blue-600 transition-all"
                style={{ width: `${(total / maxTotal) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-600 dark:text-gray-400 w-20 text-right shrink-0">{fmt(total)}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
        Día con más gasto: <span className="font-medium text-gray-600 dark:text-gray-300">
          {byDay.reduce((a, b) => b.total > a.total ? b : a, byDay[0]).label}
        </span>
      </p>
    </div>
  )
}

// ── 3. Comparativa de Períodos ────────────────────────────────────────────────

function ComparativaPeriodos({ allMovements, fmt }: {
  allMovements: Movement[]
  fmt: (v: number) => string
}) {
  const now = new Date()
  const [periodA, setPeriodA] = useState({
    start: localDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    end:   localDateStr(new Date(now.getFullYear(), now.getMonth(), 0)),
  })
  const [periodB, setPeriodB] = useState({
    start: localDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
    end:   localDateStr(now),
  })

  function expensesByLabel(movements: Movement[]) {
    const map = new Map<string, number>()
    movements.filter(m => m.dinero < 0).forEach(m => {
      const label = m.label || 'Sin categoría'
      map.set(label, (map.get(label) ?? 0) + Math.abs(m.dinero))
    })
    return map
  }

  const movA = useMemo(() => filterMovements(allMovements, periodA.start, periodA.end), [allMovements, periodA])
  const movB = useMemo(() => filterMovements(allMovements, periodB.start, periodB.end), [allMovements, periodB])
  const expA = useMemo(() => expensesByLabel(movA), [movA])
  const expB = useMemo(() => expensesByLabel(movB), [movB])

  const chartData = useMemo(() => {
    const all = new Set([...expA.keys(), ...expB.keys()])
    return [...all]
      .sort((a, b) => ((expA.get(b) ?? 0) + (expB.get(b) ?? 0)) - ((expA.get(a) ?? 0) + (expB.get(a) ?? 0)))
      .slice(0, 10)
      .map(label => ({
        label: label.length > 11 ? label.slice(0, 11) + '…' : label,
        'Per. A': expA.get(label) ?? 0,
        'Per. B': expB.get(label) ?? 0,
      }))
  }, [expA, expB])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1.5">Período A</p>
          <DateRangeInputs start={periodA.start} end={periodA.end}
            onChange={(s, e) => setPeriodA({ start: s, end: e })} />
        </div>
        <div>
          <p className="text-xs font-medium text-violet-600 dark:text-violet-400 mb-1.5">Período B</p>
          <DateRangeInputs start={periodB.start} end={periodB.end}
            onChange={(s, e) => setPeriodB({ start: s, end: e })} />
        </div>
      </div>

      {chartData.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Sin datos para los períodos seleccionados</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 44 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={36} />
            <Tooltip formatter={(v) => fmt(v as number)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Per. A" fill="#60a5fa" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Per. B" fill="#a78bfa" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

      <div className="grid grid-cols-2 gap-3">
        {([
          { label: 'Período A', mov: movA, color: 'text-blue-500' },
          { label: 'Período B', mov: movB, color: 'text-violet-500' },
        ] as const).map(({ label, mov, color }) => {
          const inc = sumIncome(mov)
          const exp = sumExpenses(mov)
          return (
            <div key={label} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-1.5 text-xs">
              <p className={`font-medium ${color}`}>{label}</p>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Ingresos</span>
                <span className="text-green-500">{fmt(inc)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Gastos</span>
                <span className="text-red-500">{fmt(exp)}</span>
              </div>
              <div className="flex justify-between font-medium border-t border-gray-200 dark:border-gray-700 pt-1">
                <span className="text-gray-600 dark:text-gray-300">Ahorro</span>
                <span className={inc - exp >= 0 ? 'text-green-500' : 'text-red-500'}>{fmt(inc - exp)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 4. Fijo vs Variable ───────────────────────────────────────────────────────

function FijoVsVariable({ movements, allMovements, types, fmt }: {
  movements: Movement[]; allMovements: Movement[]; types: MovementType[]; fmt: (v: number) => string
}) {
  const fixedTypeIds = useMemo(() => {
    const typeMonths = new Map<number, Set<string>>()
    allMovements.filter(m => m.dinero < 0 && !m.no_count && m.movement_type_id != null).forEach(m => {
      const tid = m.movement_type_id!
      if (!typeMonths.has(tid)) typeMonths.set(tid, new Set())
      typeMonths.get(tid)!.add(monthKey(m.date))
    })
    const fixed = new Set<number>()
    typeMonths.forEach((months, tid) => { if (months.size >= 2) fixed.add(tid) })
    return fixed
  }, [allMovements])

  const expenseMov = movements.filter(m => m.dinero < 0)
  const fixed   = expenseMov.filter(m => m.movement_type_id != null && fixedTypeIds.has(m.movement_type_id!))
  const variable = expenseMov.filter(m => m.movement_type_id == null || !fixedTypeIds.has(m.movement_type_id!))

  const totalFixed    = fixed.reduce((s, m) => s + Math.abs(m.dinero), 0)
  const totalVariable = variable.reduce((s, m) => s + Math.abs(m.dinero), 0)
  const total = totalFixed + totalVariable

  const pieData = [
    { name: 'Fijo',     value: totalFixed,    fill: '#60a5fa' },
    { name: 'Variable', value: totalVariable, fill: '#f9a8d4' },
  ]

  const fixedByType = new Map<string, number>()
  fixed.forEach(m => {
    const t = types.find(t => t.id === m.movement_type_id)
    const name = t?.name ?? m.label ?? 'Sin tipo'
    fixedByType.set(name, (fixedByType.get(name) ?? 0) + Math.abs(m.dinero))
  })
  const topFixed = [...fixedByType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
            </Pie>
            <Tooltip formatter={(v) => fmt(v as number)} />
          </PieChart>
        </ResponsiveContainer>

        <div className="space-y-2">
          <div className="bg-blue-50 dark:bg-blue-950 rounded-xl p-3.5">
            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Gastos fijos</p>
            <p className="text-xl font-bold text-blue-700 dark:text-blue-300 mt-0.5">{fmt(totalFixed)}</p>
            <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">
              {total > 0 ? ((totalFixed / total) * 100).toFixed(0) : 0}% del total
            </p>
          </div>
          <div className="bg-pink-50 dark:bg-pink-950 rounded-xl p-3.5">
            <p className="text-xs text-pink-600 dark:text-pink-400 font-medium">Gastos variables</p>
            <p className="text-xl font-bold text-pink-700 dark:text-pink-300 mt-0.5">{fmt(totalVariable)}</p>
            <p className="text-xs text-pink-500 dark:text-pink-400 mt-0.5">
              {total > 0 ? ((totalVariable / total) * 100).toFixed(0) : 0}% del total
            </p>
          </div>
        </div>
      </div>

      {topFixed.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Gastos fijos recurrentes</p>
          <div className="space-y-1.5">
            {topFixed.map(([name, amount]) => (
              <div key={name} className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                <span className="text-gray-700 dark:text-gray-300">{name}</span>
                <span className="font-medium text-blue-600 dark:text-blue-400">{fmt(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 5. Regla 50/30/20 ─────────────────────────────────────────────────────────

type RuleBucket = 'necesidades' | 'deseos' | 'ahorro' | 'unassigned'
const RULE_KEY = 'spendly-5030-assignment'

const BUCKETS: { id: RuleBucket; label: string; target: number; barColor: string; textColor: string }[] = [
  { id: 'necesidades', label: 'Necesidades', target: 50, barColor: 'bg-blue-500',   textColor: 'text-blue-600 dark:text-blue-400' },
  { id: 'deseos',      label: 'Deseos',       target: 30, barColor: 'bg-violet-500', textColor: 'text-violet-600 dark:text-violet-400' },
  { id: 'ahorro',      label: 'Ahorro/Inv.',  target: 20, barColor: 'bg-green-500',  textColor: 'text-green-600 dark:text-green-400' },
]

function Regla502030({ movements, groups, types, income, fmt }: {
  movements: Movement[]; groups: Group[]; types: MovementType[]; income: number; fmt: (v: number) => string
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
    localStorage.setItem(RULE_KEY, JSON.stringify(next))
  }

  const byBucket = useMemo(() => {
    const map: Record<RuleBucket, number> = { necesidades: 0, deseos: 0, ahorro: 0, unassigned: 0 }
    movements.filter(m => m.dinero < 0 && m.movement_type_id != null).forEach(m => {
      const t = types.find(t => t.id === m.movement_type_id)
      if (!t) { map.unassigned += Math.abs(m.dinero); return }
      const bucket: RuleBucket = assignment[t.income_expense_group_id] ?? 'unassigned'
      map[bucket] += Math.abs(m.dinero)
    })
    movements.filter(m => m.dinero < 0 && m.movement_type_id == null).forEach(m => {
      map.unassigned += Math.abs(m.dinero)
    })
    return map
  }, [movements, types, assignment])

  const expenseGroups = useMemo(() => {
    const usedGroupIds = new Set(types.map(t => t.income_expense_group_id))
    return groups.filter(g => !g.is_total && usedGroupIds.has(g.id))
  }, [groups, types])

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {BUCKETS.map(bucket => {
          const actual = byBucket[bucket.id]
          const pct = income > 0 ? (actual / income) * 100 : 0
          const over = pct > bucket.target
          const fillPct = bucket.target > 0 ? Math.min((pct / bucket.target) * 100, 100) : 0
          return (
            <div key={bucket.id}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className={`font-medium ${bucket.textColor}`}>{bucket.label}</span>
                <span className="text-gray-500 dark:text-gray-400">
                  {fmt(actual)} · {pct.toFixed(1)}%{' '}
                  <span className="text-gray-400 dark:text-gray-500">(obj. {bucket.target}%)</span>
                </span>
              </div>
              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${bucket.barColor} ${over ? 'opacity-70' : ''}`}
                  style={{ width: `${fillPct}%` }}
                />
              </div>
              {over && (
                <p className="text-xs text-red-400 dark:text-red-500 mt-0.5">
                  +{(pct - bucket.target).toFixed(1)}% sobre el objetivo
                </p>
              )}
            </div>
          )
        })}
        {byBucket.unassigned > 0 && (
          <p className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950 rounded-lg px-3 py-2">
            {fmt(byBucket.unassigned)} sin asignar — configura las categorías abajo
          </p>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Asignación de categorías</p>
        {expenseGroups.length === 0 ? (
          <p className="text-xs text-gray-400">No hay categorías de gasto disponibles</p>
        ) : (
          <div className="space-y-1.5">
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
                  <option value="unassigned">Sin asignar</option>
                  {BUCKETS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 6. Proyección de Patrimonio ───────────────────────────────────────────────

function ProyeccionPatrimonio({ monthlySavings, totalBalance, fmt }: {
  monthlySavings: number; totalBalance: number; fmt: (v: number) => string
}) {
  const points = useMemo(() =>
    Array.from({ length: 13 }, (_, i) => ({
      label: i === 0 ? 'Hoy' : `+${i}m`,
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
          <Tooltip formatter={(v) => fmt(v as number)} />
          <Area
            type="monotone"
            dataKey="balance"
            stroke={positive ? '#60a5fa' : '#f87171'}
            fill="url(#projGrad)"
            strokeWidth={2}
          />
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

// ── 7. Prompt IA ──────────────────────────────────────────────────────────────

function PromptIA({ allMovements, fmt }: {
  allMovements: Movement[]
  fmt: (v: number) => string
}) {
  const now = new Date()
  const [start, setStart] = useState(localDateStr(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [end,   setEnd]   = useState(localDateStr(now))
  const [copied, setCopied] = useState(false)

  const movements = useMemo(() => filterMovements(allMovements, start, end), [allMovements, start, end])

  const income   = sumIncome(movements)
  const expenses = sumExpenses(movements)
  const savings  = income - expenses
  const savingsRate = income > 0 ? (savings / income) * 100 : 0

  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    movements.filter(m => m.dinero < 0).forEach(m => {
      const label = m.label || 'Sin categoría'
      map.set(label, (map.get(label) ?? 0) + Math.abs(m.dinero))
    })
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [movements])

  const topExpenses = useMemo(() =>
    [...movements]
      .filter(m => m.dinero < 0)
      .sort((a, b) => a.dinero - b.dinero)
      .slice(0, 10),
    [movements]
  )

  const prompt = useMemo(() => {
    if (movements.length === 0) return 'Sin datos para el período seleccionado. Elige un rango con movimientos.'

    return [
      `Actúa como un asesor financiero personal experto. Analiza mis finanzas del ${start} al ${end} y dame un informe completo con recomendaciones accionables.`,
      '',
      '## DATOS FINANCIEROS',
      '',
      '### Resumen del período',
      `- Ingresos totales: ${fmt(income)}`,
      `- Gastos totales: ${fmt(expenses)}`,
      `- Ahorro neto: ${fmt(savings)}`,
      `- Tasa de ahorro: ${savingsRate.toFixed(1)}%`,
      `- Total movimientos: ${movements.length}`,
      '',
      '### Gastos por categoría',
      ...byCategory.map(([cat, amount]) =>
        `- ${cat}: ${fmt(amount)}${income > 0 ? ` (${((amount / income) * 100).toFixed(1)}% sobre ingresos)` : ''}`
      ),
      '',
      '### Top 10 gastos del período',
      ...topExpenses.map((m, i) =>
        `${i + 1}. ${m.name} — ${fmt(Math.abs(m.dinero))} (${m.date})${m.label ? ` [${m.label}]` : ''}`
      ),
      '',
      '## ANÁLISIS SOLICITADO',
      '',
      'Por favor proporciona:',
      '1. **Evaluación general** de mi situación financiera en este período',
      '2. **Análisis de gastos** — categorías preocupantes y por qué',
      '3. **Tasa de ahorro** — si es adecuada y cómo mejorarla',
      '4. **3 recomendaciones concretas** y fáciles de implementar',
      '5. **Alertas** — patrones o gastos que deberían preocuparme',
      '6. **Proyección** — si continúo así, ¿dónde estaré en 6 y 12 meses?',
    ].join('\n')
  }, [movements, start, end, income, expenses, savings, savingsRate, byCategory, topExpenses, fmt])

  function handleCopy() {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

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
        <pre className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono max-h-80 overflow-y-auto leading-relaxed border border-gray-100 dark:border-gray-700">
          {prompt}
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors shadow-sm"
        >
          {copied
            ? <Check className="w-3.5 h-3.5 text-green-500" />
            : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Pega este prompt en ChatGPT, Claude u otro asistente de IA para obtener un análisis financiero personalizado.
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

  const { data: allMovements = [] } = useQuery({
    queryKey: ['movements'],
    queryFn: () => getMovements(),
  })
  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: getGroups,
  })
  const { data: types = [] } = useQuery({
    queryKey: ['movement-types'],
    queryFn: getMovementTypes,
  })
  const { data: accountsSummary } = useQuery({
    queryKey: ['accounts-summary'],
    queryFn: getAccountsSummary,
  })

  const movements = useMemo(
    () => filterMovements(allMovements, rangeStart, rangeEnd),
    [allMovements, rangeStart, rangeEnd]
  )

  const income   = useMemo(() => sumIncome(movements),   [movements])
  const expenses = useMemo(() => sumExpenses(movements), [movements])
  const savings  = income - expenses
  const savingsRate    = income > 0 ? (savings / income) * 100 : 0
  const totalBalance   = accountsSummary?.total ?? 0
  const months         = monthsInRange(rangeStart, rangeEnd)
  const monthlySavings = savings / months

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">Análisis Financiero</h1>
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

      <SectionCard title="Salud Financiera" icon={Heart}>
        <SaludFinanciera
          movements={movements}
          income={income}
          expenses={expenses}
          savings={savings}
          savingsRate={savingsRate}
          totalBalance={totalBalance}
          fmt={fmt}
        />
      </SectionCard>

      <SectionCard title="Patrones de Gasto" icon={Activity}>
        <PatronesDeGasto movements={movements} fmt={fmt} />
      </SectionCard>

      <SectionCard title="Comparativa de Períodos" icon={GitCompare}>
        <ComparativaPeriodos allMovements={allMovements} fmt={fmt} />
      </SectionCard>

      <SectionCard title="Fijo vs Variable" icon={Shuffle}>
        <FijoVsVariable movements={movements} allMovements={allMovements} types={types} fmt={fmt} />
      </SectionCard>

      <SectionCard title="Regla 50/30/20" icon={Target}>
        <Regla502030 movements={movements} groups={groups} types={types} income={income} fmt={fmt} />
      </SectionCard>

      <SectionCard title="Proyección de Patrimonio" icon={TrendingUp}>
        <ProyeccionPatrimonio monthlySavings={monthlySavings} totalBalance={totalBalance} fmt={fmt} />
      </SectionCard>

      <SectionCard title="Prompt IA" icon={Sparkles}>
        <PromptIA allMovements={allMovements} fmt={fmt} />
      </SectionCard>
    </div>
  )
}
