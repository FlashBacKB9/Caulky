import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area,
} from 'recharts'
import {
  Heart, Activity, Target, TrendingUp, Sparkles,
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

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

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
  const avgMonthlyIncome   = income   / months
  const avgMonthlySavings  = savings  / months
  const emergencyMonths = avgMonthlyExpenses > 0 ? totalBalance / avgMonthlyExpenses : 0
  const ratio = expenses > 0 ? income / expenses : 0

  // Top spending category
  const topCat = useMemo(() => {
    const map = new Map<string, number>()
    movements.filter(m => m.dinero < 0).forEach(m => {
      const label = m.label || 'Sin categoría'
      map.set(label, (map.get(label) ?? 0) + Math.abs(m.dinero))
    })
    if (map.size === 0) return null
    return [...map.entries()].reduce((a, b) => b[1] > a[1] ? b : a)
  }, [movements])

  const metrics = [
    {
      label: 'Tasa de ahorro',
      value: `${savingsRate.toFixed(1)}%`,
      sub: savingsRate >= 20 ? 'Excelente (obj. >20%)' : savingsRate >= 10 ? 'Buena (obj. >20%)' : savingsRate >= 0 ? 'Mejorable (obj. >20%)' : 'Gastos > Ingresos',
      color: savingsRate >= 20 ? 'text-green-500' : savingsRate >= 10 ? 'text-yellow-500' : 'text-red-500',
      detail: `De cada 100€ ingresados, ahorras ${savingsRate.toFixed(0)}€`,
    },
    {
      label: 'Fondo de emergencia',
      value: `${emergencyMonths.toFixed(1)} meses`,
      sub: emergencyMonths >= 6 ? 'Suficiente (obj. >6m)' : emergencyMonths >= 3 ? 'Mínimo (obj. >6m)' : 'Insuficiente (obj. >6m)',
      color: emergencyMonths >= 6 ? 'text-green-500' : emergencyMonths >= 3 ? 'text-yellow-500' : 'text-red-500',
      detail: `${fmt(totalBalance)} patrimonio ÷ ${fmt(avgMonthlyExpenses)}/mes`,
    },
    {
      label: 'Ratio ingreso/gasto',
      value: ratio.toFixed(2),
      sub: ratio >= 1.2 ? 'Saludable (obj. >1.2)' : ratio >= 1 ? 'Ajustado (obj. >1.2)' : 'Deficitario',
      color: ratio >= 1.2 ? 'text-green-500' : ratio >= 1 ? 'text-yellow-500' : 'text-red-500',
      detail: `Por cada €1 gastado, ingresas €${ratio.toFixed(2)}`,
    },
    {
      label: 'Media mensual',
      value: fmt(avgMonthlySavings),
      sub: `${months} ${months === 1 ? 'mes' : 'meses'} analizados`,
      color: avgMonthlySavings >= 0 ? 'text-green-500' : 'text-red-500',
      detail: `${fmt(avgMonthlyIncome)} ing. · ${fmt(avgMonthlyExpenses)} gasto`,
    },
    {
      label: 'Mayor categoría',
      value: topCat ? topCat[0] : '—',
      sub: topCat ? fmt(topCat[1]) : 'Sin datos',
      color: 'text-gray-700 dark:text-gray-200',
      detail: topCat && expenses > 0 ? `${((topCat[1] / expenses) * 100).toFixed(0)}% del total de gastos` : '',
    },
    {
      label: 'Ahorro neto total',
      value: fmt(savings),
      sub: savings >= 0 ? `+${fmt(savings - 0)} en el período` : 'Período deficitario',
      color: savings >= 0 ? 'text-green-500' : 'text-red-500',
      detail: `${fmt(income)} ingresos — ${fmt(expenses)} gastos`,
    },
  ]

  // Dynamic summary text
  const summary = useMemo(() => {
    if (income === 0) return 'No hay ingresos registrados en el período seleccionado.'
    const parts: string[] = []
    if (savingsRate >= 20) {
      parts.push(`Estás ahorrando el ${savingsRate.toFixed(0)}% de tus ingresos, por encima del objetivo recomendado del 20%.`)
    } else if (savingsRate >= 10) {
      parts.push(`Tu tasa de ahorro del ${savingsRate.toFixed(0)}% es positiva pero está por debajo del objetivo recomendado del 20%.`)
    } else if (savingsRate >= 0) {
      parts.push(`Tu tasa de ahorro del ${savingsRate.toFixed(0)}% es muy baja. Revisa si hay gastos que puedas reducir.`)
    } else {
      parts.push(`Tus gastos superan tus ingresos en ${fmt(Math.abs(savings))}. Situación deficitaria que requiere atención.`)
    }
    if (emergencyMonths >= 6) {
      parts.push(`El fondo de emergencia cubre ${emergencyMonths.toFixed(1)} meses de gastos — solidez financiera correcta.`)
    } else if (emergencyMonths >= 3) {
      parts.push(`El fondo de emergencia cubre ${emergencyMonths.toFixed(1)} meses. Se recomienda llegar a al menos 6 meses.`)
    } else {
      parts.push(`El fondo de emergencia solo cubre ${emergencyMonths.toFixed(1)} meses. Prioriza aumentarlo hasta los 6 meses mínimos recomendados.`)
    }
    if (topCat) {
      parts.push(`Tu mayor gasto es "${topCat[0]}" con ${fmt(topCat[1])} (${expenses > 0 ? ((topCat[1] / expenses) * 100).toFixed(0) : 0}% del total).`)
    }
    return parts.join(' ')
  }, [income, savingsRate, savings, emergencyMonths, topCat, expenses, fmt])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {metrics.map(m => (
          <div key={m.label} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3.5">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{m.label}</p>
            <p className={`text-base font-bold truncate ${m.color}`}>{m.value}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{m.sub}</p>
            {m.detail && <p className="text-xs text-gray-400 dark:text-gray-600 mt-1 truncate">{m.detail}</p>}
          </div>
        ))}
      </div>
      <div className="bg-blue-50 dark:bg-blue-950 rounded-xl px-4 py-3 text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
        {summary}
      </div>
    </div>
  )
}

