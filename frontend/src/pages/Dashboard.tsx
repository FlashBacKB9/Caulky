import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { getDashboard, getAnnualStats } from '../api/stats'
import { getAccountsSummary, type Account } from '../api/accounts'
import { getMovements, type Movement } from '../api/movements'
import { getMovementTypes, type MovementType } from '../api/movementTypes'
import { getGroups, type Group as ApiGroup } from '../api/groups'
import {
  CreditCard, ArrowUpRight, ArrowDownRight, type LucideIcon,
  Plus, X, BarChart2, PieChart as PieIcon, TrendingUp,
  GripVertical, ChartCandlestick, Check, Landmark,
  ChevronDown, ChevronLeft, ChevronRight,
} from 'lucide-react'
import AppIcon from '../components/AppIcon'
import { useCurrency } from '../hooks/useCurrency'
import {
  useDashboardConfig, DEFAULT_DASHBOARD_CONFIG, type DashboardWidget,
} from '../hooks/useDashboardConfig'
import { applyAdvancedFilter, type AdvancedFilter } from '../components/FilterPanel'
import {
  ResponsiveContainer,
  LineChart, Line,
  AreaChart, Area,
  BarChart, Bar,
  ComposedChart,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid, ReferenceArea, ReferenceLine,
} from 'recharts'

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS_FULL  = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const EXCLUDE_GROUPS  = new Set(['Ingreso','Total','Ahorro','Gastos Anuales','Inversión'])
const BALANCE_EXCLUDE = new Set(['Total','Ahorro','Gastos Anuales','Inversión'])
const COL_CLS = ['','col-span-1','col-span-2','col-span-3','col-span-4'] as const
const GRID_CLR = '#e5e7eb'

// ── Stat panels ───────────────────────────────────────────────────────────────

function StaticPanel({ title, value, color, Icon }: {
  title: string; value: number; color: string; Icon: LucideIcon
}) {
  const { fmt } = useCurrency()
  return (
    <div className="h-full bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col">
      <div className="px-5 pt-4 pb-3 border-b border-gray-50 dark:border-gray-800">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{title}</h2>
      </div>
      <div className="flex-1 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: color + '20' }}>
            <Icon className="w-5 h-5" style={{ color }} strokeWidth={1.5} />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums leading-tight" style={{ color }}>
            {fmt(value)}
          </p>
        </div>
      </div>
    </div>
  )
}

