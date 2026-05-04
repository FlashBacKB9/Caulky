import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ComposedChart, Line,
} from 'recharts'
import {
  TrendingUp, Plus, Trash2, Copy, Sparkles, Bookmark,
  BookmarkCheck, ChevronDown, ChevronUp, Info, Target, X, ChevronRight,
} from 'lucide-react'
import { getMovements } from '../api/movements'
import { useCurrency } from '../hooks/useCurrency'

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const MONTH_NAMES  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const AI_EXPENSE_GROWTH = 3   // CPI Spain ~3% / year
const AI_INCOME_GROWTH  = 2   // Salary growth Spain ~2% / year

// ── Types ─────────────────────────────────────────────────────────────────────

type FreqType = 'monthly' | 'every-n' | 'annual'

interface Expense {
  id: string
  name: string
  amount: number
  frequency: FreqType
  everyN: number        // months between payments (for 'every-n')
  startOffset: number   // months from projection start for first payment (for 'every-n')
  annualMonth: number   // 1-12, calendar month of payment (for 'annual')
}

interface PhaseConfig {
  income: number
  incomeGrowthPct: number
  expenseGrowthPct: number
  durationMonths: number   // 0 = unlimited (only phase 1 uses this)
  expenses: Expense[]
}

interface Config {
  mode: 'auto' | 'manual'
  autoYears: number
  initialBalance: number
  projectionYears: number
  targetAmount: string    // '' = no target
  twoPhases: boolean
  phases: [PhaseConfig, PhaseConfig]
}

interface DataPoint {
  t: number
  label: string
  balance: number
  net: number
  phase: 1 | 2
}

interface Snapshot {
  savedAt: string       // ISO date string
  points: DataPoint[]
  targetAmount: string
}

// ── Storage helpers ───────────────────────────────────────────────────────────

const CONFIG_KEY   = 'caulky-projection-config'
const SNAPSHOT_KEY = 'caulky-projection-snapshot'

function loadLS<T>(key: string, fallback: T): T {
  try { const s = localStorage.getItem(key); if (s) return JSON.parse(s) } catch { /**/ }
  return fallback
}

// ── Factory helpers ───────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2)

const newExpense = (): Expense => ({
  id: uid(), name: '', amount: 0,
  frequency: 'monthly', everyN: 3, startOffset: 0, annualMonth: 1,
})

const newPhase = (): PhaseConfig => ({
  income: 0, incomeGrowthPct: AI_INCOME_GROWTH,
  expenseGrowthPct: AI_EXPENSE_GROWTH, durationMonths: 24, expenses: [],
})

const defaultConfig = (): Config => ({
  mode: 'manual', autoYears: 2,
  initialBalance: 0, projectionYears: 10,
  targetAmount: '', twoPhases: false,
  phases: [newPhase(), newPhase()],
})

// ── Computation ───────────────────────────────────────────────────────────────

function computeProjection(cfg: Config, autoIncome: number, autoExpense: number): DataPoint[] {
  const now = new Date()
  const startCalMonth = now.getMonth()   // 0-indexed
  const startCalYear  = now.getFullYear()
  const totalMonths   = cfg.projectionYears * 12

  let balance = cfg.initialBalance
  const points: DataPoint[] = []

  for (let t = 0; t <= totalMonths; t++) {
    const calMonth = (startCalMonth + t) % 12
    const calYear  = startCalYear + Math.floor((startCalMonth + t) / 12)
    const label    = `${MONTHS_SHORT[calMonth]} ${calYear}`

    // Determine phase
    const phase1Duration = cfg.phases[0].durationMonths
    const inPhase2 = cfg.twoPhases && phase1Duration > 0 && t >= phase1Duration
    const phaseIdx: 0 | 1 = inPhase2 ? 1 : 0
    const tInPhase = inPhase2 ? t - phase1Duration : t
    const phase    = cfg.phases[phaseIdx]
    const yearN    = Math.floor(tInPhase / 12)
    const growthE  = Math.pow(1 + phase.expenseGrowthPct / 100, yearN)
    const growthI  = Math.pow(1 + phase.incomeGrowthPct  / 100, yearN)

    if (t === 0) {
      points.push({ t, label, balance: Math.round(balance * 100) / 100, net: 0, phase: 1 })
      continue
    }

    // Income this month
    const monthIncome = (cfg.mode === 'auto' ? autoIncome : phase.income) * growthI

    // Expenses this month
    let monthExpense = 0
    if (cfg.mode === 'auto') {
      monthExpense = autoExpense * growthE
    } else {
      for (const exp of phase.expenses) {
        if (exp.amount <= 0) continue
        switch (exp.frequency) {
          case 'monthly':
            monthExpense += exp.amount * growthE
            break
          case 'every-n': {
            const n = Math.max(1, exp.everyN)
            if (t >= exp.startOffset && (t - exp.startOffset) % n === 0)
              monthExpense += exp.amount * growthE
            break
          }
          case 'annual':
            if (calMonth + 1 === exp.annualMonth)
              monthExpense += exp.amount * growthE
            break
        }
      }
    }

    const net = monthIncome - monthExpense
    balance += net
    points.push({
      t, label,
      balance: Math.round(balance * 100) / 100,
      net: Math.round(net * 100) / 100,
      phase: (phaseIdx + 1) as 1 | 2,
    })
  }

  return points
}

