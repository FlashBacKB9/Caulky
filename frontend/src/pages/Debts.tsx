import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Banknote, Plus, Pencil, Trash2, X, Check,
  ChevronDown, ChevronRight, TrendingUp, TrendingDown, Zap,
} from 'lucide-react'
import { getAccountsSummary, type Account } from '../api/accounts'
import { getMovements, type Movement } from '../api/movements'
import { getMovementTypes, type MovementType } from '../api/movementTypes'
import { createTemplate, updateTemplate, deleteTemplate } from '../api/templates'
import { useCurrency } from '../hooks/useCurrency'
import { useDateFormat } from '../hooks/useDateFormat'
import AppIcon from '../components/AppIcon'

// ── Types & storage ───────────────────────────────────────────────────────────

export interface DebtConfig {
  id: string
  name: string
  accountId: number
  movementTypeId: number
  capitalInitial: number
  interestRate: number    // annual %
  termMonths: number
  startDate: string       // YYYY-MM-DD
  marketValue?: number    // optional current estimate
  templateId?: number     // auto-generated payment template
}

const DEBTS_KEY = 'debts-config'

export function loadDebts(): DebtConfig[] {
  try { return JSON.parse(localStorage.getItem(DEBTS_KEY) ?? '[]') } catch { return [] }
}
function saveDebts(d: DebtConfig[]) { localStorage.setItem(DEBTS_KEY, JSON.stringify(d)) }
function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

// ── Amortization logic ────────────────────────────────────────────────────────

export interface AmortRow {
  month: number
  date: string
  payment: number
  interest: number
  capital: number
  balance: number
}

export function calcMonthlyPayment(capital: number, annualRate: number, months: number): number {
  if (annualRate === 0) return capital / months
  const r = annualRate / 100 / 12
  return capital * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1)
}

export function buildSchedule(debt: DebtConfig): AmortRow[] {
  const r       = debt.interestRate / 100 / 12
  const payment = calcMonthlyPayment(debt.capitalInitial, debt.interestRate, debt.termMonths)
  let balance   = debt.capitalInitial
  const rows: AmortRow[] = []
  const start = new Date(debt.startDate + 'T00:00:00')
  for (let i = 0; i < debt.termMonths; i++) {
    const interest = Math.round(balance * r * 100) / 100
    const capital  = Math.round((payment - interest) * 100) / 100
    const d = new Date(start)
    d.setMonth(d.getMonth() + i)
    rows.push({ month: i + 1, date: d.toLocaleDateString('en-CA'), payment: Math.round(payment * 100) / 100, interest, capital, balance: Math.round(balance * 100) / 100 })
    balance = Math.round((balance - capital) * 100) / 100
  }
  return rows
}

// For a debt: find which amortization row corresponds to each actual payment
export function matchPaymentToRow(paymentDate: string, schedule: AmortRow[]): AmortRow | null {
  // Find the row whose date is closest to (and on or before) the payment date
  const pTime = new Date(paymentDate + 'T00:00:00').getTime()
  let best: AmortRow | null = null
  let bestDiff = Infinity
  for (const row of schedule) {
    const rTime = new Date(row.date + 'T00:00:00').getTime()
    const diff  = Math.abs(pTime - rTime)
    if (diff < bestDiff) { bestDiff = diff; best = row }
  }
  return best
}

// Summary derived from payments vs schedule
export function calcDebtSummary(debt: DebtConfig, payments: Movement[]) {
  const schedule = buildSchedule(debt)
  const sorted   = [...payments].sort((a, b) => a.date.localeCompare(b.date))

  let totalPaid       = 0
  let capitalPaid     = 0
  let interestPaid    = 0
  const usedMonths    = new Set<number>()

  for (const mv of sorted) {
    const row = matchPaymentToRow(mv.date, schedule)
    if (!row || usedMonths.has(row.month)) {
      // payment not matched to a schedule row — assume split proportionally
      totalPaid += Math.abs(mv.money)
      const typicalPayment = calcMonthlyPayment(debt.capitalInitial, debt.interestRate, debt.termMonths)
      if (typicalPayment > 0) {
        const avgInterestRatio = schedule.length > 0
          ? schedule.slice(0, row?.month ?? 1).reduce((s, r) => s + r.interest / r.payment, 0) / (row?.month ?? 1)
          : 0.3
        interestPaid += Math.abs(mv.money) * avgInterestRatio
        capitalPaid  += Math.abs(mv.money) * (1 - avgInterestRatio)
      }
      continue
    }
    usedMonths.add(row.month)
    totalPaid    += Math.abs(mv.money)
    capitalPaid  += row.capital
    interestPaid += row.interest
  }

  const remainingCapital = Math.max(0, debt.capitalInitial - capitalPaid)
  const pct = debt.capitalInitial > 0 ? Math.min(100, (capitalPaid / debt.capitalInitial) * 100) : 0

  return { totalPaid, capitalPaid, interestPaid, remainingCapital, pct, schedule }
}

