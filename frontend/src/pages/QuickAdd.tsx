import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getTemplates } from '../api/templates'
import { useNavigate } from 'react-router-dom'
import { Check, Delete, ChevronDown, X, Upload, Loader2, AlertCircle, Receipt, ShoppingCart, Package, Leaf, RotateCcw } from 'lucide-react'
import { createMovement } from '../api/movements'
import { getMovementTypes, type MovementType } from '../api/movementTypes'
import { getAccountsSummary } from '../api/accounts'
import { analyzeTicket, attachTicketToMovement, updateTicketMeta, type Ticket } from '../api/tickets'
import { compressTicketImage } from '../utils/imageCompressor'
import { useCurrency } from '../hooks/useCurrency'
import { useDarkMode } from '../hooks/useDarkMode'
import { type MovementTemplate } from '../utils/recurringTemplates'
import { t } from '../utils/i18n'
import MovementForm from '../components/MovementForm'

// ── Types ─────────────────────────────────────────────────────────────────────

type Kind = 'gasto' | 'ingreso' | 'devolucion'

const INCOME_CATEGORIES = new Set(['Ingreso'])

const today = () => new Date().toISOString().slice(0, 10)

const KIND_LABELS = (): Record<Kind, string> => ({
  gasto: t('movement.expense'), ingreso: t('movement.income'), devolucion: t('movement.refund'),
})

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

  const setAmount = useCallback((v: number) => {
    const abs = Math.abs(v)
    const s = abs % 1 === 0
      ? String(abs)
      : abs.toFixed(2).replace('.', ',')
    setRaw(s || '0')
  }, [])

  const value = parseFloat(raw.replace(',', '.')) || 0

  return { raw, press, reset, value, setAmount }
}

// ── Segmented kind control ────────────────────────────────────────────────────

