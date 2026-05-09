import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t, getMonthNames } from '../utils/i18n'
import { syncPref } from '../utils/prefSync'
import { useQuery } from '@tanstack/react-query'
import { GridLayout, useContainerWidth, verticalCompactor, type LayoutItem } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid, PieChart, Pie, Cell, Legend,
  LineChart, Line, ComposedChart, ReferenceLine,
} from 'recharts'
import { getMovements, type Movement } from '../api/movements'
import { getGroups, type Group } from '../api/groups'
import { getMovementTypes, type MovementType } from '../api/movementTypes'
import { getAccountsSummary, type Account } from '../api/accounts'
import { useCurrency } from '../hooks/useCurrency'
import FilterPanel, { applyAdvancedFilter, EMPTY_FILTER, type AdvancedFilter } from '../components/FilterPanel'
import {
  SlidersHorizontal, ChevronDown, Plus, Trash2, X, Settings2,
  BarChart2, Layers, TrendingUp, Activity, PieChart as PieIcon,
  GripVertical, Sigma,
} from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────

const ROW_H = 150
const CARD_HEADER_H = 60  // approx card header + padding height in px

const MONTHS   = getMonthNames('short')
const GRID     = '#e5e7eb'
const CUR_YEAR  = new Date().getFullYear()
const CUR_MONTH = String(new Date().getMonth() + 1).padStart(2, '0')
const PALETTE  = [
  '#ef4444','#f97316','#eab308','#22c55e','#10b981','#14b8a6',
  '#3b82f6','#6366f1','#8b5cf6','#ec4899','#f43f5e','#a855f7',
  '#0ea5e9','#84cc16','#64748b','#78716c',
]
const selectCls = 'px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-300 focus:outline-none'

// ── Built-in chart types ──────────────────────────────────────────────────────

type DisplayMode = 'bars' | 'stacked' | 'lines' | 'area' | 'donut' | 'combo'
interface ModeOption { id: DisplayMode; icon: React.ReactNode; label: string }

interface ChartProps {
  filtered: Movement[]; typeToGroup: Record<number, number>
  groupById: Record<number, Group>; typeById: Record<number, MovementType>
  year: number | null; mode: DisplayMode
}

