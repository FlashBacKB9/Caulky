import { useState, useCallback, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, Check, Delete } from 'lucide-react'
import { createMovement } from '../api/movements'
import { getMovementTypes, type MovementType } from '../api/movementTypes'
import { getAccountsSummary } from '../api/accounts'
import { useCurrency } from '../hooks/useCurrency'

// ── Constants ──────────────────────────────────────────────────────────────────

const INCOME_CATEGORIES = new Set(['Ingreso'])

const today = () => new Date().toISOString().slice(0, 10)

// ── Numpad ────────────────────────────────────────────────────────────────────

const KEYS = [
  ['7','8','9'],
  ['4','5','6'],
  ['1','2','3'],
  [',','0','⌫'],
] as const

function useAmountInput() {
  const [raw, setRaw] = useState('0')

  const press = useCallback((k: string) => {
    setRaw(prev => {
      if (k === '⌫') {
        const next = prev.slice(0, -1)
        return next === '' || next === '-' ? '0' : next
      }
      if (k === ',') {
        return prev.includes(',') ? prev : prev + ','
      }
      if (prev === '0') return k
      if (prev.length >= 10) return prev
      // max 2 decimal places
      const commaIdx = prev.indexOf(',')
      if (commaIdx >= 0 && prev.length - commaIdx > 2) return prev
      return prev + k
    })
  }, [])

  const reset = useCallback(() => setRaw('0'), [])

  const value = parseFloat(raw.replace(',', '.')) || 0

  return { raw, press, reset, value }
}

// ── Category chip ─────────────────────────────────────────────────────────────

