import { useState, useMemo } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import {
  ResponsiveContainer, ComposedChart, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  Line, Bar, type LegendPayload,
} from 'recharts'
import { getAnnualStats } from '../api/stats'
import { useCurrency } from '../hooks/useCurrency'
import { Columns2, Layers, BarChart2, Activity, TrendingUp } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS    = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const MONTHS_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const EXP_SKIP  = new Set(['Ingreso','Total','Ahorro','Gastos Anuales','Inversión'])
const BAL_SKIP  = new Set(['Total','Ahorro','Gastos Anuales','Inversión'])
const CUR_YEAR  = new Date().getFullYear()
const YEARS     = Array.from({ length: 8 }, (_, i) => CUR_YEAR - i).filter(y => y >= 2019)
const GRID      = '#e5e7eb'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnnualGroup { name: string; color: string; monthly: Record<string, number>; total: number }
interface AnnualData  { year: number; groups: AnnualGroup[] }

type ChartKind   = 'expenses-group' | 'expenses-total' | 'income' | 'net' | 'distribution'
type ViewMode    = 'side' | 'overlay'
type DisplayType = 'line' | 'bar' | 'area'

const CHART_OPTIONS: { id: ChartKind; label: string }[] = [
  { id: 'expenses-group', label: 'Gastos por categoría' },
  { id: 'expenses-total', label: 'Total de gastos'      },
  { id: 'income',         label: 'Ingresos'             },
  { id: 'net',            label: 'Balance neto'         },
  { id: 'distribution',   label: 'Distribución'         },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const cutoff    = (year: number)   => year < CUR_YEAR ? 11 : new Date().getMonth()
const expGroups = (d: AnnualData)  => d.groups.filter(g => !EXP_SKIP.has(g.name))
const balGroups = (d: AnnualData)  => d.groups.filter(g => !BAL_SKIP.has(g.name) && g.name !== 'Total')
const mval      = (g: AnnualGroup, i: number) => g.monthly[MONTHS_ES[i]] ?? 0
const EMPTY_G   = { monthly: {}, total: 0, name: '', color: '' } as AnnualGroup

// ── Tooltip ───────────────────────────────────────────────────────────────────

function CT({ active, payload, label, fmt }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]
  label?: string; fmt: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  const entries = payload.filter(p => p.value != null && p.value !== 0)
  if (!entries.length) return null
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl shadow-lg px-3 py-2 text-xs">
      {label && <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1.5">{label}</p>}
      {entries.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }}/>
          <span className="text-gray-500 dark:text-gray-400 truncate max-w-[180px]">{p.name}:</span>
          <span className="font-mono font-medium text-gray-800 dark:text-gray-100 ml-auto pl-2">{fmt(Math.abs(p.value))}</span>
        </div>
      ))}
    </div>
  )
}

function Empty() {
  return <div className="flex items-center justify-center h-48 text-sm text-gray-300 dark:text-gray-600">Sin datos</div>
}

// ── Shared axis props ─────────────────────────────────────────────────────────

const xProps = { tick: { fontSize: 11, fill: '#9ca3af' }, axisLine: false as const, tickLine: false as const }
const yProps = (fmtK: (v: number) => string) => ({
  tickFormatter: fmtK, tick: { fontSize: 11, fill: '#9ca3af' },
  axisLine: false as const, tickLine: false as const, width: 48,
})

// ── Legend helpers ────────────────────────────────────────────────────────────

function legendFmt(hidden: Set<string>) {
  return (v: string, entry: LegendPayload) => {
    const key = String(entry.dataKey ?? v)
    return (
      <span style={{ opacity: hidden.has(key) ? 0.4 : 1, cursor: 'pointer', textDecoration: hidden.has(key) ? 'line-through' : 'none' }}>
        {v}
      </span>
    )
  }
}
function toggleHidden(prev: Set<string>, key: string): Set<string> {
  const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next
}
function legendClick(set: React.Dispatch<React.SetStateAction<Set<string>>>) {
  return (data: LegendPayload) => set(p => toggleHidden(p, String(data.dataKey ?? '')))
}