// ── Debt form ─────────────────────────────────────────────────────────────────

// ── Simulation ───────────────────────────────────────────────────────────────

export interface SimResult {
  newMonths: number
  interestSaved: number
  newEndDate: string
  monthsSaved: number
}

export function simulateExtra(
  remaining: number, rate: number, currentMonthly: number, startDate: string,
  extra: { type: 'monthly'; amount: number } | { type: 'lump'; amount: number },
  currentMonth: number,
): SimResult {
  const r          = rate / 100 / 12
  const payment    = extra.type === 'monthly' ? currentMonthly + extra.amount : currentMonthly
  const newBalance = extra.type === 'lump' ? Math.max(0, remaining - extra.amount) : remaining

  const newMonths = r > 0
    ? Math.ceil(-Math.log(1 - r * newBalance / payment) / Math.log(1 + r))
    : Math.ceil(newBalance / payment)

  // New interest from this point
  let bal = newBalance, newInterest = 0
  for (let i = 0; i < newMonths; i++) {
    const int = bal * r
    newInterest += int
    bal = Math.max(0, bal - (payment - int))
  }

  // Old interest from this point (same schedule)
  let oldBal = remaining, oldInterest = 0
  const oldMonths = r > 0
    ? Math.ceil(-Math.log(1 - r * remaining / currentMonthly) / Math.log(1 + r))
    : Math.ceil(remaining / currentMonthly)
  for (let i = 0; i < oldMonths; i++) {
    const int = oldBal * r
    oldInterest += int
    oldBal = Math.max(0, oldBal - (currentMonthly - int))
  }

  const d = new Date(startDate + 'T00:00:00')
  d.setMonth(d.getMonth() + currentMonth + newMonths)

  return {
    newMonths,
    interestSaved: Math.max(0, oldInterest - newInterest),
    newEndDate: d.toLocaleDateString('en-CA'),
    monthsSaved: Math.max(0, oldMonths - newMonths),
  }
}

// ── DebtForm ──────────────────────────────────────────────────────────────────

interface DebtFormProps {
  initial?: DebtConfig
  accounts: Account[]
  types: MovementType[]
  onSave: (d: DebtConfig) => void
  onCancel: () => void
}