function CategoryChip({ type, selected, onSelect }: {
  type: MovementType; selected: boolean; onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-2xl text-sm font-medium transition-all active:scale-95 ${
        selected
          ? 'text-white shadow-md scale-105'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
      }`}
      style={selected ? { backgroundColor: type.color || '#3b82f6' } : {}}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: selected ? 'rgba(255,255,255,0.7)' : (type.color || '#3b82f6') }}
      />
      {type.name}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function QuickAdd() {
  const navigate   = useNavigate()
  const qc         = useQueryClient()
  const { fmt }    = useCurrency()
  const { raw, press, reset, value } = useAmountInput()

  const [isIncome,    setIsIncome]    = useState(false)
  const [typeId,      setTypeId]      = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [accountId,   setAccountId]   = useState<number | null>(null)
  const [date,        setDate]        = useState(today())
  const [paid,        setPaid]        = useState(true)
  const [showMore,    setShowMore]    = useState(false)
  const [saved,       setSaved]       = useState(false)

  const { data: allTypes = [] } = useQuery({ queryKey: ['movement-types'], queryFn: getMovementTypes })
  const { data: summary }       = useQuery({ queryKey: ['accounts-summary'], queryFn: getAccountsSummary })

  const accounts = summary?.accounts ?? []

  const types = allTypes.filter(t =>
    isIncome ? INCOME_CATEGORIES.has(t.category) : !INCOME_CATEGORIES.has(t.category)
  )

  // Reset selected type when switching income/expense if incompatible
  useEffect(() => {
    if (typeId !== null) {
      const t = allTypes.find(x => x.id === typeId)
      if (t) {
        const belongsToIncome = INCOME_CATEGORIES.has(t.category)
        if (belongsToIncome !== isIncome) setTypeId(null)
      }
    }
  }, [isIncome, allTypes, typeId])

  // Default account to main account
  useEffect(() => {
    if (accounts.length && accountId === null) {
      const main = accounts.find(a => a.is_main) ?? accounts[0]
      setAccountId(main.id)
    }
  }, [accounts, accountId])

  const mutation = useMutation({
    mutationFn: () => {
      const money = isIncome ? Math.abs(value) : -Math.abs(value)
      return createMovement({
        name:             description.trim() || (types.find(t => t.id === typeId)?.name ?? '—'),
        money,
        date,
        movement_type_id: typeId ?? undefined,
        account_id:       accountId ?? undefined,
        paid,
        no_count:         false,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['annual'] })
      qc.invalidateQueries({ queryKey: ['accounts-summary'] })
      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        reset()
        setTypeId(null)
        setDescription('')
        setDate(today())
        setPaid(true)
      }, 1200)
    },
  })

  const canSave = value > 0

  const displayAmount = raw === '0' ? '0' : raw

  const isExpense = !isIncome

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950 max-w-md mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe-top pt-4 pb-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <button onClick={() => navigate(-1)} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors px-1">
          Cancelar
        </button>
        <span className="text-sm font-semibold text-gray-800 dark:text-white">Añadir movimiento</span>
        <div className="w-16" />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Type toggle + Amount display */}
        <div className={`flex flex-col items-center px-4 py-6 transition-colors ${isIncome ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50 dark:bg-red-950/30'}`}>

          {/* Gasto / Ingreso toggle */}
          <div className="flex rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 mb-5">
            <button
              onClick={() => setIsIncome(false)}
              className={`px-6 py-2 text-sm font-semibold transition-colors ${isExpense ? 'bg-red-500 text-white' : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400'}`}
            >
              Gasto
            </button>
            <button
              onClick={() => setIsIncome(true)}
              className={`px-6 py-2 text-sm font-semibold transition-colors ${isIncome ? 'bg-green-500 text-white' : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400'}`}
            >
              Ingreso
            </button>
          </div>

          {/* Amount */}
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-light ${isIncome ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
              {isIncome ? '+' : '−'}
            </span>
            <span className={`text-6xl font-bold tabular-nums tracking-tight ${isIncome ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
              {displayAmount}
            </span>
            <span className={`text-2xl font-light ml-1 ${isIncome ? 'text-green-500' : 'text-red-400'}`}>€</span>
          </div>

          {/* Selected category */}
          {typeId !== null && (
            <span className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {allTypes.find(t => t.id === typeId)?.name}
            </span>
          )}
        </div>

        {/* Category chips */}
        <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 py-3 shrink-0">
          <div className="flex gap-2 px-4 overflow-x-auto scrollbar-hide pb-0.5">
            {types.map(t => (
              <CategoryChip
                key={t.id} type={t}
                selected={typeId === t.id}
                onSelect={() => setTypeId(prev => prev === t.id ? null : t.id)}
              />
            ))}
          </div>
        </div>

        {/* Numpad */}
        <div className="bg-white dark:bg-gray-900 px-4 pt-2 pb-3 shrink-0">
          <div className="grid grid-cols-3 gap-2">
            {KEYS.flat().map(k => (
              <button
                key={k}
                onClick={() => press(k)}
                className={`h-14 rounded-2xl text-xl font-semibold transition-all active:scale-95 active:opacity-70
                  ${k === '⌫'
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex items-center justify-center'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700'}
                  ${k === ',' ? 'text-2xl' : ''}`}
              >
                {k === '⌫' ? <Delete className="w-5 h-5" /> : k}
              </button>
            ))}
          </div>
        </div>

        {/* More options (collapsible) */}
        <div className="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 shrink-0">
          <button
            onClick={() => setShowMore(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <span>Más opciones</span>
            {showMore ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showMore && (
            <div className="px-4 pb-4 space-y-3 border-t border-gray-50 dark:border-gray-800">
              {/* Description */}
              <div className="pt-3">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5 block">Descripción</label>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Opcional…"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>

              {/* Account */}
              {accounts.length > 1 && (
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5 block">Cuenta</label>
                  <div className="flex gap-2 flex-wrap">
                    {accounts.map(a => (
                      <button key={a.id} onClick={() => setAccountId(a.id)}
                        className={`px-3 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 ${accountId === a.id ? 'text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}
                        style={accountId === a.id ? { backgroundColor: a.color || '#3b82f6' } : {}}>
                        {a.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Date */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5 block">Fecha</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>

              {/* Paid toggle */}
              <div className="flex items-center justify-between py-1">
                <span className="text-sm text-gray-700 dark:text-gray-300">Pagado</span>
                <button
                  onClick={() => setPaid(v => !v)}
                  className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${paid ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${paid ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Save button */}
        <div className="px-4 py-4 pb-safe-bottom bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 shrink-0">
          <button
            onClick={() => mutation.mutate()}
            disabled={!canSave || mutation.isPending || saved}
            className={`w-full h-14 rounded-2xl text-base font-bold transition-all active:scale-[0.97] disabled:opacity-40
              ${saved
                ? 'bg-green-500 text-white'
                : isIncome
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-red-500 hover:bg-red-600 text-white'}
              ${mutation.isPending ? 'opacity-60' : ''}`}
          >
            {saved ? (
              <span className="flex items-center justify-center gap-2">
                <Check className="w-5 h-5" />
                ¡Guardado!
              </span>
            ) : mutation.isPending ? 'Guardando…' : (
              `Guardar ${canSave ? fmt(value, 2) : ''}`
            )}
          </button>
        </div>

      </div>
    </div>
  )
}
