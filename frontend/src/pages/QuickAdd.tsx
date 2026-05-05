import { useState, useCallback, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Check, Delete, ChevronDown, X } from 'lucide-react'
import { createMovement } from '../api/movements'
import { getMovementTypes, type MovementType } from '../api/movementTypes'
import { getAccountsSummary } from '../api/accounts'
import { useCurrency } from '../hooks/useCurrency'

// ── Types ─────────────────────────────────────────────────────────────────────

type Kind = 'gasto' | 'ingreso' | 'devolucion'

const INCOME_CATEGORIES = new Set(['Ingreso'])

const today = () => new Date().toISOString().slice(0, 10)

// ── Numpad ────────────────────────────────────────────────────────────────────

const KEYS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  [',', '0', '⌫'],
] as const

function useAmountInput() {
  const [raw, setRaw] = useState('0')

  const press = useCallback((k: string) => {
    setRaw(prev => {
      if (k === '⌫') {
        const next = prev.slice(0, -1)
        return next === '' ? '0' : next
      }
      if (k === ',') return prev.includes(',') ? prev : prev + ','
      if (prev === '0') return k
      if (prev.length >= 10) return prev
      const commaIdx = prev.indexOf(',')
      if (commaIdx >= 0 && prev.length - commaIdx > 2) return prev
      return prev + k
    })
  }, [])

  const reset = useCallback(() => setRaw('0'), [])
  const value = parseFloat(raw.replace(',', '.')) || 0

  return { raw, press, reset, value }
}

// ── Type picker (bottom sheet) ────────────────────────────────────────────────