function KindToggle({ kind, onChange }: { kind: Kind; onChange: (k: Kind) => void }) {
  const idx = kind === 'gasto' ? 0 : kind === 'ingreso' ? 1 : 2
  const isGreen = kind !== 'gasto'

  return (
    <div className="relative flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1">
      {/* sliding pill */}
      <div
        className={`absolute top-1 bottom-1 rounded-xl transition-all duration-200 ease-in-out ${
          isGreen ? 'bg-green-500' : 'bg-red-500'
        }`}
        style={{
          left:  `calc(${idx} * (100% - 8px) / 3 + 4px)`,
          right: `calc(${2 - idx} * (100% - 8px) / 3 + 4px)`,
        }}
      />
      {(['gasto', 'ingreso', 'devolucion'] as Kind[]).map(k => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold relative z-10 transition-colors active:scale-95 ${
            kind === k
              ? 'text-white'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {KIND_LABELS()[k]}
        </button>
      ))}
    </div>
  )
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
          <span className="text-sm font-semibold text-gray-800 dark:text-white">{t('movement.type')}</span>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
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

// ── Template picker (bottom sheet) ────────────────────────────────────────────

function TemplatePicker({ templates, onApply, onClose }: {
  templates: MovementTemplate[]
  onApply: (tpl: MovementTemplate) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl border-t border-gray-100 dark:border-gray-800 max-h-[65vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <span className="text-sm font-semibold text-gray-800 dark:text-white">{t('quickadd.templates')}</span>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-2">
          {templates.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 px-3 py-4 text-center">
              {t('quickadd.noTemplates')}
            </p>
          ) : (
            templates.map(tpl => {
              const money = parseFloat(tpl.money) || 0
              const isNeg = money < 0
              return (
                <button
                  key={tpl.id}
                  onClick={() => onApply(tpl)}
                  className="w-full text-left flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-white">{tpl.label}</p>
                    {tpl.name && tpl.name !== tpl.label && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{tpl.name}</p>
                    )}
                  </div>
                  <span className={`text-sm font-semibold ml-3 shrink-0 ${isNeg ? 'text-green-500' : 'text-red-500'}`}>
                    {isNeg ? '+' : '−'}{Math.abs(money).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ── Inline editable field for SpeedMode ticket header ─────────────────────────

function SpeedMetaField({ value, placeholder, type = 'text', className = '', format, onSave }: {
  value: string; placeholder?: string; type?: 'text' | 'date'
  className?: string; format?: (v: string) => string; onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const commit = (v: string) => { setEditing(false); if (v !== value) onSave(v) }
  const display = format ? format(value) : value

  if (editing) {
    return (
      <input
        type={type}
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setEditing(false); setDraft(value) } }}
        className={`${className} bg-transparent border-b border-blue-400 outline-none w-full`}
      />
    )
  }
  return (
    <p className={`${className} cursor-text`} onClick={() => { setDraft(value); setEditing(true) }}>
      {display || <span className="opacity-40">{placeholder}</span>}
    </p>
  )
}

// ── Ticket tab ────────────────────────────────────────────────────────────────

const SUPPLIES_CATS = new Set([
  'Cuidado del cabello', 'Cuidado facial y corporal',
  'Fitoterapia y parafarmacia', 'Limpieza y hogar',
  'Maquillaje', 'Mascotas',
])

type MovMode = 'food' | 'supplies' | 'combined'

interface MovFormCfg {
  mode: MovMode
  name: string
  money: string
  date: string
  movement_type_id: string
}

function TicketTab(_: { movementTypes: MovementType[] }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [ticket, setTicket]     = useState<Ticket | null>(null)
  const [error,  setError]      = useState<string | null>(null)
  const [done,   setDone]       = useState<Set<MovMode>>(new Set())
  const [movForm, setMovForm]   = useState<MovFormCfg | null>(null)

  const analyzeMut = useMutation({
    mutationFn: analyzeTicket,
    onSuccess: t => { setTicket(t); setError(null); setDone(new Set()) },
    onError: (err: unknown) => {
      const e = err as { response?: { status?: number; data?: { detail?: unknown } }; message?: string }
      const status  = e?.response?.status
      const detail  = e?.response?.data?.detail
      const detailStr = typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : null
      setError(
        detailStr  ? `Error ${status ?? ''}: ${detailStr}` :
        status     ? `Error HTTP ${status} al analizar el ticket.` :
        e?.message ? `Error de red: ${e.message}` :
        'No se pudo analizar el ticket.',
      )
    },
  })

  const handleFile = async (file: File) => {
    setTicket(null); setError(null); setDone(new Set())
    analyzeMut.mutate(await compressTicketImage(file))
  }

  // Per-mode totals
  const foodTotal = ticket
    ? Object.entries(ticket.categories).filter(([c]) => !SUPPLIES_CATS.has(c)).reduce((s, [, v]) => s + v, 0)
    : 0
  const suppliesTotal = ticket
    ? Object.entries(ticket.categories).filter(([c]) => SUPPLIES_CATS.has(c)).reduce((s, [, v]) => s + v, 0)
    : 0
  const combinedTotal = ticket ? (ticket.total ?? foodTotal + suppliesTotal) : 0

  const openMovForm = (mode: MovMode) => {
    if (!ticket) return
    const total = mode === 'food' ? foodTotal : mode === 'supplies' ? suppliesTotal : combinedTotal
    const prefKey = mode === 'food' ? 'ticket_food_type_id' : mode === 'supplies' ? 'ticket_supplies_type_id' : 'ticket_combined_type_id'
    const typeId = localStorage.getItem(prefKey) ?? ''
    const modeLabel = mode === 'food' ? 'Comida' : mode === 'supplies' ? 'Suministros' : 'Completo'
    setMovForm({
      mode,
      name: `${ticket.store_name?.trim() || 'Ticket'} — ${modeLabel}`,
      money: total.toFixed(2),
      date: ticket.ticket_date ?? new Date().toISOString().slice(0, 10),
      movement_type_id: typeId,
    })
  }

  const handleMovCreated = async (movId: number) => {
    if (!ticket || !movForm) return
    try { await attachTicketToMovement(ticket.id, movId, movForm.mode) } catch {}
    setDone(prev => new Set([...prev, movForm.mode]))
    qc.invalidateQueries({ queryKey: ['tickets'] })
    setMovForm(null)
  }

  const MOV_OPTS: { mode: MovMode; label: string; Icon: React.ComponentType<{ className?: string }>; color: string; total: number }[] = [
    { mode: 'food',     label: 'Comida',       Icon: ShoppingCart, color: '#10b981', total: foodTotal     },
    { mode: 'supplies', label: 'Suministros',  Icon: Package,      color: '#8b5cf6', total: suppliesTotal },
    { mode: 'combined', label: 'Todo',         Icon: Leaf,         color: '#3b82f6', total: combinedTotal },
  ]

  return (
    <div className="flex-1 overflow-y-auto">
      {/* ── Upload area ── */}
      {!ticket && !analyzeMut.isPending && (
        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-2xl text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
          />
          {/* Camera button */}
          <button
            onClick={() => { fileRef.current?.setAttribute('capture', 'environment'); fileRef.current?.click() }}
            className="w-full h-28 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors active:scale-[0.98]"
          >
            <Upload className="w-7 h-7" />
            <span className="text-sm font-medium">Hacer foto o subir imagen / PDF</span>
            <span className="text-xs text-gray-400">El sistema extraerá productos y precios automáticamente</span>
          </button>
          {/* Gallery / file picker */}
          <button
            onClick={() => { fileRef.current?.removeAttribute('capture'); fileRef.current?.click() }}
            className="w-full py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors active:scale-[0.98]"
          >
            Elegir desde galería o archivos
          </button>
        </div>
      )}

      {/* ── Analyzing ── */}
      {analyzeMut.isPending && (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <span className="text-sm text-gray-500 dark:text-gray-400">Analizando ticket…</span>
        </div>
      )}

      {/* ── Results ── */}
      {ticket && (
        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <SpeedMetaField
                value={ticket.store_name ?? 'Supermercado'}
                placeholder="Nombre del establecimiento"
                className="text-base font-semibold text-gray-800 dark:text-white"
                onSave={v => updateTicketMeta(ticket.id, { store_name: v }).then(t => setTicket(t))}
              />
              <SpeedMetaField
                value={ticket.ticket_date ?? ''}
                placeholder="Añadir fecha"
                type="date"
                className="text-xs text-gray-400"
                format={v => v ? new Date(v + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                onSave={v => updateTicketMeta(ticket.id, { ticket_date: v }).then(t => setTicket(t))}
              />
            </div>
            <button
              onClick={() => { setTicket(null); setError(null) }}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-1 px-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Nuevo
            </button>
          </div>

          {/* Products list */}
          {ticket.items.length > 0 ? (
            <div className="rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              <div className="grid grid-cols-[1fr_auto] px-3 py-1.5 bg-gray-50 dark:bg-gray-800/60 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                <span>Producto</span>
                <span className="text-right">Precio</span>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-gray-800/60 max-h-56 overflow-y-auto">
                {ticket.items.map((item, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto] items-center px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 dark:text-white truncate">{item.name}</p>
                      <p className="text-[10px] text-gray-400 truncate">{item.category}</p>
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 ml-3 whitespace-nowrap">
                      {item.amount.toFixed(2)} €
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No se detectaron productos.</p>
          )}

          {/* Movement buttons */}
          <div className="space-y-2.5">
            {MOV_OPTS.filter(o => o.total > 0.005).map(({ mode, label, Icon, color, total }) => {
              const isDone = done.has(mode)
              return (
                <button
                  key={mode}
                  onClick={() => !isDone && openMovForm(mode)}
                  disabled={isDone}
                  className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all active:scale-[0.98]"
                  style={{
                    background: isDone ? undefined : color + '18',
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: isDone ? undefined : color + '55',
                    backgroundColor: isDone ? undefined : undefined,
                    opacity: isDone ? 0.7 : 1,
                  }}
                  {...(isDone ? { className: 'w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800' } : {})}
                >
                  <span className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: isDone ? '#10b981' + '22' : color + '22', color: isDone ? '#10b981' : color }}>
                      {isDone
                        ? <Check className="w-4 h-4" />
                        : <Icon className="w-4 h-4" />}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: isDone ? '#10b981' : color }}>
                      {isDone ? `${label} — creado` : `Crear movimiento · ${label}`}
                    </span>
                  </span>
                  {!isDone && (
                    <span className="text-sm font-bold" style={{ color }}>
                      {total.toFixed(2)} €
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* MovementForm modal */}
      {movForm && createPortal(
        <MovementForm
          onClose={() => setMovForm(null)}
          initialValues={{
            name: movForm.name,
            money: movForm.money,
            date: movForm.date,
            movement_type_id: movForm.movement_type_id || undefined,
          }}
          onMovementCreated={handleMovCreated}
        />,
        document.body,
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function QuickAdd() {
  useDarkMode()

  const navigate = useNavigate()
  const qc = useQueryClient()
  const { fmt } = useCurrency()
  const { raw, press, reset, value, setAmount } = useAmountInput()

  const [kind, setKind]               = useState<Kind>('gasto')
  const [typeId, setTypeId]           = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [date, setDate]               = useState(today())
  const [bankDate, setBankDate]       = useState(today())
  const [paid, setPaid]               = useState(true)
  const [showMore, setShowMore]       = useState(false)
  const [showTypePicker, setShowTypePicker]         = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [saved, setSaved]             = useState(false)

  const { data: allTypes = [] } = useQuery({ queryKey: ['movement-types'], queryFn: getMovementTypes })
  const { data: summary }       = useQuery({ queryKey: ['accounts-summary'], queryFn: getAccountsSummary })

  const mainAccountId = (summary?.accounts ?? []).find(a => a.is_main)?.id
    ?? (summary?.accounts?.[0]?.id ?? undefined)

  const isIncomeKind = kind === 'ingreso'
  const types = allTypes.filter(t =>
    isIncomeKind ? INCOME_CATEGORIES.has(t.category) : !INCOME_CATEGORIES.has(t.category)
  )

  const { data: allTemplates = [] } = useQuery({ queryKey: ['templates'], queryFn: getTemplates })

  // Reset type when switching to incompatible kind
  useEffect(() => {
    if (typeId === null) return
    const t = allTypes.find(x => x.id === typeId)
    if (!t) return
    if (INCOME_CATEGORIES.has(t.category) !== isIncomeKind) setTypeId(null)
  }, [isIncomeKind, allTypes, typeId])

  const applyTemplate = (tpl: MovementTemplate) => {
    const money = parseFloat(tpl.money) || 0
    const tplType = allTypes.find(t => t.id === parseInt(tpl.movement_type_id || ''))
    let newKind: Kind
    if (tplType && INCOME_CATEGORIES.has(tplType.category)) {
      newKind = 'ingreso'
    } else if (money < 0) {
      newKind = 'devolucion'
    } else {
      newKind = 'gasto'
    }
    setKind(newKind)
    setAmount(Math.abs(money))
    setDescription(tpl.name || tpl.label)
    setTypeId(tpl.movement_type_id ? parseInt(tpl.movement_type_id) : null)
    setShowTemplatePicker(false)
  }

  const mutation = useMutation({
    mutationFn: () => {
      const money = kind === 'devolucion' ? -Math.abs(value) : Math.abs(value)
      return createMovement({
        name: description.trim() || (allTypes.find(t => t.id === typeId)?.name ?? '—'),
        money,
        date,
        bank_date: bankDate,
        movement_type_id: typeId ?? undefined,
        account_id: mainAccountId,
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

  const canSave      = value > 0
  const isGreen      = kind === 'ingreso' || kind === 'devolucion'
  const sign         = kind === 'gasto' ? '−' : '+'
  const clrText      = isGreen ? 'text-green-500 dark:text-green-400' : 'text-red-500'
  const clrBg        = isGreen ? 'bg-green-50 dark:bg-green-950/20' : 'bg-red-50 dark:bg-red-950/20'
  const selectedType = allTypes.find(t => t.id === typeId)

  const [tab, setTab] = useState<'movement' | 'ticket'>('movement')

  return (
    // h-full respects CSS zoom unlike h-screen (100vh ignores zoom on <html>)
    <div className="flex flex-col bg-white dark:bg-gray-950 max-w-md mx-auto h-full overflow-hidden">

      {/* Header: cancel + tabs */}
      <div className="shrink-0 flex items-center gap-3 px-5 pt-5 pb-3">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors shrink-0"
        >
          Cancelar
        </button>
        <div className="flex-1 flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 text-sm">
          <button
            onClick={() => setTab('movement')}
            className={`flex-1 py-1.5 font-medium transition-colors ${tab === 'movement' ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'bg-white dark:bg-gray-900 text-gray-400 dark:text-gray-500'}`}
          >
            Movimiento
          </button>
          <button
            onClick={() => setTab('ticket')}
            className={`flex-1 py-1.5 font-medium transition-colors flex items-center justify-center gap-1.5 ${tab === 'ticket' ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'bg-white dark:bg-gray-900 text-gray-400 dark:text-gray-500'}`}
          >
            <Receipt className="w-3.5 h-3.5" />
            Ticket
          </button>
        </div>
      </div>

      {/* Ticket tab */}
      {tab === 'ticket' && <TicketTab movementTypes={allTypes} />}

      {/* Movement tab — Scrollable content */}
      {tab === 'movement' && <div className="flex-1 overflow-y-auto">

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

        {/* Kind toggle — segmented control */}
        <div className="px-5 py-4">
          <KindToggle kind={kind} onChange={setKind} />
        </div>

        {/* Numpad */}
        <div className="px-5 pb-3">
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

          <button
            onClick={() => setShowTemplatePicker(true)}
            className="flex-1 flex items-center justify-between px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 text-sm transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-[0.98]"
          >
            <span className="text-gray-400 dark:text-gray-500 truncate">Plantilla</span>
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
          </button>
        </div>

        {/* More options */}
        <div className="border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={() => setShowMore(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <span>Más opciones</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showMore ? 'rotate-180' : ''}`} />
          </button>

          {showMore && (
            <div className="px-5 pb-5 space-y-4 border-t border-gray-50 dark:border-gray-800">
              <div className="pt-3">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">{t('quickadd.date')}</p>
                <input
                  type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">{t('quickadd.bankDate')}</p>
                <input
                  type="date" value={bankDate} onChange={e => setBankDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
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

        <div className="h-4" />
      </div>}

      {/* Save button — only in movement tab */}
      {tab === 'movement' && (
        <div className="shrink-0 px-5 py-4 bg-white dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800">
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
            ) : mutation.isPending ? t('quickadd.saving') : (
              `${t('quickadd.save')}${canSave ? ` ${fmt(value, 2)}` : ''}`
            )}
          </button>
        </div>
      )}

      {showTypePicker && (
        <TypePicker
          types={types}
          selectedId={typeId}
          onSelect={setTypeId}
          onClose={() => setShowTypePicker(false)}
        />
      )}

      {showTemplatePicker && (
        <TemplatePicker
          templates={allTemplates}
          onApply={applyTemplate}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}
    </div>
  )
}