// ── Sub-components ────────────────────────────────────────────────────────────

const NO_SPIN = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
const INP = `w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${NO_SPIN}`
const INP_SM = `px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${NO_SPIN}`

function ExpenseRow({ exp, onChange, onDelete }: {
  exp: Expense
  onChange: (e: Expense) => void
  onDelete: () => void
}) {
  const set = (patch: Partial<Expense>) => onChange({ ...exp, ...patch })

  return (
    <div className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 space-y-2">
      <div className="flex gap-2 items-center">
        <input
          className={INP}
          style={{ flex: '1 1 0', minWidth: 0 }}
          placeholder="Nombre del gasto"
          value={exp.name}
          onChange={e => set({ name: e.target.value })}
        />
        <input
          type="number" min={0} step={0.01}
          className={`${INP_SM} w-24 text-right shrink-0`}
          placeholder="0 €"
          value={exp.amount || ''}
          onChange={e => set({ amount: parseFloat(e.target.value) || 0 })}
        />
        <span className="text-xs text-gray-400 shrink-0">€</span>
        <button onClick={onDelete} className="p-1.5 text-gray-300 hover:text-red-400 transition-colors rounded-lg shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={INP_SM}
          value={exp.frequency}
          onChange={e => set({ frequency: e.target.value as FreqType })}
        >
          <option value="monthly">Mensual</option>
          <option value="every-n">Cada N meses</option>
          <option value="annual">Anual</option>
        </select>
        {exp.frequency === 'every-n' && (
          <>
            <span className="text-xs text-gray-400">Cada</span>
            <input type="number" min={1} max={60} className={`${INP_SM} w-14`}
              value={exp.everyN} onChange={e => set({ everyN: parseInt(e.target.value) || 1 })} />
            <span className="text-xs text-gray-400">meses, empezando en el mes</span>
            <input type="number" min={0} max={59} className={`${INP_SM} w-14`}
              value={exp.startOffset} onChange={e => set({ startOffset: parseInt(e.target.value) || 0 })} />
          </>
        )}
        {exp.frequency === 'annual' && (
          <>
            <span className="text-xs text-gray-400">en</span>
            <select className={INP_SM} value={exp.annualMonth}
              onChange={e => set({ annualMonth: parseInt(e.target.value) })}>
              {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </>
        )}
      </div>
    </div>
  )
}

function ExpensesDrawer({ phase, onChange, label, onCopyFrom, canCopy, onClose }: {
  phase: PhaseConfig
  onChange: (p: PhaseConfig) => void
  label: string
  onCopyFrom: () => void
  canCopy: boolean
  onClose: () => void
}) {
  const set = (patch: Partial<PhaseConfig>) => onChange({ ...phase, ...patch })
  const setExp = (id: string, e: Expense) =>
    set({ expenses: phase.expenses.map(x => x.id === id ? e : x) })
  const delExp = (id: string) =>
    set({ expenses: phase.expenses.filter(x => x.id !== id) })
  const addExp = () => set({ expenses: [...phase.expenses, newExpense()] })

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-white">Gastos — {label}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{phase.expenses.length} gasto{phase.expenses.length !== 1 ? 's' : ''} configurado{phase.expenses.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            {canCopy && (
              <button onClick={onCopyFrom}
                className="flex items-center gap-1 px-2 py-1 text-xs text-blue-500 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                <Copy className="w-3 h-3" />
                Copiar de {label === 'Fase 1' ? 'Fase 2' : 'Fase 1'}
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {phase.expenses.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Sin gastos configurados.</p>
          )}
          {phase.expenses.map(exp => (
            <ExpenseRow key={exp.id} exp={exp}
              onChange={e => setExp(exp.id, e)} onDelete={() => delExp(exp.id)} />
          ))}
        </div>
        {/* Footer: add button */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 shrink-0">
          <button onClick={addExp}
            className="flex items-center justify-center gap-2 w-full px-3 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl transition-colors">
            <Plus className="w-4 h-4" />
            Añadir gasto
          </button>
        </div>
      </div>
    </>
  )
}