function CyclingPanel({ accounts }: { accounts: Account[] }) {
  const { fmt } = useCurrency()
  const [idx, setIdx] = useState(0)
  const current = accounts[idx]
  if (!current) return null
  return (
    <button
      onClick={() => setIdx(i => (i + 1) % accounts.length)}
      className="h-full w-full bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col text-left hover:shadow-md transition-shadow"
    >
      <div className="px-5 pt-4 pb-3 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{current.name}</h2>
        <div className="flex gap-1">
          {accounts.map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: i === idx ? current.color : '#d1d5db' }} />
          ))}
        </div>
      </div>
      <div className="flex-1 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: current.color + '20' }}>
            <AppIcon name={current.icon} className="w-5 h-5" style={{ color: current.color }} strokeWidth={1.5} />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums leading-tight" style={{ color: current.color }}>
            {fmt(current.balance)}
          </p>
        </div>
      </div>
    </button>
  )
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string
}) {
  const { fmt } = useCurrency()
  if (!active || !payload?.length) return null
  const sorted = [...payload].sort((a, b) => b.value - a.value)
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-lg px-4 py-3 text-sm min-w-[160px]">
      <p className="font-semibold text-gray-600 dark:text-gray-300 mb-2">{label}</p>
      {sorted.map(e => (
        <div key={e.name} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
            <span className="text-gray-600 dark:text-gray-400 truncate max-w-[120px]">{e.name}</span>
          </div>
          <span className="font-mono tabular-nums text-gray-800 dark:text-gray-100">{fmt(e.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Dashboard-native chart components ─────────────────────────────────────────

interface Group { name: string; color: string; monthly: Record<string, number>; total: number }

function ExpensesLineChart({ groups, year, height = 300 }: { groups: Group[]; year: number; height?: number }) {
  const { fmtK } = useCurrency()
  const [refLeft, setRefLeft]   = useState('')
  const [refRight, setRefRight] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null)
  const [hidden, setHidden]     = useState<Set<string>>(new Set())

  const curMonth    = new Date().getFullYear() === year ? new Date().getMonth() : 11
  const expGroups   = groups.filter(g => !EXCLUDE_GROUPS.has(g.name)).filter(g => Object.values(g.monthly).some(v => v !== 0))
  const allData     = MONTHS_FULL.slice(0, curMonth + 1).map((month, i) => {
    const e: Record<string, number | string> = { month: MONTHS_SHORT[i] }
    for (const g of expGroups) e[g.name] = Math.abs(g.monthly[month] ?? 0)
    return e
  })
  const chartData   = zoomRange ? allData.slice(zoomRange[0], zoomRange[1] + 1) : allData

  const applyZoom = () => {
    if (!refLeft || !refRight || refLeft === refRight) { setRefLeft(''); setRefRight(''); setSelecting(false); return }
    let l = allData.findIndex(d => d.month === refLeft), r = allData.findIndex(d => d.month === refRight)
    if (l > r) [l, r] = [r, l]
    setZoomRange([l, r]); setRefLeft(''); setRefRight(''); setSelecting(false)
  }

  if (!expGroups.length) return (
    <div className="flex items-center justify-center h-48 text-gray-300 dark:text-gray-600 text-sm">Sin datos de gastos</div>
  )
  return (
    <div>
      {zoomRange && (
        <div className="flex justify-end mb-2">
          <button onClick={() => setZoomRange(null)} className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1">
            Restablecer zoom
          </button>
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
          onMouseDown={e => { if (e?.activeLabel) { setRefLeft(String(e.activeLabel)); setSelecting(true) } }}
          onMouseMove={e => { if (selecting && e?.activeLabel) setRefRight(String(e.activeLabel)) }}
          onMouseUp={applyZoom}
          style={{ cursor: selecting ? 'crosshair' : 'default', userSelect: 'none' }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDataOverflow />
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={42} allowDataOverflow />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} iconType="circle" iconSize={8}
            onClick={e => { const k = e.dataKey as string; setHidden(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n }) }}
            formatter={(v: string) => <span style={{ color: hidden.has(v) ? '#d1d5db' : undefined, cursor: 'pointer' }}>{v}</span>}
          />
          {expGroups.map(g => (
            <Line key={g.name} type="linear" dataKey={g.name} stroke={g.color} strokeWidth={2} dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false}
              hide={hidden.has(g.name)} strokeOpacity={hidden.has(g.name) ? 0 : 1}
            />
          ))}
          {selecting && refLeft && refRight && (
            <ReferenceArea x1={refLeft} x2={refRight} fill="#6366f1" fillOpacity={0.08} stroke="#6366f1" strokeOpacity={0.3} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function ExpensesPieChart({ groups, height = 200 }: { groups: Group[]; height?: number }) {
  const { fmt } = useCurrency()
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const [cursor, setCursor]       = useState({ x: 0, y: 0 })
  const wrapRef = useRef<HTMLDivElement>(null)

  const slices = groups
    .filter(g => !EXCLUDE_GROUPS.has(g.name) && !BALANCE_EXCLUDE.has(g.name))
    .map(g => ({ name: g.name, value: Math.abs(g.total), color: g.color }))
    .filter(s => s.value > 0).sort((a, b) => b.value - a.value)

  if (!slices.length) return <div className="flex items-center justify-center h-full text-gray-300 dark:text-gray-600 text-sm">Sin datos</div>
  const active = activeIdx !== null ? slices[activeIdx] : null

  return (
    <div ref={wrapRef} className="relative flex flex-col h-full"
      onMouseMove={e => { const r = wrapRef.current?.getBoundingClientRect(); if (r) setCursor({ x: e.clientX - r.left, y: e.clientY - r.top }) }}
    >
      {active && (
        <div className="absolute z-10 pointer-events-none bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-lg px-3 py-2 text-sm"
          style={{ left: cursor.x + 14, top: cursor.y - 38 }}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: active.color }} />
            <span className="text-gray-700 dark:text-gray-300">{active.name}</span>
            <span className="font-mono tabular-nums font-semibold text-gray-800 dark:text-gray-100 ml-1">{fmt(active.value)}</span>
          </div>
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={slices} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={2}
            onMouseEnter={(_, i) => setActiveIdx(i)} onMouseLeave={() => setActiveIdx(null)}
          >
            {slices.map((s, i) => (
              <Cell key={s.name} fill={s.color} opacity={activeIdx === null || activeIdx === i ? 1 : 0.35} stroke="none" />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 px-2 pb-1">
        {slices.map((s, i) => (
          <div key={s.name} className="flex items-center gap-1.5 cursor-default transition-opacity"
            style={{ opacity: activeIdx === null || activeIdx === i ? 1 : 0.35 }}
            onMouseEnter={() => setActiveIdx(i)} onMouseLeave={() => setActiveIdx(null)}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-[11px] text-gray-600 dark:text-gray-400">{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BalanceEvolutionChart({ groups, year, initialTotal, height = 260 }: { groups: Group[]; year: number; initialTotal: number; height?: number }) {
  const { fmtK } = useCurrency()
  const curMonth  = new Date().getFullYear() === year ? new Date().getMonth() : 11
  const netGroups = groups.filter(g => !BALANCE_EXCLUDE.has(g.name) && g.name !== 'Total')
  let running = initialTotal
  const chartData = MONTHS_FULL.slice(0, curMonth + 1).map((month, i) => {
    const net = netGroups.reduce((s, g) => s + (g.monthly[month] ?? 0), 0)
    running += net
    return { month: MONTHS_SHORT[i], balance: Math.round(running * 100) / 100 }
  })
  const min = Math.min(...chartData.map(d => d.balance))
  const max = Math.max(...chartData.map(d => d.balance))
  const pad = (max - min) * 0.1 || 100
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={48} domain={[min - pad, max + pad]} />
        <Tooltip content={<ChartTooltip />}/>
        <Area type="linear" dataKey="balance" stroke="#3b82f6" strokeWidth={2} fill="url(#balanceGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: '#3b82f6' }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Account balance history helpers ──────────────────────────────────────────

function buildAccountHistory(
  acc: Account,
  sorted: Movement[],
  typeById: Record<number, MovementType>,
): { label: string; balance: number }[] {
  if (sorted.length === 0) return []
  const firstDate = new Date((sorted[0].bank_date ?? sorted[0].date) + 'T00:00:00')
  const now = new Date()
  let bal = acc.initial_balance
  let mi = 0
  const result: { label: string; balance: number }[] = []
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
      result.push({ label: `${MONTHS_SHORT[m]} ${String(y).slice(2)}`, balance: Math.round(bal * 100) / 100 })
    }
  }
  return result
}

function BalanceLineChart({ data, lines, height }: {
  data: Record<string, number | string>[]
  lines: { key: string; color: string }[]
  height: number
}) {
  const { fmtK } = useCurrency()
  const allVals = data.flatMap(d => lines.map(l => d[l.key] as number)).filter(v => typeof v === 'number')
  const minV = allVals.length ? Math.min(...allVals) : 0
  const maxV = allVals.length ? Math.max(...allVals) : 0
  const pad  = (maxV - minV) * 0.1 || 100
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={48} domain={[minV - pad, maxV + pad]} />
        <Tooltip content={<ChartTooltip />}/>
        <ReferenceLine y={0} stroke="#f3f4f6" strokeWidth={1} />
        {lines.length > 1 && <Legend />}
        {lines.map(l => (
          <Line key={l.key} type="linear" dataKey={l.key} stroke={l.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: l.color }} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// All accounts multi-line
function AccountBalanceHistoryChart({ accounts, movements, movementTypes, height = 260 }: {
  accounts: Account[]
  movements: Movement[]
  movementTypes: MovementType[]
  height?: number
}) {
  const typeById = useMemo(() => Object.fromEntries(movementTypes.map(t => [t.id, t])), [movementTypes])
  const sorted   = useMemo(() => [...movements].sort((a, b) => (a.bank_date ?? a.date).localeCompare(b.bank_date ?? b.date)), [movements])

  const { data, lines } = useMemo(() => {
    if (accounts.length === 0 || sorted.length === 0) return { data: [], lines: [] }
    const histories = accounts.map(acc => ({ acc, rows: buildAccountHistory(acc, sorted, typeById) }))
    const labels = histories[0].rows.map(r => r.label)
    const chartData = labels.map((label, i) => {
      const entry: Record<string, number | string> = { label }
      for (const { acc, rows } of histories) entry[acc.name] = rows[i]?.balance ?? 0
      return entry
    })
    return { data: chartData, lines: accounts.map(a => ({ key: a.name, color: a.color })) }
  }, [accounts, sorted, typeById])

  return <BalanceLineChart data={data} lines={lines} height={height} />
}

// Combined total single line
function CombinedBalanceHistoryChart({ accounts, movements, movementTypes, height = 260 }: {
  accounts: Account[]
  movements: Movement[]
  movementTypes: MovementType[]
  height?: number
}) {
  const typeById = useMemo(() => Object.fromEntries(movementTypes.map(t => [t.id, t])), [movementTypes])
  const sorted   = useMemo(() => [...movements].sort((a, b) => (a.bank_date ?? a.date).localeCompare(b.bank_date ?? b.date)), [movements])

  const { data } = useMemo(() => {
    if (accounts.length === 0 || sorted.length === 0) return { data: [] }
    const histories = accounts.map(acc => buildAccountHistory(acc, sorted, typeById))
    const labels = histories[0].map(r => r.label)
    const chartData = labels.map((label, i) => ({
      label,
      Total: Math.round(histories.reduce((s, h) => s + (h[i]?.balance ?? 0), 0) * 100) / 100,
    }))
    return { data: chartData }
  }, [accounts, sorted, typeById])

  return <BalanceLineChart data={data} lines={[{ key: 'Total', color: '#3b82f6' }]} height={height} />
}

// Cycling: one account at a time, arrows to switch
function CyclingBalanceHistoryChart({ accounts, movements, movementTypes, height = 260 }: {
  accounts: Account[]
  movements: Movement[]
  movementTypes: MovementType[]
  height?: number
}) {
  const { fmt } = useCurrency()
  const [idx, setIdx] = useState(0)
  const typeById = useMemo(() => Object.fromEntries(movementTypes.map(t => [t.id, t])), [movementTypes])
  const sorted   = useMemo(() => [...movements].sort((a, b) => (a.bank_date ?? a.date).localeCompare(b.bank_date ?? b.date)), [movements])

  const safeIdx = Math.min(idx, Math.max(0, accounts.length - 1))
  const acc     = accounts[safeIdx]

  const chartData = useMemo(() => {
    if (!acc || sorted.length === 0) return []
    return buildAccountHistory(acc, sorted, typeById).map(r => ({ label: r.label, [acc.name]: r.balance }))
  }, [acc, sorted, typeById])

  if (!acc) return null

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setIdx(i => (i + 1) % accounts.length)}
          className="text-center flex-1 hover:opacity-70 transition-opacity cursor-pointer">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: acc.color }}>{acc.name}</p>
          <p className="text-lg font-bold text-gray-800 dark:text-white tabular-nums">{fmt(acc.balance)}</p>
        </button>
        <div className="flex gap-1 shrink-0 ml-3">
          {accounts.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === safeIdx ? 'opacity-100' : 'opacity-30'}`}
              style={{ backgroundColor: accounts[i].color }} />
          ))}
        </div>
      </div>
      <div className="flex-1">
        <BalanceLineChart data={chartData} lines={[{ key: acc.name, color: acc.color }]} height={height - 60} />
      </div>
    </div>
  )
}

// ── ResizableWrapper (same pattern as Charts.tsx) ─────────────────────────────

function ResizableWrapper({ colSpan, height, onUpdateColSpan, onUpdateHeight, isDragging, isDragOver,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd, children }: {
  colSpan: number; height?: number
  onUpdateColSpan: (n: number) => void
  onUpdateHeight?: (h: number) => void
  isDragging: boolean; isDragOver: boolean
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: () => void; onDragEnd: () => void
  children: (chartH: number, onGripMouseDown: () => void) => React.ReactNode
}) {
  const wrapRef    = useRef<HTMLDivElement>(null)
  const gripActive = useRef(false)
  const [liveH, setLiveH] = useState<number | null>(null)
  const chartH = liveH ?? height ?? 300
  const colCls = COL_CLS[colSpan] ?? 'col-span-2'
  // Row span is derived from chart height: every 300px = 1 row
  const effectiveRowSpan = onUpdateHeight ? Math.max(1, Math.ceil(chartH / 300)) : 1
  const rowStyle = effectiveRowSpan > 1 ? { gridRow: `span ${effectiveRowSpan}` } : undefined

  function onGripMouseDown() { gripActive.current = true }
  function handleDragStart(e: React.DragEvent) {
    if (!gripActive.current) { e.preventDefault(); return }
    gripActive.current = false; e.dataTransfer.effectAllowed = 'move'; onDragStart()
  }
  function handleDragEnd() { gripActive.current = false; onDragEnd() }

  function startHeightResize(e: React.MouseEvent) {
    e.preventDefault()
    const startY = e.clientY, startH = chartH
    const move = (ev: MouseEvent) => setLiveH(Math.max(150, Math.min(900, startH + ev.clientY - startY)))
    const up   = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up)
      setLiveH(null); onUpdateHeight?.(Math.max(150, Math.min(900, startH + ev.clientY - startY)))
    }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }

  function startWidthResize(e: React.MouseEvent) {
    e.preventDefault()
    const el = wrapRef.current; if (!el) return
    const startX = e.clientX, gridW = el.parentElement?.clientWidth ?? 800, colW = gridW / 4
    const move = (ev: MouseEvent) => { el.style.gridColumn = `span ${Math.max(1, Math.min(4, Math.round((colSpan * colW + ev.clientX - startX) / colW)))}` }
    const up   = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up)
      el.style.gridColumn = ''; onUpdateColSpan(Math.max(1, Math.min(4, Math.round((colSpan * colW + ev.clientX - startX) / colW))))
    }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }

  return (
    <div ref={wrapRef} draggable style={rowStyle}
      className={`relative ${colCls} ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'ring-2 ring-blue-400 rounded-2xl' : ''} transition-opacity`}
      onDragStart={handleDragStart} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onDragEnd={handleDragEnd}
    >
      {children(chartH, onGripMouseDown)}
      {onUpdateHeight && (
        <div className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize group z-10" onMouseDown={startHeightResize}>
          <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-gray-200 dark:bg-gray-700 group-hover:bg-blue-400 transition-colors" />
        </div>
      )}
      <div className="absolute right-0 top-0 bottom-0 w-2 cursor-e-resize group z-10" onMouseDown={startWidthResize}>
        <div className="absolute right-0.5 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-gray-200 dark:bg-gray-700 group-hover:bg-blue-400 transition-colors" />
      </div>
    </div>
  )
}

// ── Budget types & helpers ────────────────────────────────────────────────────

interface BudgetVersion { id: string; amount: number; effectiveFrom: string }
interface StoredBudget {
  id: string; name: string; typeIds: number[]
  period: 'monthly' | 'weekly' | 'annual' | 'custom'
  customFrom?: string; customTo?: string; trackingStart?: string | null
  versions: BudgetVersion[]
}

function genId()    { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
function todayStr() { return new Date().toLocaleDateString('en-CA') }

function getBudgetPeriod(b: StoredBudget, ref: Date = new Date()): { start: string; end: string } {
  if (b.period === 'monthly') {
    const y = ref.getFullYear(), m = ref.getMonth()
    return {
      start: new Date(y, m, 1).toLocaleDateString('en-CA'),
      end:   new Date(y, m + 1, 0).toLocaleDateString('en-CA'),
    }
  }
  if (b.period === 'annual') return { start: `${ref.getFullYear()}-01-01`, end: `${ref.getFullYear()}-12-31` }
  if (b.period === 'weekly') {
    const now = new Date()
    const day = now.getDay(), diff = day === 0 ? -6 : 1 - day
    const mon = new Date(now); mon.setDate(now.getDate() + diff)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return { start: mon.toLocaleDateString('en-CA'), end: sun.toLocaleDateString('en-CA') }
  }
  const today = todayStr()
  return { start: b.customFrom ?? today, end: b.customTo ?? today }
}

function getBudgetLimit(versions: BudgetVersion[], date: string): number {
  if (!versions.length) return 0
  let r = versions[0].amount
  for (const v of versions) { if (v.effectiveFrom <= date) r = v.amount; else break }
  return r
}

function calcBudgetSpent(movements: Movement[], typeIds: Set<number>, start: string, end: string): number {
  return movements
    .filter(mv => mv.movement_type_id != null && typeIds.has(mv.movement_type_id) && mv.date >= start && mv.date <= end)
    .reduce((s, mv) => s + Math.abs(mv.dinero), 0)
}

function budgetPctColors(pct: number) {
  if (pct >= 100) return { bar: 'bg-red-500',    text: 'text-red-600 dark:text-red-400' }
  if (pct >= 90)  return { bar: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400' }
  if (pct >= 70)  return { bar: 'bg-yellow-500', text: 'text-yellow-600 dark:text-yellow-400' }
  return               { bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' }
}

function budgetPeriodLabel(b: StoredBudget, start: string, end: string): string {
  if (b.period === 'monthly') {
    const [y, m] = start.split('-').map(Number)
    return `${MONTHS_SHORT[m - 1]} ${y}`
  }
  if (b.period === 'annual')  return start.slice(0, 4)
  return `${start.slice(5)} → ${end.slice(5)}`
}

function readBudgets(): StoredBudget[] {
  try { return JSON.parse(localStorage.getItem('spendly-budgets') ?? '[]') } catch { return [] }
}
function writeBudgets(b: StoredBudget[]) { localStorage.setItem('spendly-budgets', JSON.stringify(b)) }

// ── Custom chart support ──────────────────────────────────────────────────────

interface CustomChartDef {
  id: string; title: string; colSpan: number; year: number | null
  filter: AdvancedFilter; sign: 'all' | 'expense' | 'income'
  xAxis: 'month' | 'year' | 'none'; splitBy: 'none' | 'group' | 'type' | 'account'
  metric: 'sum' | 'count'; defaultDisplay: 'bar' | 'line' | 'area' | 'donut' | 'pie'
  defaultColor: string
  overrides: { key: string; display: 'bar' | 'line' | 'area' | 'hidden'; color: string; label: string; stacked?: boolean }[]
  yMax?: number; lineType?: 'monotone' | 'linear'; height?: number
  dataSource?: 'movements' | 'accounts'; displayMode?: 'bar' | 'line' | 'area' | null
}
interface ComputedSeries {
  key: string; label: string; color: string; display: 'bar' | 'line' | 'area' | 'hidden'; stacked: boolean
}

function readCustomCharts(): CustomChartDef[] {
  try { return JSON.parse(localStorage.getItem('spendly-custom-charts-v2') ?? '[]') } catch { return [] }
}

function buildMonthSeriesD(movements: Movement[], year: number | null) {
  if (year !== null) {
    const cut = year < new Date().getFullYear() ? 11 : new Date().getMonth()
    return Array.from({ length: cut + 1 }, (_, i) => ({ key: String(i), label: MONTHS_SHORT[i] }))
  }
  const seen = [...new Set(movements.map(m => m.date.slice(0, 7)))].sort()
  return seen.map(ym => ({ key: ym, label: `${MONTHS_SHORT[+ym.slice(5,7)-1]} '${ym.slice(2,4)}` }))
}
function mvMonthKeyD(mv: Movement, year: number | null): string {
  return year !== null ? String(+mv.date.slice(5, 7) - 1) : mv.date.slice(0, 7)
}

function computeChartData(
  def: CustomChartDef, movements: Movement[],
  typeToGroup: Record<number, number>, groupById: Record<number, ApiGroup>,
  typeById: Record<number, MovementType>, accountById: Record<number, Account>,
): { data: Record<string, unknown>[]; series: ComputedSeries[] } {
  const overrideMap = Object.fromEntries(def.overrides.map(o => [o.key, o]))
  function seriesKey(mv: Movement): string | null {
    if (def.splitBy === 'none')    return '__total__'
    if (def.splitBy === 'group')   { const g = typeToGroup[mv.movement_type_id ?? -1]; return g ? String(g) : null }
    if (def.splitBy === 'type')    return mv.movement_type_id ? String(mv.movement_type_id) : null
    return mv.account_id ? String(mv.account_id) : null
  }
  function baseInfo(key: string): { label: string; color: string } {
    if (key === '__total__') return { label: def.sign === 'expense' ? 'Gastos' : def.sign === 'income' ? 'Ingresos' : 'Total', color: def.defaultColor }
    if (def.splitBy === 'group') return { label: groupById[+key]?.name ?? '?', color: groupById[+key]?.color ?? '#6b7280' }
    if (def.splitBy === 'type')  return { label: typeById[+key]?.name ?? '?', color: typeById[+key]?.color ?? '#6b7280' }
    return                             { label: accountById[+key]?.name ?? '?', color: accountById[+key]?.color ?? '#6b7280' }
  }
  function makeSeries(key: string): ComputedSeries {
    const info = baseInfo(key); const ov = overrideMap[key]
    const fallback = (def.defaultDisplay === 'donut' || def.defaultDisplay === 'pie') ? 'bar' : def.defaultDisplay
    return { key, label: ov?.label ?? info.label, color: ov?.color ?? info.color, display: ov?.display ?? fallback, stacked: ov?.stacked ?? false }
  }
  const val = (mv: Movement) => def.metric === 'count' ? 1 : Math.abs(mv.dinero)
  const keyOrder: string[] = []; const keySeen = new Set<string>()
  for (const mv of movements) { const k = seriesKey(mv); if (k && !keySeen.has(k)) { keySeen.add(k); keyOrder.push(k) } }
  if (def.xAxis === 'none') {
    const byKey: Record<string, number> = {}
    for (const mv of movements) { const k = seriesKey(mv); if (k) byKey[k] = (byKey[k] ?? 0) + val(mv) }
    const data = keyOrder.map(key => {
      const info = baseInfo(key); const ov = overrideMap[key]
      return { name: ov?.label ?? info.label, value: byKey[key] ?? 0, color: ov?.color ?? info.color }
    }).sort((a, b) => (b.value as number) - (a.value as number))
    return { data, series: keyOrder.map(makeSeries) }
  }
  const isYear = def.xAxis === 'year'
  const xBuckets = isYear
    ? [...new Set(movements.map(mv => mv.date.slice(0, 4)))].sort().map(y => ({ key: y, label: y }))
    : buildMonthSeriesD(movements, def.year)
  const byBucket: Record<string, Record<string, number>> = {}
  for (const { key } of xBuckets) byBucket[key] = {}
  for (const mv of movements) {
    const bucket = isYear ? mv.date.slice(0, 4) : mvMonthKeyD(mv, def.year)
    const k = seriesKey(mv)
    if (!k || !byBucket[bucket]) continue
    byBucket[bucket][k] = (byBucket[bucket][k] ?? 0) + val(mv)
  }
  const data = xBuckets.map(({ key, label }) => ({ x: label, ...Object.fromEntries(keyOrder.map(k => [k, byBucket[key]?.[k] ?? 0])) }))
  return { data, series: keyOrder.map(makeSeries) }
}

// ── DashboardBuiltinChart ─────────────────────────────────────────────────────

function DashboardBuiltinChart({ chartId, allMvs, apiGroups, types, height, period, selDate }: {
  chartId: string; allMvs: Movement[]; apiGroups: ApiGroup[]; types: MovementType[]
  height: number; period: 'month' | 'year'; selDate: { year: number; month: number }
}) {
  const { fmtK } = useCurrency()
  const curYear  = selDate.year
  const curMonth = selDate.month

  const typeToGroup = useMemo(() => Object.fromEntries(types.map(t => [t.id, t.income_expense_group_id])), [types])
  const groupById   = useMemo(() => Object.fromEntries(apiGroups.map(g => [g.id, g])), [apiGroups])
  const typeById    = useMemo(() => Object.fromEntries(types.map(t => [t.id, t])), [types])

  const filtered = useMemo(() => {
    if (period === 'month') {
      const ym = `${curYear}-${String(curMonth + 1).padStart(2, '0')}`
      return allMvs.filter(m => m.date.startsWith(ym))
    }
    return allMvs.filter(m => m.date.startsWith(String(curYear)))
  }, [allMvs, period, curYear, curMonth])

  const year = curYear
  const series = useMemo(() => buildMonthSeriesD(filtered, year), [filtered, year])

  if (chartId === 'charts-monthly') {
    const m: Record<string, { income: number; expense: number }> = {}
    for (const { key } of series) m[key] = { income: 0, expense: 0 }
    for (const mv of filtered) { const k = mvMonthKeyD(mv, year); if (m[k]) { if (mv.dinero >= 0) m[k].income += mv.dinero; else m[k].expense += Math.abs(mv.dinero) } }
    const data = series.map(({ key, label }) => ({ month: label, ...m[key] }))
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_CLR} vertical={false}/>
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}/>
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={52}/>
          <Tooltip content={<ChartTooltip />}/>
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }}/>
          <Bar dataKey="income" name="Ingresos" fill="#22c55e" radius={[4,4,0,0]} maxBarSize={40}/>
          <Bar dataKey="expense" name="Gastos" fill="#ef4444" radius={[4,4,0,0]} maxBarSize={40}/>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (chartId === 'charts-net') {
    const m: Record<string, number> = {}
    for (const { key } of series) m[key] = 0
    for (const mv of filtered) { const k = mvMonthKeyD(mv, year); if (k in m) m[k] += mv.dinero }
    const data = series.map(({ key, label }) => ({ month: label, net: m[key] }))
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} barCategoryGap="35%">
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_CLR} vertical={false}/>
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}/>
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={52}/>
          <Tooltip content={<ChartTooltip />}/>
          <Bar dataKey="net" name="Neto" radius={[4,4,0,0]} maxBarSize={40}>
            {data.map((d, i) => <Cell key={i} fill={d.net >= 0 ? '#22c55e' : '#ef4444'}/>)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (chartId === 'charts-cumulative') {
    let acc = 0
    const data = [...filtered].filter(m => !m.no_count).sort((a, b) => a.date.localeCompare(b.date))
      .map(mv => { acc += mv.dinero; return { label: mv.date.slice(5), balance: Math.round(acc * 100) / 100 } })
    if (!data.length) return <div className="flex items-center justify-center text-gray-300 text-sm" style={{ height }}>Sin datos</div>
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data}>
          <defs><linearGradient id="cumGradD" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_CLR} vertical={false}/>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={52}/>
          <Tooltip content={<ChartTooltip />}/>
          <Area type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2} fill="url(#cumGradD)" dot={false}/>
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  if (chartId === 'charts-expdnt') {
    const s: Record<number, number> = {}
    for (const mv of filtered) { if (mv.dinero >= 0) continue; const gid = typeToGroup[mv.movement_type_id ?? -1]; if (gid) s[gid] = (s[gid] ?? 0) + Math.abs(mv.dinero) }
    const data = Object.entries(s).map(([gid, v]) => ({ name: groupById[+gid]?.name ?? '?', value: v, color: groupById[+gid]?.color ?? '#6b7280' })).sort((a, b) => b.value - a.value)
    if (!data.length) return <div className="flex items-center justify-center text-gray-300 text-sm" style={{ height }}>Sin datos</div>
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={2}>
            {data.map((d, i) => <Cell key={i} fill={d.color}/>)}
          </Pie>
          <Tooltip content={<ChartTooltip />}/>
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }}/>
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (chartId === 'charts-incdnt') {
    const s: Record<number, number> = {}
    for (const mv of filtered) { if (mv.dinero <= 0) continue; const gid = typeToGroup[mv.movement_type_id ?? -1]; if (gid) s[gid] = (s[gid] ?? 0) + mv.dinero }
    const data = Object.entries(s).map(([gid, v]) => ({ name: groupById[+gid]?.name ?? '?', value: v, color: groupById[+gid]?.color ?? '#22c55e' })).sort((a, b) => b.value - a.value)
    if (!data.length) return <div className="flex items-center justify-center text-gray-300 text-sm" style={{ height }}>Sin datos</div>
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={2}>
            {data.map((d, i) => <Cell key={i} fill={d.color}/>)}
          </Pie>
          <Tooltip content={<ChartTooltip />}/>
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }}/>
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (chartId === 'charts-top') {
    const s: Record<number, { name: string; value: number; color: string }> = {}
    for (const mv of filtered) { if (mv.dinero >= 0 || !mv.movement_type_id) continue; const tid = mv.movement_type_id; if (!s[tid]) { const t = typeById[tid]; s[tid] = { name: t?.name ?? '?', value: 0, color: t?.color ?? '#6b7280' } }; s[tid].value += Math.abs(mv.dinero) }
    const data = Object.values(s).sort((a, b) => b.value - a.value).slice(0, 10)
    if (!data.length) return <div className="flex items-center justify-center text-gray-300 text-sm" style={{ height }}>Sin datos</div>
    return (
      <ResponsiveContainer width="100%" height={Math.max(height, data.length * 30 + 20)}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 8 }}>
          <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}/>
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={110}/>
          <Tooltip content={<ChartTooltip />}/>
          <Bar dataKey="value" name="Gasto" radius={[0,4,4,0]} maxBarSize={22}>
            {data.map((d, i) => <Cell key={i} fill={d.color}/>)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (chartId === 'charts-savings') {
    const ahorroId = Object.values(groupById).find(g => g.name === 'Ahorro')?.id
    const m: Record<string, { ahorro: number; gasto: number }> = {}
    for (const { key } of series) m[key] = { ahorro: 0, gasto: 0 }
    for (const mv of filtered) { if (mv.dinero >= 0) continue; const k = mvMonthKeyD(mv, year); if (!(k in m)) continue; const gid = typeToGroup[mv.movement_type_id ?? -1]; if (ahorroId && gid === ahorroId) m[k].ahorro += Math.abs(mv.dinero); else m[k].gasto += Math.abs(mv.dinero) }
    const data = series.map(({ key, label }) => ({ month: label, ...m[key] }))
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_CLR} vertical={false}/>
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}/>
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={52}/>
          <Tooltip content={<ChartTooltip />}/>
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }}/>
          <Bar dataKey="ahorro" name="Ahorro" fill="#8b5cf6" radius={[4,4,0,0]} maxBarSize={40}/>
          <Bar dataKey="gasto" name="Gastos" fill="#ef4444" radius={[4,4,0,0]} maxBarSize={40}/>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (chartId === 'charts-trend') {
    const totals: Record<number, number> = {}
    for (const mv of filtered) { if (mv.dinero >= 0) continue; const gid = typeToGroup[mv.movement_type_id ?? -1]; if (gid) totals[gid] = (totals[gid] ?? 0) + Math.abs(mv.dinero) }
    const top5ids = Object.entries(totals).sort(([,a],[,b]) => b-a).slice(0, 5).map(([id]) => +id)
    const top5 = top5ids.map(id => groupById[id]).filter(Boolean)
    const byM: Record<string, Record<number, number>> = {}
    for (const { key } of series) { byM[key] = {}; for (const id of top5ids) byM[key][id] = 0 }
    for (const mv of filtered) { if (mv.dinero >= 0) continue; const gid = typeToGroup[mv.movement_type_id ?? -1]; if (!top5ids.includes(gid)) continue; const k = mvMonthKeyD(mv, year); if (byM[k]) byM[k][gid] = (byM[k][gid] ?? 0) + Math.abs(mv.dinero) }
    const data = series.map(({ key, label }) => ({ month: label, ...Object.fromEntries(top5ids.map(id => [id, byM[key]?.[id] ?? 0])) }))
    if (!top5.length) return <div className="flex items-center justify-center text-gray-300 text-sm" style={{ height }}>Sin datos</div>
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_CLR} vertical={false}/>
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}/>
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={52}/>
          <Tooltip content={<ChartTooltip />}/>
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }}/>
          {top5.map(g => <Line key={g.id} type="monotone" dataKey={g.id} name={g.name} stroke={g.color} strokeWidth={2} dot={false}/>)}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  if (chartId === 'charts-subtypes') {
    const typeInfo: Record<number, { name: string; color: string }> = {}
    for (const mv of filtered) { if (mv.dinero >= 0 || !mv.movement_type_id) continue; const tid = mv.movement_type_id; if (!typeInfo[tid]) { const t = typeById[tid]; typeInfo[tid] = { name: t?.name ?? '?', color: t?.color ?? '#6b7280' } } }
    const byGroup: Record<number, Record<string, number>> = {}
    for (const mv of filtered) { if (mv.dinero >= 0 || !mv.movement_type_id) continue; const gid = typeToGroup[mv.movement_type_id]; if (!gid) continue; const k = `t${mv.movement_type_id}`; if (!byGroup[gid]) byGroup[gid] = {}; byGroup[gid][k] = (byGroup[gid][k] ?? 0) + Math.abs(mv.dinero) }
    const data = Object.entries(byGroup).map(([gid, vals]) => ({ group: groupById[+gid]?.name ?? '?', ...vals }))
    const subtypes = Object.entries(typeInfo).map(([id, info]) => ({ key: `t${id}`, ...info }))
    if (!data.length) return <div className="flex items-center justify-center text-gray-300 text-sm" style={{ height }}>Sin datos</div>
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_CLR} vertical={false}/>
          <XAxis dataKey="group" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}/>
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={52}/>
          <Tooltip content={<ChartTooltip />}/>
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }}/>
          {subtypes.map(s => <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4,4,0,0]} maxBarSize={20}/>)}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return <div className="flex items-center justify-center text-gray-300 text-sm" style={{ height }}>Gráfico desconocido</div>
}