// ── Year card ─────────────────────────────────────────────────────────────────

function YearCard({ year, colorDot, subtitle, children }: { year: number; colorDot: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorDot }}/>
        <span className="text-base font-bold text-gray-800 dark:text-white">{year}</span>
        {subtitle && <span className="text-sm text-gray-400 dark:text-gray-500">· {subtitle}</span>}
      </div>
      {children}
    </div>
  )
}

// ── Side charts ───────────────────────────────────────────────────────────────

function SideExpGroupChart({ data, displayType }: { data: AnnualData; displayType: DisplayType }) {
  const { fmtK } = useCurrency()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const groups   = expGroups(data).filter(g => Math.abs(g.total) > 0)
  const cut      = cutoff(data.year)
  const chartData = MONTHS.slice(0, cut + 1).map((m, i) => {
    const row: Record<string, number | string> = { month: m }
    for (const g of groups) row[g.name] = Math.abs(mval(g, i))
    return row
  })
  if (!groups.length) return <Empty/>
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
        <XAxis dataKey="month" {...xProps}/>
        <YAxis {...yProps(fmtK)}/>
        <Tooltip content={p => <CT {...(p as unknown as Parameters<typeof CT>[0])} fmt={v => String(Math.round(v))}/>}/>
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8}
          onClick={legendClick(setHidden)}
          formatter={legendFmt(hidden)}/>
        {groups.map(g => {
          const common = { key: g.name, dataKey: g.name, hide: hidden.has(g.name), isAnimationActive: false }
          if (displayType === 'bar')  return <Bar  {...common} fill={g.color} maxBarSize={16} radius={[2,2,0,0]}/>
          if (displayType === 'area') return <Area {...common} type="linear" stroke={g.color} fill={g.color} fillOpacity={0.12} strokeWidth={2} dot={false}/>
          return <Line {...common} type="linear" stroke={g.color} strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }}/>
        })}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function SideExpTotalChart({ data, displayType }: { data: AnnualData; displayType: DisplayType }) {
  const { fmtK, fmt } = useCurrency()
  const groups  = expGroups(data)
  const cut     = cutoff(data.year)
  const chartData = MONTHS.slice(0, cut + 1).map((m, i) => ({
    month: m, Gastos: Math.round(groups.reduce((s, g) => s + Math.abs(mval(g, i)), 0)),
  }))
  const color = '#ef4444'
  const common = { dataKey: 'Gastos', isAnimationActive: false }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
        <XAxis dataKey="month" {...xProps}/>
        <YAxis {...yProps(fmtK)}/>
        <Tooltip content={p => <CT {...(p as unknown as Parameters<typeof CT>[0])} fmt={fmt}/>}/>
        {displayType === 'bar'  && <Bar  {...common} fill={color} radius={[3,3,0,0]}/>}
        {displayType === 'area' && <Area {...common} type="linear" stroke={color} fill={color} fillOpacity={0.12} strokeWidth={2} dot={false}/>}
        {displayType === 'line' && <Line {...common} type="linear" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }}/>}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function SideIncomeChart({ data, displayType }: { data: AnnualData; displayType: DisplayType }) {
  const { fmtK, fmt } = useCurrency()
  const inc  = data.groups.find(g => g.name === 'Ingreso') ?? EMPTY_G
  const cut  = cutoff(data.year)
  const chartData = MONTHS.slice(0, cut + 1).map((m, i) => ({
    month: m, Ingresos: Math.round(mval(inc, i)),
  }))
  const color  = '#22c55e'
  const common = { dataKey: 'Ingresos', isAnimationActive: false }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
        <XAxis dataKey="month" {...xProps}/>
        <YAxis {...yProps(fmtK)}/>
        <Tooltip content={p => <CT {...(p as unknown as Parameters<typeof CT>[0])} fmt={fmt}/>}/>
        {displayType === 'bar'  && <Bar  {...common} fill={color} radius={[3,3,0,0]}/>}
        {displayType === 'area' && <Area {...common} type="linear" stroke={color} fill={color} fillOpacity={0.12} strokeWidth={2} dot={false}/>}
        {displayType === 'line' && <Line {...common} type="linear" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }}/>}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function SideNetChart({ data }: { data: AnnualData }) {
  const { fmtK, fmt } = useCurrency()
  const bGroups = balGroups(data)
  const cut     = cutoff(data.year)
  let running   = 0
  const chartData = MONTHS.slice(0, cut + 1).map((m, i) => {
    running += bGroups.reduce((s, g) => s + mval(g, i), 0)
    return { month: m, Balance: Math.round(running * 100) / 100 }
  })
  const vals = chartData.map(d => d.Balance)
  const min  = Math.min(...vals), max = Math.max(...vals), pad = (max - min) * 0.15 || 100
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`netGrad${data.year}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15}/>
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
        <XAxis dataKey="month" {...xProps}/>
        <YAxis {...yProps(fmtK)} domain={[min - pad, max + pad]}/>
        <Tooltip content={p => <CT {...(p as unknown as Parameters<typeof CT>[0])} fmt={fmt}/>}/>
        <Area type="monotone" dataKey="Balance" stroke="#3b82f6" strokeWidth={2}
          fill={`url(#netGrad${data.year})`} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} isAnimationActive={false}/>
      </AreaChart>
    </ResponsiveContainer>
  )
}