function TypePicker({ types, selectedId, onSelect, onClose }: {
  types: MovementType[]
  selectedId: number | null
  onSelect: (id: number | null) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl border-t border-gray-100 dark:border-gray-800 max-h-[65vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <span className="text-sm font-semibold text-gray-800 dark:text-white">Tipo de movimiento</span>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-2">
          <button
            onClick={() => { onSelect(null); onClose() }}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
              selectedId === null
                ? 'bg-gray-100 dark:bg-gray-800 font-medium text-gray-800 dark:text-white'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            Sin tipo
          </button>
          {types.map(t => (
            <button
              key={t.id}
              onClick={() => { onSelect(t.id); onClose() }}
              className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                selectedId === t.id
                  ? 'bg-gray-100 dark:bg-gray-800'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color || '#6b7280' }} />
              <span className={`flex-1 ${selectedId === t.id ? 'font-medium text-gray-800 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                {t.name}
              </span>
              {selectedId === t.id && <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function QuickAdd() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { fmt } = useCurrency()
  const { raw, press, reset, value } = useAmountInput()

  const [kind, setKind]               = useState<Kind>('gasto')
  const [typeId, setTypeId]           = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [accountId, setAccountId]     = useState<number | null>(null)
  const [date, setDate]               = useState(today())
  const [bankDate, setBankDate]       = useState(today())
  const [paid, setPaid]               = useState(true)
  const [showMore, setShowMore]       = useState(false)
  const [showTypePicker, setShowTypePicker] = useState(false)
  const [saved, setSaved]             = useState(false)

  const { data: allTypes = [] } = useQuery({ queryKey: ['movement-types'], queryFn: getMovementTypes })
  const { data: summary }       = useQuery({ queryKey: ['accounts-summary'], queryFn: getAccountsSummary })

  const accounts = summary?.accounts ?? []

  const isIncomeKind = kind === 'ingreso'
  const types = allTypes.filter(t =>
    isIncomeKind ? INCOME_CATEGORIES.has(t.category) : !INCOME_CATEGORIES.has(t.category)
  )

  // Reset type when switching to incompatible kind
  useEffect(() => {
    if (typeId === null) return
    const t = allTypes.find(x => x.id === typeId)
    if (!t) return
    const belongsToIncome = INCOME_CATEGORIES.has(t.category)
    if (belongsToIncome !== isIncomeKind) setTypeId(null)
  }, [isIncomeKind, allTypes, typeId])

  useEffect(() => {
    if (accounts.length && accountId === null) {
      const main = accounts.find(a => a.is_main) ?? accounts[0]
      setAccountId(main.id)
    }
  }, [accounts, accountId])

  const mutation = useMutation({
    mutationFn: () => {
      // gasto   → positive money (expense type distinguishes it from income)
      // ingreso → positive money (income type)
      // devolucion → negative money (negative expense = refund in the system)
      const money = kind === 'devolucion' ? -Math.abs(value) : Math.abs(value)
      return createMovement({
        name: description.trim() || (allTypes.find(t => t.id === typeId)?.name ?? '—'),
        money,
        date,
        bank_date: bankDate,
        movement_type_id: typeId ?? undefined,
        account_id: accountId ?? undefined,
        paid,
        no_count: false,
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
        setBankDate(today())
        setPaid(true)
      }, 1200)
    },
  })

  const canSave   = value > 0
  const isGreen   = kind === 'ingreso' || kind === 'devolucion'
  const sign      = kind === 'gasto' ? '−' : '+'
  const clrText   = isGreen ? 'text-green-500 dark:text-green-400' : 'text-red-500'
  const clrBg     = isGreen ? 'bg-green-50 dark:bg-green-950/20' : 'bg-red-50 dark:bg-red-950/20'
  const selectedType = allTypes.find(t => t.id === typeId)

  const KIND_LABELS: Record<Kind, string> = { gasto: 'Gasto', ingreso: 'Ingreso', devolucion: 'Devolución' }

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950 max-w-md mx-auto">

      {/* Minimal top bar */}
      <div className="flex items-center px-4 pt-5 pb-1 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          Cancelar
        </button>
      </div>

      <div className="flex-1 flex flex-col overflow-y-auto">

        {/* Editable name */}
        <div className="px-6 pt-3 pb-2">
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Nombre del movimiento"
            className="w-full text-xl font-semibold text-gray-800 dark:text-white placeholder-gray-300 dark:placeholder-gray-700 bg-transparent border-none outline-none"
          />
        </div>

        {/* Amount display */}
        <div className={`flex items-center justify-center px-6 py-8 ${clrBg} transition-colors`}>
          <span className={`text-3xl font-light mr-1 ${clrText}`}>{sign}</span>
          <span className={`text-7xl font-bold tabular-nums tracking-tight ${clrText}`}>
            {raw === '0' ? '0' : raw}
          </span>
          <span className={`text-3xl font-light ml-2 ${clrText}`}>€</span>
        </div>

        {/* Kind toggle: Gasto / Ingreso / Devolución */}
        <div className="flex gap-2 px-5 py-4">
          {(['gasto', 'ingreso', 'devolucion'] as Kind[]).map(k => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-95 ${
                kind === k
                  ? k === 'gasto'
                    ? 'bg-red-500 text-white shadow-sm'
                    : 'bg-green-500 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
              }`}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>

        {/* Numpad */}
        <div className="px-5 pb-3 shrink-0">
          <div className="grid grid-cols-3 gap-2.5">
            {KEYS.flat().map(k => (
              <button
                key={k}
                onClick={() => press(k)}
                className={`h-14 rounded-2xl text-xl font-semibold transition-all active:scale-95 active:opacity-70 flex items-center justify-center
                  ${k === '⌫'
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700'}
                  ${k === ',' ? 'text-2xl' : ''}`}
              >
                {k === '⌫' ? <Delete className="w-5 h-5" /> : k}
              </button>
            ))}
          </div>
        </div>

        {/* Type + Template row */}
        <div className="flex gap-2 px-5 pb-4">
          {/* Type selector */}
          <button
            onClick={() => setShowTypePicker(true)}
            className="flex-1 flex items-center justify-between px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 text-sm transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-[0.98]"
          >
            <span className="flex items-center gap-2 min-w-0">
              {selectedType && (
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selectedType.color || '#6b7280' }} />
              )}
              <span className={`truncate ${selectedType ? 'text-gray-800 dark:text-white font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
                {selectedType?.name ?? 'Tipo'}
              </span>
            </span>
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
          </button>

          {/* Template — placeholder */}
          <button
            disabled
            className="flex-1 flex items-center justify-between px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 text-sm text-gray-300 dark:text-gray-600 cursor-not-allowed"
          >
            <span>Plantilla</span>
            <ChevronDown className="w-4 h-4 shrink-0 ml-2" />
          </button>
        </div>

        {/* More options */}
        <div className="border-t border-gray-100 dark:border-gray-800 shrink-0">
          <button
            onClick={() => setShowMore(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <span>Más opciones</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showMore ? 'rotate-180' : ''}`} />
          </button>

          {showMore && (
            <div className="px-5 pb-5 space-y-4 border-t border-gray-50 dark:border-gray-800">
              {/* Account */}
              {accounts.length > 1 && (
                <div className="pt-3">
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Cuenta</p>
                  <div className="flex gap-2 flex-wrap">
                    {accounts.map(a => (
                      <button
                        key={a.id}
                        onClick={() => setAccountId(a.id)}
                        className={`px-3 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                          accountId === a.id ? 'text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                        }`}
                        style={accountId === a.id ? { backgroundColor: a.color || '#3b82f6' } : {}}
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Date */}
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Fecha</p>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>

              {/* Bank date */}
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Fecha banco</p>
                <input
                  type="date"
                  value={bankDate}
                  onChange={e => setBankDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>

              {/* Paid */}
              <div className="flex items-center justify-between py-0.5">
                <span className="text-sm text-gray-700 dark:text-gray-300">Pagado</span>
                <button
                  onClick={() => setPaid(v => !v)}
                  className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${paid ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${paid ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-4" />
      </div>

      {/* Save button */}
      <div className="px-5 py-4 bg-white dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800 shrink-0">
        <button
          onClick={() => mutation.mutate()}
          disabled={!canSave || mutation.isPending || saved}
          className={`w-full h-14 rounded-2xl text-base font-bold transition-all active:scale-[0.97] disabled:opacity-40
            ${saved
              ? 'bg-green-500 text-white'
              : isGreen
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-red-500 hover:bg-red-600 text-white'}`}
        >
          {saved ? (
            <span className="flex items-center justify-center gap-2">
              <Check className="w-5 h-5" /> ¡Guardado!
            </span>
          ) : mutation.isPending ? 'Guardando…' : (
            `Guardar${canSave ? ` ${fmt(value, 2)}` : ''}`
          )}
        </button>
      </div>

      {/* Type picker sheet */}
      {showTypePicker && (
        <TypePicker
          types={types}
          selectedId={typeId}
          onSelect={setTypeId}
          onClose={() => setShowTypePicker(false)}
        />
      )}
    </div>
  )
}
