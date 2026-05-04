import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ComposedChart, Line,
} from 'recharts'
import {
  TrendingUp, Plus, Trash2, Copy, Sparkles, Bookmark,
  BookmarkCheck, ChevronDown, ChevronUp, Info, Target,
  X, ChevronRight, Landmark, Home,
} from 'lucide-react'
import { getMovements } from '../api/movements'
import { getAccountsSummary } from '../api/accounts'
import { useCurrency } from '../hooks/useCurrency'

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const MONTH_NAMES  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const AI_EXPENSE_GROWTH = 3
const AI_INCOME_GROWTH  = 2

// ── Types ─────────────────────────────────────────────────────────────────────

type FreqType = 'monthly' | 'every-n' | 'annual'

interface Expense {
  id: string
  name: string
  amount: number
  frequency: FreqType
  everyN: number
  startOffset: number
  annualMonth: number
}

interface MortgageConfig {
  enabled: boolean
  amount: number
  interestPct: number
  termYears: number
  amortize: boolean
  amortizeThreshold: number
  amortizePerYear: number
}

interface PhaseConfig {
  income: number
  incomeGrowthPct: number
  expenseGrowthPct: number
  durationMonths: number
  expenses: Expense[]
  mortgage: MortgageConfig
}

interface Config {
  mode: 'auto' | 'manual'
  autoYears: number
  initialBalance: number
  projectionYears: number
  targetAmount: string
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

interface ProjectionResult {
  main: DataPoint[]
  noAmo: DataPoint[] | null
}

interface Snapshot {
  savedAt: string
  points: DataPoint[]
  targetAmount: string
}

// ── Storage ───────────────────────────────────────────────────────────────────

const CONFIG_KEY   = 'caulky-projection-config'
const SNAPSHOT_KEY = 'caulky-projection-snapshot'

function loadLS<T>(key: string, fallback: T): T {
  try { const s = localStorage.getItem(key); if (s) return JSON.parse(s) } catch { /**/ }
  return fallback
}

// ── Factories ─────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2)

const newExpense = (): Expense => ({
  id: uid(), name: '', amount: 0,
  frequency: 'monthly', everyN: 3, startOffset: 0, annualMonth: 1,
})

const newMortgage = (): MortgageConfig => ({
  enabled: false, amount: 150000, interestPct: 3.5, termYears: 30,
  amortize: false, amortizeThreshold: 20000, amortizePerYear: 5000,
})

const newPhase = (): PhaseConfig => ({
  income: 0, incomeGrowthPct: AI_INCOME_GROWTH,
  expenseGrowthPct: AI_EXPENSE_GROWTH, durationMonths: 24,
  expenses: [], mortgage: newMortgage(),
})

const defaultConfig = (): Config => ({
  mode: 'manual', autoYears: 2,
  initialBalance: 0, projectionYears: 10,
  targetAmount: '', twoPhases: false,
  phases: [newPhase(), newPhase()],
})

// Merge loaded config with defaults to handle missing fields from old saves
function mergeConfig(raw: Partial<Config>): Config {
  const def = defaultConfig()
  return {
    ...def, ...raw,
    phases: [
      { ...def.phases[0], ...(raw.phases?.[0] ?? {}), mortgage: { ...newMortgage(), ...(raw.phases?.[0]?.mortgage ?? {}) } },
      { ...def.phases[1], ...(raw.phases?.[1] ?? {}), mortgage: { ...newMortgage(), ...(raw.phases?.[1]?.mortgage ?? {}) } },
    ],
  }
}

// ── Mortgage computation ──────────────────────────────────────────────────────

function mortgageMonthlyPayment(amount: number, pct: number, years: number): number {
  const r = pct / 100 / 12
  const n = years * 12
  if (n <= 0) return 0
  if (r === 0) return amount / n
  return amount * r / (1 - Math.pow(1 + r, -n))
}

// ── Projection computation ────────────────────────────────────────────────────

function computeOneProjection(
  cfg: Config, autoIncome: number, autoExpense: number, withAmortization: boolean
): DataPoint[] {
  const now = new Date()
  const startCalMonth = now.getMonth()
  const startCalYear  = now.getFullYear()
  const totalMonths   = cfg.projectionYears * 12

  let balance = cfg.initialBalance
  const points: DataPoint[] = []

  // Mortgage state
  const m2 = cfg.phases[1].mortgage
  const hasMortgage = cfg.twoPhases && m2.enabled && m2.amount > 0 && m2.termYears > 0
  let mortgageRemaining = hasMortgage ? m2.amount : 0
  const fixedPayment    = hasMortgage ? mortgageMonthlyPayment(m2.amount, m2.interestPct, m2.termYears) : 0
  const mortgageR       = hasMortgage ? m2.interestPct / 100 / 12 : 0

  for (let t = 0; t <= totalMonths; t++) {
    const calMonth = (startCalMonth + t) % 12
    const calYear  = startCalYear + Math.floor((startCalMonth + t) / 12)
    const label    = `${MONTHS_SHORT[calMonth]} ${calYear}`

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

    const monthIncome = (cfg.mode === 'auto' ? autoIncome : phase.income) * growthI

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

    // Mortgage (phase 2 only)
    if (inPhase2 && hasMortgage && mortgageRemaining > 0) {
      const interest      = mortgageRemaining * mortgageR
      const principalPaid = Math.min(Math.max(0, fixedPayment - interest), mortgageRemaining)
      mortgageRemaining  -= principalPaid
      monthExpense       += interest + principalPaid

      // Extra amortization
      if (withAmortization && m2.amortize && m2.amortizePerYear > 0 && balance > m2.amortizeThreshold && mortgageRemaining > 0) {
        const extra = Math.min(m2.amortizePerYear / 12, mortgageRemaining)
        mortgageRemaining -= extra
        monthExpense      += extra
      }
    }

    const net = monthIncome - monthExpense
    balance += net
    points.push({
      t, label,
      balance: Math.round(balance * 100) / 100,
      net:     Math.round(net * 100) / 100,
      phase:   (phaseIdx + 1) as 1 | 2,
    })
  }

  return points
}

function computeProjectionResult(cfg: Config, autoIncome: number, autoExpense: number): ProjectionResult {
  const m2 = cfg.phases[1].mortgage
  const hasAmortization = cfg.twoPhases && m2.enabled && m2.amortize && m2.amortizePerYear > 0 && m2.amount > 0
  const main  = computeOneProjection(cfg, autoIncome, autoExpense, true)
  const noAmo = hasAmortization ? computeOneProjection(cfg, autoIncome, autoExpense, false) : null
  return { main, noAmo }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const NO_SPIN = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
const INP    = `w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${NO_SPIN}`
const INP_SM = `px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${NO_SPIN}`
const TOGGLE_ON  = 'bg-blue-500'
const TOGGLE_OFF = 'bg-gray-200 dark:bg-gray-700'

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${value ? TOGGLE_ON : TOGGLE_OFF}`}>
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

// ── ExpenseRow ────────────────────────────────────────────────────────────────

function ExpenseRow({ exp, onChange, onDelete }: {
  exp: Expense; onChange: (e: Expense) => void; onDelete: () => void
}) {
  const set = (patch: Partial<Expense>) => onChange({ ...exp, ...patch })
  return (
    <div className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 space-y-2">
      <div className="flex gap-2 items-center">
        <input className={INP} style={{ flex: '1 1 0', minWidth: 0 }}
          placeholder="Nombre del gasto" value={exp.name}
          onChange={e => set({ name: e.target.value })} />
        <input type="number" min={0} step={0.01}
          className={`${INP_SM} w-24 text-right shrink-0`} placeholder="0"
          value={exp.amount || ''} onChange={e => set({ amount: parseFloat(e.target.value) || 0 })} />
        <span className="text-xs text-gray-400 shrink-0">€</span>
        <button onClick={onDelete} className="p-1.5 text-gray-300 hover:text-red-400 transition-colors rounded-lg shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className={INP_SM} value={exp.frequency}
          onChange={e => set({ frequency: e.target.value as FreqType })}>
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
              {MONTH_NAMES.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
            </select>
          </>
        )}
      </div>
    </div>
  )
}

// ── ExpensesDrawer ────────────────────────────────────────────────────────────

function ExpensesDrawer({ phase, onChange, label, onCopyFrom, canCopy, onClose }: {
  phase: PhaseConfig; onChange: (p: PhaseConfig) => void
  label: string; onCopyFrom: () => void; canCopy: boolean; onClose: () => void
}) {
  const set = (patch: Partial<PhaseConfig>) => onChange({ ...phase, ...patch })
  const setExp = (id: string, e: Expense) => set({ expenses: phase.expenses.map(x => x.id === id ? e : x) })
  const delExp = (id: string) => set({ expenses: phase.expenses.filter(x => x.id !== id) })
  const addExp = () => set({ expenses: [...phase.expenses, newExpense()] })

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-white">Gastos — {label}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{phase.expenses.length} gasto{phase.expenses.length !== 1 ? 's' : ''}</p>
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
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {phase.expenses.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Sin gastos configurados.</p>
          )}
          {phase.expenses.map(exp => (
            <ExpenseRow key={exp.id} exp={exp}
              onChange={e => setExp(exp.id, e)} onDelete={() => delExp(exp.id)} />
          ))}
        </div>
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

// ── MortgageSection ───────────────────────────────────────────────────────────

function MortgageSection({ phase, onChange }: { phase: PhaseConfig; onChange: (p: PhaseConfig) => void }) {
  const m = phase.mortgage ?? newMortgage()
  const set = (patch: Partial<MortgageConfig>) => onChange({ ...phase, mortgage: { ...m, ...patch } })
  const [open, setOpen] = useState(false)

  const monthly      = m.enabled && m.amount > 0 && m.termYears > 0 ? mortgageMonthlyPayment(m.amount, m.interestPct, m.termYears) : 0
  const totalPaid    = monthly * m.termYears * 12
  const totalInterest = Math.max(0, totalPaid - m.amount)

  return (
    <>
      {/* Trigger row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => m.enabled && setOpen(o => !o)}
          className="flex items-center gap-2 flex-1 text-left">
          <Home className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Hipoteca
            {m.enabled && monthly > 0 && (
              <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                ({Math.round(monthly).toLocaleString('es-ES')}€/mes)
              </span>
            )}
          </span>
          {m.enabled && (open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-auto" />)}
        </button>
        <Toggle value={m.enabled} onChange={v => { set({ enabled: v }); if (v) setOpen(true) }} />
      </div>

      {/* Expanded config */}
      {m.enabled && open && (
        <div className="px-4 pb-4 space-y-3">
          {/* Main mortgage params */}
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 divide-y divide-gray-100 dark:divide-gray-800">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className="text-xs text-gray-500 dark:text-gray-400 flex-1">Capital</span>
              <input type="number" min={0} step={1000} className={`${INP_SM} w-28 text-right`}
                value={m.amount || ''} placeholder="0"
                onChange={e => set({ amount: parseFloat(e.target.value) || 0 })} />
              <span className="text-xs text-gray-400">€</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className="text-xs text-gray-500 dark:text-gray-400 flex-1">Tipo de interés</span>
              <input type="number" min={0} max={20} step={0.05} className={`${INP_SM} w-20 text-right`}
                value={m.interestPct} onChange={e => set({ interestPct: parseFloat(e.target.value) || 0 })} />
              <span className="text-xs text-gray-400">%/año</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className="text-xs text-gray-500 dark:text-gray-400 flex-1">Plazo</span>
              <input type="number" min={1} max={40} step={1} className={`${INP_SM} w-16 text-right`}
                value={m.termYears} onChange={e => set({ termYears: parseInt(e.target.value) || 1 })} />
              <span className="text-xs text-gray-400">años</span>
            </div>
          </div>

          {/* Summary */}
          {monthly > 0 && (
            <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 px-3 py-2 space-y-0.5">
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Cuota mensual: <strong>{Math.round(monthly).toLocaleString('es-ES')} €</strong>
              </p>
              <p className="text-xs text-blue-500 dark:text-blue-400">
                Total intereses: <strong>{Math.round(totalInterest).toLocaleString('es-ES')} €</strong>
              </p>
            </div>
          )}

          {/* Amortization strategy */}
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <span className="text-xs text-gray-500 dark:text-gray-400 flex-1 font-medium">Amortización anticipada</span>
              <Toggle value={m.amortize} onChange={v => set({ amortize: v })} />
            </div>
            {m.amortize && (
              <div className="divide-y divide-gray-100 dark:divide-gray-800 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex-1">Si balance &gt;</span>
                  <input type="number" min={0} step={1000} className={`${INP_SM} w-24 text-right`}
                    value={m.amortizeThreshold || ''} placeholder="0"
                    onChange={e => set({ amortizeThreshold: parseFloat(e.target.value) || 0 })} />
                  <span className="text-xs text-gray-400">€</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex-1">Amortizar al año</span>
                  <input type="number" min={0} step={500} className={`${INP_SM} w-24 text-right`}
                    value={m.amortizePerYear || ''} placeholder="0"
                    onChange={e => set({ amortizePerYear: parseFloat(e.target.value) || 0 })} />
                  <span className="text-xs text-gray-400">€</span>
                </div>
                <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                  Cuando el balance supere el umbral, se amortizará capital extra cada mes reduciendo el plazo.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ── PhasePanel ────────────────────────────────────────────────────────────────

function PhasePanel({ phase, onChange, label, onCopyFrom, canCopy, showMortgage }: {
  phase: PhaseConfig; onChange: (p: PhaseConfig) => void
  label: string; onCopyFrom: () => void; canCopy: boolean; showMortgage: boolean
}) {
  const set = (patch: Partial<PhaseConfig>) => onChange({ ...phase, ...patch })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const totalMonthly = phase.expenses.filter(e => e.frequency === 'monthly').reduce((s, e) => s + e.amount, 0)

  return (
    <div className="space-y-4">
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
        {/* Expenses trigger */}
        <button onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-3 w-full px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left">
          <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">
            Gastos
            {phase.expenses.length > 0 && (
              <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                ({phase.expenses.length}{totalMonthly > 0 ? ` · ${totalMonthly}€/mes` : ''})
              </span>
            )}
          </span>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </button>
        {/* Mortgage (phase 2 only) */}
        {showMortgage && <MortgageSection phase={phase} onChange={onChange} />}
      </div>

      {drawerOpen && (
        <ExpensesDrawer phase={phase} onChange={onChange} label={label} canCopy={canCopy}
          onCopyFrom={() => onCopyFrom()} onClose={() => setDrawerOpen(false)} />
      )}
    </div>
  )
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, fmt, twoPhases }: {
  active?: boolean; payload?: { value: number; dataKey: string }[]
  label?: string; fmt: (v: number) => string; twoPhases: boolean
}) {
  if (!active || !payload?.length) return null
  const main = payload.find(p => p.dataKey === 'balance')
  const snap = payload.find(p => p.dataKey === 'snapBalance')
  const noAmo = payload.find(p => p.dataKey === 'noAmoBalance')
  const pt = payload[0] as { payload?: DataPoint }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg px-3 py-2 text-xs space-y-1 min-w-[160px]">
      <p className="font-semibold text-gray-700 dark:text-gray-200">{label}</p>
      {main && <p className="text-gray-600 dark:text-gray-400">Balance: <span className="font-medium text-blue-500">{fmt(main.value)}</span></p>}
      {noAmo && <p className="text-gray-500 dark:text-gray-400">Sin amortizar: <span className="font-medium text-orange-500">{fmt(noAmo.value)}</span></p>}
      {snap && <p className="text-gray-400">Guardado: <span className="font-medium">{fmt(snap.value)}</span></p>}
      {pt?.payload && pt.payload.net !== 0 && (
        <p className={pt.payload.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}>
          Neto: {pt.payload.net >= 0 ? '+' : ''}{fmt(pt.payload.net)}/mes
        </p>
      )}
      {twoPhases && pt?.payload && <p className="text-gray-400">Fase {pt.payload.phase}</p>}
    </div>
  )
}

function DiffTooltip({ active, payload, label, fmt }: {
  active?: boolean; payload?: { value: number }[]; label?: string; fmt: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  const v = payload[0].value
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg px-3 py-2 text-xs space-y-1">
      <p className="font-semibold text-gray-700 dark:text-gray-200">{label}</p>
      <p className={v >= 0 ? 'text-green-600 dark:text-green-400' : 'text-orange-500'}>
        {v >= 0 ? 'Beneficio: +' : 'Coste: '}{fmt(Math.abs(v))}
      </p>
    </div>
  )
}

// ── Mortgage comparison charts ────────────────────────────────────────────────

function MortgageCompareCharts({ main, noAmo, xTicks, fmt }: {
  main: DataPoint[]; noAmo: DataPoint[]; xTicks: string[]; fmt: (v: number, d?: number) => string
}) {
  const [mode, setMode] = useState<'overlay' | 'diff'>('overlay')

  const overlayData = main.map((pt, i) => ({ ...pt, noAmoBalance: noAmo[i]?.balance ?? null }))
  const diffData    = main.map((pt, i) => ({ ...pt, diff: pt.balance - (noAmo[i]?.balance ?? pt.balance) }))

  // Summary stats
  const breakEven   = diffData.find(pt => pt.diff > 0 && pt.t > 0)
  const finalDiff   = diffData[diffData.length - 1]?.diff ?? 0
  const allBalances = [...main.map(p => p.balance), ...noAmo.map(p => p.balance)]
  const yMin = Math.floor(Math.min(...allBalances) / 5000) * 5000
  const yMax = Math.ceil(Math.max(...allBalances) / 5000) * 5000
  const fmtK = (v: number) => Math.abs(v) >= 1000000 ? `${(v/1000000).toFixed(1)}M€` : Math.abs(v) >= 1000 ? `${(v/1000).toFixed(0)}k€` : `${v}€`

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 px-4 py-3">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Punto de equilibrio</p>
          <p className="text-sm font-semibold text-gray-800 dark:text-white">
            {breakEven ? breakEven.label : 'Fuera del horizonte'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {breakEven ? `Mes ${breakEven.t} — amortizar empieza a compensar` : 'La amortización no compensa en el periodo'}
          </p>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${finalDiff >= 0 ? 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-800'}`}>
          <p className="text-xs text-gray-400 mb-1">Diferencia al final</p>
          <p className={`text-sm font-semibold ${finalDiff >= 0 ? 'text-green-700 dark:text-green-300' : 'text-orange-600 dark:text-orange-400'}`}>
            {finalDiff >= 0 ? '+' : ''}{fmt(finalDiff, 0)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {finalDiff >= 0 ? 'Amortizar deja más balance' : 'Sin amortizar deja más balance'}
          </p>
        </div>
      </div>

      {/* Chart toggle */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Comparación de amortización</p>
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {(['overlay', 'diff'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${mode === m ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                {m === 'overlay' ? 'Superponer' : 'Diferencia'}
              </button>
            ))}
          </div>
        </div>

        {mode === 'overlay' ? (
          <>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={overlayData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-100 dark:text-gray-800" />
                  <XAxis dataKey="label" ticks={xTicks} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis domain={[yMin, yMax]} tickFormatter={fmtK} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                  <Tooltip content={<ChartTooltip fmt={v => fmt(v, 0)} twoPhases={false} />} />
                  <Line dataKey="noAmoBalance" stroke="#f97316" strokeWidth={2} dot={false} name="Sin amortizar" strokeDasharray="4 2" />
                  <Area dataKey="balance" stroke="#3b82f6" strokeWidth={2} fill="#3b82f620" dot={false} name="Con amortización" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-0.5 bg-blue-500" /> Con amortización</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-dashed border-orange-400" /> Sin amortizar</span>
            </div>
          </>
        ) : (
          <>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={diffData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="diffPos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="diffNeg" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="5%"  stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-100 dark:text-gray-800" />
                  <XAxis dataKey="label" ticks={xTicks} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                  <Tooltip content={<DiffTooltip fmt={(v) => fmt(v, 0)} />} />
                  <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 2" />
                  {breakEven && <ReferenceLine x={breakEven.label} stroke="#22c55e" strokeDasharray="3 2" label={{ value: 'Equilibrio', fill: '#22c55e', fontSize: 10 }} />}
                  <Area dataKey="diff" stroke="#3b82f6" strokeWidth={2} dot={false}
                    fill={finalDiff >= 0 ? 'url(#diffPos)' : 'url(#diffNeg)'} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-gray-400">Positivo = amortizar adelanta tu balance. Negativo = el coste del capital extra aún no compensa.</p>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Projection() {
  const { fmt } = useCurrency()
  const [cfg, setCfg] = useState<Config>(() => mergeConfig(loadLS(CONFIG_KEY, {})))
  const [activePhaseTab, setActivePhaseTab] = useState<0 | 1>(0)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(() => loadLS(SNAPSHOT_KEY, null))
  const [showAiTip, setShowAiTip] = useState(false)

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

  // Accounts & movements
  const accountsQuery = useQuery({ queryKey: ['accounts-summary'], queryFn: getAccountsSummary })
  const accountsTotal = accountsQuery.data?.total ?? null

  const yearsToFetch = Array.from({ length: cfg.autoYears }, (_, i) => new Date().getFullYear() - i)
  const movementsQuery = useQuery({
    queryKey: ['projection-movements', cfg.autoYears],
    queryFn: async () => {
      const all = await Promise.all(yearsToFetch.map(y => getMovements({ year: y })))
      return all.flat()
    },
    enabled: cfg.mode === 'auto',
  })

  const { autoIncome, autoExpense, autoMonths } = useMemo(() => {
    if (!movementsQuery.data) return { autoIncome: 0, autoExpense: 0, autoMonths: 0 }
    const mvs = movementsQuery.data.filter(m => !m.no_count)
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
    return {
      autoIncome:  Math.round(entries.reduce((s, e) => s + e.income, 0) / entries.length),
      autoExpense: Math.round(entries.reduce((s, e) => s + e.expense, 0) / entries.length),
      autoMonths:  entries.length,
    }
  }, [movementsQuery.data])

  // Projection
  const projResult = useMemo(() =>
    computeProjectionResult(cfg, autoIncome, autoExpense),
    [cfg, autoIncome, autoExpense]
  )
  const points = projResult.main

  const target = parseFloat(cfg.targetAmount) || 0
  const targetCrossing = useMemo(() => {
    if (!target) return null
    return points.find(p => p.balance >= target && p.t > 0) ?? null
  }, [points, target])

  const chartData = useMemo(() => {
    const snapMap = snapshot ? new Map(snapshot.points.map(p => [p.t, p.balance])) : null
    const noAmoMap = projResult.noAmo ? new Map(projResult.noAmo.map(p => [p.t, p.balance])) : null
    return points.map(p => ({
      ...p,
      snapBalance:  snapMap?.get(p.t) ?? undefined,
      noAmoBalance: noAmoMap?.get(p.t) ?? undefined,
    }))
  }, [points, snapshot, projResult.noAmo])

  const xTicks = useMemo(() => {
    const step = cfg.projectionYears <= 5 ? 6 : cfg.projectionYears <= 10 ? 12 : 24
    return points.filter(p => p.t % step === 0).map(p => p.label)
  }, [points, cfg.projectionYears])

  const saveSnapshot = () => {
    const snap: Snapshot = { savedAt: new Date().toISOString(), points: points.map(p => ({ ...p })), targetAmount: cfg.targetAmount }
    setSnapshot(snap)
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap))
  }
  const deleteSnapshot = () => { setSnapshot(null); localStorage.removeItem(SNAPSHOT_KEY) }
  const snapDate = snapshot ? new Date(snapshot.savedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : null

  const allBalances = [...points.map(p => p.balance), ...(snapshot?.points.map(p => p.balance) ?? []), ...(projResult.noAmo?.map(p => p.balance) ?? [])]
  const yMin = Math.floor(Math.min(...allBalances, target || Infinity) / 5000) * 5000
  const yMax = Math.ceil(Math.max(...allBalances, target || -Infinity) / 5000) * 5000
  const fmtK = (v: number) => Math.abs(v) >= 1000000 ? `${(v/1000000).toFixed(1)}M€` : Math.abs(v) >= 1000 ? `${(v/1000).toFixed(0)}k€` : `${v}€`

  const showMortgageCharts = !!(projResult.noAmo && projResult.noAmo.length > 0)

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

        {/* ── Config ─── */}
        <div className="space-y-5">
          {/* Mode */}
          <section className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Modo</p>
            <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
              {(['manual', 'auto'] as const).map(m => (
                <button key={m} onClick={() => setPatch({ mode: m })}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${cfg.mode === m ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                  {m === 'manual' ? 'Manual' : 'Usar mis datos'}
                </button>
              ))}
            </div>
          </section>

          {cfg.mode === 'auto' && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 px-4 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Años de historial</span>
                <select className={INP_SM} value={cfg.autoYears} onChange={e => setPatch({ autoYears: parseInt(e.target.value) })}>
                  {[1, 2, 3, 5].map(n => <option key={n} value={n}>{n} {n === 1 ? 'año' : 'años'}</option>)}
                </select>
              </div>
              {movementsQuery.isLoading ? (
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
                <div className="flex items-center gap-1.5">
                  {accountsTotal !== null && (
                    <button onClick={() => setPatch({ initialBalance: Math.round(accountsTotal) })}
                      title={`Usar saldo actual (${Math.round(accountsTotal).toLocaleString('es-ES')} €)`}
                      className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors whitespace-nowrap">
                      <Landmark className="w-3 h-3" />
                      Usar cuentas
                    </button>
                  )}
                  <input type="number" step={100} className={`${INP_SM} w-24 text-right`}
                    value={cfg.initialBalance || ''} placeholder="0"
                    onChange={e => setPatch({ initialBalance: parseFloat(e.target.value) || 0 })} />
                  <span className="text-xs text-gray-400">€</span>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">Años de proyección</span>
                <select className={INP_SM} value={cfg.projectionYears} onChange={e => setPatch({ projectionYears: parseInt(e.target.value) })}>
                  {[5, 10, 15, 20, 25, 30, 35, 40].map(n => <option key={n} value={n}>{n} años</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex items-center gap-1.5 flex-1">
                  <Target className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Objetivo</span>
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
                <Toggle value={cfg.twoPhases} onChange={v => setPatch({ twoPhases: v })} />
              </div>
              {cfg.twoPhases && (() => {
                const now = new Date()
                const toDateStr = (months: number) => {
                  const d = new Date(now.getFullYear(), now.getMonth() + months, 1)
                  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                }
                const toMonths = (dateStr: string) => {
                  const [y, m] = dateStr.split('-').map(Number)
                  return Math.max(1, (y - now.getFullYear()) * 12 + (m - now.getMonth() - 1))
                }
                const dateVal = toDateStr(cfg.phases[0].durationMonths)
                const [selYear, selMonth] = dateVal.split('-').map(Number)
                const yearOptions = Array.from({ length: 41 }, (_, i) => now.getFullYear() + i)
                return (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Fin Fase 1</span>
                    <div className="flex items-center gap-1 ml-auto">
                      <select className={INP_SM} value={selMonth}
                        onChange={e => setPhase(0, { durationMonths: toMonths(`${selYear}-${String(parseInt(e.target.value)).padStart(2, '0')}`) })}>
                        {MONTHS_SHORT.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
                      </select>
                      <select className={INP_SM} value={selYear}
                        onChange={e => setPhase(0, { durationMonths: toMonths(`${e.target.value}-${String(selMonth).padStart(2, '0')}`) })}>
                        {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                      <span className="text-xs text-gray-400 whitespace-nowrap">({cfg.phases[0].durationMonths}m)</span>
                    </div>
                  </div>
                )
              })()}
            </div>
          </section>

          {/* AI tip */}
          {cfg.mode === 'manual' && (
            <div className="rounded-xl border border-amber-100 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/10 px-4 py-3">
              <button className="flex items-center gap-2 w-full text-left" onClick={() => setShowAiTip(!showAiTip)}>
                <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="text-xs font-medium text-amber-700 dark:text-amber-400 flex-1">Recomendación para las subidas anuales</span>
                {showAiTip ? <ChevronUp className="w-3 h-3 text-amber-400" /> : <ChevronDown className="w-3 h-3 text-amber-400" />}
              </button>
              {showAiTip && (
                <div className="mt-2 text-xs text-amber-700 dark:text-amber-400 space-y-1">
                  <p>• <strong>Gastos ({AI_EXPENSE_GROWTH}%):</strong> IPC histórico en España.</p>
                  <p>• <strong>Ingresos ({AI_INCOME_GROWTH}%):</strong> Subida media salarial en España.</p>
                  <button onClick={() => setConfig(c => {
                    const phases = [...c.phases] as [PhaseConfig, PhaseConfig]
                    phases[0] = { ...phases[0], expenseGrowthPct: AI_EXPENSE_GROWTH, incomeGrowthPct: AI_INCOME_GROWTH }
                    phases[1] = { ...phases[1], expenseGrowthPct: AI_EXPENSE_GROWTH, incomeGrowthPct: AI_INCOME_GROWTH }
                    return { ...c, phases }
                  })} className="mt-1 px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-800/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/50 transition-colors">
                    Aplicar a todas las fases
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Phase tabs */}
          {cfg.mode === 'manual' && (
            <section className="space-y-3">
              {cfg.twoPhases && (
                <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
                  {(['Fase 1', 'Fase 2'] as const).map((label, i) => (
                    <button key={i} onClick={() => setActivePhaseTab(i as 0 | 1)}
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${activePhaseTab === i ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
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
                showMortgage={cfg.twoPhases && activePhaseTab === 1}
                onCopyFrom={() => {
                  const from = activePhaseTab === 0 ? 1 : 0
                  setConfig(c => {
                    const phases = [...c.phases] as [PhaseConfig, PhaseConfig]
                    phases[activePhaseTab] = { ...phases[activePhaseTab], income: phases[from].income, expenses: phases[from].expenses.map(e => ({ ...e, id: uid() })) }
                    return { ...c, phases }
                  })
                }}
              />
            </section>
          )}
        </div>

        {/* ── Charts ─── */}
        <div className="space-y-4">
          {/* Target banners */}
          {targetCrossing && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800">
              <Target className="w-4 h-4 text-green-500 shrink-0" />
              <p className="text-sm text-green-700 dark:text-green-300">
                Llegas a <strong>{fmt(target, 0)}</strong> en <strong>{targetCrossing.label}</strong> (mes {targetCrossing.t})
              </p>
            </div>
          )}
          {target > 0 && !targetCrossing && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800">
              <Info className="w-4 h-4 text-orange-500 shrink-0" />
              <p className="text-sm text-orange-700 dark:text-orange-300">No alcanzas el objetivo de {fmt(target, 0)} en {cfg.projectionYears} años.</p>
            </div>
          )}

          {/* Main chart */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Evolución del balance</p>
              <div className="flex items-center gap-2">
                {snapshot && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">Guardado el {snapDate}</span>
                    <button onClick={deleteSnapshot} className="p-1 text-gray-300 hover:text-red-400 rounded transition-colors">
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
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-100 dark:text-gray-800" />
                  <XAxis dataKey="label" ticks={xTicks} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis domain={[yMin, yMax]} tickFormatter={fmtK} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                  <Tooltip content={<ChartTooltip fmt={v => fmt(v, 0)} twoPhases={cfg.twoPhases} />} />
                  {cfg.twoPhases && cfg.phases[0].durationMonths > 0 && (() => {
                    const pt = points.find(p => p.t === cfg.phases[0].durationMonths)
                    return pt ? <ReferenceLine x={pt.label} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: 'Fase 2', fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }} /> : null
                  })()}
                  {target > 0 && <ReferenceLine y={target} stroke="#22c55e" strokeDasharray="4 2" label={{ value: `Objetivo ${fmt(target, 0)}`, fill: '#22c55e', fontSize: 10, position: 'insideTopLeft' }} />}
                  {snapshot && <Line dataKey="snapBalance" stroke="#9ca3af" strokeDasharray="4 2" dot={false} strokeWidth={1.5} />}
                  {projResult.noAmo && <Line dataKey="noAmoBalance" stroke="#f97316" strokeDasharray="4 2" dot={false} strokeWidth={1.5} />}
                  <Area dataKey="balance" stroke="#3b82f6" strokeWidth={2} fill="url(#balGrad)" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {(snapshot || projResult.noAmo) && (
              <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400 pt-1">
                <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-blue-500" /> Balance proyectado</span>
                {projResult.noAmo && <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-dashed border-orange-400" /> Sin amortizar</span>}
                {snapshot && <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-dashed border-gray-400" /> Guardado {snapDate}</span>}
              </div>
            )}
          </div>

          {/* Summary table */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
            <div className={`grid px-4 py-2 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide ${showMortgageCharts ? 'grid-cols-4' : 'grid-cols-3'}`}>
              <span>Momento</span>
              <span className="text-right">Balance</span>
              <span className="text-right">Neto/mes</span>
              {showMortgageCharts && <span className="text-right text-orange-400">Sin amort.</span>}
            </div>
            {[1, Math.floor(cfg.projectionYears / 2), cfg.projectionYears].filter((v, i, a) => a.indexOf(v) === i).map(yr => {
              const pt   = points.find(p => p.t === yr * 12) ?? points[points.length - 1]
              const noAm = projResult.noAmo?.find(p => p.t === yr * 12)
              return (
                <div key={yr} className={`grid px-4 py-2.5 text-sm ${showMortgageCharts ? 'grid-cols-4' : 'grid-cols-3'}`}>
                  <span className="text-gray-500 dark:text-gray-400">Año {yr}</span>
                  <span className={`text-right font-medium ${pt.balance >= cfg.initialBalance ? 'text-gray-800 dark:text-white' : 'text-red-500'}`}>{fmt(pt.balance, 0)}</span>
                  <span className={`text-right text-xs ${pt.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>{pt.net >= 0 ? '+' : ''}{fmt(pt.net, 0)}</span>
                  {showMortgageCharts && <span className="text-right text-xs text-orange-500">{noAm ? fmt(noAm.balance, 0) : '—'}</span>}
                </div>
              )
            })}
          </div>

          {/* Mortgage comparison charts */}
          {showMortgageCharts && projResult.noAmo && (
            <MortgageCompareCharts
              main={points} noAmo={projResult.noAmo}
              xTicks={xTicks} fmt={v => fmt(v, 0)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