// ── DashboardCustomChart ──────────────────────────────────────────────────────

function DashboardCustomChart({ def, apiGroups, types, accounts, height, period, selDate }: {
  def: CustomChartDef; apiGroups: ApiGroup[]; types: MovementType[]
  accounts: Account[]; height: number; period: 'month' | 'year'
  selDate: { year: number; month: number }
}) {
  const { fmtK } = useCurrency()
  const curYear  = selDate.year
  const curMonth = selDate.month

  const fetchYear = period === 'month' ? selDate.year : def.year
  const { data: allMovements = [] } = useQuery({
    queryKey: ['movements', fetchYear],
    queryFn: () => getMovements(fetchYear !== null ? { year: fetchYear } : undefined),
    enabled: def.dataSource !== 'accounts',
  })

  const typeToGroup = useMemo(() => Object.fromEntries(types.map(t => [t.id, t.income_expense_group_id])), [types])
  const groupById   = useMemo(() => Object.fromEntries(apiGroups.map(g => [g.id, g])), [apiGroups])
  const typeById    = useMemo(() => Object.fromEntries(types.map(t => [t.id, t])), [types])
  const accountById = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a])), [accounts])

  // Account-sourced: show current balances as donut/bar
  if (def.dataSource === 'accounts') {
    const data = accounts
      .map(a => ({ name: a.name, value: a.balance, color: a.color }))
      .filter(d => d.value !== 0).sort((a, b) => b.value - a.value)
    if (!data.length) return <div className="flex items-center justify-center text-gray-300 text-sm" style={{ height }}>Sin datos</div>
    const innerR = def.defaultDisplay === 'donut' ? 55 : 0
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={innerR} outerRadius={85} dataKey="value" paddingAngle={2}>
            {data.map((d, i) => <Cell key={i} fill={d.color}/>)}
          </Pie>
          <Tooltip content={<ChartTooltip />}/>
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }}/>
        </PieChart>
      </ResponsiveContainer>
    )
  }

  const movements = useMemo(() => {
    let mvs = allMovements
    if (period === 'month') {
      const ym = `${curYear}-${String(curMonth + 1).padStart(2, '0')}`
      mvs = mvs.filter(m => m.date.startsWith(ym))
    } else if (period === 'year' && def.year === null) {
      mvs = mvs.filter(m => m.date.startsWith(String(curYear)))
    }
    const f = applyAdvancedFilter(mvs, def.filter, typeToGroup)
    return def.sign === 'all' ? f : f.filter(mv => def.sign === 'expense' ? mv.dinero < 0 : mv.dinero > 0)
  }, [allMovements, period, def, typeToGroup, curYear, curMonth])

  const { data: chartData, series } = useMemo(
    () => computeChartData(def, movements, typeToGroup, groupById, typeById, accountById),
    [def, movements, typeToGroup, groupById, typeById, accountById]
  )

  const visible  = series.filter(s => s.display !== 'hidden')
  const lt       = def.lineType ?? 'monotone'
  const mFmtK    = def.metric === 'count' ? (v: number) => String(Math.round(v)) : fmtK

  if (def.xAxis === 'none') {
    const d = chartData as { name: string; value: number; color: string }[]
    if (!d.length) return <div className="flex items-center justify-center text-gray-300 text-sm" style={{ height }}>Sin datos</div>
    if (def.defaultDisplay === 'donut' || def.defaultDisplay === 'pie') {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie data={d} cx="50%" cy="50%" innerRadius={def.defaultDisplay === 'donut' ? 55 : 0} outerRadius={85} dataKey="value" paddingAngle={2}>
              {d.map((item, i) => <Cell key={i} fill={item.color}/>)}
            </Pie>
            <Tooltip content={<ChartTooltip />}/>
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }}/>
          </PieChart>
        </ResponsiveContainer>
      )
    }
    return (
      <ResponsiveContainer width="100%" height={Math.max(height, d.length * 30 + 20)}>
        <BarChart data={d} layout="vertical" margin={{ left: 0, right: 8 }}>
          <XAxis type="number" tickFormatter={mFmtK} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}/>
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={110}/>
          <Tooltip content={<ChartTooltip />}/>
          <Bar dataKey="value" radius={[0,4,4,0]} maxBarSize={22}>
            {d.map((item, i) => <Cell key={i} fill={item.color}/>)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (!visible.length) return <div className="flex items-center justify-center text-gray-300 text-sm" style={{ height }}>Sin datos</div>
  const dm = def.displayMode ?? null
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_CLR} vertical={false}/>
        <XAxis dataKey="x" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}/>
        <YAxis tickFormatter={mFmtK} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={52}
          domain={def.yMax != null ? [0, def.yMax] : undefined}/>
        <Tooltip content={<ChartTooltip />}/>
        <ReferenceLine y={0} stroke={GRID_CLR} strokeWidth={1} />
        {visible.length > 1 && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }}/>}
        {visible.map(s => {
          const d = dm ?? s.display
          const common = { key: s.key, dataKey: s.key, name: s.label }
          if (d === 'line') return <Line  {...common} type={lt} stroke={s.color} strokeWidth={2} dot={false}/>
          if (d === 'area') return <Area  {...common} type={lt} stroke={s.color} fill={s.color} fillOpacity={0.15} strokeWidth={2} dot={false} stackId={s.stacked ? 'sa' : undefined}/>
          return                   <Bar   {...common} fill={s.color} radius={s.stacked ? [0,0,0,0] : [4,4,0,0]} maxBarSize={40} stackId={s.stacked ? 'sb' : undefined}/>
        })}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── Period toggle ─────────────────────────────────────────────────────────────