const ComboIcon = () => (
  <svg viewBox="0 0 14 14" fill="none" className="w-3.5 h-3.5">
    <rect x="1" y="8" width="2.5" height="5" rx="0.4" fill="currentColor" opacity={0.65}/>
    <rect x="5.5" y="5" width="2.5" height="8" rx="0.4" fill="currentColor" opacity={0.65}/>
    <rect x="10" y="6.5" width="2.5" height="6.5" rx="0.4" fill="currentColor" opacity={0.65}/>
    <polyline points="2.25,6 6.75,3.5 11.25,5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const M_BARS:    ModeOption = { id:'bars',    icon:<BarChart2  className="w-3.5 h-3.5"/>, label:t('charts.modeColumns') }
const M_STACKED: ModeOption = { id:'stacked', icon:<Layers     className="w-3.5 h-3.5"/>, label:t('charts.modeStacked') }
const M_LINES:   ModeOption = { id:'lines',   icon:<Activity   className="w-3.5 h-3.5"/>, label:t('charts.modeLines')   }
const M_AREA:    ModeOption = { id:'area',    icon:<TrendingUp className="w-3.5 h-3.5"/>, label:t('charts.modeArea')    }
const M_DONUT:   ModeOption = { id:'donut',   icon:<PieIcon    className="w-3.5 h-3.5"/>, label:t('charts.modeDonut')   }
const M_COMBO:   ModeOption = { id:'combo',   icon:<ComboIcon/>,                           label:t('charts.modeCombo')   }

// ── Custom chart types ────────────────────────────────────────────────────────

type XAxisType   = 'month' | 'year' | 'none'
type SplitByType = 'none' | 'group' | 'type' | 'account'
type SignType    = 'all' | 'expense' | 'income'
type MetricType  = 'sum' | 'count'

interface SeriesOverride {
  key: string; display: 'bar' | 'line' | 'area' | 'hidden'; color: string; label: string; stacked?: boolean; cumulative?: boolean
}
interface CustomChartDef {
  id: string; title: string; colSpan: number; year: number | null
  filter: AdvancedFilter; sign: SignType; xAxis: XAxisType; splitBy: SplitByType
  metric: MetricType; defaultDisplay: 'bar' | 'line' | 'area' | 'donut' | 'pie'
  defaultColor: string; overrides: SeriesOverride[]; yMax?: number
  lineType?: 'monotone' | 'linear'; height?: number; showModeButtons?: boolean
  displayMode?: 'bar' | 'line' | 'area' | null
  wide?: boolean
  donutSize?: number
  donutSide?: 'left' | 'right' | 'top' | 'bottom'
  dataSource?: 'movements' | 'accounts'
  noneAxisPeriod?: 'year' | 'month'
  period?: 'current_year' | 'current_month'
}
interface ComputedSeries {
  key: string; label: string; color: string; display: 'bar' | 'line' | 'area' | 'hidden'; stacked: boolean; cumulative: boolean
}

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
function newCustomChart(): CustomChartDef {
  return {
    id: genId(), title: t('charts.newTitle'), colSpan: 2, year: CUR_YEAR,
    filter: EMPTY_FILTER, sign: 'expense', xAxis: 'month', splitBy: 'none',
    metric: 'sum', defaultDisplay: 'bar', defaultColor: '#3b82f6', overrides: [],
    dataSource: 'movements',
  }
}
function effectiveColSpan(def: CustomChartDef) { return def.colSpan ?? (def.wide ? 4 : 2) }

// ── Shared UI ─────────────────────────────────────────────────────────────────

function CT({ active, payload, label, fmt }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]
  label?: string; fmt: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl shadow-lg px-3 py-2.5 text-xs">
      {label && <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1.5">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }}/>
          <span className="text-gray-500 dark:text-gray-400">{p.name}:</span>
          <span className="font-mono font-medium text-gray-800 dark:text-gray-100">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}
function Empty({ h = 200 }: { h?: number }) {
  return <div className="flex items-center justify-center text-gray-300 dark:text-gray-600 text-sm" style={{ height: h }}>{t('charts.noData')}</div>
}

// ── Month helpers ─────────────────────────────────────────────────────────────

function monthCutoff(year: number | null) { return year === null || year < CUR_YEAR ? 11 : new Date().getMonth() }

function buildMonthSeries(movements: Movement[], year: number | null) {
  if (year !== null) {
    const cut = monthCutoff(year)
    return Array.from({ length: cut + 1 }, (_, i) => ({ key: String(i), label: MONTHS[i] }))
  }
  const seen = [...new Set(movements.map(m => m.date.slice(0, 7)))].sort()
  return seen.map(ym => ({ key: ym, label: `${MONTHS[+ym.slice(5, 7) - 1]} '${ym.slice(2, 4)}` }))
}
function mvMonthKey(mv: Movement, year: number | null): string {
  return year !== null ? String(+mv.date.slice(5, 7) - 1) : mv.date.slice(0, 7)
}

// ── computeChartData ──────────────────────────────────────────────────────────

function computeChartData(
  def: CustomChartDef, movements: Movement[],
  typeToGroup: Record<number,number>, groupById: Record<number,Group>,
  typeById: Record<number,MovementType>, accountById: Record<number,Account>,
): { data: Record<string,unknown>[]; series: ComputedSeries[] } {

  const overrideMap = Object.fromEntries(def.overrides.map(o => [o.key, o]))

  function seriesKey(mv: Movement): string | null {
    if (def.splitBy === 'none')    return '__total__'
    if (def.splitBy === 'group')   { const g = typeToGroup[mv.movement_type_id ?? -1]; return g ? String(g) : null }
    if (def.splitBy === 'type')    return mv.movement_type_id ? String(mv.movement_type_id) : null
    return mv.account_id ? String(mv.account_id) : null
  }
  function baseInfo(key: string): { label: string; color: string } {
    if (key === '__total__') return { label: def.sign === 'expense' ? t('charts.expense') : def.sign === 'income' ? t('charts.income') : 'Total', color: def.defaultColor }
    if (def.splitBy === 'group')   return { label: groupById[+key]?.name ?? '?',   color: groupById[+key]?.color   ?? '#6b7280' }
    if (def.splitBy === 'type')    return { label: typeById[+key]?.name   ?? '?',   color: typeById[+key]?.color    ?? '#6b7280' }
    return                                { label: accountById[+key]?.name ?? '?',  color: accountById[+key]?.color ?? '#6b7280' }
  }
  function makeSeries(key: string): ComputedSeries {
    const info = baseInfo(key); const ov = overrideMap[key]
    const fallback = (def.defaultDisplay === 'donut' || def.defaultDisplay === 'pie') ? 'bar' : def.defaultDisplay
    return { key, label: ov?.label ?? info.label, color: ov?.color ?? info.color, display: ov?.display ?? fallback, stacked: ov?.stacked ?? false, cumulative: ov?.cumulative ?? false }
  }
  // Use signed dinero so refunds/returns properly cancel out within a category.
  // We take Math.abs of the final accumulated value per bucket so bars are always positive.
  const val = (mv: Movement) => def.metric === 'count' ? 1 : mv.dinero

  // Collect unique keys in appearance order
  const keyOrder: string[] = []; const keySeen = new Set<string>()
  for (const mv of movements) { const k = seriesKey(mv); if (k && !keySeen.has(k)) { keySeen.add(k); keyOrder.push(k) } }

  if (def.xAxis === 'none') {
    const byKey: Record<string,number> = {}
    for (const mv of movements) { const k = seriesKey(mv); if (k) byKey[k] = (byKey[k] ?? 0) + val(mv) }
    const data = keyOrder.map(key => {
      const info = baseInfo(key); const ov = overrideMap[key]
      return { name: ov?.label ?? info.label, value: Math.abs(byKey[key] ?? 0), color: ov?.color ?? info.color }
    }).sort((a, b) => (b.value as number) - (a.value as number))
    return { data, series: keyOrder.map(makeSeries) }
  }

  const isYear = def.xAxis === 'year'
  const xBuckets = isYear
    ? [...new Set(movements.map(mv => mv.date.slice(0,4)))].sort().map(y => ({ key: y, label: y }))
    : buildMonthSeries(movements, def.year)

  const byBucket: Record<string,Record<string,number>> = {}
  for (const { key } of xBuckets) byBucket[key] = {}
  for (const mv of movements) {
    const bucket = isYear ? mv.date.slice(0,4) : mvMonthKey(mv, def.year)
    const k = seriesKey(mv)
    if (!k || !byBucket[bucket]) continue
    byBucket[bucket][k] = (byBucket[bucket][k] ?? 0) + val(mv)
  }
  const data = xBuckets.map(({ key, label }) => ({
    x: label, ...Object.fromEntries(keyOrder.map(k => [k, Math.abs(byBucket[key]?.[k] ?? 0)]))
  }))
  return { data, series: keyOrder.map(makeSeries) }
}

function applyCumulative(data: Record<string,unknown>[], series: ComputedSeries[]): Record<string,unknown>[] {
  const cumKeys = series.filter(s => s.cumulative && s.display !== 'hidden').map(s => s.key)
  if (cumKeys.length === 0) return data
  const running: Record<string,number> = {}
  return data.map(row => {
    const newRow = { ...row }
    for (const k of cumKeys) {
      running[k] = (running[k] ?? 0) + ((row[k] as number) ?? 0)
      newRow[k] = running[k]
    }
    return newRow
  })
}

// ── Dashboard-native chart types (ported as built-ins) ────────────────────────

const DASH_EXCLUDE_GROUPS  = new Set(['Ingreso','Total','Ahorro','Gastos Anuales','Inversión'])
const DASH_BALANCE_EXCLUDE = new Set(['Total','Ahorro','Gastos Anuales','Inversión'])

function buildGroupStats(
  movements: Movement[], typeToGroup: Record<number,number>, groupById: Record<number,Group>,
): Array<{ name:string; color:string; monthly:Record<number,number>; total:number }> {
  const byGroup: Record<number,{ name:string; color:string; monthly:Record<number,number>; total:number }> = {}
  for (const mv of movements) {
    const gid = typeToGroup[mv.movement_type_id ?? -1]; if (!gid) continue
    const g = groupById[gid]; if (!g) continue
    if (!byGroup[gid]) byGroup[gid] = { name:g.name, color:g.color, monthly:{}, total:0 }
    const mi = +mv.date.slice(5,7) - 1
    byGroup[gid].monthly[mi] = (byGroup[gid].monthly[mi] ?? 0) + mv.dinero
    byGroup[gid].total += mv.dinero
  }
  return Object.values(byGroup)
}

function DashExpLineChart({ filtered, typeToGroup, groupById, year }: ChartProps) {
  const { fmtK } = useCurrency()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const groups   = useMemo(()=>buildGroupStats(filtered.filter(mv=>mv.dinero<0), typeToGroup, groupById),[filtered,typeToGroup,groupById])
  const cutMonth = year===null||year<CUR_YEAR ? 11 : new Date().getMonth()
  const expGroups = groups.filter(g=>!DASH_EXCLUDE_GROUPS.has(g.name)).filter(g=>Object.values(g.monthly).some(v=>v!==0))
  const chartData = Array.from({ length:cutMonth+1 }, (_,i) => {
    const e: Record<string,number|string> = { month:MONTHS[i] }
    for (const g of expGroups) e[g.name] = Math.abs(g.monthly[i] ?? 0)
    return e
  })
  if (!expGroups.length) return <Empty/>
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top:4, right:16, left:0, bottom:0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
        <XAxis dataKey="month" tick={{ fontSize:11, fill:'#9ca3af' }} axisLine={false} tickLine={false}/>
        <YAxis tickFormatter={fmtK} tick={{ fontSize:11, fill:'#9ca3af' }} axisLine={false} tickLine={false} width={42}/>
        <Tooltip content={p=><CT {...(p as unknown as Parameters<typeof CT>[0])} fmt={v=>String(Math.round(v))}/>}/>
        <Legend wrapperStyle={{ fontSize:11, paddingTop:12 }} iconType="circle" iconSize={8}
          onClick={e=>{ const k=e.dataKey as string; setHidden(p=>{ const n=new Set(p); n.has(k)?n.delete(k):n.add(k); return n }) }}
          formatter={(v:string)=><span style={{ color:hidden.has(v)?'#d1d5db':undefined, cursor:'pointer' }}>{v}</span>}
        />
        {expGroups.map(g=>(
          <Line key={g.name} type="linear" dataKey={g.name} stroke={g.color} strokeWidth={2}
            dot={false} activeDot={{ r:4, strokeWidth:0 }} isAnimationActive={false}
            hide={hidden.has(g.name)} strokeOpacity={hidden.has(g.name)?0:1}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function DashExpPieChart({ filtered, typeToGroup, groupById }: ChartProps) {
  const { fmt } = useCurrency()
  const [activeIdx, setActiveIdx] = useState<number|null>(null)
  const [cursor, setCursor]       = useState({ x:0, y:0 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const groups  = useMemo(()=>buildGroupStats(filtered.filter(mv=>mv.dinero<0), typeToGroup, groupById),[filtered,typeToGroup,groupById])
  const slices  = groups
    .filter(g=>!DASH_EXCLUDE_GROUPS.has(g.name)&&!DASH_BALANCE_EXCLUDE.has(g.name))
    .map(g=>({ name:g.name, value:Math.abs(g.total), color:g.color }))
    .filter(s=>s.value>0).sort((a,b)=>b.value-a.value)
  if (!slices.length) return <Empty/>
  const active = activeIdx!==null ? slices[activeIdx] : null
  return (
    <div ref={wrapRef} className="relative"
      onMouseMove={e=>{ const r=wrapRef.current?.getBoundingClientRect(); if(r) setCursor({ x:e.clientX-r.left, y:e.clientY-r.top }) }}>
      {active && (
        <div className="absolute z-10 pointer-events-none bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-lg px-3 py-2 text-sm"
          style={{ left:cursor.x+14, top:cursor.y-38 }}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor:active.color }}/>
            <span className="text-gray-700 dark:text-gray-300">{active.name}</span>
            <span className="font-mono font-semibold ml-1">{fmt(active.value)}</span>
          </div>
        </div>
      )}
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie data={slices} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={2}
            onMouseEnter={(_,i)=>setActiveIdx(i)} onMouseLeave={()=>setActiveIdx(null)}>
            {slices.map((s,i)=>(
              <Cell key={s.name} fill={s.color} opacity={activeIdx===null||activeIdx===i?1:0.35} stroke="none"/>
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 px-2 pb-1">
        {slices.map((s,i)=>(
          <div key={s.name} className="flex items-center gap-1.5 cursor-default transition-opacity"
            style={{ opacity:activeIdx===null||activeIdx===i?1:0.35 }}
            onMouseEnter={()=>setActiveIdx(i)} onMouseLeave={()=>setActiveIdx(null)}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor:s.color }}/>
            <span className="text-[11px] text-gray-600 dark:text-gray-400">{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DashBalanceChart({ filtered, typeToGroup, groupById, year, accounts }: ChartProps & { accounts: Account[] }) {
  const { fmt, fmtK } = useCurrency()
  const groups       = useMemo(()=>buildGroupStats(filtered, typeToGroup, groupById),[filtered,typeToGroup,groupById])
  const initialTotal = useMemo(()=>accounts.reduce((s,a)=>s+(a.initial_balance??0),0),[accounts])
  const cutMonth = year===null||year<CUR_YEAR ? 11 : new Date().getMonth()
  const netGroups = groups.filter(g=>!DASH_BALANCE_EXCLUDE.has(g.name)&&g.name!=='Total')
  let running = initialTotal
  const chartData = Array.from({ length:cutMonth+1 }, (_,i) => {
    const net = netGroups.reduce((s,g)=>s+(g.monthly[i]??0),0)
    running += net
    return { month:MONTHS[i], balance:Math.round(running*100)/100 }
  })
  const vals = chartData.map(d=>d.balance)
  const min = Math.min(...vals), max = Math.max(...vals), pad = (max-min)*0.1||100
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData} margin={{ top:4, right:16, left:0, bottom:0 }}>
        <defs>
          <linearGradient id="dashBalGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
        <XAxis dataKey="month" tick={{ fontSize:11, fill:'#9ca3af' }} axisLine={false} tickLine={false}/>
        <YAxis tickFormatter={fmtK} tick={{ fontSize:11, fill:'#9ca3af' }} axisLine={false} tickLine={false} width={48} domain={[min-pad,max+pad]}/>
        <Tooltip content={(p:unknown)=><CT {...(p as Parameters<typeof CT>[0])} fmt={fmt}/>}/>
        <Area type="linear" dataKey="balance" stroke="#3b82f6" strokeWidth={2} fill="url(#dashBalGrad)" dot={false} activeDot={{ r:4, strokeWidth:0, fill:'#3b82f6' }} isAnimationActive={false}/>
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Built-in chart components ─────────────────────────────────────────────────

function DonutLayout({ data, mode, fmt, outerR, side, onLayoutChange }: {
  data: { name: string; value: number; color: string }[]
  mode: 'donut' | 'pie'; fmt: (v: number) => string
  outerR: number; side: 'left'|'right'|'top'|'bottom'
  onLayoutChange?: (outerR: number, side: 'left'|'right'|'top'|'bottom') => void
}) {
  const editable = !!onLayoutChange
  const [dragZone, setDragZone] = useState<'left'|'right'|'top'|'bottom'|null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragZoneRef = useRef<typeof dragZone>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const [listOverflows, setListOverflows] = useState(false)
  const [listAtBottom, setListAtBottom] = useState(true)
  const checkListScroll = () => {
    const el = listScrollRef.current
    if (!el) return
    const overflows = el.scrollHeight > el.clientHeight + 2
    setListOverflows(overflows)
    setListAtBottom(!overflows || el.scrollHeight - el.scrollTop <= el.clientHeight + 2)
  }
  useEffect(() => { checkListScroll() }, [data, outerR, side])

  const innerR    = mode === 'donut' ? Math.round(outerR * 0.57) : 0
  const boxSize   = outerR * 2 + 16
  const isRow     = side === 'left' || side === 'right'
  const isPieFirst = side === 'left' || side === 'top'

  function startResize(e: React.MouseEvent) {
    if (!onLayoutChange) return
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX; const startY = e.clientY; const startR = outerR
    const onMove = (ev: MouseEvent) => {
      const d = Math.max(ev.clientX - startX, ev.clientY - startY)
      onLayoutChange(Math.round(Math.max(40, Math.min(180, startR + d)) / 5) * 5, side)
    }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }

  function startDrag(e: React.MouseEvent) {
    if (!onLayoutChange) return
    e.preventDefault()
    setIsDragging(true); dragZoneRef.current = null
    const onMove = (ev: MouseEvent) => {
      if (!containerRef.current) return
      const r = containerRef.current.getBoundingClientRect()
      const rx = (ev.clientX - r.left) / r.width
      const ry = (ev.clientY - r.top) / r.height
      const z: 'left'|'right'|'top'|'bottom' = Math.abs(rx - 0.5) > Math.abs(ry - 0.5)
        ? (rx < 0.5 ? 'left' : 'right') : (ry < 0.5 ? 'top' : 'bottom')
      dragZoneRef.current = z; setDragZone(z)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
      setIsDragging(false); setDragZone(null)
      if (dragZoneRef.current) onLayoutChange(outerR, dragZoneRef.current)
    }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }

  const pieBlock = (
    <div key="pie" style={{ width: boxSize, height: boxSize, flexShrink: 0 }} className="relative">
      {editable && (
        <div onMouseDown={startDrag}
          title="Arrastra para reposicionar"
          className="absolute top-1 left-1 z-10 cursor-grab p-0.5 rounded text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
          <GripVertical className="w-3.5 h-3.5"/>
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={innerR} outerRadius={outerR} paddingAngle={mode==='donut'?2:1} dataKey="value">
            {data.map((d,i) => <Cell key={i} fill={d.color}/>)}
          </Pie>
          <Tooltip content={(p: unknown) => { const { active, payload } = p as { active?: boolean; payload?: { name:string; value:number; payload:{ color:string } }[] }; if (!active||!payload?.length) return null; const item=payload[0]; return (<div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl shadow-lg px-3 py-2.5 text-xs"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor:item.payload.color }}/><span className="text-gray-500 dark:text-gray-400">{item.name}:</span><span className="font-mono font-medium text-gray-800 dark:text-gray-100">{fmt(item.value)}</span></div></div>) }}/>
        </PieChart>
      </ResponsiveContainer>
      {editable && (
        <div onMouseDown={startResize} title="Arrastra para redimensionar"
          className="absolute bottom-0.5 right-0.5 z-10 cursor-nwse-resize p-1">
          <div className="w-3 h-3 border-r-2 border-b-2 border-gray-400 dark:border-gray-500 rounded-br-sm"/>
        </div>
      )}
    </div>
  )

  const listBlock = (
    <div key="list" className="flex-1 min-w-0 relative" style={isRow ? { maxHeight: boxSize } : {}}>
      <div ref={listScrollRef}
        className={`space-y-1.5 ${isRow ? 'overflow-y-auto h-full [&::-webkit-scrollbar]:hidden' : ''}`}
        style={isRow ? { maxHeight: boxSize, scrollbarWidth: 'none' } : {}}
        onScroll={checkListScroll}>
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }}/>
            <span className="flex-1 truncate text-gray-600 dark:text-gray-400">{d.name}</span>
            <span className="font-mono text-gray-700 dark:text-gray-200 shrink-0">{fmt(d.value)}</span>
          </div>
        ))}
      </div>
      {isRow && listOverflows && !listAtBottom && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white dark:from-gray-900 to-transparent rounded-b" />
      )}
    </div>
  )

  const ZONE_CLS: Record<string, string> = {
    left:   'left-0 top-0 bottom-0 w-1/4',
    right:  'right-0 top-0 bottom-0 w-1/4',
    top:    'top-0 left-0 right-0 h-1/4',
    bottom: 'bottom-0 left-0 right-0 h-1/4',
  }

  return (
    <div ref={containerRef} className={`relative flex ${isRow ? 'flex-row items-start' : 'flex-col items-center'} gap-4`}>
      {isDragging && (
        <div className="absolute inset-0 z-20 pointer-events-none">
          {(['left','right','top','bottom'] as const).map(z => (
            <div key={z} className={`absolute ${ZONE_CLS[z]} rounded-lg border-2 transition-colors ${dragZone===z?'bg-blue-100/70 dark:bg-blue-900/40 border-blue-400':'border-gray-200 dark:border-gray-700 border-dashed'}`}/>
          ))}
        </div>
      )}
      {isPieFirst ? [pieBlock, listBlock] : [listBlock, pieBlock]}
    </div>
  )
}

function DonutOrBars({ data, mode, fmt, fmtK, outerR = 82, side = 'left', onLayoutChange }: {
  data: { name: string; value: number; color: string }[]
  mode: DisplayMode | 'pie'; fmt: (v: number) => string; fmtK: (v: number) => string
  outerR?: number; side?: 'left'|'right'|'top'|'bottom'
  onLayoutChange?: (outerR: number, side: 'left'|'right'|'top'|'bottom') => void
}) {
  const tt = (p: unknown) => <CT {...(p as Parameters<typeof CT>[0])} fmt={fmt}/>
  if (!data.length) return <Empty/>
  if (mode === 'donut' || mode === 'pie') {
    return <DonutLayout data={data} mode={mode} fmt={fmt} outerR={outerR} side={side} onLayoutChange={onLayoutChange}/>
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 30 + 20)}>
      <BarChart data={data} layout="vertical" margin={{ left:0, right:8 }}>
        <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize:10 }} axisLine={false} tickLine={false}/>
        <YAxis type="category" dataKey="name" tick={{ fontSize:11 }} axisLine={false} tickLine={false} width={110}/>
        <Tooltip content={tt}/>
        <Bar dataKey="value" name="Total" radius={[0,4,4,0]} maxBarSize={22}>
          {data.map((d,i) => <Cell key={i} fill={d.color}/>)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function MonthlyBarChart({ filtered, year, mode }: ChartProps) {
  const { fmt, fmtK } = useCurrency()
  const data = useMemo(() => {
    const series = buildMonthSeries(filtered, year)
    const m: Record<string,{ income:number; expense:number }> = {}
    for (const { key } of series) m[key] = { income:0, expense:0 }
    for (const mv of filtered) { const k = mvMonthKey(mv,year); if (m[k]) { if (mv.dinero>=0) m[k].income+=mv.dinero; else m[k].expense+=Math.abs(mv.dinero) } }
    return series.map(({ key, label }) => ({ month:label, ...m[key] }))
  }, [filtered, year])
  const tt = (p: unknown) => <CT {...(p as Parameters<typeof CT>[0])} fmt={fmt}/>
  if (mode==='lines') return (<ResponsiveContainer width="100%" height={220}><LineChart data={data}><CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/><XAxis dataKey="month" tick={{ fontSize:11 }} axisLine={false} tickLine={false}/><YAxis tickFormatter={fmtK} tick={{ fontSize:11 }} axisLine={false} tickLine={false} width={60}/><Tooltip content={tt}/><Legend wrapperStyle={{ fontSize:11, paddingTop:6 }}/><Line type="monotone" dataKey="income" name={t('charts.income')} stroke="#22c55e" strokeWidth={2} dot={false}/><Line type="monotone" dataKey="expense" name={t('charts.expense')} stroke="#ef4444" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer>)
  if (mode==='combo') return (<ResponsiveContainer width="100%" height={220}><ComposedChart data={data} barCategoryGap="35%"><CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/><XAxis dataKey="month" tick={{ fontSize:11 }} axisLine={false} tickLine={false}/><YAxis tickFormatter={fmtK} tick={{ fontSize:11 }} axisLine={false} tickLine={false} width={60}/><Tooltip content={tt}/><Legend wrapperStyle={{ fontSize:11, paddingTop:6 }}/><Bar dataKey="expense" name={t('charts.expense')} fill="#ef4444" radius={[4,4,0,0]} maxBarSize={40}/><Line type="monotone" dataKey="income" name={t('charts.income')} stroke="#22c55e" strokeWidth={2.5} dot={false} activeDot={{ r:4 }}/></ComposedChart></ResponsiveContainer>)
  const isStacked = mode==='stacked'
  return (<ResponsiveContainer width="100%" height={220}><BarChart data={data} barGap={4} barCategoryGap="30%"><CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/><XAxis dataKey="month" tick={{ fontSize:11 }} axisLine={false} tickLine={false}/><YAxis tickFormatter={fmtK} tick={{ fontSize:11 }} axisLine={false} tickLine={false} width={60}/><Tooltip content={tt}/><Legend wrapperStyle={{ fontSize:11, paddingTop:6 }}/><Bar dataKey="income" name={t('charts.income')} fill="#22c55e" radius={isStacked?[0,0,0,0]:[4,4,0,0]} maxBarSize={40} stackId={isStacked?'a':undefined}/><Bar dataKey="expense" name={t('charts.expense')} fill="#ef4444" radius={[4,4,0,0]} maxBarSize={40} stackId={isStacked?'a':undefined}/></BarChart></ResponsiveContainer>)
}

function NetMonthlyChart({ filtered, year }: ChartProps) {
  const { fmt, fmtK } = useCurrency()
  const data = useMemo(() => {
    const series = buildMonthSeries(filtered, year); const m: Record<string,number> = {}
    for (const { key } of series) m[key]=0
    for (const mv of filtered) { const k=mvMonthKey(mv,year); if (k in m) m[k]+=mv.dinero }
    return series.map(({ key, label }) => ({ month:label, net:m[key] }))
  }, [filtered, year])
  const tt = (p: unknown) => <CT {...(p as Parameters<typeof CT>[0])} fmt={fmt}/>
  return (<ResponsiveContainer width="100%" height={220}><BarChart data={data} barCategoryGap="35%"><CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/><XAxis dataKey="month" tick={{ fontSize:11 }} axisLine={false} tickLine={false}/><YAxis tickFormatter={fmtK} tick={{ fontSize:11 }} axisLine={false} tickLine={false} width={60}/><Tooltip content={tt}/><ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1}/><Bar dataKey="net" name={t('charts.net')} radius={[4,4,0,0]} maxBarSize={40}>{data.map((d,i)=><Cell key={i} fill={d.net>=0?'#22c55e':'#ef4444'}/>)}</Bar></BarChart></ResponsiveContainer>)
}

function CumulativeChart({ filtered, year, mode }: ChartProps) {
  const { fmt, fmtK } = useCurrency()
  const data = useMemo(() => {
    let acc=0
    return [...filtered].filter(mv=>!mv.no_count).sort((a,b)=>a.date.localeCompare(b.date))
      .map(mv => { acc+=mv.dinero; return { date:mv.date, label:year!==null?mv.date.slice(5):mv.date.slice(2,7), balance:acc } })
  }, [filtered, year])
  if (!data.length) return <Empty/>
  const tipContent = ({ active, payload }: { active?: boolean; payload?: { value:number; payload:{ date:string } }[] }) => {
    if (!active||!payload?.length) return null
    return (<div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl shadow-lg px-3 py-2.5 text-xs"><p className="text-gray-400 mb-0.5">{payload[0]?.payload?.date}</p><p className="font-mono font-semibold text-gray-800 dark:text-gray-100">{fmt(payload[0]?.value)}</p></div>)
  }
  if (mode==='lines') return (<ResponsiveContainer width="100%" height={220}><LineChart data={data}><CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/><XAxis dataKey="label" tick={{ fontSize:10 }} axisLine={false} tickLine={false} interval="preserveStartEnd"/><YAxis tickFormatter={fmtK} tick={{ fontSize:11 }} axisLine={false} tickLine={false} width={60}/><Tooltip content={tipContent as never}/><Line type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer>)
  return (<ResponsiveContainer width="100%" height={220}><AreaChart data={data}><defs><linearGradient id="cumG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/><XAxis dataKey="label" tick={{ fontSize:10 }} axisLine={false} tickLine={false} interval="preserveStartEnd"/><YAxis tickFormatter={fmtK} tick={{ fontSize:11 }} axisLine={false} tickLine={false} width={60}/><Tooltip content={tipContent as never}/><Area type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2} fill="url(#cumG)" dot={false}/></AreaChart></ResponsiveContainer>)
}

function ExpenseDonutChart({ filtered, typeToGroup, groupById, mode }: ChartProps) {
  const { fmt, fmtK } = useCurrency()
  const data = useMemo(() => {
    const s: Record<number,number> = {}
    for (const mv of filtered) { if (mv.dinero>=0) continue; const gid=typeToGroup[mv.movement_type_id??-1]; if (gid) s[gid]=(s[gid]??0)+Math.abs(mv.dinero) }
    return Object.entries(s).map(([gid,v])=>({ name:groupById[+gid]?.name??'?', value:v, color:groupById[+gid]?.color??'#6b7280' })).sort((a,b)=>b.value-a.value)
  }, [filtered, typeToGroup, groupById])
  return <DonutOrBars data={data} mode={mode} fmt={fmt} fmtK={fmtK}/>
}

function IncomeDonutChart({ filtered, typeToGroup, groupById, mode }: ChartProps) {
  const { fmt, fmtK } = useCurrency()
  const data = useMemo(() => {
    const s: Record<number,number> = {}
    for (const mv of filtered) { if (mv.dinero<=0) continue; const gid=typeToGroup[mv.movement_type_id??-1]; if (gid) s[gid]=(s[gid]??0)+mv.dinero }
    return Object.entries(s).map(([gid,v])=>({ name:groupById[+gid]?.name??'?', value:v, color:groupById[+gid]?.color??'#22c55e' })).sort((a,b)=>b.value-a.value)
  }, [filtered, typeToGroup, groupById])
  return <DonutOrBars data={data} mode={mode} fmt={fmt} fmtK={fmtK}/>
}

function TopTypesChart({ filtered, typeById }: ChartProps) {
  const { fmt, fmtK } = useCurrency()
  const data = useMemo(() => {
    const s: Record<number,{ name:string; value:number; color:string }> = {}
    for (const mv of filtered) { if (mv.dinero>=0||!mv.movement_type_id) continue; const tid=mv.movement_type_id; if (!s[tid]) { const t=typeById[tid]; s[tid]={ name:t?.name??'?', value:0, color:t?.color??'#6b7280' } }; s[tid].value+=Math.abs(mv.dinero) }
    return Object.values(s).sort((a,b)=>b.value-a.value).slice(0,10)
  }, [filtered, typeById])
  const tt = (p: unknown) => <CT {...(p as Parameters<typeof CT>[0])} fmt={fmt}/>
  if (!data.length) return <Empty/>
  return (<ResponsiveContainer width="100%" height={Math.max(180, data.length*30+20)}><BarChart data={data} layout="vertical" margin={{ left:0, right:8 }}><XAxis type="number" tickFormatter={fmtK} tick={{ fontSize:10 }} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="name" tick={{ fontSize:11 }} axisLine={false} tickLine={false} width={100}/><Tooltip content={tt}/><Bar dataKey="value" name="Gasto" radius={[0,4,4,0]} maxBarSize={22}>{data.map((d,i)=><Cell key={i} fill={d.color}/>)}</Bar></BarChart></ResponsiveContainer>)
}

function SavingsChart({ filtered, typeToGroup, groupById, year, mode }: ChartProps) {
  const { fmt, fmtK } = useCurrency()
  const ahorroId = useMemo(() => Object.values(groupById).find(g=>g.name==='Ahorro')?.id, [groupById])
  const data = useMemo(() => {
    const series=buildMonthSeries(filtered,year); const m: Record<string,{ ahorro:number; gasto:number }>={}
    for (const { key } of series) m[key]={ ahorro:0, gasto:0 }
    for (const mv of filtered) { if (mv.dinero>=0) continue; const k=mvMonthKey(mv,year); if (!(k in m)) continue; const gid=typeToGroup[mv.movement_type_id??-1]; if (ahorroId&&gid===ahorroId) m[k].ahorro+=Math.abs(mv.dinero); else m[k].gasto+=Math.abs(mv.dinero) }
    return series.map(({ key, label }) => ({ month:label, ...m[key] }))
  }, [filtered, typeToGroup, ahorroId, year])
  const tt = (p: unknown) => <CT {...(p as Parameters<typeof CT>[0])} fmt={fmt}/>
  if (mode==='combo') return (<ResponsiveContainer width="100%" height={220}><ComposedChart data={data} barCategoryGap="35%"><CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/><XAxis dataKey="month" tick={{ fontSize:11 }} axisLine={false} tickLine={false}/><YAxis tickFormatter={fmtK} tick={{ fontSize:11 }} axisLine={false} tickLine={false} width={60}/><Tooltip content={tt}/><Legend wrapperStyle={{ fontSize:11, paddingTop:6 }}/><Bar dataKey="gasto" name="Gastos" fill="#ef4444" radius={[4,4,0,0]} maxBarSize={40}/><Area type="monotone" dataKey="ahorro" name="Ahorro" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} strokeWidth={2.5} dot={false}/></ComposedChart></ResponsiveContainer>)
  const isStacked = mode!=='bars'
  return (<ResponsiveContainer width="100%" height={220}><BarChart data={data} barCategoryGap="30%"><CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/><XAxis dataKey="month" tick={{ fontSize:11 }} axisLine={false} tickLine={false}/><YAxis tickFormatter={fmtK} tick={{ fontSize:11 }} axisLine={false} tickLine={false} width={60}/><Tooltip content={tt}/><Legend wrapperStyle={{ fontSize:11, paddingTop:6 }}/><Bar dataKey="ahorro" name="Ahorro" fill="#8b5cf6" radius={[4,4,0,0]} maxBarSize={40} stackId={isStacked?'a':undefined}/><Bar dataKey="gasto" name="Gastos" fill="#ef4444" radius={isStacked?[0,0,0,0]:[4,4,0,0]} maxBarSize={40} stackId={isStacked?'a':undefined}/></BarChart></ResponsiveContainer>)
}

function TrendLineChart({ filtered, typeToGroup, groupById, year, mode }: ChartProps) {
  const { fmt, fmtK } = useCurrency()
  const { top5, data } = useMemo(() => {
    const totals: Record<number,number>={}
    for (const mv of filtered) { if (mv.dinero>=0) continue; const gid=typeToGroup[mv.movement_type_id??-1]; if (gid) totals[gid]=(totals[gid]??0)+Math.abs(mv.dinero) }
    const top5ids=Object.entries(totals).sort(([,a],[,b])=>b-a).slice(0,5).map(([id])=>+id)
    const top5=top5ids.map(id=>groupById[id]).filter(Boolean)
    const series=buildMonthSeries(filtered,year)
    const byM: Record<string,Record<number,number>>={}
    for (const { key } of series) { byM[key]={}; for (const id of top5ids) byM[key][id]=0 }
    for (const mv of filtered) { if (mv.dinero>=0) continue; const gid=typeToGroup[mv.movement_type_id??-1]; if (!top5ids.includes(gid)) continue; const k=mvMonthKey(mv,year); if (byM[k]) byM[k][gid]=(byM[k][gid]??0)+Math.abs(mv.dinero) }
    const data=series.map(({ key, label })=>({ month:label, ...Object.fromEntries(top5ids.map(id=>[id,byM[key]?.[id]??0])) }))
    return { top5, data }
  }, [filtered, typeToGroup, groupById, year])
  const tt = (p: unknown) => <CT {...(p as Parameters<typeof CT>[0])} fmt={fmt}/>
  if (!top5.length) return <Empty/>
  if (mode==='bars') return (<ResponsiveContainer width="100%" height={240}><BarChart data={data} barCategoryGap="25%"><CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/><XAxis dataKey="month" tick={{ fontSize:11 }} axisLine={false} tickLine={false}/><YAxis tickFormatter={fmtK} tick={{ fontSize:11 }} axisLine={false} tickLine={false} width={60}/><Tooltip content={tt}/><Legend wrapperStyle={{ fontSize:11, paddingTop:6 }}/>{top5.map(g=><Bar key={g.id} dataKey={g.id} name={g.name} fill={g.color} radius={[4,4,0,0]} maxBarSize={24}/>)}</BarChart></ResponsiveContainer>)
  if (mode==='combo') return (<ResponsiveContainer width="100%" height={240}><ComposedChart data={data} barCategoryGap="25%"><CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/><XAxis dataKey="month" tick={{ fontSize:11 }} axisLine={false} tickLine={false}/><YAxis tickFormatter={fmtK} tick={{ fontSize:11 }} axisLine={false} tickLine={false} width={60}/><Tooltip content={tt}/><Legend wrapperStyle={{ fontSize:11, paddingTop:6 }}/>{top5.map((g,i)=>i===0?<Area key={g.id} type="monotone" dataKey={g.id} name={g.name} stroke={g.color} fill={g.color} fillOpacity={0.18} strokeWidth={2.5} dot={false}/>:<Bar key={g.id} dataKey={g.id} name={g.name} fill={g.color} radius={[4,4,0,0]} maxBarSize={18}/>)}</ComposedChart></ResponsiveContainer>)
  if (mode==='area') return (<ResponsiveContainer width="100%" height={240}><AreaChart data={data}><CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/><XAxis dataKey="month" tick={{ fontSize:11 }} axisLine={false} tickLine={false}/><YAxis tickFormatter={fmtK} tick={{ fontSize:11 }} axisLine={false} tickLine={false} width={60}/><Tooltip content={tt}/><Legend wrapperStyle={{ fontSize:11, paddingTop:6 }}/>{top5.map(g=><Area key={g.id} type="monotone" dataKey={g.id} name={g.name} stroke={g.color} fill={g.color} fillOpacity={0.15} strokeWidth={2} dot={false}/>)}</AreaChart></ResponsiveContainer>)
  return (<ResponsiveContainer width="100%" height={240}><LineChart data={data}><CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/><XAxis dataKey="month" tick={{ fontSize:11 }} axisLine={false} tickLine={false}/><YAxis tickFormatter={fmtK} tick={{ fontSize:11 }} axisLine={false} tickLine={false} width={60}/><Tooltip content={tt}/><Legend wrapperStyle={{ fontSize:11, paddingTop:6 }}/>{top5.map(g=><Line key={g.id} type="monotone" dataKey={g.id} name={g.name} stroke={g.color} strokeWidth={2} dot={false} activeDot={{ r:4 }}/>)}</LineChart></ResponsiveContainer>)
}

function SubtypesByGroupChart({ filtered, typeToGroup, groupById, typeById, mode }: ChartProps) {
  const { fmt, fmtK } = useCurrency()
  const { data, subtypes } = useMemo(() => {
    const typeInfo: Record<number,{ name:string; color:string }>={}
    for (const mv of filtered) { if (mv.dinero>=0||!mv.movement_type_id) continue; const tid=mv.movement_type_id; if (!typeInfo[tid]) { const t=typeById[tid]; typeInfo[tid]={ name:t?.name??'?', color:t?.color??'#6b7280' } } }
    const byGroup: Record<number,Record<string,number>>={}
    for (const mv of filtered) { if (mv.dinero>=0||!mv.movement_type_id) continue; const gid=typeToGroup[mv.movement_type_id]; if (!gid) continue; const key=`t${mv.movement_type_id}`; if (!byGroup[gid]) byGroup[gid]={}; byGroup[gid][key]=(byGroup[gid][key]??0)+Math.abs(mv.dinero) }
    const data=Object.entries(byGroup).map(([gid,vals])=>({ group:groupById[+gid]?.name??'?', ...vals })).sort((a,b)=>{ const sum=(x: typeof a)=>Object.entries(x).filter(([k])=>k.startsWith('t')).reduce((s,[,v])=>s+(v as unknown as number),0); return sum(b)-sum(a) })
    const subtypes=Object.entries(typeInfo).map(([id,info])=>({ key:`t${id}`, ...info }))
    return { data, subtypes }
  }, [filtered, typeToGroup, groupById, typeById])
  const tt = (p: unknown) => <CT {...(p as Parameters<typeof CT>[0])} fmt={fmt}/>
  if (!data.length) return <Empty h={240}/>
  const isStacked = mode==='stacked'
  if (mode==='lines') return (<ResponsiveContainer width="100%" height={240}><LineChart data={data}><CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/><XAxis dataKey="group" tick={{ fontSize:10 }} axisLine={false} tickLine={false}/><YAxis tickFormatter={fmtK} tick={{ fontSize:11 }} axisLine={false} tickLine={false} width={60}/><Tooltip content={tt}/><Legend wrapperStyle={{ fontSize:11, paddingTop:6 }}/>{subtypes.map(s=><Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r:4, fill:s.color }}/>)}</LineChart></ResponsiveContainer>)
  return (<ResponsiveContainer width="100%" height={240}><BarChart data={data} barCategoryGap="25%"><CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/><XAxis dataKey="group" tick={{ fontSize:10 }} axisLine={false} tickLine={false}/><YAxis tickFormatter={fmtK} tick={{ fontSize:11 }} axisLine={false} tickLine={false} width={60}/><Tooltip content={tt}/><Legend wrapperStyle={{ fontSize:11, paddingTop:6 }}/>{subtypes.map((s,i)=><Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={isStacked?'g':undefined} radius={isStacked?(i===subtypes.length-1?[4,4,0,0]:[0,0,0,0]):[4,4,0,0]} maxBarSize={isStacked?60:20}/>)}</BarChart></ResponsiveContainer>)
}

// ── ChartWithFilter (built-in charts) ─────────────────────────────────────────

function ChartWithFilter({ title, groups, types, allYears, modes, onDelete,
  render: Render }: {
  title: string; groups: Group[]; types: MovementType[]; allYears: number[]
  modes?: ModeOption[]; onDelete?: () => void
  render: (props: ChartProps) => React.ReactNode
}) {
  const [showFilters,       setShowFilters]       = useState(false)
  const [showYearPicker,    setShowYearPicker]    = useState(false)
  const [confirmingDelete,  setConfirmingDelete]  = useState(false)
  const [year,              setYear]              = useState<number | null>(CUR_YEAR)
  const [advFilter,         setAdvFilter]         = useState<AdvancedFilter>(EMPTY_FILTER)
  const [mode,              setMode]              = useState<DisplayMode>(modes?.[0]?.id ?? 'bars')

  const { data: movements = [] } = useQuery({ queryKey:['movements',year], queryFn:()=>getMovements(year!==null?{year}:undefined) })
  const typeToGroup = useMemo(()=>Object.fromEntries(types.map(t=>[t.id,t.income_expense_group_id])),[types])
  const groupById   = useMemo(()=>Object.fromEntries(groups.map(g=>[g.id,g])),[groups])
  const typeById    = useMemo(()=>Object.fromEntries(types.map(t=>[t.id,t])),[types])
  const filtered    = useMemo(()=>applyAdvancedFilter(movements,advFilter,typeToGroup),[movements,advFilter,typeToGroup])
  const condCount   = advFilter.conditions.length
  const activeCount = condCount + (year!==CUR_YEAR?1:0)

  return (
    <div className="h-full bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-1 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical className="drag-handle w-3.5 h-3.5 text-gray-200 dark:text-gray-700 shrink-0 cursor-grab" strokeWidth={1.5}/>
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 min-w-0 truncate">{title}</h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {modes && modes.length>1 && (
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
              {modes.map(m=><button key={m.id} onClick={()=>setMode(m.id)} title={m.label} className={`p-1 rounded-md transition-colors ${mode===m.id?'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm':'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>{m.icon}</button>)}
            </div>
          )}
          {/* Year picker */}
          <div className="relative">
            <button onClick={()=>setShowYearPicker(v=>!v)} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${showYearPicker||year!==CUR_YEAR?'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200':'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-600'}`}>
              {year??'Todos'} <ChevronDown className="w-3 h-3"/>
            </button>
            {showYearPicker && (
              <div className="absolute right-0 top-8 z-20 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl p-1.5 flex flex-col gap-0.5 min-w-[80px]">
                {[null,...allYears].map(y=>(
                  <button key={y??'all'} onClick={()=>{ setYear(y); setShowYearPicker(false) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium text-left transition-colors ${year===y?'bg-gray-800 dark:bg-white text-white dark:text-gray-900':'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    {y??'Todos'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={()=>setShowFilters(v=>!v)} title="Filtros avanzados" className={`relative p-1.5 rounded-lg transition-colors ${showFilters||activeCount>0?'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200':'text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
            <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={1.5}/>
            {activeCount>0&&!showFilters&&<span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 text-white text-[8px] flex items-center justify-center font-bold leading-none">{activeCount}</span>}
          </button>
          {onDelete && (
            confirmingDelete ? (
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={()=>{ onDelete(); setConfirmingDelete(false) }}
                  className="px-2 py-1 text-xs rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors whitespace-nowrap">
                  Ocultar
                </button>
                <button onClick={()=>setConfirmingDelete(false)} className="p-1 rounded-lg text-gray-300 dark:text-gray-600 hover:text-gray-500 transition-colors">
                  <X className="w-3 h-3" strokeWidth={1.5}/>
                </button>
              </div>
            ) : (
              <button onClick={()=>setConfirmingDelete(true)} title="Ocultar gráfico" className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5}/>
              </button>
            )
          )}
        </div>
      </div>
      {showFilters && (
        <div className="mx-5 mb-3">
          <FilterPanel filter={advFilter} onChange={setAdvFilter} types={types} groups={groups}/>
        </div>
      )}
      <div className="px-5 pb-5 pt-2">
        <Render filtered={filtered} typeToGroup={typeToGroup} groupById={groupById} typeById={typeById} year={year} mode={mode}/>
      </div>
    </div>
  )
}

// ── ResizableWrapper ─────────────────────────────────────────────────────────

function buildPackedLayout(items: { i: string; w: number; h: number }[]): readonly LayoutItem[] {
  let x = 0, y = 0, rowH = 0
  return items.map(item => {
    if (x + item.w > 4) { x = 0; y += rowH; rowH = 0 }
    const pos = { i: item.i, x, y, w: item.w, h: item.h }
    x += item.w; rowH = Math.max(rowH, item.h)
    return pos
  })
}

// ── CustomChartCard ───────────────────────────────────────────────────────────

function CustomChartCard({ def, chartH, onUpdate, onDelete, onHide, onEdit, allYears, groups, types, accounts }: {
  def: CustomChartDef; chartH: number
  onUpdate: (d: CustomChartDef) => void; onDelete: () => void; onHide?: () => void; onEdit: () => void
  allYears: number[]; groups: Group[]; types: MovementType[]; accounts: Account[]
}) {
  const { fmt, fmtK } = useCurrency()
  const [showYearPicker, setShowYearPicker] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const upd = useCallback((patch: Partial<CustomChartDef>) => onUpdate({ ...def, ...patch }), [def, onUpdate])

  const isAccounts = (def.dataSource ?? 'movements') === 'accounts'
  const effectiveYear_c = def.period ? CUR_YEAR : def.year
  const { data: movements = [] } = useQuery({ queryKey:['movements',effectiveYear_c], queryFn:()=>getMovements(effectiveYear_c!==null?{year:effectiveYear_c}:undefined) })
  const { data: movementsAll = [] } = useQuery({ queryKey:['movements',null], queryFn:()=>getMovements(), enabled: isAccounts && def.xAxis!=='none' })
  const typeToGroup  = useMemo(()=>Object.fromEntries(types.map(t=>[t.id,t.income_expense_group_id])),[types])
  const groupById    = useMemo(()=>Object.fromEntries(groups.map(g=>[g.id,g])),[groups])
  const typeById     = useMemo(()=>Object.fromEntries(types.map(t=>[t.id,t])),[types])
  const accountById  = useMemo(()=>Object.fromEntries(accounts.map(a=>[a.id,a])),[accounts])

  const baseFiltered = useMemo(()=>{
    if (isAccounts) return []
    const f = applyAdvancedFilter(movements, def.filter, typeToGroup)
    const signed = def.sign==='all' ? f : f.filter(mv=>def.sign==='expense'?mv.dinero<0:mv.dinero>0)
    if (def.period === 'current_month')
      return signed.filter(mv => mv.date.startsWith(`${CUR_YEAR}-${CUR_MONTH}`))
    if (def.xAxis==='none' && def.noneAxisPeriod==='month')
      return signed.filter(mv => mv.date.slice(5,7) === CUR_MONTH)
    return signed
  }, [isAccounts, movements, def.filter, def.sign, typeToGroup, def.xAxis, def.noneAxisPeriod, def.period])

  const { data: rawChartData, series } = useMemo(
    ()=>isAccounts ? { data:[], series:[] } : computeChartData(def, baseFiltered, typeToGroup, groupById, typeById, accountById),
    [isAccounts, def, baseFiltered, typeToGroup, groupById, typeById, accountById]
  )
  const chartData = useMemo(()=>applyCumulative(rawChartData, series), [rawChartData, series])

  const accountsCurrentData = useMemo(()=>{
    if (!isAccounts || def.xAxis!=='none') return null
    return accounts.map(a=>({ name:a.name, value:a.balance, color:a.color })).filter(d=>d.value!==0).sort((a,b)=>b.value-a.value)
  }, [isAccounts, def.xAxis, accounts])

  const accountsHistoryData = useMemo(()=>{
    if (!isAccounts || def.xAxis==='none' || !movementsAll.length) return null
    const isYear = def.xAxis==='year'
    const xBuckets = isYear
      ? [...new Set(movementsAll.map(mv=>mv.date.slice(0,4)))].sort().map(y=>({ key:y, label:y }))
      : buildMonthSeries(movementsAll, null)
    const linkedTypes: Record<number, Set<number>> = {}
    for (const acc of accounts) {
      if (!acc.is_main) linkedTypes[acc.id] = new Set(types.filter(t=>t.linked_account_id===acc.id).map(t=>t.id))
    }
    const balAt = (acc: Account, key: string) => {
      const inRange = (mv: Movement) => (isYear?mv.date.slice(0,4):mv.date.slice(0,7)) <= key
      if (acc.is_main) return acc.initial_balance + movementsAll.filter(inRange).reduce((s,mv)=>s+mv.dinero, 0)
      const linked = linkedTypes[acc.id]
      return acc.initial_balance + movementsAll.filter(mv=>mv.movement_type_id!=null&&linked.has(mv.movement_type_id)&&inRange(mv)).reduce((s,mv)=>s+mv.money, 0)
    }
    const ovMap = Object.fromEntries(def.overrides.map(o=>[o.key,o]))
    const defDisp = (d: string): ComputedSeries['display'] => d==='bar'?'bar':d==='area'?'area':'line'
    if (def.splitBy==='none') {
      const data = xBuckets.map(({ key, label }) => ({ x:label, total:accounts.reduce((s,acc)=>s+balAt(acc,key),0) }))
      const accSeries: ComputedSeries[] = [{ key:'total', label:'Total cuentas', color:def.defaultColor, display:defDisp(def.defaultDisplay), stacked:false, cumulative:false }]
      return { data, accSeries }
    }
    const data = xBuckets.map(({ key, label }) => {
      const row: Record<string,unknown> = { x: label }
      for (const acc of accounts) row[`a${acc.id}`] = balAt(acc, key)
      return row
    })
    const accSeries: ComputedSeries[] = accounts.map(acc=>{
      const k = `a${acc.id}`; const ov = ovMap[k]
      return { key:k, label:ov?.label??acc.name, color:ov?.color??acc.color, display:defDisp(ov?.display??def.defaultDisplay), stacked:ov?.stacked??false, cumulative:false }
    })
    return { data, accSeries }
  }, [isAccounts, def.xAxis, def.splitBy, def.overrides, def.defaultDisplay, def.defaultColor, movementsAll, accounts, types])

  const mFmt  = def.metric==='count' ? (v: number) => String(Math.round(v)) : fmt
  const mFmtK = def.metric==='count' ? (v: number) => String(Math.round(v)) : fmtK
  const tt = (p: unknown) => <CT {...(p as Parameters<typeof CT>[0])} fmt={mFmt}/>

  // permVisible = not permanently hidden via overrides (X button in builder)
  // visible     = also exclude locally toggled series (legend click)
  const [localHidden, setLocalHidden] = useState<Set<string>>(new Set())
  function toggleLocal(key: string) {
    setLocalHidden(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }
  const permVisible = series.filter(s=>s.display!=='hidden')
  const visible     = permVisible.filter(s=>!localHidden.has(s.key))

  // Chart rendering
  const lt = def.lineType ?? 'monotone'
  let chartEl: React.ReactNode

  if (isAccounts) {
    if (def.xAxis==='none') {
      const d = accountsCurrentData ?? []
      chartEl = d.length===0 ? <Empty h={chartH}/> : (
        <DonutOrBars data={d}
          mode={def.defaultDisplay==='donut'?'donut':def.defaultDisplay==='pie'?'pie':'bars'}
          fmt={fmt} fmtK={fmtK} outerR={def.donutSize??82} side={def.donutSide??'left'}/>
      )
    } else {
      const h = accountsHistoryData
      chartEl = !h ? <Empty h={chartH}/> : (
        <ResponsiveContainer width="100%" height={chartH}>
          <ComposedChart data={h.data}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
            <XAxis dataKey="x" tick={{ fontSize:11 }} axisLine={false} tickLine={false}/>
            <YAxis tickFormatter={fmtK} tick={{ fontSize:11 }} axisLine={false} tickLine={false} width={60}/>
            <Tooltip content={tt}/>
            {h.accSeries.length>1 && <Legend wrapperStyle={{ fontSize:11, paddingTop:4 }}/>}
            {h.accSeries.filter(s=>s.display!=='hidden').map(s=>{
              const common = { key:s.key, dataKey:s.key, name:s.label }
              if (s.display==='bar') return <Bar {...common} fill={s.color} radius={s.stacked?[0,0,0,0]:[4,4,0,0]} maxBarSize={40} stackId={s.stacked?'sb':undefined}/>
              if (s.display==='area') return <Area {...common} type={lt} stroke={s.color} fill={s.color} fillOpacity={0.15} strokeWidth={2} dot={false} stackId={s.stacked?'sa':undefined}/>
              return <Line {...common} type={lt} stroke={s.color} strokeWidth={2} dot={false}/>
            })}
          </ComposedChart>
        </ResponsiveContainer>
      )
    }
  } else if (chartData.length===0 || (def.xAxis!=='none' && visible.length===0)) {
    chartEl = <Empty h={chartH}/>
  } else if (def.xAxis==='none') {
    chartEl = <DonutOrBars data={chartData as { name:string; value:number; color:string }[]}
      mode={def.defaultDisplay==='donut'?'donut':def.defaultDisplay==='pie'?'pie':'bars'}
      fmt={mFmt} fmtK={mFmtK} outerR={def.donutSize??82} side={def.donutSide??'left'}/>
  } else {
    const legendContent = permVisible.length>1 ? ()=>(
      <div className="flex flex-wrap gap-3 justify-center pt-1.5" style={{ fontSize:11 }}>
        {permVisible.map(s=>(
          <button key={s.key}
            onClick={()=>toggleLocal(s.key)}
            className={`flex items-center gap-1.5 transition-opacity ${localHidden.has(s.key)?'opacity-30':'text-gray-600 dark:text-gray-400 hover:opacity-70'}`}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor:s.color }}/>
            <span className={localHidden.has(s.key)?'line-through':''}>{s.label}</span>
          </button>
        ))}
      </div>
    ) : undefined
    const dm = def.displayMode ?? null
    chartEl = (
      <ResponsiveContainer width="100%" height={chartH}>
        <ComposedChart data={chartData} key={visible.map(s=>`${s.key}:${dm??s.display}`).join()}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
          <XAxis dataKey="x" tick={{ fontSize:11 }} axisLine={false} tickLine={false}/>
          <YAxis tickFormatter={mFmtK} tick={{ fontSize:11 }} axisLine={false} tickLine={false} width={60}
            domain={def.yMax != null ? [0, def.yMax] : undefined} allowDataOverflow={def.yMax != null}/>
          <Tooltip content={tt}/>
          {legendContent && <Legend wrapperStyle={{ paddingTop:4 }} content={legendContent}/>}
          {visible.map(s => {
            const d = dm ?? s.display
            const common = { key:s.key, dataKey:s.key, name:s.label }
            if (d==='line') return <Line  {...common} type={lt} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r:4 }}/>
            if (d==='area') return <Area  {...common} type={lt} stroke={s.color} fill={s.color} fillOpacity={0.15} strokeWidth={2} dot={false} stackId={s.stacked?'sa':undefined}/>
            return                 <Bar   {...common} fill={s.color} radius={s.stacked?[0,0,0,0]:[4,4,0,0]} maxBarSize={40} stackId={s.stacked?'sb':undefined}/>
          })}
        </ComposedChart>
      </ResponsiveContainer>
    )
  }

  const modeOptions = def.xAxis==='none'
    ? [['bar',t('charts.modeColumns'),BarChart2],['donut',t('charts.modeDonut'),PieIcon]] as const
    : [['bar',t('charts.modeColumns'),BarChart2],['line',t('charts.modeLines'),Activity],['area',t('charts.modeArea'),TrendingUp]] as const

  return (
    <div className="relative h-full bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center px-4 pt-3 pb-2 gap-2">
        <GripVertical className="drag-handle w-3.5 h-3.5 text-gray-200 dark:text-gray-700 shrink-0 cursor-grab" strokeWidth={1.5}/>
        <h3 className="flex-1 text-sm font-semibold text-gray-600 dark:text-gray-300 min-w-0 truncate">{def.title}</h3>
        <div className="flex items-center gap-0.5 shrink-0">
          {def.xAxis!=='year' && (
            <div className="relative">
              <button onClick={()=>setShowYearPicker(v=>!v)} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${showYearPicker||def.period||def.year!==CUR_YEAR?'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200':'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-600'}`}>
                {def.period==='current_year'?'Año actual':def.period==='current_month'?'Mes actual':(def.year??'Todos')} <ChevronDown className="w-3 h-3"/>
              </button>
              {showYearPicker && (
                <div className="absolute right-0 top-8 z-20 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl p-1.5 flex flex-col gap-0.5 min-w-[90px]">
                  {([['current_year','Año actual'],['current_month','Mes actual']] as const).map(([p,label])=>(
                    <button key={p} onClick={()=>{ upd({ period:p, year:CUR_YEAR }); setShowYearPicker(false) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium text-left transition-colors ${def.period===p?'bg-gray-800 dark:bg-white text-white dark:text-gray-900':'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                      {label}
                    </button>
                  ))}
                  <div className="h-px bg-gray-100 dark:bg-gray-700 my-0.5"/>
                  {[null,...allYears].map(y=>(
                    <button key={y??'all'} onClick={()=>{ upd({ year:y, period:undefined }); setShowYearPicker(false) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium text-left transition-colors ${!def.period&&def.year===y?'bg-gray-800 dark:bg-white text-white dark:text-gray-900':'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                      {y??'Todos'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {def.xAxis==='none' && !isAccounts && (
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
              <button onClick={()=>upd({ noneAxisPeriod:'year' })}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${(def.noneAxisPeriod??'year')==='year'?'bg-white dark:bg-gray-700 shadow-sm text-gray-800 dark:text-gray-100':'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                Año
              </button>
              <button onClick={()=>upd({ noneAxisPeriod:'month' })}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${def.noneAxisPeriod==='month'?'bg-white dark:bg-gray-700 shadow-sm text-gray-800 dark:text-gray-100':'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                Mes
              </button>
            </div>
          )}
          {def.showModeButtons && (
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5 ml-0.5">
              {def.xAxis==='none' ? (
                modeOptions.map(([id,,Icon])=>(
                  <button key={id} onClick={()=>upd({ defaultDisplay: id as CustomChartDef['defaultDisplay'] })}
                    className={`p-1 rounded-md transition-colors ${def.defaultDisplay===id?'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm':'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                    <Icon className="w-3 h-3"/>
                  </button>
                ))
              ) : (<>
                {([['bar',t('charts.modeColumns'),BarChart2],['line',t('charts.modeLines'),Activity],['area',t('charts.modeArea'),TrendingUp]] as const).map(([id,,Icon])=>(
                  <button key={id} onClick={()=>upd({ displayMode: id })}
                    className={`p-1 rounded-md transition-colors ${def.displayMode===id?'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm':'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                    <Icon className="w-3 h-3"/>
                  </button>
                ))}
                {permVisible.some(s => s.display !== permVisible[0]?.display) && (
                  <button onClick={()=>upd({ displayMode: null })} title="Mixto"
                    className={`p-1 rounded-md transition-colors ${!def.displayMode?'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm':'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                    <ComboIcon/>
                  </button>
                )}
              </>)}
            </div>
          )}
          <button onClick={onEdit} title="Editar gráfico" className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600 hover:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <Settings2 className="w-3.5 h-3.5" strokeWidth={1.5}/>
          </button>
          {confirmingDelete ? (
            <div className="flex items-center gap-1 shrink-0">
              {onHide && (
                <button onClick={()=>{ onHide(); setConfirmingDelete(false) }}
                  className="px-2 py-1 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors whitespace-nowrap">
                  Solo ocultar
                </button>
              )}
              <button onClick={()=>{ onDelete(); setConfirmingDelete(false) }}
                className="px-2 py-1 text-xs rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors whitespace-nowrap">
                Eliminar
              </button>
              <button onClick={()=>setConfirmingDelete(false)} className="p-1 rounded-lg text-gray-300 dark:text-gray-600 hover:text-gray-500 transition-colors">
                <X className="w-3 h-3" strokeWidth={1.5}/>
              </button>
            </div>
          ) : (
            <button onClick={()=>setConfirmingDelete(true)} title="Eliminar" className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5}/>
            </button>
          )}
        </div>
      </div>
      <div className="px-5 pb-6 pt-2">{chartEl}</div>
    </div>
  )
}

// ── ChartBuilderScreen ────────────────────────────────────────────────────────

function ChartBuilderScreen({ def, onUpdate, onSave, onCancel, allYears, groups, types, accounts }: {
  def: CustomChartDef; onUpdate: (d: CustomChartDef) => void; onSave: () => void; onCancel: () => void
  allYears: number[]; groups: Group[]; types: MovementType[]; accounts: Account[]
}) {
  const { fmt, fmtK } = useCurrency()
  const [showFilter,   setShowFilter]  = useState(false)
  const [colorPickKey, setColorPickKey] = useState<string|null>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const [sidebarAtBottom, setSidebarAtBottom] = useState(true)
  const checkSidebar = () => {
    const el = sidebarRef.current
    if (!el) return
    setSidebarAtBottom(el.scrollHeight <= el.clientHeight + 2 || el.scrollHeight - el.scrollTop <= el.clientHeight + 2)
  }

  const upd = useCallback((patch: Partial<CustomChartDef>) => onUpdate({ ...def, ...patch }), [def, onUpdate])

  const isAccounts = (def.dataSource ?? 'movements') === 'accounts'
  const effectiveYear_b = def.period ? CUR_YEAR : def.year
  const { data: movements = [] } = useQuery({ queryKey:['movements',effectiveYear_b], queryFn:()=>getMovements(effectiveYear_b!==null?{year:effectiveYear_b}:undefined) })
  const { data: movementsAll = [] } = useQuery({ queryKey:['movements',null], queryFn:()=>getMovements(), enabled: isAccounts && def.xAxis!=='none' })
  const typeToGroup = useMemo(()=>Object.fromEntries(types.map(t=>[t.id,t.income_expense_group_id])),[types])
  const groupById   = useMemo(()=>Object.fromEntries(groups.map(g=>[g.id,g])),[groups])
  const typeById    = useMemo(()=>Object.fromEntries(types.map(t=>[t.id,t])),[types])
  const accountById = useMemo(()=>Object.fromEntries(accounts.map(a=>[a.id,a])),[accounts])

  const baseFiltered = useMemo(()=>{
    if (isAccounts) return []
    const f = applyAdvancedFilter(movements, def.filter, typeToGroup)
    const signed = def.sign==='all' ? f : f.filter(mv=>def.sign==='expense'?mv.dinero<0:mv.dinero>0)
    if (def.period === 'current_month')
      return signed.filter(mv => mv.date.startsWith(`${CUR_YEAR}-${CUR_MONTH}`))
    if (def.xAxis==='none' && def.noneAxisPeriod==='month')
      return signed.filter(mv => mv.date.slice(5,7) === CUR_MONTH)
    return signed
  }, [isAccounts, movements, def.filter, def.sign, typeToGroup, def.xAxis, def.noneAxisPeriod, def.period])

  const { data: rawChartData, series } = useMemo(
    ()=>isAccounts ? { data:[], series:[] } : computeChartData(def, baseFiltered, typeToGroup, groupById, typeById, accountById),
    [isAccounts, def, baseFiltered, typeToGroup, groupById, typeById, accountById]
  )
  const chartData = useMemo(()=>applyCumulative(rawChartData, series), [rawChartData, series])

  const accountsCurrentData = useMemo(()=>{
    if (!isAccounts || def.xAxis!=='none') return null
    return accounts.map(a=>({ name:a.name, value:a.balance, color:a.color })).filter(d=>d.value!==0).sort((a,b)=>b.value-a.value)
  }, [isAccounts, def.xAxis, accounts])

  const accountsHistoryData = useMemo(()=>{
    if (!isAccounts || def.xAxis==='none' || !movementsAll.length) return null
    const isYear = def.xAxis==='year'
    const xBuckets = isYear
      ? [...new Set(movementsAll.map(mv=>mv.date.slice(0,4)))].sort().map(y=>({ key:y, label:y }))
      : buildMonthSeries(movementsAll, null)
    const linkedTypes: Record<number, Set<number>> = {}
    for (const acc of accounts) {
      if (!acc.is_main) linkedTypes[acc.id] = new Set(types.filter(t=>t.linked_account_id===acc.id).map(t=>t.id))
    }
    const balAt = (acc: Account, key: string) => {
      const inRange = (mv: Movement) => (isYear?mv.date.slice(0,4):mv.date.slice(0,7)) <= key
      if (acc.is_main) return acc.initial_balance + movementsAll.filter(inRange).reduce((s,mv)=>s+mv.dinero, 0)
      const linked = linkedTypes[acc.id]
      return acc.initial_balance + movementsAll.filter(mv=>mv.movement_type_id!=null&&linked.has(mv.movement_type_id)&&inRange(mv)).reduce((s,mv)=>s+mv.money, 0)
    }
    const ovMap = Object.fromEntries(def.overrides.map(o=>[o.key,o]))
    const defDisp = (d: string): ComputedSeries['display'] => d==='bar'?'bar':d==='area'?'area':'line'
    if (def.splitBy==='none') {
      const data = xBuckets.map(({ key, label }) => ({ x:label, total:accounts.reduce((s,acc)=>s+balAt(acc,key),0) }))
      const accSeries: ComputedSeries[] = [{ key:'total', label:'Total cuentas', color:def.defaultColor, display:defDisp(def.defaultDisplay), stacked:false, cumulative:false }]
      return { data, accSeries }
    }
    const data = xBuckets.map(({ key, label }) => {
      const row: Record<string,unknown> = { x: label }
      for (const acc of accounts) row[`a${acc.id}`] = balAt(acc, key)
      return row
    })
    const accSeries: ComputedSeries[] = accounts.map(acc=>{
      const k = `a${acc.id}`; const ov = ovMap[k]
      return { key:k, label:ov?.label??acc.name, color:ov?.color??acc.color, display:defDisp(ov?.display??def.defaultDisplay), stacked:ov?.stacked??false, cumulative:false }
    })
    return { data, accSeries }
  }, [isAccounts, def.xAxis, def.splitBy, def.overrides, def.defaultDisplay, def.defaultColor, movementsAll, accounts, types])

  const mFmt  = def.metric==='count' ? (v: number) => String(Math.round(v)) : fmt
  const mFmtK = def.metric==='count' ? (v: number) => String(Math.round(v)) : fmtK
  const tt = (p: unknown) => <CT {...(p as Parameters<typeof CT>[0])} fmt={mFmt}/>

  function setSeriesOverride(key: string, patch: Partial<Omit<SeriesOverride,'key'>>) {
    const existing = def.overrides.find(o=>o.key===key)
    const s = series.find(s=>s.key===key)!
    const updated: SeriesOverride = { key, display:s.display, color:s.color, label:s.label, ...(existing??{}), ...patch }
    upd({ overrides: existing ? def.overrides.map(o=>o.key===key?updated:o) : [...def.overrides, updated] })
  }

  const [localHidden, setLocalHidden] = useState<Set<string>>(new Set())
  function toggleLocal(key: string) {
    setLocalHidden(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }
  const permVisible = series.filter(s=>s.display!=='hidden')
  const visible     = permVisible.filter(s=>!localHidden.has(s.key))
  const dispIcons: Record<string, React.ReactNode> = { bar:<BarChart2 className="w-3.5 h-3.5"/>, line:<Activity className="w-3.5 h-3.5"/>, area:<TrendingUp className="w-3.5 h-3.5"/> }

  const lt = def.lineType ?? 'monotone'
  let chartEl: React.ReactNode

  if (isAccounts) {
    if (def.xAxis==='none') {
      const d = accountsCurrentData ?? []
      chartEl = d.length===0 ? <Empty h={340}/> : (
        <DonutOrBars data={d}
          mode={def.defaultDisplay==='donut'?'donut':def.defaultDisplay==='pie'?'pie':'bars'}
          fmt={fmt} fmtK={fmtK} outerR={def.donutSize??82} side={def.donutSide??'left'}
          onLayoutChange={(r,s)=>upd({ donutSize:r, donutSide:s })}/>
      )
    } else {
      const h = accountsHistoryData
      chartEl = !h ? <Empty h={340}/> : (
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={h.data}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
            <XAxis dataKey="x" tick={{ fontSize:11 }} axisLine={false} tickLine={false}/>
            <YAxis tickFormatter={fmtK} tick={{ fontSize:11 }} axisLine={false} tickLine={false} width={60}/>
            <Tooltip content={tt}/>
            {h.accSeries.length>1 && <Legend wrapperStyle={{ fontSize:11, paddingTop:4 }}/>}
            {h.accSeries.filter(s=>s.display!=='hidden').map(s=>{
              const common = { key:s.key, dataKey:s.key, name:s.label }
              if (s.display==='bar') return <Bar {...common} fill={s.color} radius={s.stacked?[0,0,0,0]:[4,4,0,0]} maxBarSize={40} stackId={s.stacked?'sb':undefined}/>
              if (s.display==='area') return <Area {...common} type={lt} stroke={s.color} fill={s.color} fillOpacity={0.15} strokeWidth={2} dot={false} stackId={s.stacked?'sa':undefined}/>
              return <Line {...common} type={lt} stroke={s.color} strokeWidth={2} dot={false}/>
            })}
          </ComposedChart>
        </ResponsiveContainer>
      )
    }
  } else if (chartData.length===0 || (def.xAxis!=='none' && visible.length===0)) {
    chartEl = <Empty h={340}/>
  } else if (def.xAxis==='none') {
    chartEl = <DonutOrBars data={chartData as { name:string; value:number; color:string }[]}
      mode={def.defaultDisplay==='donut'?'donut':def.defaultDisplay==='pie'?'pie':'bars'}
      fmt={mFmt} fmtK={mFmtK} outerR={def.donutSize??82} side={def.donutSide??'left'}
      onLayoutChange={(r,s)=>upd({ donutSize:r, donutSide:s })}/>
  } else {
    const legendContent = permVisible.length>1 ? ()=>(
      <div className="flex flex-wrap gap-3 justify-center pt-1.5" style={{ fontSize:11 }}>
        {permVisible.map(s=>(
          <button key={s.key}
            onClick={()=>toggleLocal(s.key)}
            className={`flex items-center gap-1.5 transition-opacity ${localHidden.has(s.key)?'opacity-30':'text-gray-600 dark:text-gray-400 hover:opacity-70'}`}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor:s.color }}/>
            <span className={localHidden.has(s.key)?'line-through':''}>{s.label}</span>
          </button>
        ))}
      </div>
    ) : undefined
    chartEl = (
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={chartData} key={visible.map(s=>`${s.key}:${s.display}`).join()}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
          <XAxis dataKey="x" tick={{ fontSize:11 }} axisLine={false} tickLine={false}/>
          <YAxis tickFormatter={mFmtK} tick={{ fontSize:11 }} axisLine={false} tickLine={false} width={60}
            domain={def.yMax != null ? [0, def.yMax] : undefined} allowDataOverflow={def.yMax != null}/>
          <Tooltip content={tt}/>
          {legendContent && <Legend wrapperStyle={{ paddingTop:4 }} content={legendContent}/>}
          {visible.map(s => {
            const common = { key:s.key, dataKey:s.key, name:s.label }
            if (s.display==='line') return <Line  {...common} type={lt} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r:4 }}/>
            if (s.display==='area') return <Area  {...common} type={lt} stroke={s.color} fill={s.color} fillOpacity={0.15} strokeWidth={2} dot={false} stackId={s.stacked?'sa':undefined}/>
            return                         <Bar   {...common} fill={s.color} radius={s.stacked?[0,0,0,0]:[4,4,0,0]} maxBarSize={52} stackId={s.stacked?'sb':undefined}/>
          })}
        </ComposedChart>
      </ResponsiveContainer>
    )
  }

  const labelCls = 'block text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5'

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-gray-50 dark:bg-gray-950">

      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-3.5 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <button onClick={onCancel} className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors shrink-0">
          <X className="w-4 h-4"/> Cancelar
        </button>
        <input
          value={def.title} onChange={e=>upd({ title:e.target.value })} placeholder="Título del gráfico"
          className="flex-1 min-w-0 text-base font-semibold text-gray-800 dark:text-white bg-transparent text-center focus:outline-none placeholder:text-gray-300"
        />
        <button onClick={onSave} className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gray-800 dark:bg-white text-white dark:text-gray-900 text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors shrink-0">
          Guardar
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: config panel */}
        <div className="w-80 shrink-0 relative flex flex-col bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800">
        <div ref={sidebarRef} className="flex-1 overflow-y-auto p-5 space-y-5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }} onScroll={checkSidebar}>

          <div className="space-y-1.5">
            <span className={labelCls}>Fuente de datos</span>
            <div className="flex gap-1.5">
              {([['movements','Movimientos'],['accounts','Cuentas']] as const).map(([src,label])=>(
                <button key={src} onClick={()=>upd({ dataSource:src, overrides:[], xAxis:src==='accounts'?'none':def.xAxis, defaultDisplay:src==='accounts'?'donut':def.defaultDisplay, splitBy:src==='accounts'?'none':def.splitBy })}
                  className={`flex-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${(def.dataSource??'movements')===src?'bg-gray-800 dark:bg-white text-white dark:text-gray-900 border-transparent':'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'}`}>
                  {label}
                </button>
              ))}
            </div>
            {!isAccounts && (<>
              <select value={def.sign} onChange={e=>upd({ sign:e.target.value as SignType })} className={`w-full ${selectCls}`}>
                <option value="expense">Solo gastos</option>
                <option value="income">Solo ingresos</option>
                <option value="all">Todos</option>
              </select>
              <select value={def.metric} onChange={e=>upd({ metric:e.target.value as MetricType })} className={`w-full ${selectCls}`}>
                <option value="sum">Suma (€)</option>
                <option value="count">Nº movimientos</option>
              </select>
            </>)}
          </div>

          <div className="space-y-1.5">
            <span className={labelCls}>Vista</span>
            <select value={def.xAxis} onChange={e=>{
              const xAxis=e.target.value as XAxisType
              upd({ xAxis, overrides:[],
                ...(xAxis==='year'?{ year:null }:{}),
                ...(xAxis!=='none'&&(def.defaultDisplay==='donut'||def.defaultDisplay==='pie')?{ defaultDisplay:'bar' as const }:{}),
                ...(xAxis==='none'&&(def.defaultDisplay==='line'||def.defaultDisplay==='area')?{ defaultDisplay:'bar' as const }:{}),
              })
            }} className={`w-full ${selectCls}`}>
              <option value="month">Eje: mes</option>
              <option value="year">Eje: año</option>
              <option value="none">Sin eje temporal</option>
            </select>
            {!isAccounts && (
              <select value={def.splitBy} onChange={e=>upd({ splitBy:e.target.value as SplitByType, overrides:[] })} className={`w-full ${selectCls}`}>
                <option value="none">Sin desglose</option>
                <option value="group">Por categoría</option>
                <option value="type">Por subtipo</option>
              </select>
            )}
            {def.xAxis!=='none' && (
              <>
                {!isAccounts && (
                  <div className="flex items-center gap-2 pt-1">
                    <label className="text-[11px] text-gray-400 shrink-0">Máx. eje Y</label>
                    <input
                      type="number" min="0" placeholder="Auto"
                      value={def.yMax ?? ''} onChange={e=>upd({ yMax: e.target.value==='' ? undefined : +e.target.value })}
                      className={`flex-1 ${selectCls}`}
                    />
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <label className="text-[11px] text-gray-400 shrink-0">Líneas</label>
                  {(['monotone','linear'] as const).map(lt=>(
                    <button key={lt} onClick={()=>upd({ lineType:lt })}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors ${(def.lineType??'monotone')===lt?'bg-gray-800 dark:bg-white text-white dark:text-gray-900 border-transparent':'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                      {lt==='monotone'?'Curvas':'Rectas'}
                    </button>
                  ))}
                </div>
              </>
            )}
            {!isAccounts && (
              <label className="flex items-center gap-2 text-[11px] text-gray-500 cursor-pointer pt-1">
                <input type="checkbox" checked={def.showModeButtons??false} onChange={e=>upd({ showModeButtons:e.target.checked })} className="w-3.5 h-3.5 rounded accent-blue-500"/>
                Selector de tipo en tarjeta
              </label>
            )}
          </div>

          {!isAccounts && def.xAxis!=='year' && (
            <div className="space-y-1.5">
              <span className={labelCls}>Periodo</span>
              <div className="flex flex-wrap gap-1">
                {([['current_year','Año actual'],['current_month','Mes actual']] as const).map(([p,label])=>(
                  <button key={p} onClick={()=>upd({ period:p, year:CUR_YEAR })} className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium border transition-colors ${def.period===p?'bg-gray-800 dark:bg-white text-white dark:text-gray-900 border-transparent':'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>{label}</button>
                ))}
                {[null,...allYears].map(y=>(
                  <button key={y??'all'} onClick={()=>upd({ year:y, period:undefined })} className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium border transition-colors ${!def.period&&def.year===y?'bg-gray-800 dark:bg-white text-white dark:text-gray-900 border-transparent':'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>{y??'Todos'}</button>
                ))}
              </div>
              {!def.period && def.xAxis==='none' && (
                <div className="flex gap-1.5 pt-0.5">
                  <button onClick={()=>upd({ noneAxisPeriod:'year' })}
                    className={`flex-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${(def.noneAxisPeriod??'year')==='year'?'bg-gray-800 dark:bg-white text-white dark:text-gray-900 border-transparent':'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'}`}>
                    Año completo
                  </button>
                  <button onClick={()=>upd({ noneAxisPeriod:'month' })}
                    className={`flex-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${def.noneAxisPeriod==='month'?'bg-gray-800 dark:bg-white text-white dark:text-gray-900 border-transparent':'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'}`}>
                    Mes actual
                  </button>
                </div>
              )}
            </div>
          )}

          {!isAccounts && (
            <div className="space-y-1.5">
              <span className={labelCls}>Filtros</span>
              <button onClick={()=>setShowFilter(v=>!v)} className={`flex items-center gap-1.5 w-full text-xs px-3 py-2 rounded-lg border transition-colors ${showFilter||def.filter.conditions.length>0?'bg-gray-800 dark:bg-white text-white dark:text-gray-900 border-transparent':'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                <SlidersHorizontal className="w-3.5 h-3.5"/> Filtro avanzado {def.filter.conditions.length>0&&`(${def.filter.conditions.length})`}
              </button>
              {showFilter && <FilterPanel filter={def.filter} onChange={filter=>upd({ filter })} types={types} groups={groups}/>}
            </div>
          )}

          {(series.length>0 || isAccounts) && (
            <div className="space-y-2">
              <span className={labelCls}>{isAccounts?'Tipo de gráfico':def.splitBy==='none'?'Tipo de gráfico':`Series (${series.length})`}</span>

              {(isAccounts || def.splitBy==='none' || def.xAxis==='none') && (
                <div className="flex flex-wrap gap-1.5">
                  {(def.xAxis==='none'
                    ? [{ id:'bar',   icon:<BarChart2 className="w-3.5 h-3.5"/>, label:'Barras' },
                       { id:'donut', icon:<PieIcon   className="w-3.5 h-3.5"/>, label:'Donut'  },
                       { id:'pie',   icon:<PieIcon   className="w-3.5 h-3.5"/>, label:'Tarta'  }]
                    : [{ id:'bar',   icon:<BarChart2  className="w-3.5 h-3.5"/>, label:t('charts.modeColumns') },
                       { id:'line',  icon:<Activity   className="w-3.5 h-3.5"/>, label:t('charts.modeLines')   },
                       { id:'area',  icon:<TrendingUp className="w-3.5 h-3.5"/>, label:t('charts.modeArea')    }]
                  ).map(m=>(
                    <button key={m.id} onClick={()=>upd({ defaultDisplay:m.id as CustomChartDef['defaultDisplay'] })}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${def.defaultDisplay===m.id?'bg-gray-800 dark:bg-white text-white dark:text-gray-900 border-transparent':'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'}`}
                    >{m.icon}{m.label}</button>
                  ))}
                  {(def.defaultDisplay==='donut'||def.defaultDisplay==='pie') && def.xAxis==='none' && (
                    <p className="text-[11px] text-gray-400 w-full pt-0.5">Arrastra el círculo en la vista previa para reposicionarlo y redimensionarlo.</p>
                  )}
                  {!isAccounts && def.splitBy==='none' && def.xAxis!=='none' && (
                    <div className="relative">
                      <button onClick={()=>setColorPickKey(colorPickKey==='__c__'?null:'__c__')} className="w-6 h-6 rounded-full border-2 border-gray-200 dark:border-gray-700 hover:scale-110 transition-transform" style={{ backgroundColor:def.defaultColor }}/>
                      {colorPickKey==='__c__' && (
                        <div className="absolute top-8 left-0 z-10 flex flex-wrap gap-1.5 p-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl w-44">
                          {PALETTE.map(c=><button key={c} onClick={()=>{ upd({ defaultColor:c }); setColorPickKey(null) }} className={`w-5 h-5 rounded-full hover:scale-110 transition-transform ${def.defaultColor===c?'ring-2 ring-offset-1 ring-gray-400':''}`} style={{ backgroundColor:c }}/>)}
                        </div>
                      )}
                    </div>
                  )}
                  {isAccounts && def.xAxis!=='none' && def.splitBy==='none' && (
                    <div className="relative">
                      <button onClick={()=>setColorPickKey(colorPickKey==='__c__'?null:'__c__')} className="w-6 h-6 rounded-full border-2 border-gray-200 dark:border-gray-700 hover:scale-110 transition-transform" style={{ backgroundColor:def.defaultColor }}/>
                      {colorPickKey==='__c__' && (
                        <div className="absolute top-8 left-0 z-10 flex flex-wrap gap-1.5 p-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl w-44">
                          {PALETTE.map(c=><button key={c} onClick={()=>{ upd({ defaultColor:c }); setColorPickKey(null) }} className={`w-5 h-5 rounded-full hover:scale-110 transition-transform ${def.defaultColor===c?'ring-2 ring-offset-1 ring-gray-400':''}`} style={{ backgroundColor:c }}/>)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {isAccounts && def.xAxis!=='none' && (
                <div className="flex gap-1.5">
                  {([['none','Suma total'],['account','Por cuenta']] as const).map(([v,label])=>(
                    <button key={v} onClick={()=>upd({ splitBy:v as SplitByType, overrides:[] })}
                      className={`flex-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${def.splitBy===v?'bg-gray-800 dark:bg-white text-white dark:text-gray-900 border-transparent':'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {isAccounts && def.xAxis!=='none' && def.splitBy!=='none' && accountsHistoryData && (() => {
                const { accSeries } = accountsHistoryData
                const setAccOverride = (key: string, patch: Partial<Omit<SeriesOverride,'key'>>) => {
                  const existing = def.overrides.find(o=>o.key===key)
                  const s = accSeries.find(s=>s.key===key)!
                  const updated: SeriesOverride = { key, display:s.display, color:s.color, label:s.label, stacked:s.stacked, ...(existing??{}), ...patch }
                  upd({ overrides: existing ? def.overrides.map(o=>o.key===key?updated:o) : [...def.overrides, updated] })
                }
                const setAllAccDisplay = (display: 'bar'|'line'|'area'|'hidden') => {
                  upd({ overrides: accSeries.map(s=>({ ...(def.overrides.find(o=>o.key===s.key)??{ key:s.key, color:s.color, label:s.label, stacked:s.stacked }), display })) })
                }
                return (
                  <div className="space-y-3">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-gray-400 shrink-0 mr-0.5">Todos:</span>
                      {([['bar',<BarChart2 className="w-3.5 h-3.5"/>,t('charts.modeColumns')],['line',<Activity className="w-3.5 h-3.5"/>,t('charts.modeLines')],['area',<TrendingUp className="w-3.5 h-3.5"/>,t('charts.modeArea')],['hidden',<X className="w-3.5 h-3.5"/>,'Ocultar']] as const).map(([d,icon,label])=>(
                        <button key={d} onClick={()=>setAllAccDisplay(d)} title={label}
                          className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >{icon}</button>
                      ))}
                      <span className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1 shrink-0"/>
                      <button onClick={()=>{ const allStacked=accSeries.every(s=>s.stacked); upd({ overrides: accSeries.map(s=>({ ...(def.overrides.find(o=>o.key===s.key)??{ key:s.key, color:s.color, label:s.label, display:s.display }), stacked:!allStacked })) }) }}
                        title={accSeries.every(s=>s.stacked)?'Desapilar todo':'Apilar todo'} className={`p-1.5 rounded-lg border transition-colors ${accSeries.every(s=>s.stacked)?'border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-500':'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                        <Layers className="w-3.5 h-3.5"/>
                      </button>
                    </div>
                    {accSeries.map(s=>(
                      <div key={s.key} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="relative shrink-0">
                            <button onClick={()=>setColorPickKey(colorPickKey===s.key?null:s.key)} className="w-5 h-5 rounded-full border border-gray-200 dark:border-gray-700 hover:scale-110 transition-transform" style={{ backgroundColor:s.color }}/>
                            {colorPickKey===s.key && (
                              <div className="absolute top-7 left-0 z-10 flex flex-wrap gap-1 p-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl w-44">
                                {PALETTE.map(c=><button key={c} onClick={()=>{ setAccOverride(s.key,{ color:c }); setColorPickKey(null) }} className={`w-5 h-5 rounded-full hover:scale-110 transition-transform ${s.color===c?'ring-2 ring-offset-1 ring-gray-400':''}`} style={{ backgroundColor:c }}/>)}
                              </div>
                            )}
                          </div>
                          <span className="flex-1 text-xs text-gray-600 dark:text-gray-400 truncate min-w-0">{s.label}</span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {(['bar','line','area'] as const).map(d=>(
                              <button key={d} onClick={()=>setAccOverride(s.key,{ display:d })} title={d==='bar'?t('charts.modeColumns'):d==='line'?t('charts.modeLines'):t('charts.modeArea')}
                                className={`p-1.5 rounded transition-colors ${s.display===d?'bg-gray-800 dark:bg-white text-white dark:text-gray-900':'text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400'}`}
                              >{dispIcons[d]}</button>
                            ))}
                            <button
                              onClick={()=>setAccOverride(s.key,{ stacked:!s.stacked })}
                              disabled={s.display==='line'||s.display==='hidden'}
                              title={s.stacked?'Dejar de apilar':'Apilar'}
                              className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${s.stacked&&s.display!=='line'&&s.display!=='hidden'?'bg-blue-500 text-white':'text-gray-400 dark:text-gray-600 hover:text-blue-500 dark:hover:text-blue-400'}`}
                            ><Layers className="w-3.5 h-3.5"/></button>
                            <button onClick={()=>setAccOverride(s.key,{ display:s.display==='hidden'?(def.defaultDisplay==='donut'||def.defaultDisplay==='pie'?'bar':def.defaultDisplay):'hidden' })}
                              title={s.display==='hidden'?'Mostrar':'Ocultar'}
                              className={`p-1.5 rounded transition-colors ${s.display==='hidden'?'text-gray-300 hover:text-gray-500':'text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400'}`}
                            ><X className="w-3.5 h-3.5"/></button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {!isAccounts && def.splitBy!=='none' && def.xAxis!=='none' && (() => {
                function setAllDisplay(display: 'bar'|'line'|'area'|'hidden') {
                  upd({ overrides: series.map(s => ({ ...(def.overrides.find(o=>o.key===s.key) ?? { key:s.key, color:s.color, label:s.label, stacked:s.stacked }), display })) })
                }
                return (
                  <div className="space-y-3">
                    {/* Change all row */}
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-gray-400 shrink-0 mr-0.5">Todos:</span>
                      {([['bar',<BarChart2 className="w-3.5 h-3.5"/>,t('charts.modeColumns')],['line',<Activity className="w-3.5 h-3.5"/>,t('charts.modeLines')],['area',<TrendingUp className="w-3.5 h-3.5"/>,t('charts.modeArea')],['hidden',<X className="w-3.5 h-3.5"/>,'Ocultar']] as const).map(([d,icon,label])=>(
                        <button key={d} onClick={()=>setAllDisplay(d)} title={label}
                          className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >{icon}</button>
                      ))}
                      <span className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1 shrink-0"/>
                      <button onClick={()=>{ const allStacked=series.every(s=>s.stacked); upd({ overrides: series.map(s => ({ ...(def.overrides.find(o=>o.key===s.key) ?? { key:s.key, color:s.color, label:s.label, display:s.display }), stacked:!allStacked })) }) }}
                        title={series.every(s=>s.stacked)?'Desapilar todo':'Apilar todo'} className={`p-1.5 rounded-lg border transition-colors ${series.every(s=>s.stacked)?'border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-500':'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                        <Layers className="w-3.5 h-3.5"/>
                      </button>
                      <button onClick={()=>upd({ overrides: series.map(s => ({ ...(def.overrides.find(o=>o.key===s.key) ?? { key:s.key, color:s.color, label:s.label, display:s.display }), cumulative:!series.every(x=>x.cumulative) })) })}
                        title="Acumulativo todo" className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <Sigma className="w-3.5 h-3.5"/>
                      </button>
                    </div>
                    {/* Per-series */}
                    {series.map(s=>(
                      <div key={s.key} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="relative shrink-0">
                            <button onClick={()=>setColorPickKey(colorPickKey===s.key?null:s.key)} className="w-5 h-5 rounded-full border border-gray-200 dark:border-gray-700 hover:scale-110 transition-transform" style={{ backgroundColor:s.color }}/>
                            {colorPickKey===s.key && (
                              <div className="absolute top-7 left-0 z-10 flex flex-wrap gap-1 p-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl w-44">
                                {PALETTE.map(c=><button key={c} onClick={()=>{ setSeriesOverride(s.key,{ color:c }); setColorPickKey(null) }} className={`w-5 h-5 rounded-full hover:scale-110 transition-transform ${s.color===c?'ring-2 ring-offset-1 ring-gray-400':''}`} style={{ backgroundColor:c }}/>)}
                              </div>
                            )}
                          </div>
                          <span className="flex-1 text-xs text-gray-600 dark:text-gray-400 truncate min-w-0">{s.label}</span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {(['bar','line','area'] as const).map(d=>(
                              <button key={d} onClick={()=>setSeriesOverride(s.key,{ display:d })} title={d==='bar'?t('charts.modeColumns'):d==='line'?t('charts.modeLines'):t('charts.modeArea')}
                                className={`p-1.5 rounded transition-colors ${s.display===d?'bg-gray-800 dark:bg-white text-white dark:text-gray-900':'text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400'}`}
                              >{dispIcons[d]}</button>
                            ))}
                            <button
                              onClick={()=>setSeriesOverride(s.key,{ stacked:!s.stacked })}
                              disabled={s.display==='line'||s.display==='hidden'}
                              title={s.stacked?'Dejar de apilar':'Apilar'}
                              className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${s.stacked&&s.display!=='line'&&s.display!=='hidden'?'bg-blue-500 text-white':'text-gray-400 dark:text-gray-600 hover:text-blue-500 dark:hover:text-blue-400'}`}
                            ><Layers className="w-3.5 h-3.5"/></button>
                            <button
                              onClick={()=>setSeriesOverride(s.key,{ cumulative:!s.cumulative })}
                              disabled={s.display==='hidden' || def.xAxis==='none'}
                              title={s.cumulative?'Quitar acumulativo':'Acumulativo'}
                              className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${s.cumulative&&s.display!=='hidden'?'bg-indigo-500 text-white':'text-gray-400 dark:text-gray-600 hover:text-indigo-500 dark:hover:text-indigo-400'}`}
                            ><Sigma className="w-3.5 h-3.5"/></button>
                            <button onClick={()=>setSeriesOverride(s.key,{ display:s.display==='hidden'?(def.defaultDisplay==='donut'||def.defaultDisplay==='pie')?'bar':def.defaultDisplay:'hidden' })}
                              title={s.display==='hidden'?'Mostrar':'Ocultar'}
                              className={`p-1.5 rounded transition-colors ${s.display==='hidden'?'text-gray-300 hover:text-gray-500':'text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400'}`}
                            ><X className="w-3.5 h-3.5"/></button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          )}

        </div>{/* end inner scroll */}
        {!sidebarAtBottom && <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white dark:from-gray-900 to-transparent" />}
        </div>{/* end sidebar wrapper */}

        {/* Right: preview */}
        <div className="flex-1 overflow-auto p-8 flex flex-col items-center justify-start [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          <div className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-6">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 uppercase tracking-wide font-medium">Vista previa</p>
            {chartEl}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Charts() {
  const [customCharts, setCustomCharts] = useState<CustomChartDef[]>(() => {
    try { return JSON.parse(localStorage.getItem('spendly-custom-charts-v2') ?? '[]') } catch { return [] }
  })
  const [draftChart, setDraftChart] = useState<CustomChartDef|null>(null)

  useEffect(() => { syncPref('spendly-custom-charts-v2', JSON.stringify(customCharts)) }, [customCharts])

  const { data: allMovements = [] } = useQuery({ queryKey:['movements-all'],  queryFn:()=>getMovements() })
  const { data: groups = [] }       = useQuery({ queryKey:['groups'],          queryFn:getGroups })
  const { data: types  = [] }       = useQuery({ queryKey:['movement-types'],  queryFn:getMovementTypes })
  const { data: summary }           = useQuery({ queryKey:['accounts'],         queryFn:getAccountsSummary })
  const accounts = summary?.accounts ?? []

  const allYears = useMemo(()=>[...new Set(allMovements.map(m=>+m.date.slice(0,4)))].sort((a,b)=>b-a),[allMovements])
  const shared   = { groups, types, allYears }
  const { width: gridWidth, containerRef } = useContainerWidth()

  const BUILTIN_DEFS = useMemo(()=>[
    { id:'monthly',    wide:true  },
    { id:'expdnt',     wide:false },
    { id:'net',        wide:false },
    { id:'cumulative', wide:false },
  ],[])

  const [hiddenBuiltins, setHiddenBuiltins] = useState<Set<string>>(()=>{
    try { return new Set(JSON.parse(localStorage.getItem('spendly-hidden-builtins') ?? '[]')) } catch { return new Set() }
  })
  const [builtinCfg, setBuiltinCfg] = useState<Record<string,{ colSpan?:number; height?:number }>>(()=>{
    try { return JSON.parse(localStorage.getItem('spendly-builtin-cfg') ?? '{}') } catch { return {} }
  })
  useEffect(()=>{ syncPref('spendly-builtin-cfg', JSON.stringify(builtinCfg)) },[builtinCfg])


  function hideBuiltin(id: string) {
    setHiddenBuiltins(prev=>{ const s=new Set(prev); s.add(id); syncPref('spendly-hidden-builtins', JSON.stringify([...s])); return s })
    setLayout(prev => prev.filter(l => l.i !== id))
  }

  const [hiddenCustom, setHiddenCustom] = useState<Set<string>>(()=>{
    try { return new Set(JSON.parse(localStorage.getItem('spendly-hidden-customs')??'[]')) } catch { return new Set() }
  })
  function hideCustomChart(id: string) {
    setHiddenCustom(prev=>{ const s=new Set(prev); s.add(id); syncPref('spendly-hidden-customs',JSON.stringify([...s])); return s })
    setLayout(prev => prev.filter(l => l.i !== id))
  }

  // ── Layout state (react-grid-layout) ─────────────────────────────────────────
  const [layout, setLayout] = useState<readonly LayoutItem[]>(() => {
    try {
      const saved = localStorage.getItem('spendly-charts-layout-v1')
      if (saved) return JSON.parse(saved)
    } catch { /* fall through */ }
    // Derive from existing stored data
    const bCfg: Record<string,{colSpan?:number;height?:number}> = (() => {
      try { return JSON.parse(localStorage.getItem('spendly-builtin-cfg') ?? '{}') } catch { return {} }
    })()
    const cCharts: CustomChartDef[] = (() => {
      try { return JSON.parse(localStorage.getItem('spendly-custom-charts-v2') ?? '[]') } catch { return [] }
    })()
    const hidB = new Set<string>((() => {
      try { return JSON.parse(localStorage.getItem('spendly-hidden-builtins') ?? '[]') } catch { return [] }
    })())
    const hidC = new Set<string>((() => {
      try { return JSON.parse(localStorage.getItem('spendly-hidden-customs') ?? '[]') } catch { return [] }
    })())
    const WIDE: Record<string,boolean> = { monthly: true }
    const IDS  = ['monthly','expdnt','net','cumulative']
    return buildPackedLayout([
      ...IDS.filter(id=>!hidB.has(id)).map(id=>({
        i: id, w: bCfg[id]?.colSpan ?? (WIDE[id] ? 4 : 2),
        h: Math.max(3, Math.ceil(((bCfg[id]?.height ?? 300) + CARD_HEADER_H) / ROW_H)),
      })),
      ...cCharts.filter(d=>!hidC.has(d.id)).map(d=>({
        i: d.id, w: d.colSpan ?? (d.wide ? 4 : 2),
        h: Math.max(3, Math.ceil(((d.height ?? 300) + CARD_HEADER_H) / ROW_H)),
      })),
    ])
  })
  useEffect(() => { syncPref('spendly-charts-layout-v1', JSON.stringify(layout)) }, [layout])

  function handleLayoutChange(newLayout: readonly LayoutItem[]) {
    setLayout(newLayout)
    setBuiltinCfg(prev => {
      const next = { ...prev }
      for (const item of newLayout) {
        if (BUILTIN_DEFS.some(b => b.id === item.i))
          next[item.i] = { ...next[item.i], colSpan: item.w, height: item.h * ROW_H }
      }
      return next
    })
    setCustomCharts(prev => prev.map(c => {
      const item = newLayout.find(l => l.i === c.id)
      return item ? { ...c, colSpan: item.w, height: item.h * ROW_H } : c
    }))
  }

  const [editingId, setEditingId] = useState<string|null>(null)

  function addChart()  { setDraftChart(newCustomChart()); setEditingId(null) }
  function editChart(def: CustomChartDef) { setDraftChart({...def}); setEditingId(def.id) }
  function saveDraft() {
    if (!draftChart) return
    if (editingId) {
      setCustomCharts(cs => cs.map(c => c.id === editingId ? draftChart : c))
    } else {
      setCustomCharts(cs => [...cs, draftChart])
      setLayout(prev => {
        const maxY = prev.reduce((m, l) => Math.max(m, l.y + l.h), 0)
        return [...prev, { i: draftChart.id, x: 0, y: maxY, w: effectiveColSpan(draftChart), h: 3 }]
      })
    }
    setDraftChart(null); setEditingId(null)
  }
  function cancelDraft() { setDraftChart(null); setEditingId(null) }

  if (draftChart) return (
    <ChartBuilderScreen
      def={draftChart} onUpdate={setDraftChart}
      onSave={saveDraft} onCancel={cancelDraft}
      allYears={allYears} groups={groups} types={types} accounts={accounts}
    />
  )

  return (
    <div className="p-3 md:p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">{t('charts.title')}</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">Filtros y vista independientes por gráfico</p>
        </div>
        <div className="flex items-center gap-2">
          {(hiddenBuiltins.size + hiddenCustom.size) > 0 && (
            <button onClick={()=>{
              const restB = [...hiddenBuiltins], restC = [...hiddenCustom]
              setHiddenBuiltins(new Set()); localStorage.removeItem('spendly-hidden-builtins')
              setHiddenCustom(new Set()); localStorage.removeItem('spendly-hidden-customs')
              setLayout(prev => {
                const maxY = prev.reduce((m, l) => Math.max(m, l.y + l.h), 0)
                const WIDE: Record<string,boolean> = { monthly: true }
                const toAdd = [
                  ...restB.map(id => ({ i: id, w: builtinCfg[id]?.colSpan ?? (WIDE[id] ? 4 : 2), h: 3 })),
                  ...restC.map(id => { const d = customCharts.find(c => c.id === id); return { i: id, w: d ? effectiveColSpan(d) : 2, h: 3 } }),
                ]
                return [...prev, ...buildPackedLayout(toAdd).map(item => ({ ...item, y: item.y + maxY }))]
              })
            }} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Restaurar ocultos ({hiddenBuiltins.size + hiddenCustom.size})
            </button>
          )}
          <button onClick={addChart} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gray-800 dark:bg-white text-white dark:text-gray-900 text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors shadow-sm">
            <Plus className="w-4 h-4"/> Añadir gráfico
          </button>
        </div>
      </div>

      <div ref={containerRef}>
      {gridWidth > 0 && <GridLayout
        layout={layout}
        width={gridWidth}
        gridConfig={{ cols: 4, rowHeight: ROW_H, margin: [16, 16] as [number,number], containerPadding: [0, 0] as [number,number] }}
        dragConfig={{ handle: '.drag-handle' }}
        resizeConfig={{ handles: ['s', 'e'] }}
        compactor={verticalCompactor}
        onLayoutChange={handleLayoutChange}
      >
        {BUILTIN_DEFS.filter(b=>!hiddenBuiltins.has(b.id)).map(({id})=>{
          const bp = { ...shared, onDelete: ()=>hideBuiltin(id) }
          const renderMap: Record<string,()=>React.ReactNode> = {
            monthly:       ()=><ChartWithFilter title="Ingresos y gastos por mes"       {...bp} modes={[M_BARS,M_STACKED,M_LINES,M_COMBO]} render={p=><MonthlyBarChart {...p}/>}/>,
            net:           ()=><ChartWithFilter title="Balance neto por mes"            {...bp}                                             render={p=><NetMonthlyChart {...p}/>}/>,
            cumulative:    ()=><ChartWithFilter title="Balance acumulado"               {...bp} modes={[M_AREA,M_LINES]}                   render={p=><CumulativeChart {...p}/>}/>,
            expdnt:        ()=><ChartWithFilter title="Gastos por categoría"            {...bp} modes={[M_DONUT,M_BARS]}                   render={p=><ExpenseDonutChart {...p}/>}/>,
            incdnt:        ()=><ChartWithFilter title="Ingresos por categoría"          {...bp} modes={[M_DONUT,M_BARS]}                   render={p=><IncomeDonutChart {...p}/>}/>,
            top:           ()=><ChartWithFilter title="Top subtipos de gasto"           {...bp}                                             render={p=><TopTypesChart {...p}/>}/>,
            savings:       ()=><ChartWithFilter title="Ahorro vs gasto mensual"         {...bp} modes={[M_STACKED,M_BARS,M_COMBO]}         render={p=><SavingsChart {...p}/>}/>,
            trend:         ()=><ChartWithFilter title="Tendencia mensual por categoría" {...bp} modes={[M_LINES,M_AREA,M_BARS,M_COMBO]}    render={p=><TrendLineChart {...p}/>}/>,
            subtypes:      ()=><ChartWithFilter title="Subtipos de gasto por categoría" {...bp} modes={[M_STACKED,M_BARS,M_LINES]}         render={p=><SubtypesByGroupChart {...p}/>}/>,
            'dash-line':   ()=><ChartWithFilter title="Gastos por categoría vs Ingresos"{...bp}                                             render={p=><DashExpLineChart {...p}/>}/>,
            'dash-pie':    ()=><ChartWithFilter title="Distribución de gastos"           {...bp}                                             render={p=><DashExpPieChart {...p}/>}/>,
            'dash-balance':()=><ChartWithFilter title="Evolución del balance"            {...bp}                                             render={p=><DashBalanceChart {...p} accounts={accounts}/>}/>,
          }
          const renderFn = renderMap[id]; if (!renderFn) return null
          return <div key={id} className="h-full overflow-hidden">{renderFn()}</div>
        })}

        {customCharts.filter(def=>!hiddenCustom.has(def.id)).map(def=>{
          const item = layout.find(l => l.i === def.id)
          const chartH = item ? Math.max(80, item.h * ROW_H - CARD_HEADER_H) : 240
          return (
            <div key={def.id} className="h-full overflow-hidden">
              <CustomChartCard
                def={def}
                chartH={chartH}
                onUpdate={updated=>setCustomCharts(cs=>cs.map(c=>c.id===def.id?updated:c))}
                onDelete={()=>{ setCustomCharts(cs=>cs.filter(c=>c.id!==def.id)); setLayout(prev=>prev.filter(l=>l.i!==def.id)) }}
                onHide={()=>hideCustomChart(def.id)}
                onEdit={()=>editChart(def)}
                allYears={allYears} groups={groups} types={types} accounts={accounts}
              />
            </div>
          )
        })}
      </GridLayout>}
      </div>
    </div>
  )
}