// ── 2. Patrones de Gasto por Mes ──────────────────────────────────────────────

function PatronesDeGasto({ movements, fmt }: { movements: Movement[]; fmt: (v: number) => string }) {
  const expenses = movements.filter(m => m.dinero < 0)

  const byMonth = useMemo(() => {
    const map = new Map<string, number>()
    expenses.forEach(m => {
      const key = monthKey(m.date)
      map.set(key, (map.get(key) ?? 0) + Math.abs(m.dinero))
    })
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, total]) => {
        const [y, mo] = key.split('-').map(Number)
        const label = `${MONTHS_SHORT[mo - 1]} ${String(y).slice(2)}`
        return { key, label, total }
      })
  }, [expenses])

  if (byMonth.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">Sin gastos en el período seleccionado</p>
  }

  const avg = byMonth.reduce((s, m) => s + m.total, 0) / byMonth.length
  const max = byMonth.reduce((a, b) => b.total > a.total ? b : a, byMonth[0])
  const min = byMonth.reduce((a, b) => b.total < a.total ? b : a, byMonth[0])

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={byMonth} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={36} />
          <Tooltip formatter={(v) => fmt(v as number)} labelFormatter={l => `Gastos · ${l}`} />
          <Bar dataKey="total" name="Gastos" fill="#60a5fa" radius={[3, 3, 0, 0]}
            label={false} />
        </BarChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-3 gap-3 text-center text-xs">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
          <p className="text-gray-400 dark:text-gray-500 mb-0.5">Mes más alto</p>
          <p className="font-semibold text-red-500">{max.label}</p>
          <p className="text-gray-500 dark:text-gray-400 mt-0.5">{fmt(max.total)}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
          <p className="text-gray-400 dark:text-gray-500 mb-0.5">Media mensual</p>
          <p className="font-semibold text-blue-500">—</p>
          <p className="text-gray-500 dark:text-gray-400 mt-0.5">{fmt(avg)}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
          <p className="text-gray-400 dark:text-gray-500 mb-0.5">Mes más bajo</p>
          <p className="font-semibold text-green-500">{min.label}</p>
          <p className="text-gray-500 dark:text-gray-400 mt-0.5">{fmt(min.total)}</p>
        </div>
      </div>
    </div>
  )
}

// ── 3. Regla 50/30/20 ─────────────────────────────────────────────────────────

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

// ── 4. Proyección de Patrimonio ───────────────────────────────────────────────

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
            name="Patrimonio"
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

// ── 5. Prompt IA ──────────────────────────────────────────────────────────────

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
      '## CONTEXTO IMPORTANTE SOBRE LOS DATOS',
      '',
      'Esta aplicación registra todas las salidas de dinero como "gastos", incluyendo transferencias a cuentas de ahorro o de inversión propias.',
      'Esto significa que la "tasa de ahorro" calculada automáticamente puede estar artificialmente deprimida: si hago transferencias a mis propias cuentas de ahorro/inversión, esas aparecen como gasto aunque en realidad son ahorro.',
      'Al analizar los datos, ten en cuenta que algunas categorías de "gasto" (especialmente las relacionadas con ahorro, inversión, fondos, o cuentas propias) son en realidad ahorro real.',
      'Ajusta tu evaluación de la tasa de ahorro si detectas este patrón en las categorías.',
      '',
      '## DATOS FINANCIEROS',
      '',
      '### Resumen del período',
      `- Ingresos totales: ${fmt(income)}`,
      `- Salidas totales (gastos + transferencias a ahorro): ${fmt(expenses)}`,
      `- Balance neto del período: ${fmt(savings)}`,
      `- Tasa de ahorro aparente: ${savingsRate.toFixed(1)}% (puede ser superior si hay transferencias a ahorro)`,
      `- Total movimientos: ${movements.length}`,
      '',
      '### Salidas por categoría (gastos y posibles ahorros)',
      ...byCategory.map(([cat, amount]) =>
        `- ${cat}: ${fmt(amount)}${income > 0 ? ` (${((amount / income) * 100).toFixed(1)}% sobre ingresos)` : ''}`
      ),
      '',
      '### Top 10 salidas del período',
      ...topExpenses.map((m, i) =>
        `${i + 1}. ${m.name} — ${fmt(Math.abs(m.dinero))} (${m.date})${m.label ? ` [${m.label}]` : ''}`
      ),
      '',
      '## ANÁLISIS SOLICITADO',
      '',
      'Por favor proporciona:',
      '1. **Evaluación general** — distingue entre gastos reales y posibles transferencias a ahorro según las categorías',
      '2. **Tasa de ahorro real estimada** — ajustando si identificas categorías que son en realidad ahorro',
      '3. **Análisis de gastos** — categorías preocupantes y por qué',
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

      <SectionCard title="Patrones de Gasto por Mes" icon={Activity}>
        <PatronesDeGasto movements={movements} fmt={fmt} />
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