function PhasePanel({ phase, onChange, label, onCopyFrom, canCopy }: {
  phase: PhaseConfig
  onChange: (p: PhaseConfig) => void
  label: string
  onCopyFrom: () => void
  canCopy: boolean
}) {
  const set = (patch: Partial<PhaseConfig>) => onChange({ ...phase, ...patch })
  const [drawerOpen, setDrawerOpen] = useState(false)

  const totalMonthly = phase.expenses
    .filter(e => e.frequency === 'monthly')
    .reduce((s, e) => s + e.amount, 0)

  return (
    <div className="space-y-4">
      {/* Income + growth */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">Ingreso mensual neto</span>
          <div className="flex items-center gap-1">
            <input type="number" min={0} step={10} className={`${INP_SM} w-28 text-right`}
              value={phase.income || ''} placeholder="0"
              onChange={e => set({ income: parseFloat(e.target.value) || 0 })} />
            <span className="text-xs text-gray-400">€</span>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">Subida anual ingresos</span>
          <div className="flex items-center gap-1">
            <input type="number" min={0} max={50} step={0.5} className={`${INP_SM} w-16 text-right`}
              value={phase.incomeGrowthPct}
              onChange={e => set({ incomeGrowthPct: parseFloat(e.target.value) || 0 })} />
            <span className="text-xs text-gray-400">%/año</span>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">Subida anual gastos</span>
          <div className="flex items-center gap-1">
            <input type="number" min={0} max={50} step={0.5} className={`${INP_SM} w-16 text-right`}
              value={phase.expenseGrowthPct}
              onChange={e => set({ expenseGrowthPct: parseFloat(e.target.value) || 0 })} />
            <span className="text-xs text-gray-400">%/año</span>
          </div>
        </div>
        {/* Expenses trigger row */}
        <button onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-3 w-full px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left">
          <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">
            Gastos
            {phase.expenses.length > 0 && (
              <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                ({phase.expenses.length} gasto{phase.expenses.length !== 1 ? 's' : ''}{totalMonthly > 0 ? ` · ${totalMonthly}€/mes` : ''})
              </span>
            )}
          </span>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {drawerOpen && (
        <ExpensesDrawer
          phase={phase} onChange={onChange}
          label={label} canCopy={canCopy}
          onCopyFrom={() => { onCopyFrom(); }}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  )
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, fmt, twoPhases }: {
  active?: boolean; payload?: { value: number; dataKey: string; color: string }[]
  label?: string; fmt: (v: number) => string; twoPhases: boolean
}) {
  if (!active || !payload?.length) return null
  const main = payload.find(p => p.dataKey === 'balance')
  const snap = payload.find(p => p.dataKey === 'snapBalance')
  const pt   = payload[0] as { payload?: DataPoint }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg px-3 py-2 text-xs space-y-1 min-w-[160px]">
      <p className="font-semibold text-gray-700 dark:text-gray-200">{label}</p>
      {main && <p className="text-gray-600 dark:text-gray-400">Balance: <span className="font-medium text-gray-900 dark:text-white">{fmt(main.value)}</span></p>}
      {snap && <p className="text-gray-400">Proyección guardada: <span className="font-medium">{fmt(snap.value)}</span></p>}
      {pt?.payload && pt.payload.net !== 0 && (
        <p className={pt.payload.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}>
          Neto: {pt.payload.net >= 0 ? '+' : ''}{fmt(pt.payload.net)}/mes
        </p>
      )}
      {twoPhases && pt?.payload && (
        <p className="text-gray-400">Fase {pt.payload.phase}</p>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Projection() {
  const { fmt } = useCurrency()
  const [cfg, setCfg] = useState<Config>(() => loadLS(CONFIG_KEY, defaultConfig()))
  const [activePhaseTab, setActivePhaseTab] = useState<0 | 1>(0)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(() => loadLS(SNAPSHOT_KEY, null))
  const [showAiTip, setShowAiTip] = useState(false)

  // Persist config on every change
  const setConfig = useCallback((next: Config | ((c: Config) => Config)) => {
    setCfg(prev => {
      const n = typeof next === 'function' ? next(prev) : next
      localStorage.setItem(CONFIG_KEY, JSON.stringify(n))
      return n
    })
  }, [])

  const setPatch = (patch: Partial<Config>) => setConfig(c => ({ ...c, ...patch }))
  const setPhase = (idx: 0 | 1, patch: Partial<PhaseConfig>) =>
    setConfig(c => {
      const phases = [...c.phases] as [PhaseConfig, PhaseConfig]
      phases[idx] = { ...phases[idx], ...patch }
      return { ...c, phases }
    })
  const updatePhase = (idx: 0 | 1, p: PhaseConfig) => setPhase(idx, p)

  // ── Auto-mode: fetch and aggregate movements ────────────────────────────────

  const yearsToFetch = Array.from({ length: cfg.autoYears }, (_, i) => new Date().getFullYear() - i)
  const movementsQueries = useQuery({
    queryKey: ['projection-movements', cfg.autoYears],
    queryFn: async () => {
      const all = await Promise.all(
        yearsToFetch.map(y => getMovements({ year: y }))
      )
      return all.flat()
    },
    enabled: cfg.mode === 'auto',
  })

  const { autoIncome, autoExpense, autoMonths } = useMemo(() => {
    if (!movementsQueries.data) return { autoIncome: 0, autoExpense: 0, autoMonths: 0 }
    const mvs = movementsQueries.data.filter(m => !m.no_count)
    // Group by year-month
    const monthMap = new Map<string, { income: number; expense: number }>()
    for (const m of mvs) {
      const key = m.date.slice(0, 7)
      const entry = monthMap.get(key) ?? { income: 0, expense: 0 }
      if (m.dinero > 0) entry.income += m.dinero
      else entry.expense += Math.abs(m.dinero)
      monthMap.set(key, entry)
    }
    const entries = [...monthMap.values()]
    if (!entries.length) return { autoIncome: 0, autoExpense: 0, autoMonths: 0 }
    const totalIncome  = entries.reduce((s, e) => s + e.income, 0)
    const totalExpense = entries.reduce((s, e) => s + e.expense, 0)
    return {
      autoIncome:  Math.round(totalIncome  / entries.length),
      autoExpense: Math.round(totalExpense / entries.length),
      autoMonths:  entries.length,
    }
  }, [movementsQueries.data])

  // ── Projection computation ──────────────────────────────────────────────────

  const points = useMemo(() =>
    computeProjection(cfg, autoIncome, autoExpense),
    [cfg, autoIncome, autoExpense]
  )

  // Find target crossing
  const target = parseFloat(cfg.targetAmount) || 0
  const targetCrossing = useMemo(() => {
    if (!target) return null
    return points.find(p => p.balance >= target && p.t > 0) ?? null
  }, [points, target])

  // Merge snapshot points into chart data
  const chartData = useMemo(() => {
    if (!snapshot) return points
    const snapMap = new Map(snapshot.points.map(p => [p.t, p.balance]))
    return points.map(p => ({
      ...p,
      snapBalance: snapMap.get(p.t) ?? undefined,
    }))
  }, [points, snapshot])

  // ── Tick reducer for X axis ─────────────────────────────────────────────────

  const xTicks = useMemo(() => {
    const step = cfg.projectionYears <= 5 ? 6 : cfg.projectionYears <= 10 ? 12 : 24
    return points.filter(p => p.t % step === 0).map(p => p.label)
  }, [points, cfg.projectionYears])

  // ── Snapshot ────────────────────────────────────────────────────────────────

  const saveSnapshot = () => {
    const snap: Snapshot = {
      savedAt: new Date().toISOString(),
      points: points.map(p => ({ ...p })),
      targetAmount: cfg.targetAmount,
    }
    setSnapshot(snap)
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap))
  }

  const deleteSnapshot = () => {
    setSnapshot(null)
    localStorage.removeItem(SNAPSHOT_KEY)
  }

  const snapDate = snapshot ? new Date(snapshot.savedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : null

  // ── Balance range for Y axis ────────────────────────────────────────────────

  const allBalances = [
    ...points.map(p => p.balance),
    ...(snapshot?.points.map(p => p.balance) ?? []),
  ]
  const minB = Math.min(...allBalances)
  const maxB = Math.max(...allBalances)
  const yMin = Math.floor(Math.min(minB, target || minB) / 5000) * 5000
  const yMax = Math.ceil(Math.max(maxB, target || maxB) / 5000) * 5000

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-3 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
          <TrendingUp className="w-5 h-5 text-blue-500" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-800 dark:text-white">Proyección a futuro</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500">Simula la evolución de tu dinero a largo plazo</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6">

        {/* ── Left: config panel ─────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Mode */}
          <section className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Modo</p>
            <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
              {(['manual', 'auto'] as const).map(m => (
                <button key={m} onClick={() => setPatch({ mode: m })}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    cfg.mode === m
                      ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}>
                  {m === 'manual' ? 'Manual' : 'Usar mis datos'}
                </button>
              ))}
            </div>
          </section>

          {/* Auto mode settings */}
          {cfg.mode === 'auto' && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 px-4 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Años de historial</span>
                <select className={INP_SM} value={cfg.autoYears}
                  onChange={e => setPatch({ autoYears: parseInt(e.target.value) })}>
                  {[1, 2, 3, 5].map(n => <option key={n} value={n}>{n} {n === 1 ? 'año' : 'años'}</option>)}
                </select>
              </div>
              {movementsQueries.isLoading ? (
                <p className="text-xs text-gray-400 animate-pulse">Calculando medias…</p>
              ) : (
                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                  <p>Media mensual sobre <span className="font-medium">{autoMonths} meses</span>:</p>
                  <p className="text-green-600 dark:text-green-400">Ingresos: +{fmt(autoIncome, 0)}</p>
                  <p className="text-red-500">Gastos: −{fmt(autoExpense, 0)}</p>
                  <p className={autoIncome - autoExpense >= 0 ? 'text-blue-500' : 'text-orange-500'}>
                    Neto: {autoIncome - autoExpense >= 0 ? '+' : ''}{fmt(autoIncome - autoExpense, 0)}/mes
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Global params */}
          <section className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Parámetros</p>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">Balance inicial</span>
                <div className="flex items-center gap-1">
                  <input type="number" step={100} className={`${INP_SM} w-28 text-right`}
                    value={cfg.initialBalance || ''} placeholder="0"
                    onChange={e => setPatch({ initialBalance: parseFloat(e.target.value) || 0 })} />
                  <span className="text-xs text-gray-400">€</span>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">Años de proyección</span>
                <select className={INP_SM} value={cfg.projectionYears}
                  onChange={e => setPatch({ projectionYears: parseInt(e.target.value) })}>
                  {[5, 10, 15, 20, 30].map(n => <option key={n} value={n}>{n} años</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex items-center gap-1.5 flex-1">
                  <Target className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Objetivo (€)</span>
                </div>
                <div className="flex items-center gap-1">
                  <input type="number" step={1000} className={`${INP_SM} w-28 text-right`}
                    value={cfg.targetAmount} placeholder="—"
                    onChange={e => setPatch({ targetAmount: e.target.value })} />
                  <span className="text-xs text-gray-400">€</span>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">Dos fases</span>
                <button onClick={() => setPatch({ twoPhases: !cfg.twoPhases })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                    cfg.twoPhases ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`}>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                    cfg.twoPhases ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
              {cfg.twoPhases && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">Duración Fase 1</span>
                  <div className="flex items-center gap-1">
                    <input type="number" min={1} max={600} className={`${INP_SM} w-16 text-right`}
                      value={cfg.phases[0].durationMonths}
                      onChange={e => setPhase(0, { durationMonths: parseInt(e.target.value) || 0 })} />
                    <span className="text-xs text-gray-400">meses</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* AI tip for growth rates */}
          {cfg.mode === 'manual' && (
            <div className="rounded-xl border border-amber-100 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/10 px-4 py-3">
              <button className="flex items-center gap-2 w-full text-left"
                onClick={() => setShowAiTip(!showAiTip)}>
                <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="text-xs font-medium text-amber-700 dark:text-amber-400 flex-1">
                  Recomendación para las subidas anuales
                </span>
                {showAiTip ? <ChevronUp className="w-3 h-3 text-amber-400" /> : <ChevronDown className="w-3 h-3 text-amber-400" />}
              </button>
              {showAiTip && (
                <div className="mt-2 text-xs text-amber-700 dark:text-amber-400 space-y-1">
                  <p>• <strong>Gastos ({AI_EXPENSE_GROWTH}%):</strong> IPC histórico en España (últimos 10 años).</p>
                  <p>• <strong>Ingresos ({AI_INCOME_GROWTH}%):</strong> Subida media salarial en España.</p>
                  <button onClick={() => {
                    setConfig(c => {
                      const phases = [...c.phases] as [PhaseConfig, PhaseConfig]
                      phases[0] = { ...phases[0], expenseGrowthPct: AI_EXPENSE_GROWTH, incomeGrowthPct: AI_INCOME_GROWTH }
                      phases[1] = { ...phases[1], expenseGrowthPct: AI_EXPENSE_GROWTH, incomeGrowthPct: AI_INCOME_GROWTH }
                      return { ...c, phases }
                    })
                  }} className="mt-1 px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-800/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/50 transition-colors">
                    Aplicar a todas las fases
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Phase tabs (manual only) */}
          {cfg.mode === 'manual' && (
            <section className="space-y-3">
              {cfg.twoPhases && (
                <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
                  {(['Fase 1', 'Fase 2'] as const).map((label, i) => (
                    <button key={i} onClick={() => setActivePhaseTab(i as 0 | 1)}
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${
                        activePhaseTab === i
                          ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <PhasePanel
                phase={cfg.phases[activePhaseTab]}
                label={cfg.twoPhases ? `Fase ${activePhaseTab + 1}` : 'Fase 1'}
                onChange={p => updatePhase(activePhaseTab, p)}
                canCopy={cfg.twoPhases}
                onCopyFrom={() => {
                  const from = activePhaseTab === 0 ? 1 : 0
                  setConfig(c => {
                    const phases = [...c.phases] as [PhaseConfig, PhaseConfig]
                    phases[activePhaseTab] = {
                      ...phases[activePhaseTab],
                      income: phases[from].income,
                      expenses: phases[from].expenses.map(e => ({ ...e, id: uid() })),
                    }
                    return { ...c, phases }
                  })
                }}
              />
            </section>
          )}
        </div>

        {/* ── Right: chart + summary ─────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Target info */}
          {targetCrossing && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800">
              <Target className="w-4 h-4 text-green-500 shrink-0" />
              <p className="text-sm text-green-700 dark:text-green-300">
                Llegas a <strong>{fmt(target, 0)}</strong> en <strong>{targetCrossing.label}</strong>
                {targetCrossing.t > 0 && ` (en ${targetCrossing.t} meses)`}
              </p>
            </div>
          )}
          {target > 0 && !targetCrossing && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800">
              <Info className="w-4 h-4 text-orange-500 shrink-0" />
              <p className="text-sm text-orange-700 dark:text-orange-300">
                No alcanzas el objetivo de {fmt(target, 0)} en {cfg.projectionYears} años con esta configuración.
              </p>
            </div>
          )}

          {/* Chart card */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Evolución del balance</p>
              <div className="flex items-center gap-2">
                {snapshot && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">Guardado el {snapDate}</span>
                    <button onClick={deleteSnapshot}
                      className="p-1 text-gray-300 hover:text-red-400 rounded transition-colors" title="Borrar proyección guardada">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <button onClick={saveSnapshot}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  {snapshot ? <BookmarkCheck className="w-3.5 h-3.5 text-blue-500" /> : <Bookmark className="w-3.5 h-3.5" />}
                  Recordar
                </button>
              </div>
            </div>

            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-100 dark:text-gray-800" />
                  <XAxis
                    dataKey="label"
                    ticks={xTicks}
                    tick={{ fontSize: 11, fill: 'currentColor', className: 'text-gray-400 dark:text-gray-500' }}
                    tickLine={false} axisLine={false}
                  />
                  <YAxis
                    domain={[yMin, yMax]}
                    tickFormatter={v => {
                      if (Math.abs(v) >= 1000000) return `${(v/1000000).toFixed(1)}M€`
                      if (Math.abs(v) >= 1000) return `${(v/1000).toFixed(0)}k€`
                      return `${v}€`
                    }}
                    tick={{ fontSize: 11, fill: 'currentColor', className: 'text-gray-400 dark:text-gray-500' }}
                    tickLine={false} axisLine={false} width={56}
                  />
                  <Tooltip
                    content={<ChartTooltip fmt={v => fmt(v, 0)} twoPhases={cfg.twoPhases} />}
                  />
                  {/* Phase separator */}
                  {cfg.twoPhases && cfg.phases[0].durationMonths > 0 && (() => {
                    const pt = points.find(p => p.t === cfg.phases[0].durationMonths)
                    return pt ? <ReferenceLine x={pt.label} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: 'Fase 2', fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }} /> : null
                  })()}
                  {/* Target line */}
                  {target > 0 && (
                    <ReferenceLine y={target} stroke="#22c55e" strokeDasharray="4 2"
                      label={{ value: `Objetivo ${fmt(target, 0)}`, fill: '#22c55e', fontSize: 10, position: 'insideTopLeft' }} />
                  )}
                  {/* Saved snapshot */}
                  {snapshot && (
                    <Line dataKey="snapBalance" stroke="#9ca3af" strokeDasharray="4 2"
                      dot={false} strokeWidth={1.5} name="Proyección guardada" />
                  )}
                  {/* Main area */}
                  <Area dataKey="balance" stroke="#3b82f6" strokeWidth={2}
                    fill="url(#balGrad)" dot={false} name="Balance" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {snapshot && (
              <div className="flex items-center gap-3 text-xs text-gray-400 pt-1">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-6 h-px border-t-2 border-blue-400" />
                  Proyección actual
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-6 h-px border-t-2 border-dashed border-gray-400" />
                  Guardada el {snapDate}
                </span>
              </div>
            )}
          </div>

          {/* Summary table (first/mid/end of projection) */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
            <div className="grid grid-cols-4 px-4 py-2 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              <span>Momento</span>
              <span className="text-right">Balance</span>
              <span className="text-right">Neto/mes</span>
              {snapshot && <span className="text-right">Guardado</span>}
            </div>
            {[1, Math.floor(cfg.projectionYears / 2), cfg.projectionYears].filter((v, i, a) => a.indexOf(v) === i).map(yr => {
              const pt   = points.find(p => p.t === yr * 12) ?? points[points.length - 1]
              const snap = snapshot?.points.find(p => p.t === yr * 12)
              return (
                <div key={yr} className="grid grid-cols-4 px-4 py-2.5 text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Año {yr}</span>
                  <span className={`text-right font-medium ${pt.balance >= cfg.initialBalance ? 'text-gray-800 dark:text-white' : 'text-red-500'}`}>
                    {fmt(pt.balance, 0)}
                  </span>
                  <span className={`text-right text-xs ${pt.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                    {pt.net >= 0 ? '+' : ''}{fmt(pt.net, 0)}
                  </span>
                  {snapshot && <span className="text-right text-xs text-gray-400">{snap ? fmt(snap.balance, 0) : '—'}</span>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