function PeriodToggle({ period, onChange }: { period: 'month' | 'year'; onChange: (p: 'month' | 'year') => void }) {
  return (
    <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
      {(['year', 'month'] as const).map(p => (
        <button key={p} onClick={() => onChange(p)}
          className={`px-2 py-0.5 text-[11px] rounded-md font-medium transition-colors ${period === p ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}
        >
          {p === 'year' ? 'Año' : 'Mes'}
        </button>
      ))}
    </div>
  )
}

// ── Chart options ─────────────────────────────────────────────────────────────

const BUILTIN_CHART_DEFS: { id: string; label: string; desc: string; Icon: LucideIcon; defaultColSpan: number }[] = [
  { id: 'chart-expenses-line',      label: 'Gastos por categoría',          desc: 'Líneas por grupo a lo largo del año',           Icon: BarChart2,  defaultColSpan: 4 },
  { id: 'chart-expenses-pie',       label: 'Distribución de gastos',        desc: 'Donut con el total anual por grupo',             Icon: PieIcon,    defaultColSpan: 2 },
  { id: 'chart-balance',            label: 'Evolución del balance',         desc: 'Área con la evolución mensual del saldo',        Icon: TrendingUp, defaultColSpan: 2 },
  { id: 'charts-monthly',      label: 'Ingresos y gastos por mes',      desc: 'Barras de ingresos y gastos mensuales',         Icon: BarChart2,  defaultColSpan: 4 },
  { id: 'charts-net',          label: 'Balance neto por mes',           desc: 'Balance neto por cada mes',                    Icon: TrendingUp, defaultColSpan: 2 },
  { id: 'charts-cumulative',   label: 'Balance acumulado',              desc: 'Balance acumulado de todos los movimientos',    Icon: TrendingUp, defaultColSpan: 2 },
  { id: 'charts-expdnt',       label: 'Gastos por categoría (donut)',   desc: 'Distribución de gastos por grupo',              Icon: PieIcon,    defaultColSpan: 2 },
  { id: 'charts-incdnt',       label: 'Ingresos por categoría (donut)', desc: 'Distribución de ingresos por grupo',            Icon: PieIcon,    defaultColSpan: 2 },
  { id: 'charts-top',          label: 'Top subtipos de gasto',          desc: 'Los mayores subtipos de gasto',                 Icon: BarChart2,  defaultColSpan: 2 },
  { id: 'charts-savings',      label: 'Ahorro vs gasto mensual',        desc: 'Comparativa mensual de ahorro vs gasto',        Icon: BarChart2,  defaultColSpan: 2 },
  { id: 'charts-trend',        label: 'Tendencia por categoría',        desc: 'Evolución mensual de las top 5 categorías',     Icon: TrendingUp, defaultColSpan: 4 },
  { id: 'charts-subtypes',     label: 'Subtipos por categoría',         desc: 'Desglose de subtipos por grupo',                Icon: BarChart2,  defaultColSpan: 4 },
]

const METRIC_STAT_OPTIONS = [
  { id: 'stat-income',          label: 'Ingresos del año',     desc: 'Total de ingresos en el año actual',   Icon: ArrowUpRight,   color: '#22c55e' },
  { id: 'stat-income-monthly',  label: 'Ingresos del mes',     desc: 'Ingresos en el mes en curso',          Icon: ArrowUpRight,   color: '#22c55e' },
  { id: 'stat-expense',         label: 'Gastos del año',       desc: 'Total de gastos en el año actual',     Icon: ArrowDownRight, color: '#ef4444' },
  { id: 'stat-expense-monthly', label: 'Gastos del mes',       desc: 'Gastos en el mes en curso',            Icon: ArrowDownRight, color: '#ef4444' },
  { id: 'stat-net-annual',      label: 'Balance neto del año', desc: 'Ingresos menos gastos del año actual', Icon: TrendingUp,     color: '#8b5cf6' },
  { id: 'stat-net-monthly',     label: 'Balance neto del mes', desc: 'Ingresos menos gastos del mes actual', Icon: TrendingUp,     color: '#8b5cf6' },
]

const SPECIAL_STAT_OPTIONS = [
  { id: 'stat-uso',           label: 'Cuenta de uso',     desc: 'Saldo de la cuenta principal',            Icon: CreditCard,      color: '#3b82f6' },
  { id: 'stat-accounts',      label: 'Panel de ahorro',   desc: 'Cuentas de ahorro con selector cíclico',  Icon: ChartCandlestick, color: '#f59e0b' },
  { id: 'stat-total-balance', label: 'Patrimonio total',  desc: 'Suma del saldo de todas las cuentas',     Icon: Landmark,        color: '#8b5cf6' },
]

const BALANCE_HISTORY_OPTIONS = [
  { id: 'stat-balance-history',  label: 'Histórico de balance',        desc: 'Balance histórico de todas las cuentas en un gráfico', Icon: TrendingUp, color: '#6366f1', defaultColSpan: 4 },
  { id: 'stat-balance-combined', label: 'Balance total histórico',     desc: 'Suma de todas las cuentas en una sola línea',          Icon: TrendingUp, color: '#3b82f6', defaultColSpan: 2 },
  { id: 'stat-balance-cycle',    label: 'Balance cuenta a cuenta',     desc: 'Una cuenta a la vez, con flechas para cambiar',        Icon: TrendingUp, color: '#f59e0b', defaultColSpan: 2 },
]

// ── NewBudgetForm ─────────────────────────────────────────────────────────────

function NewBudgetForm({ types, onSave, onCancel }: {
  types: MovementType[]
  onSave: (b: StoredBudget) => void
  onCancel: () => void
}) {
  const [name,   setName]   = useState('')
  const [amount, setAmount] = useState('')
  const [period, setPeriod] = useState<StoredBudget['period']>('monthly')
  const [selIds, setSelIds] = useState<Set<number>>(new Set())

  const typesByGroup = useMemo(() => {
    const map = new Map<string, MovementType[]>()
    for (const t of types) { if (!map.has(t.category)) map.set(t.category, []); map.get(t.category)!.push(t) }
    return [...map.entries()]
  }, [types])

  const toggleType = (id: number) => setSelIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const handleSave = () => {
    const parsed = parseFloat(amount.replace(',', '.'))
    if (!name.trim() || isNaN(parsed) || parsed <= 0 || selIds.size === 0) return
    const b: StoredBudget = {
      id: genId(), name: name.trim(), typeIds: [...selIds], period,
      versions: [{ id: genId(), amount: parsed, effectiveFrom: todayStr() }],
      trackingStart: null,
    }
    onSave(b)
  }

  return (
    <div className="space-y-3 px-1 pb-1">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 pt-1 uppercase tracking-widest">Nuevo presupuesto</p>
      <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nombre" autoFocus
        className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      <div className="flex gap-2">
        <select value={period} onChange={e => setPeriod(e.target.value as StoredBudget['period'])}
          className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none"
        >
          <option value="monthly">Mensual</option>
          <option value="weekly">Semanal</option>
          <option value="annual">Anual</option>
        </select>
        <div className="relative flex-1">
          <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Límite"
            className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 pr-6 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">€</span>
        </div>
      </div>
      <div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">Categorías</p>
        <div className="space-y-0.5 max-h-44 overflow-y-auto border border-gray-100 dark:border-gray-800 rounded-lg p-1">
          {typesByGroup.map(([group, gTypes]) => (
            <div key={group}>
              <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-2 pt-1.5 pb-0.5">{group}</p>
              {gTypes.map(t => (
                <button key={t.id} onClick={() => toggleType(t.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${selIds.has(t.id) ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                  {t.name}
                  {selIds.has(t.id) && <Check className="w-3 h-3 ml-auto" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors">
          Cancelar
        </button>
        <button onClick={handleSave} disabled={!name.trim() || !amount || selIds.size === 0}
          className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 transition-colors"
        >
          Crear
        </button>
      </div>
    </div>
  )
}

// ── Month picker ──────────────────────────────────────────────────────────────

function MonthPicker({ year, month, onChange, onClose }: {
  year: number; month: number  // month: 0-indexed
  onChange: (year: number, month: number) => void
  onClose: () => void
}) {
  const [pickYear, setPickYear] = useState(year)
  const now = new Date()
  const todayYear = now.getFullYear()
  const todayMonth = now.getMonth()
  const isCurrentSel = year === todayYear && month === todayMonth

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full left-0 mt-1.5 z-50 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xl p-3 w-52">
        <div className="flex items-center justify-between px-1 mb-2">
          <button type="button" onClick={() => setPickYear(y => y - 1)}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-800 dark:text-white tabular-nums">{pickYear}</span>
          <button type="button" onClick={() => setPickYear(y => y + 1)}
            disabled={pickYear >= todayYear}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 disabled:opacity-30 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTHS_SHORT.map((m, i) => {
            const isFuture = pickYear > todayYear || (pickYear === todayYear && i > todayMonth)
            const isSelected = pickYear === year && i === month
            return (
              <button key={i} type="button"
                onClick={() => { if (!isFuture) { onChange(pickYear, i); onClose() } }}
                disabled={isFuture}
                className={`py-1.5 text-xs rounded-lg transition-colors ${
                  isSelected
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium'
                    : isFuture
                    ? 'text-gray-300 dark:text-gray-700 cursor-not-allowed'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {m}
              </button>
            )
          })}
        </div>
        {!isCurrentSel && (
          <button type="button"
            onClick={() => { onChange(todayYear, todayMonth); onClose() }}
            className="w-full mt-2 py-1.5 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors border-t border-gray-100 dark:border-gray-800 pt-2">
            Mes actual
          </button>
        )}
      </div>
    </>
  )
}

// ── Add-widget modal ──────────────────────────────────────────────────────────

type AddMode = 'chart' | 'stat' | 'budget'

function AddWidgetModal({ mode, existingIds, budgets, types, accounts, onAdd, onClose }: {
  mode: AddMode; existingIds: Set<string>; budgets: StoredBudget[]
  types: MovementType[]; accounts: Account[]
  onAdd: (w: DashboardWidget, newBudget?: StoredBudget) => void; onClose: () => void
}) {
  const [showNewBudget, setShowNewBudget] = useState(false)
  const navigate = useNavigate()

  const allChartOptions = useMemo(() => {
    const custom = readCustomCharts()
    return [
      ...BUILTIN_CHART_DEFS,
      ...custom.map(c => ({ id: c.id, label: c.title, desc: 'Gráfico personalizado', Icon: BarChart2, defaultColSpan: c.colSpan ?? 2 })),
    ]
  }, [])

  const availChartOptions  = allChartOptions.filter(o => !existingIds.has(o.id))
  const availMetrics       = METRIC_STAT_OPTIONS.filter(o => !existingIds.has(o.id))
  const availSpecial       = SPECIAL_STAT_OPTIONS.filter(o => !existingIds.has(o.id))
  const availBalanceHist   = BALANCE_HISTORY_OPTIONS.filter(o => !existingIds.has(o.id))
  const availAccounts      = accounts.filter(a => !existingIds.has(`stat-account-${a.id}`))
  const availBudgets       = budgets.filter(b => !existingIds.has(b.id))
  const title = mode === 'chart' ? 'Añadir gráfico' : mode === 'stat' ? 'Añadir estadística' : 'Añadir presupuesto'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 w-full max-w-sm max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white">{title}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-3 space-y-1">

          {/* Chart options */}
          {mode === 'chart' && (
            <>
              <button onClick={() => { onClose(); navigate('/charts') }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-left">
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                  <Plus className="w-4 h-4 text-blue-500" />
                </div>
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">Crear nuevo gráfico</span>
              </button>
              {availChartOptions.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 px-4 py-3 border-t border-gray-100 dark:border-gray-800 mt-1 pt-3">Todos los gráficos ya están en el dashboard</p>
              ) : (
                <div className="border-t border-gray-100 dark:border-gray-800 pt-1 mt-1">
                  {availChartOptions.map(o => (
                    <button key={o.id}
                      onClick={() => { onAdd({ id: o.id, colSpan: o.defaultColSpan }); onClose() }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                        <o.Icon className="w-4 h-4 text-blue-500" strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 dark:text-white">{o.label}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{o.desc}</p>
                      </div>
                      <Plus className="w-4 h-4 text-gray-300 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Stat options */}
          {mode === 'stat' && (
            availMetrics.length === 0 && availAccounts.length === 0 && availSpecial.length === 0 && availBalanceHist.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 px-4 py-3">Todos los paneles de estadística ya están en el dashboard</p>
            ) : (
              <>
                {availMetrics.length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-4 pt-2 pb-1">Métricas</p>
                    {availMetrics.map(o => (
                      <button key={o.id}
                        onClick={() => { onAdd({ id: o.id, colSpan: 1 }); onClose() }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                      >
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: o.color + '20' }}>
                          <o.Icon className="w-4 h-4" style={{ color: o.color }} strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 dark:text-white">{o.label}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{o.desc}</p>
                        </div>
                        <Plus className="w-4 h-4 text-gray-300 shrink-0" />
                      </button>
                    ))}
                  </>
                )}
                {availAccounts.length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-4 pt-3 pb-1 border-t border-gray-100 dark:border-gray-800 mt-1">Cuentas</p>
                    {availAccounts.map(a => (
                      <button key={a.id}
                        onClick={() => { onAdd({ id: `stat-account-${a.id}`, colSpan: 1 }); onClose() }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                      >
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: a.color + '20' }}>
                          <CreditCard className="w-4 h-4" style={{ color: a.color }} strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 dark:text-white">{a.name}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Saldo de la cuenta</p>
                        </div>
                        <Plus className="w-4 h-4 text-gray-300 shrink-0" />
                      </button>
                    ))}
                  </>
                )}
                {availSpecial.length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-4 pt-3 pb-1 border-t border-gray-100 dark:border-gray-800 mt-1">Paneles especiales</p>
                    {availSpecial.map(o => (
                      <button key={o.id}
                        onClick={() => { onAdd({ id: o.id, colSpan: 1 }); onClose() }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                      >
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: o.color + '20' }}>
                          <o.Icon className="w-4 h-4" style={{ color: o.color }} strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 dark:text-white">{o.label}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{o.desc}</p>
                        </div>
                        <Plus className="w-4 h-4 text-gray-300 shrink-0" />
                      </button>
                    ))}
                  </>
                )}
                {availBalanceHist.length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-4 pt-3 pb-1 border-t border-gray-100 dark:border-gray-800 mt-1">Histórico</p>
                    {availBalanceHist.map(o => (
                      <button key={o.id}
                        onClick={() => { onAdd({ id: o.id, colSpan: o.defaultColSpan }); onClose() }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                      >
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: o.color + '20' }}>
                          <o.Icon className="w-4 h-4" style={{ color: o.color }} strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 dark:text-white">{o.label}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{o.desc}</p>
                        </div>
                        <Plus className="w-4 h-4 text-gray-300 shrink-0" />
                      </button>
                    ))}
                  </>
                )}
              </>
            )
          )}

          {/* Budget list */}
          {mode === 'budget' && !showNewBudget && (
            <>
              {/* Always-visible create button at top */}
              <button onClick={() => setShowNewBudget(true)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                  <Plus className="w-4 h-4 text-blue-500" />
                </div>
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">Crear nuevo presupuesto</span>
              </button>
              {/* Combined all-budgets card */}
              {budgets.length > 0 && !existingIds.has('budget-all') && (
                <button
                  onClick={() => { onAdd({ id: 'budget-all', colSpan: 4 }); onClose() }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left border-t border-gray-100 dark:border-gray-800 mt-1 pt-2"
                >
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                    <BarChart2 className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-white">Todos los presupuestos</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Tarjeta combinada con todos en una</p>
                  </div>
                  <Plus className="w-4 h-4 text-gray-300 shrink-0" />
                </button>
              )}

              {availBudgets.length > 0 && (
                <div className="border-t border-gray-100 dark:border-gray-800 pt-1 mt-1">
                  {availBudgets.map(b => (
                    <button key={b.id}
                      onClick={() => { onAdd({ id: b.id, colSpan: 2 }); onClose() }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                        <ChartCandlestick className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
                      </div>
                      <span className="flex-1 text-sm font-medium text-gray-800 dark:text-white">{b.name}</span>
                      <Plus className="w-4 h-4 text-gray-300 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* New budget form */}
          {mode === 'budget' && showNewBudget && (
            <NewBudgetForm
              types={types}
              onSave={b => {
                const all = readBudgets()
                writeBudgets([...all, b])
                onAdd({ id: b.id, colSpan: 2 }, b)
                onClose()
              }}
              onCancel={() => setShowNewBudget(false)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { fmt } = useCurrency()
  const { config, save } = useDashboardConfig()
  const [searchParams, setSearchParams] = useSearchParams()
  const [editMode, setEditMode] = useState(() => searchParams.get('edit') === '1')
  const [addMode, setAddMode]   = useState<AddMode | null>(null)
  const [budgets, setBudgets]     = useState<StoredBudget[]>(() => readBudgets())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [customChartDefs]       = useState<CustomChartDef[]>(() => readCustomCharts())
  const [selDate, setSelDate]   = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() } })
  const [showPicker, setShowPicker] = useState(false)

  const year     = selDate.year
  const apiMonth = selDate.month + 1
  const { data, isLoading }    = useQuery({ queryKey: ['dashboard', year, apiMonth], queryFn: () => getDashboard(year, apiMonth) })
  const { data: annualData }   = useQuery({ queryKey: ['annual', year],              queryFn: () => getAnnualStats(year) })
  const { data: accountsData } = useQuery({ queryKey: ['accounts-summary'], queryFn: getAccountsSummary })

  const hasBudgetWidgets      = config.widgets.some(w => !w.id.startsWith('stat-') && !w.id.startsWith('chart-') && !w.id.startsWith('charts-') && !customChartDefs.some(c => c.id === w.id))
  const hasChartsBuiltins     = config.widgets.some(w => w.id.startsWith('charts-'))
  const hasBalanceHistory     = config.widgets.some(w => w.id.startsWith('stat-balance-'))
  const hasCustomChartWidgets = config.widgets.some(w => customChartDefs.some(c => c.id === w.id))
  const needsChartsData       = hasChartsBuiltins || hasCustomChartWidgets

  const { data: movements = [] } = useQuery({
    queryKey: ['movements'], queryFn: () => getMovements(),
    enabled: hasBudgetWidgets || hasChartsBuiltins || hasBalanceHistory,
  })
  const { data: apiGroups = [] } = useQuery({
    queryKey: ['groups'], queryFn: getGroups, enabled: needsChartsData,
  })
  const { data: movementTypes = [] } = useQuery({
    queryKey: ['movement-types'], queryFn: getMovementTypes,
    enabled: needsChartsData || hasBalanceHistory || (editMode && addMode === 'budget'),
  })

  // Drag state
  const [dragId,   setDragId]   = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const dragIdRef = useRef<string | null>(null)

  function handleDrop(targetId: string) {
    const srcId = dragIdRef.current
    if (!srcId || srcId === targetId) return
    dragIdRef.current = null
    const arr  = [...config.widgets]
    const from = arr.findIndex(w => w.id === srcId)
    const to   = arr.findIndex(w => w.id === targetId)
    if (from >= 0 && to >= 0) { arr.splice(to, 0, arr.splice(from, 1)[0]); save({ widgets: arr }) }
    setDragId(null); setDragOver(null)
  }

  function removeWidget(id: string) { save({ widgets: config.widgets.filter(w => w.id !== id) }) }
  function addWidget(w: DashboardWidget) { save({ widgets: [...config.widgets, w] }) }
  function updateWidget(id: string, patch: Partial<DashboardWidget>) {
    save({ widgets: config.widgets.map(w => w.id === id ? { ...w, ...patch } : w) })
  }

  const exitEdit  = () => { setEditMode(false); setSearchParams({}); setConfirmDeleteId(null) }

  const existingIds = useMemo(() => new Set(config.widgets.map(w => w.id)), [config.widgets])

  if (isLoading) return <div className="p-8 text-gray-500">Cargando...</div>
  if (!data) return null

  const savingsAccounts = accountsData?.accounts.filter(a => !a.is_main) ?? []
  const allAccounts     = accountsData?.accounts ?? []
  const initialTotal    = accountsData?.accounts.reduce((s, a) => s + a.initial_balance, 0) ?? 0

  const PANEL = 'h-full bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5'
  const TITLE = 'text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500'

  const isChartWidget = (id: string) => id.startsWith('chart-') || id.startsWith('charts-') || id.startsWith('stat-balance-') || customChartDefs.some(c => c.id === id)

  // Render widget content
  function renderContent(w: DashboardWidget, chartH: number) {
    // ── Stat panels ──
    if (w.id === 'stat-uso')      return <StaticPanel title="De uso"   value={data!.uso_balance}      color="#3b82f6" Icon={CreditCard}     />
    if (w.id === 'stat-income')   return <StaticPanel title="Ingresos del año"  value={data!.annual.income}    color="#22c55e" Icon={ArrowUpRight}   />
    if (w.id === 'stat-expense')  return <StaticPanel title="Gastos del año"    value={data!.annual.expenses}  color="#ef4444" Icon={ArrowDownRight} />
    if (w.id === 'stat-accounts')      return <CyclingPanel accounts={savingsAccounts} />
    if (w.id === 'stat-total-balance') return <StaticPanel title="Patrimonio total" value={accountsData?.total ?? 0} color="#8b5cf6" Icon={Landmark} />
    if (w.id === 'stat-income-monthly')  return <StaticPanel title="Ingresos del mes"     value={data!.monthly.income}                         color="#22c55e" Icon={ArrowUpRight}   />
    if (w.id === 'stat-expense-monthly') return <StaticPanel title="Gastos del mes"       value={data!.monthly.expenses}                       color="#ef4444" Icon={ArrowDownRight} />
    if (w.id === 'stat-net-annual') {
      const v = data!.annual.income - data!.annual.expenses
      return <StaticPanel title="Balance neto del año" value={v} color={v >= 0 ? '#22c55e' : '#ef4444'} Icon={TrendingUp} />
    }
    if (w.id === 'stat-net-monthly') {
      const v = data!.monthly.income - data!.monthly.expenses
      return <StaticPanel title="Balance neto del mes" value={v} color={v >= 0 ? '#22c55e' : '#ef4444'} Icon={TrendingUp} />
    }
    if (w.id.startsWith('stat-account-')) {
      const accId = parseInt(w.id.replace('stat-account-', ''))
      const acc = allAccounts.find(a => a.id === accId)
      if (acc) return <StaticPanel title={acc.name} value={acc.balance} color={acc.color} Icon={CreditCard} />
    }

    // ── Dashboard-native charts ──
    if (w.id === 'chart-expenses-line') return (
      <div className={PANEL}>
        <h2 className={`${TITLE} mb-5`}>Gastos por categoría — {year}</h2>
        <ExpensesLineChart groups={annualData?.groups ?? []} year={year} height={chartH} />
      </div>
    )
    if (w.id === 'chart-expenses-pie') return (
      <div className={PANEL}>
        <h2 className={`${TITLE} mb-4`}>Distribución de gastos — {year}</h2>
        <ExpensesPieChart groups={annualData?.groups ?? []} height={chartH} />
      </div>
    )
    if (w.id === 'chart-balance') return (
      <div className={PANEL}>
        <h2 className={`${TITLE} mb-4`}>Evolución del balance — {year}</h2>
        <BalanceEvolutionChart groups={annualData?.groups ?? []} year={year} initialTotal={initialTotal} height={chartH} />
      </div>
    )
    if (w.id === 'stat-balance-history') return (
      <div className={PANEL}>
        <h2 className={`${TITLE} mb-4`}>Histórico de balance por cuenta</h2>
        <AccountBalanceHistoryChart accounts={allAccounts} movements={movements} movementTypes={movementTypes} height={chartH} />
      </div>
    )
    if (w.id === 'stat-balance-combined') return (
      <div className={PANEL}>
        <h2 className={`${TITLE} mb-4`}>Balance total histórico</h2>
        <CombinedBalanceHistoryChart accounts={allAccounts} movements={movements} movementTypes={movementTypes} height={chartH} />
      </div>
    )
    if (w.id === 'stat-balance-cycle') return (
      <div className={PANEL}>
        <CyclingBalanceHistoryChart accounts={allAccounts} movements={movements} movementTypes={movementTypes} height={chartH} />
      </div>
    )

    // ── Charts.tsx built-in charts ──
    if (w.id.startsWith('charts-')) {
      const currentPeriod = w.period ?? 'year'
      const label = BUILTIN_CHART_DEFS.find(d => d.id === w.id)?.label ?? w.id
      return (
        <div className={PANEL}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={TITLE}>{label}</h2>
            <PeriodToggle period={currentPeriod} onChange={p => updateWidget(w.id, { period: p })} />
          </div>
          <DashboardBuiltinChart
            chartId={w.id}
            allMvs={movements}
            apiGroups={apiGroups}
            types={movementTypes}
            height={chartH}
            period={currentPeriod}
            selDate={selDate}
          />
        </div>
      )
    }

    // ── Custom charts ──
    const customDef = customChartDefs.find(c => c.id === w.id)
    if (customDef) {
      const currentPeriod = w.period ?? 'year'
      return (
        <div className={PANEL}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={TITLE}>{customDef.title}</h2>
            <PeriodToggle period={currentPeriod} onChange={p => updateWidget(w.id, { period: p })} />
          </div>
          <DashboardCustomChart
            def={customDef}
            apiGroups={apiGroups}
            types={movementTypes}
            accounts={allAccounts}
            height={chartH}
            period={currentPeriod}
            selDate={selDate}
          />
        </div>
      )
    }

    // ── All-budgets combined widget ──
    if (w.id === 'budget-all') {
      const refDate = new Date(selDate.year, selDate.month, 1)
      const allPeriods = budgets.map(b => {
        const { start, end } = getBudgetPeriod(b, refDate)
        const typeIds = new Set(b.typeIds)
        const limit   = getBudgetLimit(b.versions, start)
        const spent   = calcBudgetSpent(movements, typeIds, start, end)
        const pct     = limit > 0 ? Math.min(Math.round((spent / limit) * 100), 100) : 0
        const colors  = budgetPctColors(pct)
        return { b, start, end, limit, spent, pct, colors }
      })
      if (allPeriods.length === 0) return (
        <div className={`${PANEL} flex items-center justify-center text-gray-300 dark:text-gray-600 text-sm`}>
          No hay presupuestos configurados
        </div>
      )
      return (
        <div className={PANEL}>
          <h2 className={`${TITLE} mb-4`}>Presupuestos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {allPeriods.map(({ b, start, end, limit, spent, pct, colors }) => (
              <div key={b.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">{b.name}</span>
                  <span className="text-[10px] text-gray-300 dark:text-gray-600 shrink-0 ml-2">{budgetPeriodLabel(b, start, end)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono tabular-nums text-gray-600 dark:text-gray-300">{fmt(spent)}</span>
                  <span className="text-gray-400 dark:text-gray-500">de {fmt(limit)}</span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full transition-all ${colors.bar}`} style={{ width: `${pct}%` }} />
                </div>
                <p className={`text-[10px] text-right font-medium tabular-nums ${colors.text}`}>{pct}%</p>
              </div>
            ))}
          </div>
        </div>
      )
    }

    // ── Budget widget ──
    const budget = budgets.find(b => b.id === w.id)
    if (!budget) return (
      <div className={`${PANEL} flex flex-col items-center justify-center gap-2`}>
        <span className="text-sm text-gray-300 dark:text-gray-600">Presupuesto no encontrado</span>
        <button
          onClick={() => removeWidget(w.id)}
          className="text-xs text-red-400 hover:text-red-500 underline underline-offset-2 transition-colors"
        >
          Eliminar widget
        </button>
      </div>
    )
    const typeIds = new Set(budget.typeIds)
    const { start, end } = getBudgetPeriod(budget, new Date(selDate.year, selDate.month, 1))
    const limit  = getBudgetLimit(budget.versions, start)
    const spent  = calcBudgetSpent(movements, typeIds, start, end)
    const pct    = limit > 0 ? Math.min(Math.round((spent / limit) * 100), 100) : 0
    const colors = budgetPctColors(pct)
    return (
      <div className={PANEL}>
        <div className="flex items-center justify-between mb-3">
          <h2 className={TITLE}>{budget.name}</h2>
          <span className="text-xs text-gray-300 dark:text-gray-600">{budgetPeriodLabel(budget, start, end)}</span>
        </div>
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-mono tabular-nums text-gray-700 dark:text-gray-200">{fmt(spent)}</span>
          <span className="text-gray-400 dark:text-gray-500">de {fmt(limit)}</span>
        </div>
        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
          <div className={`h-2 rounded-full transition-all ${colors.bar}`} style={{ width: `${pct}%` }} />
        </div>
        <p className={`text-xs mt-1.5 text-right font-medium tabular-nums ${colors.text}`}>{pct}%</p>
      </div>
    )
  }

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Dashboard</h1>
          {!editMode && (
            <div className="relative shrink-0">
              <button
                onClick={() => setShowPicker(p => !p)}
                className={`flex items-center gap-1 text-sm px-3 py-1 rounded-full transition-colors ${
                  selDate.year !== new Date().getFullYear() || selDate.month !== new Date().getMonth()
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {data.month} {year}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showPicker && (
                <MonthPicker
                  year={selDate.year}
                  month={selDate.month}
                  onChange={(y, m) => { setSelDate({ year: y, month: m }); setShowPicker(false) }}
                  onClose={() => setShowPicker(false)}
                />
              )}
            </div>
          )}
        </div>
        {editMode ? (
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setAddMode('stat')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Estadística
            </button>
            <button onClick={() => setAddMode('chart')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Gráfico
            </button>
            <button onClick={() => { setBudgets(readBudgets()); setAddMode('budget') }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Presupuesto
            </button>
            <button onClick={() => save(DEFAULT_DASHBOARD_CONFIG)}
              className="px-3 py-1.5 rounded-xl text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 transition-colors"
            >
              Restablecer
            </button>
            <button onClick={exitEdit}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors shadow-sm"
            >
              Guardar
            </button>
          </div>
        ) : null}
      </div>

      {/* Edit mode hint */}
      {editMode && (
        <p className="text-xs text-gray-400 dark:text-gray-500 -mt-3">
          Arrastra los widgets para reordenarlos · Arrastra el borde derecho para cambiar el ancho · Arrastra el borde inferior para cambiar la altura (más alto = más filas del grid)
        </p>
      )}

      {/* Widget grid */}
      {config.widgets.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-start [&>*]:max-sm:!col-span-1 [&>*]:sm:max-md:!col-span-1">
          {config.widgets.map(w => {
            const colCls = COL_CLS[w.colSpan] ?? 'col-span-2'
            const hasResize = isChartWidget(w.id)
            // For chart widgets, row span is derived from height; for stat/budget widgets always 1
            const rs = hasResize ? Math.max(1, Math.ceil((w.height ?? 300) / 300)) : (w.rowSpan ?? 1)
            const rowStyle = rs > 1 ? { gridRow: `span ${rs}` } : undefined

            if (editMode) {
              return (
                <ResizableWrapper
                  key={w.id}
                  colSpan={w.colSpan}
                  height={hasResize ? (w.height ?? 300) : undefined}
                  onUpdateColSpan={cs => updateWidget(w.id, { colSpan: cs })}
                  onUpdateHeight={hasResize ? h => updateWidget(w.id, { height: h }) : undefined}
                  isDragging={dragId === w.id}
                  isDragOver={dragOver === w.id && dragId !== w.id}
                  onDragStart={() => { dragIdRef.current = w.id; setDragId(w.id) }}
                  onDragOver={e => { e.preventDefault(); setDragOver(w.id) }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null) }}
                  onDrop={() => handleDrop(w.id)}
                  onDragEnd={() => { dragIdRef.current = null; setDragId(null); setDragOver(null) }}
                >
                  {(chartH, onGripMouseDown) => (
                    <div className="relative h-full">
                      {renderContent(w, chartH)}
                      <button onMouseDown={onGripMouseDown}
                        className="absolute top-2 left-2 z-20 p-1.5 bg-white/90 dark:bg-gray-800/90 rounded-lg shadow border border-gray-200 dark:border-gray-700 cursor-grab hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <GripVertical className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                      {confirmDeleteId === w.id ? (
                        <div className="absolute top-2 right-4 z-20 flex items-center gap-1 bg-white/95 dark:bg-gray-800/95 rounded-lg shadow border border-red-200 dark:border-red-700 px-2 py-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">¿Eliminar?</span>
                          <button onClick={() => { removeWidget(w.id); setConfirmDeleteId(null) }}
                            className="text-xs font-medium text-red-500 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
                            Sí
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)}
                            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                            No
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(w.id)}
                          className="absolute top-2 right-4 z-20 p-1.5 bg-white/90 dark:bg-gray-800/90 rounded-lg shadow border border-gray-200 dark:border-gray-700 hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-300 dark:hover:border-red-700 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </ResizableWrapper>
              )
            }

            return (
              <div key={w.id} className={colCls} style={rowStyle}>
                {renderContent(w, w.height ?? 300)}
              </div>
            )
          })}
        </div>
      ) : (
        !editMode && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-gray-300 dark:text-gray-600 text-sm mb-3">El dashboard está vacío</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Ve a Configuración → Editar Dashboard para añadir widgets</p>
          </div>
        )
      )}

      {/* Backend budget groups (only in view mode) */}
      {!editMode && data.budget_groups.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5 space-y-4">
          <h2 className={TITLE}>Presupuestos — {data.month}</h2>
          <div className="grid grid-cols-2 gap-4">
            {data.budget_groups.map((g: { name: string; color: string; budget: number; current_month: number; percent: number }) => (
              <div key={g.name}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{g.name}</span>
                  <span className="text-gray-400 tabular-nums">
                    {fmt(Math.abs(g.current_month))}
                    <span className="text-gray-300 dark:text-gray-600"> / </span>
                    {fmt(g.budget)}
                  </span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                  <div className="h-2 rounded-full transition-all"
                    style={{ width: `${g.percent}%`, backgroundColor: g.percent > 90 ? '#ef4444' : g.percent > 70 ? '#f59e0b' : g.color }} />
                </div>
                <p className="text-xs text-gray-300 dark:text-gray-600 mt-1 text-right">{g.percent}%</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add widget modal */}
      {addMode && (
        <AddWidgetModal
          mode={addMode}
          existingIds={existingIds}
          budgets={budgets}
          types={movementTypes}
          accounts={allAccounts}
          onAdd={(widget, newBudget) => {
            addWidget(widget)
            if (newBudget) setBudgets(readBudgets())
          }}
          onClose={() => setAddMode(null)}
        />
      )}
    </div>
  )
}