function SideDistChart({ data, monthIdx }: { data: AnnualData; monthIdx?: number }) {
  const { fmt } = useCurrency()
  const [hov, setHov] = useState<number | null>(null)
  const slices = expGroups(data)
    .map(g => ({
      name:  g.name,
      value: monthIdx !== undefined ? Math.abs(mval(g, monthIdx)) : Math.abs(g.total),
      color: g.color,
    }))
    .filter(s => s.value > 0).sort((a, b) => b.value - a.value)
  if (!slices.length) return <Empty/>
  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={slices} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
            dataKey="value" paddingAngle={2}
            onMouseEnter={(_, i) => setHov(i)} onMouseLeave={() => setHov(null)}>
            {slices.map((s, i) => (
              <Cell key={s.name} fill={s.color} opacity={hov === null || hov === i ? 1 : 0.3} stroke="none"/>
            ))}
          </Pie>
          <Tooltip formatter={(v: unknown) => [fmt(v as number), '']} contentStyle={{ borderRadius: 12, border: '1px solid #f3f4f6', fontSize: 12 }}/>
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 px-2">
        {slices.map((s, i) => (
          <div key={s.name} className="flex items-center gap-1.5"
            style={{ opacity: hov === null || hov === i ? 1 : 0.35 }}
            onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }}/>
            <span className="text-[11px] text-gray-600 dark:text-gray-400">{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Overlay charts ────────────────────────────────────────────────────────────

function OvExpGroupChart({ dA, dB, yA, yB, displayType }: {
  dA: AnnualData; dB: AnnualData; yA: number; yB: number; displayType: DisplayType
}) {
  const { fmtK } = useCurrency()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const gA = expGroups(dA).filter(g => Math.abs(g.total) > 0)
  const gB = expGroups(dB).filter(g => Math.abs(g.total) > 0)
  const colorMap: Record<string, string> = {}
  for (const g of [...gA, ...gB]) colorMap[g.name] = g.color
  const names  = [...new Set([...gA.map(g => g.name), ...gB.map(g => g.name)])]
  const maxCut = Math.max(cutoff(yA), cutoff(yB))
  const chartData = MONTHS.slice(0, maxCut + 1).map((m, i) => {
    const row: Record<string, number | string | null> = { month: m }
    for (const name of names) {
      row[`${name}__A`] = i <= cutoff(yA) ? Math.abs(mval(gA.find(g => g.name === name) ?? EMPTY_G, i)) : null
      row[`${name}__B`] = i <= cutoff(yB) ? Math.abs(mval(gB.find(g => g.name === name) ?? EMPTY_G, i)) : null
    }
    return row
  })
  if (!names.length) return <Empty/>
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
        <XAxis dataKey="month" {...xProps}/>
        <YAxis {...yProps(fmtK)}/>
        <Tooltip content={p => <CT {...(p as unknown as Parameters<typeof CT>[0])} fmt={v => String(Math.round(v))}/>}/>
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8}
          onClick={legendClick(setHidden)}
          formatter={legendFmt(hidden)}/>
        {names.flatMap(name => {
          const color = colorMap[name]
          const kA = `${name}__A`, kB = `${name}__B`
          const cA = { key: kA, dataKey: kA, name: `${name} (${yA})`, hide: hidden.has(kA), isAnimationActive: false, connectNulls: true }
          const cB = { key: kB, dataKey: kB, name: `${name} (${yB})`, hide: hidden.has(kB), isAnimationActive: false, connectNulls: true }
          if (displayType === 'bar') return [
            <Bar {...cA} fill={color} maxBarSize={12} radius={[2,2,0,0]}/>,
            <Bar {...cB} fill={color} fillOpacity={0.45} maxBarSize={12} radius={[2,2,0,0]}/>,
          ]
          if (displayType === 'area') return [
            <Area {...cA} type="linear" stroke={color} fill={color} fillOpacity={0.12} strokeWidth={2} dot={false}/>,
            <Area {...cB} type="linear" stroke={color} fill={color} fillOpacity={0.05} strokeWidth={2} strokeDasharray="5 4" dot={false}/>,
          ]
          return [
            <Line {...cA} type="linear" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }}/>,
            <Line {...cB} type="linear" stroke={color} strokeWidth={2} strokeDasharray="5 4" strokeOpacity={0.55} dot={false} activeDot={{ r: 3, strokeWidth: 0 }}/>,
          ]
        })}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function OvBarChart({ dA, dB, yA, yB, kind }: {
  dA: AnnualData; dB: AnnualData; yA: number; yB: number; kind: 'expenses-total' | 'income' | 'net'
}) {
  const { fmtK, fmt } = useCurrency()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const maxCut = Math.max(cutoff(yA), cutoff(yB))
  const colorA = kind === 'income' ? '#22c55e' : kind === 'net' ? '#3b82f6' : '#ef4444'
  const colorB = kind === 'income' ? '#86efac' : kind === 'net' ? '#a5b4fc' : '#fca5a5'

  function monthVal(d: AnnualData, i: number) {
    if (kind === 'expenses-total') return Math.round(expGroups(d).reduce((s, g) => s + Math.abs(mval(g, i)), 0))
    if (kind === 'income')         return Math.round(mval(d.groups.find(g => g.name === 'Ingreso') ?? EMPTY_G, i))
    return Math.round(balGroups(d).reduce((s, g) => s + mval(g, i), 0))
  }

  let runA = 0, runB = 0
  const chartData = MONTHS.slice(0, maxCut + 1).map((m, i) => {
    if (kind === 'net') {
      runA += i <= cutoff(yA) ? monthVal(dA, i) : 0
      runB += i <= cutoff(yB) ? monthVal(dB, i) : 0
      return { month: m, [String(yA)]: i <= cutoff(yA) ? Math.round(runA) : null, [String(yB)]: i <= cutoff(yB) ? Math.round(runB) : null }
    }
    return { month: m, [String(yA)]: i <= cutoff(yA) ? monthVal(dA, i) : null, [String(yB)]: i <= cutoff(yB) ? monthVal(dB, i) : null }
  })

  const kA = String(yA), kB = String(yB)
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
        <XAxis dataKey="month" {...xProps}/>
        <YAxis {...yProps(fmtK)}/>
        <Tooltip content={p => <CT {...(p as unknown as Parameters<typeof CT>[0])} fmt={fmt}/>}/>
        <Legend wrapperStyle={{ fontSize: 11 }}
          onClick={legendClick(setHidden)}
          formatter={legendFmt(hidden)}/>
        <Bar dataKey={kA} fill={colorA} radius={[3,3,0,0]} isAnimationActive={false} hide={hidden.has(kA)} maxBarSize={32}/>
        <Bar dataKey={kB} fill={colorB} radius={[3,3,0,0]} isAnimationActive={false} hide={hidden.has(kB)} maxBarSize={32}/>
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── Multi-year summary table ───────────────────────────────────────────────────

function SummaryTable({ yearData }: { yearData: AnnualData[] }) {
  const { fmt } = useCurrency()
  const years = yearData.map(d => d.year)

  const allNames: string[] = []
  const seen = new Set<string>()
  for (const d of yearData) {
    for (const g of d.groups) {
      if (!seen.has(g.name) && g.name !== 'Total') { seen.add(g.name); allNames.push(g.name) }
    }
  }

  const incomeNames  = allNames.filter(n => n === 'Ingreso')
  const savingsNames = allNames.filter(n => ['Ahorro','Gastos Anuales','Inversión'].includes(n))
  const expenseNames = allNames.filter(n => !EXP_SKIP.has(n))

  const gTotal = (d: AnnualData, name: string) => d.groups.find(g => g.name === name)?.total ?? null

  const TH  = 'px-3 py-2 text-right text-[11px] font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap'
  const TD  = 'px-3 py-1.5 text-right text-xs font-mono whitespace-nowrap'
  const LBL = 'px-3 py-1.5 text-xs font-medium whitespace-nowrap sticky left-0 z-10'

  function GroupRow({ name, mode, bgClass, labelClass }: {
    name: string
    mode: 'income' | 'savings' | 'signed'
    bgClass: string
    labelClass?: string
  }) {
    return (
      <tr className={`hover:brightness-95 ${bgClass}`}>
        <td className={`${LBL} ${bgClass} ${labelClass ?? 'text-gray-600 dark:text-gray-300'}`}>{name}</td>
        {yearData.map(d => {
          const v = gTotal(d, name)
          if (v === null || v === 0) {
            return <td key={d.year} className={TD}><span className="text-gray-300 dark:text-gray-600">—</span></td>
          }
          if (mode === 'income') {
            return <td key={d.year} className={`${TD} text-green-700 dark:text-green-400`}>{fmt(Math.abs(v))}</td>
          }
          if (mode === 'savings') {
            return <td key={d.year} className={`${TD} text-gray-600 dark:text-gray-300`}>{fmt(Math.abs(v))}</td>
          }
          // signed: expense groups — negative=red, positive=green (devolutions)
          if (v < 0) {
            return <td key={d.year} className={`${TD} text-red-500 dark:text-red-400`}>{fmt(v)}</td>
          }
          return <td key={d.year} className={`${TD} text-green-600 dark:text-green-400`}>+{fmt(v)}</td>
        })}
      </tr>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
              <th className={`${TH} text-left min-w-[140px] sticky left-0 z-10 bg-gray-50 dark:bg-gray-800/60`}>Categoría</th>
              {years.map(y => <th key={y} className={TH}>{y}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">

            {incomeNames.map(name => (
              <GroupRow key={name} name={name} mode="income"
                bgClass="bg-green-50/40 dark:bg-green-900/10"
                labelClass="text-green-700 dark:text-green-400"/>
            ))}

            {savingsNames.map(name => (
              <GroupRow key={name} name={name} mode="savings"
                bgClass={name === 'Ahorro' ? 'bg-amber-50/40 dark:bg-amber-900/10' : 'bg-white dark:bg-gray-900'}
                labelClass={name === 'Ahorro' ? 'text-amber-700 dark:text-amber-500 font-medium' : undefined}/>
            ))}

            {expenseNames.map(name => (
              <GroupRow key={name} name={name} mode="signed" bgClass="bg-white dark:bg-gray-900"/>
            ))}

            {/* Gasto Total */}
            <tr className="bg-blue-50/60 dark:bg-blue-900/10 border-t border-blue-100 dark:border-blue-900/20">
              <td className={`${LBL} bg-blue-50/60 dark:bg-blue-900/10 text-blue-700 dark:text-blue-400 font-semibold`}>Gasto Total</td>
              {yearData.map(d => {
                const total = expGroups(d).reduce((s, g) => s + Math.abs(g.total), 0)
                return (
                  <td key={d.year} className="px-3 py-1.5 text-right text-xs font-mono font-semibold whitespace-nowrap text-blue-700 dark:text-blue-400">
                    {total > 0 ? fmt(total) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                  </td>
                )
              })}
            </tr>

            {/* Total Neto */}
            <tr className="bg-gray-50/80 dark:bg-gray-800/40 border-t border-gray-100 dark:border-gray-700">
              <td className={`${LBL} bg-gray-50/80 dark:bg-gray-800/40 text-gray-700 dark:text-gray-200 font-semibold`}>Total Neto</td>
              {yearData.map(d => {
                const income   = d.groups.find(g => g.name === 'Ingreso')?.total ?? 0
                const expenses = expGroups(d).reduce((s, g) => s + g.total, 0)
                const savings  = savingsNames.reduce((s, n) => s + (gTotal(d, n) ?? 0), 0)
                const net      = income + expenses + savings
                return (
                  <td key={d.year} className={`px-3 py-1.5 text-right text-xs font-mono font-semibold whitespace-nowrap ${net > 0 ? 'text-green-600 dark:text-green-400' : net < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'}`}>
                    {net !== 0 ? fmt(net) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                  </td>
                )
              })}
            </tr>

          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Multi-year evolution charts ───────────────────────────────────────────────

function EvolutionLineChart({ yearData }: { yearData: AnnualData[] }) {
  const { fmtK } = useCurrency()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const names    = [...new Set(yearData.flatMap(d => expGroups(d).map(g => g.name)))]
  const colorMap: Record<string, string> = {}
  for (const d of yearData) for (const g of d.groups) colorMap[g.name] = g.color

  const chartData = yearData.map(d => {
    const row: Record<string, number | string> = { year: d.year }
    for (const name of names) {
      const g = expGroups(d).find(g => g.name === name)
      row[name] = g ? Math.abs(g.total) : 0
    }
    return row
  })

  if (!names.length) return <Empty/>
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
        <XAxis dataKey="year" {...xProps}/>
        <YAxis {...yProps(fmtK)}/>
        <Tooltip content={p => <CT {...(p as unknown as Parameters<typeof CT>[0])} fmt={v => String(Math.round(v))}/>}/>
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8}
          onClick={legendClick(setHidden)}
          formatter={legendFmt(hidden)}/>
        {names.map(name => (
          <Line key={name} type="linear" dataKey={name} stroke={colorMap[name]} strokeWidth={2}
            dot={{ r: 3, fill: colorMap[name], strokeWidth: 0 }}
            activeDot={{ r: 4, strokeWidth: 0 }} hide={hidden.has(name)} isAnimationActive={false}/>
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function EvolutionStackedChart({ yearData }: { yearData: AnnualData[] }) {
  const { fmtK } = useCurrency()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const expNames = [...new Set(yearData.flatMap(d => expGroups(d).map(g => g.name)))]
  const colorMap: Record<string, string> = {}
  for (const d of yearData) for (const g of d.groups) colorMap[g.name] = g.color

  const chartData = yearData.map(d => {
    const row: Record<string, number | string> = { year: d.year }
    for (const name of expNames) {
      const g = expGroups(d).find(g => g.name === name)
      row[name] = g ? Math.abs(g.total) : 0
    }
    const inc = d.groups.find(g => g.name === 'Ingreso')
    row['Ingreso'] = inc ? Math.abs(inc.total) : 0
    return row
  })

  if (!expNames.length) return <Empty/>
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
        <XAxis dataKey="year" {...xProps}/>
        <YAxis {...yProps(fmtK)}/>
        <Tooltip content={p => <CT {...(p as unknown as Parameters<typeof CT>[0])} fmt={v => String(Math.round(v))}/>}/>
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8}
          onClick={legendClick(setHidden)}
          formatter={legendFmt(hidden)}/>
        {expNames.map(name => (
          <Bar key={name} dataKey={name} fill={colorMap[name]} stackId="exp"
            maxBarSize={60} hide={hidden.has(name)} isAnimationActive={false}/>
        ))}
        <Line dataKey="Ingreso" name="Ingreso" stroke="#22c55e" strokeWidth={2.5} type="linear"
          dot={{ r: 4, fill: '#22c55e', strokeWidth: 0 }}
          activeDot={{ r: 5, strokeWidth: 0 }} hide={hidden.has('Ingreso')} isAnimationActive={false}/>
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Comparaciones() {
  const [yearA,       setYearA]       = useState(CUR_YEAR - 1)
  const [yearB,       setYearB]       = useState(CUR_YEAR)
  const [kind,        setKind]        = useState<ChartKind>('expenses-group')
  const [mode,        setMode]        = useState<ViewMode>('side')
  const [period,      setPeriod]      = useState<'year' | 'month'>('year')
  const [month,       setMonth]       = useState(new Date().getMonth())
  const [displayType, setDisplayType] = useState<DisplayType>('line')

  const { data: rawA } = useQuery({ queryKey: ['annual', yearA], queryFn: () => getAnnualStats(yearA) })
  const { data: rawB } = useQuery({ queryKey: ['annual', yearB], queryFn: () => getAnnualStats(yearB) })

  const allYearQueries = useQueries({
    queries: YEARS.map(y => ({ queryKey: ['annual', y], queryFn: () => getAnnualStats(y) })),
  })

  const sortedYearData = useMemo(() =>
    YEARS
      .map((_, i) => allYearQueries[i]?.data as AnnualData | undefined)
      .filter((d): d is AnnualData => !!d && d.groups.some(g => Math.abs(g.total) > 0))
      .sort((a, b) => a.year - b.year),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allYearQueries.map(q => q.dataUpdatedAt).join(',')]
  )

  const dA = rawA as AnnualData | undefined
  const dB = rawB as AnnualData | undefined

  const canOverlay    = kind !== 'distribution'
  const effectiveMode = canOverlay ? mode : 'side'
  const distMonthIdx  = kind === 'distribution' && period === 'month' ? month : undefined

  const selCls = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${active
      ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`

  const tabCls = (active: boolean) =>
    `flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${active
      ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-800 dark:text-gray-100'
      : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`

  function renderSide(d: AnnualData) {
    switch (kind) {
      case 'expenses-group': return <SideExpGroupChart data={d} displayType={displayType}/>
      case 'expenses-total': return <SideExpTotalChart data={d} displayType={displayType}/>
      case 'income':         return <SideIncomeChart   data={d} displayType={displayType}/>
      case 'net':            return <SideNetChart data={d}/>
      case 'distribution':   return <SideDistChart data={d} monthIdx={distMonthIdx}/>
    }
  }

  function renderOverlay() {
    if (!dA || !dB) return null
    switch (kind) {
      case 'expenses-group': return <OvExpGroupChart dA={dA} dB={dB} yA={yearA} yB={yearB} displayType={displayType}/>
      case 'expenses-total':
      case 'income':
      case 'net': return <OvBarChart dA={dA} dB={dB} yA={yearA} yB={yearB} kind={kind}/>
      default:    return null
    }
  }

  const dotA = '#3b82f6', dotB = '#f97316'
  const sep  = <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 shrink-0"/>

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Comparaciones</h1>

      {/* Controls */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">

        {/* Chart type */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {CHART_OPTIONS.map(o => (
            <button key={o.id} onClick={() => { setKind(o.id); if (o.id !== 'distribution') setPeriod('year') }}
              className={selCls(kind === o.id)}>
              {o.label}
            </button>
          ))}
        </div>

        {sep}

        {/* Display type toggle (not for distribution/net) */}
        {kind !== 'distribution' && kind !== 'net' && (
          <>
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button onClick={() => setDisplayType('line')} className={tabCls(displayType === 'line')}>
                <Activity className="w-3.5 h-3.5"/> Líneas
              </button>
              <button onClick={() => setDisplayType('bar')} className={tabCls(displayType === 'bar')}>
                <BarChart2 className="w-3.5 h-3.5"/> Columnas
              </button>
              <button onClick={() => setDisplayType('area')} className={tabCls(displayType === 'area')}>
                <TrendingUp className="w-3.5 h-3.5"/> Área
              </button>
            </div>
            {sep}
          </>
        )}

        {/* Year pickers */}
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dotA }}/>
          <select value={yearA} onChange={e => setYearA(+e.target.value)}
            className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none">
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dotB }}/>
          <select value={yearB} onChange={e => setYearB(+e.target.value)}
            className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none">
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {sep}

        {/* Period selector — distribution only */}
        {kind === 'distribution' && (
          <>
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button onClick={() => setPeriod('year')}  className={tabCls(period === 'year')}>Año completo</button>
              <button onClick={() => setPeriod('month')} className={tabCls(period === 'month')}>Mes</button>
            </div>
            {period === 'month' && (
              <select value={month} onChange={e => setMonth(+e.target.value)}
                className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none">
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            )}
            {sep}
          </>
        )}

        {/* Mode toggle */}
        <div className={`flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 ${!canOverlay ? 'opacity-40 pointer-events-none' : ''}`}>
          <button onClick={() => setMode('side')} className={tabCls(effectiveMode === 'side')}>
            <Columns2 className="w-3.5 h-3.5"/> Lado a lado
          </button>
          <button onClick={() => setMode('overlay')} className={tabCls(effectiveMode === 'overlay')}>
            <Layers className="w-3.5 h-3.5"/> Superponer
          </button>
        </div>
      </div>

      {/* Chart area */}
      {effectiveMode === 'side' ? (
        <div className="flex gap-4">
          <YearCard year={yearA} colorDot={dotA} subtitle={distMonthIdx !== undefined ? MONTHS_ES[distMonthIdx].replace(/^\w/, c => c.toUpperCase()) : undefined}>
            {dA ? renderSide(dA) : <div className="h-64 flex items-center justify-center text-gray-300 text-sm">Cargando…</div>}
          </YearCard>
          <YearCard year={yearB} colorDot={dotB} subtitle={distMonthIdx !== undefined ? MONTHS_ES[distMonthIdx].replace(/^\w/, c => c.toUpperCase()) : undefined}>
            {dB ? renderSide(dB) : <div className="h-64 flex items-center justify-center text-gray-300 text-sm">Cargando…</div>}
          </YearCard>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4">
          <div className="flex items-center gap-4 mb-3">
            {[{ year: yearA, color: dotA }, { year: yearB, color: dotB }].map(({ year, color }) => (
              <div key={year} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }}/>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{year}</span>
              </div>
            ))}
          </div>
          {dA && dB ? renderOverlay() : <div className="h-64 flex items-center justify-center text-gray-300 text-sm">Cargando…</div>}
        </div>
      )}

      {/* Multi-year section */}
      {sortedYearData.length >= 1 && (<>
        <h2 className="text-lg font-bold text-gray-800 dark:text-white pt-2">Evolución anual</h2>

        <SummaryTable yearData={sortedYearData}/>

        {sortedYearData.length >= 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Evolución Anual Gastos</h3>
              <EvolutionLineChart yearData={sortedYearData}/>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Evolución Anual</h3>
              <EvolutionStackedChart yearData={sortedYearData}/>
            </div>
          </div>
        )}
      </>)}
    </div>
  )
}