function DebtForm({ initial, accounts, types, onSave, onCancel }: DebtFormProps) {
  const defaultPayment = initial
    ? String(Math.round(calcMonthlyPayment(initial.capitalInitial, initial.interestRate, initial.termMonths) * 100) / 100)
    : ''

  const [name,        setName]        = useState(initial?.name ?? '')
  const [accountId,   setAccountId]   = useState(String(initial?.accountId ?? ''))
  const [typeId,      setTypeId]      = useState(String(initial?.movementTypeId ?? ''))
  const [capital,     setCapital]     = useState(String(initial?.capitalInitial ?? ''))
  const [rate,        setRate]        = useState(String(initial?.interestRate ?? ''))
  const [term,        setTerm]        = useState(String(initial?.termMonths ?? ''))
  const [startDate,   setStartDate]   = useState(initial?.startDate ?? new Date().toLocaleDateString('en-CA'))
  const [mktVal,      setMktVal]      = useState(String(initial?.marketValue ?? ''))
  const [usePayment,  setUsePayment]  = useState(false)
  const [payment,     setPayment]     = useState(defaultPayment)

  const inputCls = 'border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-full'
  const labelCls = 'text-xs text-gray-500 dark:text-gray-400'

  // Auto-calculate term from payment or payment from term
  const computedTerm = useMemo(() => {
    if (!usePayment || !capital || !rate || !payment) return null
    const r = parseFloat(rate) / 100 / 12
    const C = parseFloat(capital.replace(',', '.'))
    const P = parseFloat(payment.replace(',', '.'))
    if (r === 0) return Math.ceil(C / P)
    const n = -Math.log(1 - r * C / P) / Math.log(1 + r)
    return isFinite(n) && n > 0 ? Math.ceil(n) : null
  }, [usePayment, capital, rate, payment])

  const computedPayment = useMemo(() => {
    if (usePayment || !capital || !rate || !term) return null
    const C = parseFloat(capital.replace(',', '.'))
    const r = parseFloat(rate)
    const n = parseInt(term)
    if (isNaN(C) || isNaN(r) || isNaN(n)) return null
    return calcMonthlyPayment(C, r, n)
  }, [usePayment, capital, rate, term])

  const save = () => {
    const C = parseFloat(capital.replace(',', '.'))
    const R = parseFloat(rate.replace(',', '.'))
    const T = usePayment ? (computedTerm ?? 0) : parseInt(term)
    if (!name.trim() || !accountId || !typeId || isNaN(C) || isNaN(R) || !T) return
    onSave({
      id:              initial?.id ?? genId(),
      name:            name.trim(),
      accountId:       parseInt(accountId),
      movementTypeId:  parseInt(typeId),
      capitalInitial:  C,
      interestRate:    R,
      termMonths:      T,
      startDate,
      marketValue:     mktVal ? parseFloat(mktVal.replace(',', '.')) : undefined,
    })
  }

  const debtAccounts = accounts.filter(a => a.category === 'inmueble' || a.category === 'vehiculo' || a.category === 'corriente' || a.category === 'ahorro')
  const expenseTypes = types.filter(tp => tp.category?.toLowerCase() !== 'ingreso')

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-white">{initial ? 'Editar deuda' : 'Nueva deuda'}</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2 space-y-1">
          <label className={labelCls}>Nombre</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="ej. Hipoteca piso" className={inputCls} autoFocus />
        </div>

        <div className="space-y-1">
          <label className={labelCls}>Cuenta vinculada</label>
          <select value={accountId} onChange={e => setAccountId(e.target.value)} className={inputCls}>
            <option value="">— Selecciona —</option>
            {debtAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className={labelCls}>Subtipo de pago</label>
          <select value={typeId} onChange={e => setTypeId(e.target.value)} className={inputCls}>
            <option value="">— Selecciona —</option>
            {expenseTypes.map(tp => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className={labelCls}>Capital prestado (€)</label>
          <input type="number" step="0.01" value={capital} onChange={e => setCapital(e.target.value)} placeholder="ej. 150000" className={inputCls} />
        </div>

        <div className="space-y-1">
          <label className={labelCls}>Interés anual (%)</label>
          <input type="number" step="0.01" value={rate} onChange={e => setRate(e.target.value)} placeholder="ej. 2.5" className={inputCls} />
        </div>

        {/* Term or payment — toggle */}
        <div className="sm:col-span-2 space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
              <button onClick={() => setUsePayment(false)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${!usePayment ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                Plazo (meses)
              </button>
              <button onClick={() => setUsePayment(true)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${usePayment ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                Cuota mensual
              </button>
            </div>
          </div>
          {!usePayment ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className={labelCls}>Plazo (meses)</label>
                <input type="number" value={term} onChange={e => setTerm(e.target.value)} placeholder="ej. 360" className={inputCls} />
              </div>
              {computedPayment != null && (
                <div className="space-y-1">
                  <label className={labelCls}>Cuota calculada</label>
                  <div className="px-2.5 py-1.5 text-sm font-mono font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    {computedPayment.toFixed(2)} €/mes
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className={labelCls}>Cuota mensual (€)</label>
                <input type="number" step="0.01" value={payment} onChange={e => setPayment(e.target.value)} placeholder="ej. 550" className={inputCls} />
              </div>
              {computedTerm != null && (
                <div className="space-y-1">
                  <label className={labelCls}>Plazo calculado</label>
                  <div className="px-2.5 py-1.5 text-sm font-mono font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    {computedTerm} meses ({(computedTerm / 12).toFixed(1)} años)
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className={labelCls}>Fecha de inicio</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
        </div>

        <div className="space-y-1">
          <label className={labelCls}>Valor de mercado estimado (€) <span className="text-gray-300 dark:text-gray-600">opcional</span></label>
          <input type="number" step="0.01" value={mktVal} onChange={e => setMktVal(e.target.value)} placeholder="ej. 200000" className={inputCls} />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700">Cancelar</button>
        <button onClick={save}
          className="px-4 py-1.5 text-xs font-medium rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors">
          Guardar
        </button>
      </div>
    </div>
  )
}

// ── Debt detail ───────────────────────────────────────────────────────────────

function DebtDetail({ debt, account, payments, onBack, onEdit, fmt, fmtDate }: {
  debt: DebtConfig
  account: Account | undefined
  payments: Movement[]
  onBack: () => void
  onEdit: () => void
  fmt: (v: number) => string
  fmtDate: (s: string) => string
}) {
  const [showTable,   setShowTable]   = useState(false)
  const [mktEdit,     setMktEdit]     = useState(false)
  const [mktInput,    setMktInput]    = useState(String(debt.marketValue ?? ''))
  const [simMode,     setSimMode]     = useState<'mensual' | 'unico'>('mensual')
  const [simAmount,   setSimAmount]   = useState('')

  const { totalPaid, capitalPaid, interestPaid, remainingCapital, pct, schedule } = useMemo(
    () => calcDebtSummary(debt, payments),
    [debt, payments],
  )

  const monthly        = calcMonthlyPayment(debt.capitalInitial, debt.interestRate, debt.termMonths)
  const totalInterest  = useMemo(() => schedule.reduce((s, r) => s + r.interest, 0), [schedule])
  const currentMonth   = payments.length  // approx months paid
  const endDate        = (() => { const d = new Date(debt.startDate + 'T00:00:00'); d.setMonth(d.getMonth() + debt.termMonths); return d.toLocaleDateString('en-CA') })()

  const simResult = useMemo(() => {
    const amt = parseFloat(simAmount.replace(',', '.'))
    if (!simAmount || isNaN(amt) || amt <= 0 || remainingCapital <= 0) return null
    return simulateExtra(
      remainingCapital, debt.interestRate, monthly, debt.startDate,
      simMode === 'mensual' ? { type: 'monthly', amount: amt } : { type: 'lump', amount: amt },
      currentMonth,
    )
  }, [simAmount, simMode, remainingCapital, debt.interestRate, monthly, debt.startDate, currentMonth])
  const paymentsSorted = [...payments].sort((a, b) => b.date.localeCompare(a.date))

  // Profitability
  const mktVal    = debt.marketValue
  const equity    = mktVal != null ? mktVal - remainingCapital : null
  const roi       = mktVal != null ? mktVal - debt.capitalInitial - interestPaid : null
  const roiPct    = roi != null && debt.capitalInitial > 0 ? (roi / (debt.capitalInitial + interestPaid)) * 100 : null

  const accentColor = account?.color ?? '#6366f1'

  return (
    <div className="space-y-4">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          Volver
        </button>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {account && (
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: accentColor + '20' }}>
              <AppIcon name={account.icon} className="w-4 h-4" style={{ color: accentColor }} strokeWidth={1.5} />
            </div>
          )}
          <h2 className="text-lg font-bold text-gray-800 dark:text-white truncate">{debt.name}</h2>
        </div>
        <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg transition-colors">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Progress */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5 space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Capital pendiente</p>
            <p className="text-3xl font-bold tabular-nums text-gray-900 dark:text-white mt-0.5">{fmt(remainingCapital)}</p>
            <p className="text-xs text-gray-400 mt-1">de {fmt(debt.capitalInitial)} inicial</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums" style={{ color: accentColor }}>{pct.toFixed(1)}%</p>
            <p className="text-xs text-gray-400">amortizado</p>
          </div>
        </div>
        <div className="h-3 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: accentColor }} />
        </div>
        <p className="text-xs text-gray-400">Fin estimado: {fmtDate(endDate)} · {fmt(monthly)}/mes</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total pagado',      value: fmt(totalPaid),    sub: `${paymentsSorted.length} cuota${paymentsSorted.length !== 1 ? 's' : ''}` },
          { label: 'Capital pagado',    value: fmt(capitalPaid),  sub: `${pct.toFixed(1)}% de ${fmt(debt.capitalInitial)}` },
          { label: 'Intereses pagados', value: fmt(interestPaid), sub: `de ${fmt(totalInterest)} totales` },
          { label: 'Interés anual',     value: `${debt.interestRate}%`, sub: `${debt.termMonths} meses` },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 px-3 py-2.5">
            <p className="text-[11px] text-gray-400 dark:text-gray-500">{s.label}</p>
            <p className="text-base font-bold tabular-nums text-gray-900 dark:text-white mt-0.5">{s.value}</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Simulation */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5" /> Simular amortización anticipada
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            {(['mensual', 'unico'] as const).map(m => (
              <button key={m} onClick={() => { setSimMode(m); setSimAmount('') }}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${simMode === m ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                {m === 'mensual' ? 'Extra mensual' : 'Pago único'}
              </button>
            ))}
          </div>
          <input
            type="number" step="0.01" value={simAmount} onChange={e => setSimAmount(e.target.value)}
            placeholder={simMode === 'mensual' ? 'Importe extra/mes €' : 'Importe único €'}
            className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        {simResult && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            {[
              { label: 'Nueva fecha fin', value: fmtDate(simResult.newEndDate), color: 'text-blue-600 dark:text-blue-400' },
              { label: 'Meses ahorrados', value: `${simResult.monthsSaved} meses`, color: 'text-green-600 dark:text-green-400' },
              { label: 'Intereses ahorrados', value: fmt(simResult.interestSaved), color: 'text-green-600 dark:text-green-400' },
              { label: 'Plazo nuevo', value: `${simResult.newMonths} meses`, color: 'text-gray-700 dark:text-gray-200' },
            ].map(s => (
              <div key={s.label} className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
                <p className="text-[11px] text-gray-400 dark:text-gray-500">{s.label}</p>
                <p className={`text-sm font-bold tabular-nums mt-0.5 ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}
        {!simResult && simAmount && (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">Introduce un importe válido para ver la simulación.</p>
        )}
      </div>

      {/* Profitability */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Rentabilidad</h3>
          {!mktEdit && (
            <button onClick={() => { setMktEdit(true); setMktInput(String(debt.marketValue ?? '')) }}
              className="text-xs text-blue-500 hover:text-blue-600 transition-colors">
              {debt.marketValue ? 'Editar estimación' : 'Añadir valor de mercado'}
            </button>
          )}
        </div>
        {mktEdit ? (
          <div className="flex items-center gap-2">
            <input type="number" step="1" value={mktInput} onChange={e => setMktInput(e.target.value)}
              placeholder="Valor actual estimado €"
              className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <button onClick={() => {
              const v = parseFloat(mktInput.replace(',', '.'))
              if (!isNaN(v)) {
                const debts = loadDebts()
                const next = debts.map(d => d.id === debt.id ? { ...d, marketValue: v } : d)
                saveDebts(next)
                debt.marketValue = v
              }
              setMktEdit(false)
            }} className="p-1.5 text-green-500"><Check className="w-4 h-4" /></button>
            <button onClick={() => setMktEdit(false)} className="p-1.5 text-gray-400"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : mktVal != null ? (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-gray-400">Valor mercado</p>
              <p className="text-base font-bold tabular-nums text-gray-900 dark:text-white">{fmt(mktVal)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Equity neto</p>
              <p className={`text-base font-bold tabular-nums ${equity! >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>{fmt(equity!)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Rentabilidad</p>
              <div className={`flex items-center gap-1 ${roiPct! >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                {roiPct! >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                <p className="text-base font-bold tabular-nums">{roiPct!.toFixed(1)}%</p>
              </div>
              <p className="text-[11px] text-gray-400">{fmt(roi!)}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">Añade una estimación del valor actual para calcular la rentabilidad.</p>
        )}
      </div>

      {/* Payment history */}
      {paymentsSorted.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Pagos realizados</h3>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800 max-h-64 overflow-y-auto">
            {paymentsSorted.map((mv, i) => {
              const row = matchPaymentToRow(mv.date, schedule)
              return (
                <div key={mv.id ?? i} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-xs text-gray-400 w-20 shrink-0 tabular-nums">{fmtDate(mv.date)}</span>
                  <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate">{mv.name}</span>
                  {row && (
                    <>
                      <span className="text-xs text-gray-400 shrink-0 tabular-nums">{fmt(row.capital)} cap.</span>
                      <span className="text-xs text-red-400 shrink-0 tabular-nums">{fmt(row.interest)} int.</span>
                    </>
                  )}
                  <span className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-200 shrink-0 tabular-nums">{fmt(Math.abs(mv.money))}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Amortization schedule (collapsible) */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <button onClick={() => setShowTable(v => !v)}
          className="w-full flex items-center gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          {showTable ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          Cuadro de amortización completo
        </button>
        {showTable && (
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                <tr>
                  {['Mes', 'Fecha', 'Cuota', 'Capital', 'Interés', 'Pendiente'].map(h => (
                    <th key={h} className="px-3 py-2 text-right first:text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {schedule.map(row => (
                  <tr key={row.month} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <td className="px-3 py-1.5 text-gray-500">{row.month}</td>
                    <td className="px-3 py-1.5 text-gray-500 tabular-nums">{fmtDate(row.date)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-700 dark:text-gray-200 tabular-nums">{fmt(row.payment)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-green-600 dark:text-green-400 tabular-nums">{fmt(row.capital)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-red-400 tabular-nums">{fmt(row.interest)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-500 tabular-nums">{fmt(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Debts() {
  const { fmt }     = useCurrency()
  const { fmtDate } = useDateFormat()
  const qc          = useQueryClient()

  const { data: summary }           = useQuery({ queryKey: ['accounts-summary'], queryFn: getAccountsSummary })
  const { data: allMovements = [] } = useQuery({ queryKey: ['movements'],        queryFn: () => getMovements() })
  const { data: types = [] }        = useQuery({ queryKey: ['movement-types'],   queryFn: getMovementTypes })

  const [debts,      setDebts]      = useState<DebtConfig[]>(loadDebts)
  const [showForm,   setShowForm]   = useState(false)
  const [editDebt,   setEditDebt]   = useState<DebtConfig | null>(null)
  const [detailId,   setDetailId]   = useState<string | null>(null)

  const accounts = summary?.accounts ?? []

  const saveDebt = async (d: DebtConfig) => {
    const monthly  = calcMonthlyPayment(d.capitalInitial, d.interestRate, d.termMonths)
    const startDay = new Date(d.startDate + 'T00:00:00').getDate()

    const templatePayload = {
      label:            d.name,
      name:             `${d.name} {mes} {año}`,
      money:            String(-Math.round(monthly * 100) / 100),
      dateMode:         'manual' as const,
      bankDateMode:     'manual' as const,
      movement_type_id: String(d.movementTypeId),
      paid:             false,
      no_count:         false,
      notes:            '',
      recurrence: {
        rule: { kind: 'monthly_day' as const, everyN: 1, weekdays: [], monthDay: startDay, monthWeek: 1, weekday: 0 },
        startDate: d.startDate,
        autoCreate: false,
      },
    }

    let templateId = d.templateId
    try {
      if (d.templateId) {
        await updateTemplate(d.templateId, templatePayload)
      } else {
        const tpl = await createTemplate(templatePayload)
        templateId = tpl.id
      }
      qc.invalidateQueries({ queryKey: ['templates'] })
    } catch { /* template creation not critical */ }

    const debtWithTemplate = { ...d, templateId }
    const next = debts.some(x => x.id === d.id)
      ? debts.map(x => x.id === d.id ? debtWithTemplate : x)
      : [...debts, debtWithTemplate]
    setDebts(next)
    saveDebts(next)
    setShowForm(false)
    setEditDebt(null)
  }

  const deleteDebt = async (id: string) => {
    if (!confirm('¿Eliminar esta deuda?')) return
    const debt = debts.find(d => d.id === id)
    if (debt?.templateId) {
      try { await deleteTemplate(debt.templateId); qc.invalidateQueries({ queryKey: ['templates'] }) } catch { /**/ }
    }
    const next = debts.filter(d => d.id !== id)
    setDebts(next)
    saveDebts(next)
    if (detailId === id) setDetailId(null)
  }

  const detailDebt = detailId ? debts.find(d => d.id === detailId) ?? null : null
  const detailAccount = detailDebt ? accounts.find(a => a.id === detailDebt.accountId) : undefined
  const detailPayments = detailDebt
    ? allMovements.filter(mv => mv.movement_type_id === detailDebt.movementTypeId && mv.dinero < 0)
    : []

  // Total summary
  const totalRemaining = useMemo(() => debts.reduce((s, d) => {
    const mvs = allMovements.filter(mv => mv.movement_type_id === d.movementTypeId && mv.dinero < 0)
    const { remainingCapital } = calcDebtSummary(d, mvs)
    return s + remainingCapital
  }, 0), [debts, allMovements])

  return (
    <div className="p-3 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Banknote className="w-6 h-6 text-blue-500" strokeWidth={1.5} />
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Deudas</h1>
        </div>
        {!detailDebt && !showForm && !editDebt && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gray-800 dark:bg-white text-white dark:text-gray-900 text-xs font-medium hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Nueva deuda
          </button>
        )}
      </div>

      {/* Form */}
      {(showForm || editDebt) && (
        <DebtForm
          initial={editDebt ?? undefined}
          accounts={accounts}
          types={types}
          onSave={saveDebt}
          onCancel={() => { setShowForm(false); setEditDebt(null) }}
        />
      )}

      {/* Detail view */}
      {detailDebt && !editDebt && (
        <DebtDetail
          debt={detailDebt}
          account={detailAccount}
          payments={detailPayments}
          onBack={() => setDetailId(null)}
          onEdit={() => setEditDebt(detailDebt)}
          fmt={fmt}
          fmtDate={fmtDate}
        />
      )}

      {/* List */}
      {!detailDebt && !showForm && !editDebt && (
        <>
          {debts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                <Banknote className="w-8 h-8 text-blue-400" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-700 dark:text-gray-200">No hay deudas registradas</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Añade tu hipoteca, préstamo de coche u otras deudas.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Global summary */}
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Total pendiente</p>
                  <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white mt-0.5">{fmt(totalRemaining)}</p>
                </div>
                <p className="text-sm text-gray-400">{debts.length} deuda{debts.length !== 1 ? 's' : ''}</p>
              </div>

              {/* Debt cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {debts.map(debt => {
                  const account  = accounts.find(a => a.id === debt.accountId)
                  const mvs      = allMovements.filter(mv => mv.movement_type_id === debt.movementTypeId && mv.dinero < 0)
                  const { capitalPaid, interestPaid, remainingCapital, pct } = calcDebtSummary(debt, mvs)
                  const monthly  = calcMonthlyPayment(debt.capitalInitial, debt.interestRate, debt.termMonths)
                  const endDate  = (() => { const d = new Date(debt.startDate + 'T00:00:00'); d.setMonth(d.getMonth() + debt.termMonths); return d.toLocaleDateString('en-CA') })()
                  const color    = account?.color ?? '#6366f1'
                  return (
                    <div key={debt.id}
                      onClick={() => setDetailId(debt.id)}
                      className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow space-y-3"
                      style={{ borderLeftColor: color, borderLeftWidth: 4 }}>

                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {account && (
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color + '20' }}>
                              <AppIcon name={account.icon} className="w-4 h-4" style={{ color }} strokeWidth={1.5} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{debt.name}</p>
                            {account && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{account.name}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setEditDebt(debt)} className="p-1 text-gray-300 dark:text-gray-600 hover:text-gray-500 rounded">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteDebt(debt.id)} className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-400 rounded">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-end justify-between">
                          <div>
                            <p className="text-xs text-gray-400">Pendiente</p>
                            <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">{fmt(remainingCapital)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold tabular-nums" style={{ color }}>{pct.toFixed(0)}%</p>
                            <p className="text-xs text-gray-400">{fmt(monthly)}/mes</p>
                          </div>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-gray-50 dark:border-gray-800">
                        <div>
                          <p className="text-[10px] text-gray-400">Capital pagado</p>
                          <p className="text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-200">{fmt(capitalPaid)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400">Intereses</p>
                          <p className="text-xs font-semibold tabular-nums text-red-400">{fmt(interestPaid)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400">Fin</p>
                          <p className="text-xs font-semibold tabular-nums text-gray-500 dark:text-gray-400">{fmtDate(endDate).slice(-4)}/{fmtDate(endDate).slice(3, 5)}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
