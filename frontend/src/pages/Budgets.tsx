import { useMemo, useState } from 'react'
import { t, getMonthNames } from '../utils/i18n'
import { syncPref } from '../utils/prefSync'
import { useQuery } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, X, ChevronLeft, ChevronDown, ChevronRight, History, ChartCandlestick, Table2, TrendingUp } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { getMovements, type Movement } from '../api/movements'
import { getMovementTypes, type MovementType } from '../api/movementTypes'
import { getGroups, type Group } from '../api/groups'
import { useCurrency } from '../hooks/useCurrency'

// ── Types ──────────────────────────────────────────────────────────────────────

interface BudgetVersion {
  id: string
  amount: number
  effectiveFrom: string // YYYY-MM-DD
}

type BudgetPeriodType = 'monthly' | 'weekly' | 'annual' | 'custom'

interface Budget {
  id: string
  name: string
  typeIds: number[]
  period: BudgetPeriodType
  customFrom?: string
  customTo?: string
  monthlyStartDay?: number   // 1–31, default 1
  weeklyStartDay?: number    // 0=Lun … 6=Dom, default 0
  annualStartDate?: string   // "MM-DD", default "01-01"
  trackingStart: string | null // null = infinite past
  versions: BudgetVersion[] // sorted asc by effectiveFrom
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
function todayStr() { return new Date().toLocaleDateString('en-CA') }
function localDateStr(d: Date) { return d.toLocaleDateString('en-CA') }
function addDays(d: string, n: number) {
  const dt = new Date(d + 'T00:00:00'); dt.setDate(dt.getDate() + n); return localDateStr(dt)
}

const MONTHS = getMonthNames('short')
const PERIOD_LABELS: Record<BudgetPeriodType, string> = {
  monthly: t('budgets.periodMonthly'), weekly: t('budgets.periodWeekly'), annual: t('budgets.periodAnnual'), custom: t('budgets.periodCustom'),
}

export function readBudgets(): Budget[] {
  try { return JSON.parse(localStorage.getItem('spendly-budgets') ?? '[]') } catch { return [] }
}
export type { Budget, BudgetPeriodType }

export function getCurrentPeriod(
  period: BudgetPeriodType,
  customFrom?: string,
  customTo?: string,
  monthlyStartDay?: number,
  weeklyStartDay?: number,
  annualStartDate?: string,
): { start: string; end: string } {
  const now = new Date()

  if (period === 'monthly') {
    const d = monthlyStartDay ?? 1
    let y = now.getFullYear(), m = now.getMonth()
    if (now.getDate() < d) { m -= 1; if (m < 0) { m = 11; y -= 1 } }
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const clamp = Math.min(d, daysInMonth)
    return { start: localDateStr(new Date(y, m, clamp)), end: localDateStr(new Date(y, m + 1, clamp - 1)) }
  }

  if (period === 'annual') {
    const sd = annualStartDate ?? '01-01'
    const y = now.getFullYear()
    const thisStart = `${y}-${sd}`
    const [mm, dd] = sd.split('-').map(Number)
    if (todayStr() >= thisStart) {
      const endDt = new Date(y + 1, mm - 1, dd); endDt.setDate(endDt.getDate() - 1)
      return { start: thisStart, end: localDateStr(endDt) }
    } else {
      const endDt = new Date(y, mm - 1, dd); endDt.setDate(endDt.getDate() - 1)
      return { start: `${y - 1}-${sd}`, end: localDateStr(endDt) }
    }
  }

  if (period === 'weekly') {
    const jsWD = ((weeklyStartDay ?? 0) + 1) % 7  // 0=Mon→1, 6=Sun→0
    const diff = (now.getDay() - jsWD + 7) % 7
    const start = new Date(now); start.setDate(now.getDate() - diff)
    const end   = new Date(start); end.setDate(start.getDate() + 6)
    return { start: localDateStr(start), end: localDateStr(end) }
  }

  return { start: customFrom ?? todayStr(), end: customTo ?? todayStr() }
}

// Returns periods newest-first from fromDate to today
function generatePeriods(
  period: BudgetPeriodType,
  fromDate: string,
  customFrom?: string,
  customTo?: string,
  monthlyStartDay?: number,
  weeklyStartDay?: number,
  annualStartDate?: string,
): Array<{ key: string; label: string; start: string; end: string }> {
  const today = todayStr()

  if (period === 'custom') {
    const start = customFrom ?? today
    const end   = customTo   ?? today
    return [{ key: start, label: `${start} → ${end}`, start, end }]
  }

  const periods: Array<{ key: string; label: string; start: string; end: string }> = []

  if (period === 'annual') {
    const sd  = annualStartDate ?? '01-01'
    const [mm, dd] = sd.split('-').map(Number)
    // Find first fiscal year that starts on or before fromDate
    let y = +fromDate.slice(0, 4)
    if (fromDate < `${y}-${sd}`) y -= 1
    while (`${y}-${sd}` <= today) {
      const startStr = `${y}-${sd}`
      const endDt = new Date(y + 1, mm - 1, dd); endDt.setDate(endDt.getDate() - 1)
      const endStr = localDateStr(endDt)
      const label  = sd === '01-01' ? `${y}` : `${startStr.slice(5)} → ${endStr.slice(5)}`
      periods.push({ key: `${y}`, label, start: startStr, end: endStr })
      y++
    }
  } else if (period === 'monthly') {
    const d = monthlyStartDay ?? 1
    // Start from the period that contains fromDate
    let fy = +fromDate.slice(0, 4), fm = +fromDate.slice(5, 7) - 1
    if (+fromDate.slice(8, 10) < d) { fm -= 1; if (fm < 0) { fm = 11; fy -= 1 } }
    let cur = new Date(fy, fm, 1)
    const endRef = new Date(today)
    while (cur <= endRef) {
      const y = cur.getFullYear(), m = cur.getMonth()
      const daysInM = new Date(y, m + 1, 0).getDate()
      const clamp   = Math.min(d, daysInM)
      const start   = localDateStr(new Date(y, m, clamp))
      const endM    = localDateStr(new Date(y, m + 1, clamp - 1))
      periods.push({ key: `${y}-${String(m + 1).padStart(2, '0')}-${String(clamp).padStart(2, '0')}`, label: `${MONTHS[m]} ${y}`, start, end: endM })
      cur = new Date(y, m + 1, 1)
    }
  } else {
    // weekly
    const jsWD = ((weeklyStartDay ?? 0) + 1) % 7
    const d = new Date(fromDate)
    const diff0 = (d.getDay() - jsWD + 7) % 7
    d.setDate(d.getDate() - diff0)
    const todayD = new Date(today)
    while (d <= todayD) {
      const startStr = localDateStr(d)
      const end = new Date(d); end.setDate(d.getDate() + 6)
      const endStr = localDateStr(end)
      periods.push({ key: startStr, label: `${startStr.slice(5)} → ${endStr.slice(5)}`, start: startStr, end: endStr })
      d.setDate(d.getDate() + 7)
    }
  }

  return periods.reverse()
}

// Latest version whose effectiveFrom <= date; falls back to first version
export function getAmountForDate(versions: BudgetVersion[], date: string): number {
  if (!versions.length) return 0
  let result = versions[0].amount
  for (const v of versions) {
    if (v.effectiveFrom <= date) result = v.amount
    else break
  }
  return result
}

export function calcSpending(movements: Movement[], typeIds: Set<number>, start: string, end: string): number {
  return movements
    .filter(mv => mv.movement_type_id != null && typeIds.has(mv.movement_type_id) && mv.date >= start && mv.date <= end)
    .reduce((s, mv) => s + Math.abs(mv.dinero), 0)
}

function pctColors(pct: number) {
  if (pct >= 105) return { bar: 'bg-red-500',      text: 'text-red-600 dark:text-red-400' }
  if (pct >= 90)  return { bar: 'bg-orange-500',   text: 'text-orange-600 dark:text-orange-400' }
  if (pct >= 70)  return { bar: 'bg-yellow-500',   text: 'text-yellow-600 dark:text-yellow-400' }
  return               { bar: 'bg-emerald-500',  text: 'text-emerald-600 dark:text-emerald-400' }
}

// ── BudgetCard ─────────────────────────────────────────────────────────────────

function BudgetCard({ budget, movements, onClick, onEdit, onDelete }: {
  budget: Budget; movements: Movement[]
  onClick: () => void; onEdit: () => void; onDelete: () => void
}) {
  const { fmt } = useCurrency()
  const typeIds = useMemo(() => new Set(budget.typeIds), [budget.typeIds])
  const { start, end } = useMemo(() => getCurrentPeriod(budget.period, budget.customFrom, budget.customTo, budget.monthlyStartDay, budget.weeklyStartDay, budget.annualStartDate), [budget])
  const currentAmount = budget.versions.length ? budget.versions[budget.versions.length - 1].amount : 0
  const spent = useMemo(() => calcSpending(movements, typeIds, start, end), [movements, typeIds, start, end])
  const pct = currentAmount > 0 ? Math.round((spent / currentAmount) * 100) : 0
  const remaining = currentAmount - spent
  const colors = pctColors(pct)

  return (
    <div onClick={onClick}
      className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow group">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white truncate">{budget.name}</h3>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">{PERIOD_LABELS[budget.period]}</span>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={e => e.stopPropagation()}>
          <button onClick={onEdit}
            className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <Edit2 className="w-3.5 h-3.5" strokeWidth={1.5}/>
          </button>
          <button onClick={onDelete}
            className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5}/>
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-end justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-700 dark:text-gray-200">{fmt(spent)}</span>
            {' / '}{fmt(currentAmount)}
          </span>
          <div className="text-right shrink-0">
            <div className={`text-xs font-bold tabular-nums ${colors.text}`}>{pct}%</div>
            <div className="text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
              {remaining >= 0 ? `Resta ${fmt(remaining)}` : `+${fmt(-remaining)}`}
            </div>
          </div>
        </div>
        <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${colors.bar}`} style={{ width: `${Math.min(pct, 100)}%` }}/>
        </div>
      </div>
    </div>
  )
}

// ── BudgetForm ─────────────────────────────────────────────────────────────────

function BudgetForm({ initial, types, groups, onSave, onCancel }: {
  initial: Budget | null; types: MovementType[]; groups: Group[]
  onSave: (b: Budget) => void; onCancel: () => void
}) {
  const today = todayStr()
  const currentAmount = initial?.versions[initial.versions.length - 1]?.amount

  const [name,             setName]            = useState(initial?.name ?? '')
  const [period,           setPeriod]          = useState<BudgetPeriodType>(initial?.period ?? 'monthly')
  const [customFrom,       setCustomFrom]      = useState(initial?.customFrom ?? today)
  const [customTo,         setCustomTo]        = useState(initial?.customTo ?? today)
  const [monthlyStartDay,  setMonthlyStartDay] = useState(initial?.monthlyStartDay ?? 1)
  const [weeklyStartDay,   setWeeklyStartDay]  = useState(initial?.weeklyStartDay ?? 0)
  const [annualStartMonth, setAnnualStartMonth] = useState(() => {
    const sd = initial?.annualStartDate ?? '01-01'
    return parseInt(sd.slice(0, 2), 10)
  })
  const [annualStartDay,   setAnnualStartDay]  = useState(() => {
    const sd = initial?.annualStartDate ?? '01-01'
    return parseInt(sd.slice(3, 5), 10)
  })
  const [selectedIds,      setSelectedIds]     = useState<Set<number>>(new Set(initial?.typeIds ?? []))
  const [amount,           setAmount]          = useState(currentAmount?.toString() ?? '')
  const [trackingStart,    setTrackingStart]   = useState(initial?.trackingStart ?? '')

  const groupById    = useMemo(() => Object.fromEntries(groups.map(g => [g.id, g])), [groups])
  const typesByGroup = useMemo(() => {
    const map: Record<number, MovementType[]> = {}
    for (const t of types) {
      if (!map[t.income_expense_group_id]) map[t.income_expense_group_id] = []
      map[t.income_expense_group_id].push(t)
    }
    return map
  }, [types])

  const amountNum = parseFloat(amount)
  const amountChanged = initial && !isNaN(amountNum) && amountNum !== currentAmount
  const isValid = name.trim().length > 0 && !isNaN(amountNum) && amountNum > 0 && selectedIds.size > 0

  function toggleType(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleSave() {
    if (!isValid) return
    let versions: BudgetVersion[]
    if (!initial) {
      versions = [{ id: genId(), amount: amountNum, effectiveFrom: trackingStart || today }]
    } else if (amountChanged) {
      versions = [...initial.versions, { id: genId(), amount: amountNum, effectiveFrom: today }]
    } else {
      versions = initial.versions
    }
    onSave({
      id: initial?.id ?? genId(),
      name: name.trim(),
      typeIds: [...selectedIds],
      period,
      customFrom:        period === 'custom'   ? customFrom : undefined,
      customTo:          period === 'custom'   ? customTo   : undefined,
      monthlyStartDay:   period === 'monthly'  ? monthlyStartDay  : undefined,
      weeklyStartDay:    period === 'weekly'   ? weeklyStartDay   : undefined,
      annualStartDate:   period === 'annual'   ? `${String(annualStartMonth).padStart(2,'0')}-${String(annualStartDay).padStart(2,'0')}` : undefined,
      trackingStart: trackingStart || null,
      versions,
    })
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400'
  const dateInputCls = 'flex-1 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-300 focus:outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
            {initial ? t('budgets.editTitle') : t('budgets.newTitle')}
          </h2>
          <button onClick={onCancel} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4"/>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Name */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">{t('common.name')}</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Ocio mensual" className={inputCls}/>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">
              {t('budgets.amountLabel')}
              {amountChanged && (
                <span className="ml-2 normal-case font-normal text-blue-400"> — {t('budgets.newVersion')}</span>
              )}
            </label>
            <input type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} placeholder="150" className={inputCls}/>
          </div>

          {/* Period */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">{t('budgets.periodLabel')}</label>
            <div className="flex gap-1.5 flex-wrap">
              {(['monthly','weekly','annual','custom'] as BudgetPeriodType[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${period === p ? 'bg-gray-800 dark:bg-white text-white dark:text-gray-900 border-transparent' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'}`}>
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
            {period === 'monthly' && (
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
                <span>Empieza el día</span>
                <select value={monthlyStartDay} onChange={e => setMonthlyStartDay(Number(e.target.value))}
                  className={dateInputCls + ' w-16'}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <span>de cada mes</span>
              </div>
            )}
            {period === 'weekly' && (
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
                <span>Empieza el</span>
                <select value={weeklyStartDay} onChange={e => setWeeklyStartDay(Number(e.target.value))}
                  className={dateInputCls}>
                  {['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            )}
            {period === 'annual' && (
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
                <span>Empieza el</span>
                <select value={annualStartDay} onChange={e => setAnnualStartDay(Number(e.target.value))}
                  className={dateInputCls + ' w-16'}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <span>de</span>
                <select value={annualStartMonth} onChange={e => setAnnualStartMonth(Number(e.target.value))}
                  className={dateInputCls}>
                  {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
              </div>
            )}
            {period === 'custom' && (
              <div className="flex items-center gap-2 mt-2">
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className={dateInputCls}/>
                <span className="text-gray-400 text-xs shrink-0">→</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className={dateInputCls}/>
              </div>
            )}
          </div>

          {/* Tracking start */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">
              {t('budgets.trackingStart')} <span className="normal-case font-normal">({t('budgets.trackingHint')})</span>
            </label>
            <input type="date" value={trackingStart} onChange={e => setTrackingStart(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 focus:outline-none w-auto"/>
            {trackingStart && (
              <button onClick={() => setTrackingStart('')} className="ml-2 text-[11px] text-gray-400 hover:text-gray-600 transition-colors">{t('budgets.clear')}</button>
            )}
          </div>

          {/* Type selector */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">
              {t('budgets.subcategories')} <span className="normal-case font-normal">({selectedIds.size} seleccionadas)</span>
            </label>
            <div className="border border-gray-100 dark:border-gray-800 rounded-xl p-3 space-y-3 max-h-52 overflow-y-auto">
              {Object.entries(typesByGroup).map(([gid, gTypes]) => {
                const group = groupById[+gid]
                return (
                  <div key={gid}>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{group?.name ?? '?'}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {gTypes.map(t => (
                        <button key={t.id} onClick={() => toggleType(t.id)}
                          className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] border transition-colors ${selectedIds.has(t.id) ? 'text-white border-transparent' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 hover:border-gray-300'}`}
                          style={selectedIds.has(t.id) ? { backgroundColor: t.color } : undefined}>
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-800 shrink-0">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            {t('common.cancel')}
          </button>
          <button onClick={handleSave} disabled={!isValid}
            className="flex-1 px-4 py-2 rounded-xl bg-gray-800 dark:bg-white text-white dark:text-gray-900 text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── BudgetDetail ───────────────────────────────────────────────────────────────

function BudgetDetail({ budget, movements, types, onClose, onEdit }: {
  budget: Budget; movements: Movement[]; types: MovementType[]
  onClose: () => void; onEdit: () => void
}) {
  const { fmt, fmtK } = useCurrency()
  const typeIds  = useMemo(() => new Set(budget.typeIds), [budget.typeIds])
  const typeMap  = useMemo(() => Object.fromEntries(types.map(t => [t.id, t])), [types])

  const earliestDate = useMemo(() => {
    const dates = movements
      .filter(mv => mv.movement_type_id != null && typeIds.has(mv.movement_type_id))
      .map(mv => mv.date).sort()
    return dates[0] ?? addDays(todayStr(), -365)
  }, [movements, typeIds])

  const [viewFrom,      setViewFrom]      = useState(budget.trackingStart ?? '')
  const [view,          setView]          = useState<'table' | 'chart'>('table')
  const [expandedRows,  setExpandedRows]  = useState<Set<string>>(new Set())

  function toggleRow(key: string) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const resolvedFrom = viewFrom || budget.trackingStart || earliestDate

  const periods = useMemo(
    () => generatePeriods(budget.period, resolvedFrom, budget.customFrom, budget.customTo, budget.monthlyStartDay, budget.weeklyStartDay, budget.annualStartDate),
    [budget.period, resolvedFrom, budget.customFrom, budget.customTo, budget.monthlyStartDay, budget.weeklyStartDay, budget.annualStartDate]
  )

  const rows = useMemo(() => periods.map(p => {
    const amount = getAmountForDate(budget.versions, p.start)
    const spent  = calcSpending(movements, typeIds, p.start, p.end)
    const pct    = amount > 0 ? Math.round((spent / amount) * 100) : 0
    return { ...p, amount, spent, pct }
  }), [periods, budget.versions, movements, typeIds])

  // Chart data: oldest first for time axis
  const chartData = useMemo(() => [...rows].reverse().map(r => ({ x: r.label, gasto: r.spent, limite: r.amount })), [rows])

  const typeNames = useMemo(
    () => budget.typeIds.map(id => typeMap[id]?.name ?? '?').join(', '),
    [budget.typeIds, typeMap]
  )

  const { start, end } = getCurrentPeriod(budget.period, budget.customFrom, budget.customTo, budget.monthlyStartDay, budget.weeklyStartDay, budget.annualStartDate)
  const currentAmount  = budget.versions[budget.versions.length - 1]?.amount ?? 0
  const currentSpent   = useMemo(() => calcSpending(movements, typeIds, start, end), [movements, typeIds, start, end])
  const currentPct     = currentAmount > 0 ? Math.round((currentSpent / currentAmount) * 100) : 0
  const currentColors  = pctColors(currentPct)

  const tooltipFmt = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
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

  return (
    <div className="flex-1 overflow-auto">
      {/* Subheader */}
      <div className="flex items-center gap-4 px-3 md:px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors shrink-0">
          <ChevronLeft className="w-4 h-4"/> {t('common.back')}
        </button>
        <h2 className="flex-1 text-sm font-semibold text-gray-800 dark:text-white text-center truncate">{budget.name}</h2>
        <button onClick={onEdit} className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors shrink-0">
          <Edit2 className="w-3.5 h-3.5"/> {t('common.edit')}
        </button>
      </div>

      <div className="p-3 md:p-6 max-w-2xl mx-auto space-y-4">

        {/* Current period summary */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{PERIOD_LABELS[budget.period]} {t('budgets.currentPeriod')}</p>
              <p className="text-lg font-bold text-gray-800 dark:text-white mt-0.5">{budget.name}</p>
              <p className="text-[11px] text-gray-400 mt-0.5 tabular-nums">{start} → {end}</p>
            </div>
            <span className={`text-2xl font-bold tabular-nums ${currentColors.text}`}>{currentPct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mb-2">
            <div className={`h-full rounded-full transition-all ${currentColors.bar}`} style={{ width: `${Math.min(currentPct, 100)}%` }}/>
          </div>
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{t('budgets.spent')} <span className="font-semibold text-gray-700 dark:text-gray-200">{fmt(currentSpent)}</span></span>
            <span>{t('budgets.limit')} <span className="font-semibold text-gray-700 dark:text-gray-200">{fmt(currentAmount)}</span></span>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 truncate">{typeNames}</p>
        </div>

        {/* Version history */}
        {budget.versions.length > 1 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-3.5 h-3.5 text-gray-400" strokeWidth={1.5}/>
              <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{t('budgets.limitHistory')}</p>
            </div>
            <div className="space-y-1.5">
              {[...budget.versions].reverse().map((v, i) => (
                <div key={v.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 dark:text-gray-500">desde {v.effectiveFrom}</span>
                  <span className={`font-semibold ${i === 0 ? 'text-gray-800 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>{fmt(v.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Controls row: view toggle + date filter */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* View toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5 shrink-0">
            <button onClick={() => setView('table')} title="Tabla"
              className={`p-1.5 rounded-md transition-colors ${view === 'table' ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
              <Table2 className="w-3.5 h-3.5"/>
            </button>
            <button onClick={() => setView('chart')} title="Gráfico"
              className={`p-1.5 rounded-md transition-colors ${view === 'chart' ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
              <TrendingUp className="w-3.5 h-3.5"/>
            </button>
          </div>

          <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide shrink-0">Ver desde</label>
          <input type="date" value={viewFrom} onChange={e => setViewFrom(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-300 focus:outline-none"/>
          {viewFrom && (
            <button onClick={() => setViewFrom('')} className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">{t('budgets.clear')}</button>
          )}
        </div>

        {/* Chart view */}
        {view === 'chart' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4">
            {chartData.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">{t('charts.noData')}</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false}/>
                  <XAxis dataKey="x" tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/>
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={60}/>
                  <Tooltip content={tooltipFmt as never}/>
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }}/>
                  <Line dataKey="limite" name={t('budgets.seriesLimit')} stroke="#ef4444" strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={{ r: 4 }}/>
                  <Line dataKey="gasto"  name={t('budgets.seriesSpent')}  stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }}/>
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* Table view */}
        {view === 'table' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide w-6"></th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide">{t('budgets.periodLabel')}</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium text-gray-400 uppercase tracking-wide">{t('budgets.limit')}</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium text-gray-400 uppercase tracking-wide">{t('budgets.spent')}</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium text-gray-400 uppercase tracking-wide">%</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">{t('budgets.noData')}</td></tr>
                )}
                {rows.map(row => {
                  const colors = pctColors(row.pct)
                  const expanded = expandedRows.has(row.key)
                  const isCurrent = row.start === start && row.end === end
                  const rowMovements = movements.filter(mv =>
                    mv.movement_type_id != null && typeIds.has(mv.movement_type_id) &&
                    mv.date >= row.start && mv.date <= row.end
                  ).sort((a, b) => b.date.localeCompare(a.date))
                  return (
                    <>
                      <tr key={row.key}
                        onClick={() => toggleRow(row.key)}
                        className={`border-b border-gray-50 dark:border-gray-800/50 last:border-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer ${isCurrent ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''}`}>
                        <td className="pl-3 py-2.5">
                          {expanded
                            ? <ChevronDown className="w-3.5 h-3.5 text-gray-400"/>
                            : <ChevronRight className="w-3.5 h-3.5 text-gray-400"/>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-700 dark:text-gray-300 font-medium">
                          <span>{row.label}</span>
                          {isCurrent && <span className="ml-1.5 text-[10px] font-semibold text-blue-500 dark:text-blue-400">← actual</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-400 dark:text-gray-500 text-right font-mono">{fmt(row.amount)}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-700 dark:text-gray-200 text-right font-mono">{fmt(row.spent)}</td>
                        <td className={`px-4 py-2.5 text-xs font-bold text-right tabular-nums ${colors.text}`}>{row.pct}%</td>
                        <td className="px-4 py-2.5">
                          <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                            <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${Math.min(row.pct, 100)}%` }}/>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={row.key + '-exp'} className="border-b border-gray-50 dark:border-gray-800/50">
                          <td colSpan={6} className="px-4 pb-2 pt-0">
                            {rowMovements.length === 0 ? (
                              <p className="text-xs text-gray-400 py-2 pl-4">{t('budgets.noData')}</p>
                            ) : (
                              <div className="ml-4 divide-y divide-gray-50 dark:divide-gray-800/60">
                                {rowMovements.map(mv => (
                                  <div key={mv.id} className="flex items-center justify-between py-1.5 gap-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: mv.color }}/>
                                      <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{mv.name}</span>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                      <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">{mv.date}</span>
                                      <span className="text-xs font-mono font-medium text-gray-700 dark:text-gray-200 tabular-nums">{fmt(Math.abs(mv.dinero))}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Budgets() {
  const [budgets, setBudgets] = useState<Budget[]>(() => {
    try { return JSON.parse(localStorage.getItem('spendly-budgets') ?? '[]') } catch { return [] }
  })
  const [showForm,      setShowForm]      = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [detailId,      setDetailId]      = useState<string | null>(null)

  const { data: movements = [] } = useQuery({ queryKey: ['movements'], queryFn: () => getMovements() })
  const { data: types  = [] }   = useQuery({ queryKey: ['movement-types'],  queryFn: getMovementTypes })
  const { data: groups = [] }   = useQuery({ queryKey: ['groups'],          queryFn: getGroups })

  function saveBudgets(next: Budget[]) {
    setBudgets(next)
    syncPref('spendly-budgets', JSON.stringify(next))
  }

  function handleSave(b: Budget) {
    const exists = budgets.find(x => x.id === b.id)
    saveBudgets(exists ? budgets.map(x => x.id === b.id ? b : x) : [...budgets, b])
    setShowForm(false); setEditingBudget(null)
  }

  function handleDelete(id: string) {
    if (!confirm(t('budgets.confirmDelete'))) return
    saveBudgets(budgets.filter(b => b.id !== id))
    if (detailId === id) setDetailId(null)
  }

  function openEdit(b: Budget) {
    setEditingBudget(b); setShowForm(true); setDetailId(null)
  }

  const detailBudget = detailId ? budgets.find(b => b.id === detailId) ?? null : null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 md:px-6 py-3 md:py-4 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <ChartCandlestick className="w-4 h-4 text-gray-400" strokeWidth={1.5}/>
          <h1 className="text-base font-bold text-gray-800 dark:text-white">{t('budgets.title')}</h1>
        </div>
        <button
          onClick={() => { setEditingBudget(null); setShowForm(true) }}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gray-800 dark:bg-white text-white dark:text-gray-900 text-xs font-medium hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors">
          <Plus className="w-3.5 h-3.5"/> {t('budgets.new')}
        </button>
      </div>

      {detailBudget ? (
        <BudgetDetail
          budget={detailBudget}
          movements={movements}
          types={types}
          onClose={() => setDetailId(null)}
          onEdit={() => openEdit(detailBudget)}
        />
      ) : (
        <div className="flex-1 overflow-auto p-3 md:p-6">
          {budgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
              <ChartCandlestick className="w-10 h-10" strokeWidth={1}/>
              <p className="text-sm">{t('budgets.empty')}</p>
              <button
                onClick={() => { setEditingBudget(null); setShowForm(true) }}
                className="text-sm text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                {t('budgets.createFirst')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {budgets.map(b => (
                <BudgetCard
                  key={b.id}
                  budget={b}
                  movements={movements}
                  onClick={() => setDetailId(b.id)}
                  onEdit={() => openEdit(b)}
                  onDelete={() => handleDelete(b.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <BudgetForm
          initial={editingBudget}
          types={types}
          groups={groups}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingBudget(null) }}
        />
      )}
    </div>
  )
}
