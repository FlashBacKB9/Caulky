import { useEffect, useRef, useState } from 'react'
import { t } from '../utils/i18n'
import { useSharedMovements } from '../hooks/useSharedMovements'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMovementTypes, type MovementType } from '../api/movementTypes'
import { createMovement } from '../api/movements'
import { getAccountsSummary } from '../api/accounts'
import api from '../api/client'
import {
  Paperclip, Image as ImageIcon, FileText, X, Plus, ChevronLeft,
  Pencil, Calendar, Check, AlertTriangle, Repeat,
} from 'lucide-react'
import {
  applyFormula, computeDates, shiftWeekend,
  WEEKDAY_NAMES, WEEK_ORD_NAMES, WEEK_ORD_VALUES, describeRule,
  type MovementTemplate, type RecurrenceRule, type TemplateRecurrence,
} from '../utils/recurringTemplates'
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '../api/templates'

interface Props { onClose: () => void; initialDate?: string }

// ── Shared constants ───────────────────────────────────────────────────────────

const CATEGORY_ORDER = [
  'Ingreso','Gasto Casa','Vida Diaria','Transporte','Salud',
  'Entretenimiento','Suscripciones','Regalos','Vacaciones',
  'Ahorro','Coche','Moto','Gastos Anuales','Inversión',
]
const INP = 'w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600'
const LBL = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
const BTN_PILL = (active: boolean) =>
  `py-1.5 rounded-lg text-xs border transition-colors ${active ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`

function FileTypeIcon({ mime }: { mime: string }) {
  const cls = 'w-4 h-4 text-gray-500 shrink-0'
  if (mime.startsWith('image/')) return <ImageIcon className={cls} strokeWidth={1.5} />
  if (mime === 'application/pdf') return <FileText className={cls} strokeWidth={1.5} />
  return <Paperclip className={cls} strokeWidth={1.5} />
}

function Toggle({ value, onChange, color = '#3b82f6' }: {
  value: boolean; onChange: (v: boolean) => void; color?: string
}) {
  return (
    <button type="button" onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${!value ? 'bg-gray-300 dark:bg-gray-600' : ''}`}
      style={value ? { backgroundColor: color } : {}}>
      <span className={`absolute top-0.5 h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${value ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  )
}

function TypeSelect({ value, onChange, types, byCategory }: {
  value: string; onChange: (v: string) => void
  types: MovementType[]; byCategory: Record<string, MovementType[]>
}) {
  const sel = types.find(t => String(t.id) === value)
  return (
    <div className="relative">
      {sel && <span className="absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sel.color }} />}
      <select value={value} onChange={e => onChange(e.target.value)} className={`${INP} ${sel ? 'pl-8' : ''}`}>
        <option value="">{t('form.noCategory')}</option>
        {Object.entries(byCategory).map(([cat, items]) => (
          <optgroup key={cat} label={cat}>
            {items.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>
        ))}
      </select>
    </div>
  )
}

// ── Default recurrence rule ────────────────────────────────────────────────────

function defaultRule(): RecurrenceRule {
  return { kind: 'monthly_day', everyN: 1, weekdays: [], monthDay: 1, monthWeek: 1, weekday: 0 }
}

// ── Recurrence rule editor ─────────────────────────────────────────────────────

function RuleEditor({ rule, onChange }: { rule: RecurrenceRule; onChange: (r: RecurrenceRule) => void }) {
  const set = (patch: Partial<RecurrenceRule>) => onChange({ ...rule, ...patch })
  const kinds: { value: RecurrenceRule['kind']; label: string }[] = [
    { value: 'daily',            label: t('recurrence.daily') },
    { value: 'weekly',           label: t('recurrence.weekly') },
    { value: 'monthly_day',      label: t('recurrence.monthlyDay') },
    { value: 'monthly_weekday',  label: t('recurrence.monthlyWeekday') },
  ]
  return (
    <div className="space-y-3">
      {/* Kind selector */}
      <div className="grid grid-cols-2 gap-1.5">
        {kinds.map(k => (
          <button key={k.value} type="button" onClick={() => set({ kind: k.value })}
            className={BTN_PILL(rule.kind === k.value)}>
            {k.label}
          </button>
        ))}
      </div>

      {/* Kind-specific config */}
      {rule.kind === 'daily' && (
        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>{t('recurrence.every')}</span>
          <input type="number" min={1} value={rule.everyN} onChange={e => set({ everyN: parseInt(e.target.value) || 1 })}
            className="w-16 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-300" />
          <span>{t('recurrence.days')}</span>
        </div>
      )}

      {rule.kind === 'weekly' && (
        <div className="space-y-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">{t('recurrence.weekdays')}</span>
          <div className="flex gap-1 flex-wrap">
            {WEEKDAY_NAMES.map((name, i) => {
              const active = rule.weekdays.includes(i)
              return (
                <button key={i} type="button"
                  onClick={() => set({ weekdays: active ? rule.weekdays.filter(d => d !== i) : [...rule.weekdays, i] })}
                  className={`px-2 py-1 rounded-lg text-xs border transition-colors ${active ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                  {name.slice(0, 2)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {rule.kind === 'monthly_day' && (
        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 flex-wrap">
          <span>{t('recurrence.onDay')}</span>
          <input type="number" min={1} max={31} value={rule.monthDay}
            onChange={e => set({ monthDay: Math.min(31, Math.max(1, parseInt(e.target.value) || 1)) })}
            className="w-16 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-300" />
          <span>{t('recurrence.ofEvery')}</span>
          <input type="number" min={1} value={rule.everyN} onChange={e => set({ everyN: parseInt(e.target.value) || 1 })}
            className="w-16 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-300" />
          <span>{t('recurrence.months')}</span>
        </div>
      )}

      {rule.kind === 'monthly_weekday' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span>{t('recurrence.the')}</span>
            <select value={rule.monthWeek} onChange={e => set({ monthWeek: parseInt(e.target.value) })}
              className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg px-2 py-1 text-sm focus:outline-none">
              {WEEK_ORD_VALUES.map((v, i) => <option key={v} value={v}>{WEEK_ORD_NAMES[i]}</option>)}
            </select>
            <select value={rule.weekday} onChange={e => set({ weekday: parseInt(e.target.value) })}
              className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg px-2 py-1 text-sm focus:outline-none">
              {WEEKDAY_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
            </select>
            <span>{t('recurrence.ofEachMonth')}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

type PanelMode = 'form' | 'template' | 'recurrence' | 'multibulk'

export default function MovementForm({ onClose, initialDate }: Props) {
  const qc = useQueryClient()
  const today = new Date().toLocaleDateString('en-CA')
  const { sharedEnabled } = useSharedMovements()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)

  // ── Main form ────────────────────────────────────────────────────────────────
  const startDate = initialDate ?? today
  const [form, setForm] = useState({
    name: '', money: '', date: startDate, bank_date: startDate,
    movement_type_id: '', account_id: '', is_transfer: false, from_account_id: '',
    paid: true, no_count: false, notes: '',
    is_shared: false, shared_between: '2', my_share: '',
  })
  const set = (field: string, value: unknown) => setForm(f => ({ ...f, [field]: value }))

  // ── Panel mode ───────────────────────────────────────────────────────────────
  const [panel, setPanel] = useState<PanelMode>('form')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [recurrenceId, setRecurrenceId] = useState<number | null>(null)

  // ── Template state ───────────────────────────────────────────────────────────
  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: getTemplates })
  const emptyTpl = (): Omit<MovementTemplate, 'id'> => ({
    label: '', name: '', money: '', dateMode: 'today', bankDateMode: 'manual',
    movement_type_id: '', paid: true, no_count: false, notes: '',
  })
  const [tplDraft, setTplDraft] = useState(emptyTpl)
  const setTpl = (field: string, value: unknown) => setTplDraft(d => ({ ...d, [field]: value }))

  // ── Recurrence state ─────────────────────────────────────────────────────────
  const [recRule, setRecRule] = useState<RecurrenceRule>(defaultRule)
  const [recStart, setRecStart] = useState(today)
  const [recMode, setRecMode] = useState<'bulk' | 'auto'>('bulk')
  const [recWeekendFallback, setRecWeekendFallback] = useState<'friday' | 'monday' | null>(null)
  const [recBulkN, setRecBulkN] = useState(3)
  const [recBulkDone, setRecBulkDone] = useState<number | null>(null)
  const [recBulkNumbered, setRecBulkNumbered] = useState(false)
  const [recBulkDivide, setRecBulkDivide] = useState(false)
  const [multiBulkDone, setMultiBulkDone] = useState<number | null>(null)

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: types = [] } = useQuery({ queryKey: ['movement-types'], queryFn: getMovementTypes })
  const { data: accountsSummary } = useQuery({ queryKey: ['accounts-summary'], queryFn: getAccountsSummary })
  const accounts = accountsSummary?.accounts ?? []
  const byCategory = CATEGORY_ORDER.reduce<Record<string, MovementType[]>>((acc, cat) => {
    const items = types.filter(t => t.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})

  // ── Mutations ────────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async () => {
      const shared_between = form.is_shared && !form.my_share ? (parseInt(form.shared_between) || 2) : undefined
      const my_share = form.is_shared && form.my_share ? (parseFloat(form.my_share) || undefined) : undefined
      const mv = await createMovement({
        name: form.name, money: parseFloat(form.money), date: form.date,
        bank_date: form.bank_date || undefined,
        movement_type_id: !form.is_transfer && form.movement_type_id ? parseInt(form.movement_type_id) : undefined,
        account_id: form.account_id ? parseInt(form.account_id) : undefined,
        is_transfer: form.is_transfer,
        from_account_id: form.is_transfer && form.from_account_id ? parseInt(form.from_account_id) : undefined,
        paid: form.paid, no_count: form.no_count, notes: form.notes || undefined,
        is_shared: form.is_shared, shared_between, my_share,
      })
      if (pendingFiles.length) {
        const fd = new FormData()
        pendingFiles.forEach(f => fd.append('files', f))
        await api.post(`/movements/${mv.id}/files`, fd)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['annual'] })
      qc.invalidateQueries({ queryKey: ['accounts-summary'] })
      onClose()
    },
  })

  const bulkMut = useMutation({
    mutationFn: async ({ dates, numbered }: { dates: Date[]; numbered: boolean }) => {
      const tpl = templates.find(t => t.id === recurrenceId)!
      const total = dates.length
      for (let i = 0; i < dates.length; i++) {
        const date = dates[i]
        const dateStr = date.toISOString().split('T')[0]
        const bankDateStr = tpl.bankDateMode === 'today' ? dateStr : undefined
        const bankD = bankDateStr ? new Date(bankDateStr) : undefined
        const baseName = applyFormula(tpl.name || tpl.label, date, bankD) || tpl.label
        await createMovement({
          name: numbered ? `${baseName} ${i + 1}/${total}` : baseName,
          money: parseFloat(tpl.money) || 0,
          date: dateStr,
          bank_date: bankDateStr,
          movement_type_id: tpl.movement_type_id ? parseInt(tpl.movement_type_id) : undefined,
          paid: tpl.paid, no_count: tpl.no_count, notes: tpl.notes || undefined,
        })
      }
      return dates.length
    },
    onSuccess: (n) => {
      setRecBulkDone(n)
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['annual'] })
      qc.invalidateQueries({ queryKey: ['accounts-summary'] })
    },
  })

  // ── Template helpers ─────────────────────────────────────────────────────────
  const applyTemplate = (tpl: MovementTemplate) => {
    setForm(prev => ({
      name: applyFormula(tpl.name),
      money: tpl.money,
      date: prev.date || (tpl.dateMode === 'today' ? today : ''),
      bank_date: prev.bank_date || ((tpl.bankDateMode ?? 'manual') === 'today' ? today : ''),
      movement_type_id: tpl.movement_type_id,
      account_id: prev.account_id,
      is_transfer: false, from_account_id: '',
      paid: tpl.paid, no_count: tpl.no_count, notes: tpl.notes,
      is_shared: false, shared_between: '2', my_share: '',
    }))
    setPanel('form')
  }

  const openCreate = () => {
    setEditingId(null)
    setTplDraft(emptyTpl())
    setPanel('template')
  }

  const openEdit = (tpl: MovementTemplate) => {
    setEditingId(tpl.id)
    setTplDraft({ label: tpl.label, name: tpl.name, money: tpl.money, dateMode: tpl.dateMode,
      bankDateMode: tpl.bankDateMode ?? 'manual', movement_type_id: tpl.movement_type_id,
      paid: tpl.paid, no_count: tpl.no_count, notes: tpl.notes })
    setPanel('template')
  }

  const openRecurrence = (tpl: MovementTemplate) => {
    setRecurrenceId(tpl.id)
    const existing = tpl.recurrence
    setRecRule(existing?.rule ?? defaultRule())
    setRecStart(existing?.startDate ?? today)
    setRecMode(existing?.autoCreate ? 'auto' : 'bulk')
    setRecWeekendFallback(existing?.weekendFallback ?? null)
    setRecBulkDone(null)
    setPanel('recurrence')
  }

  const tplCreateMut = useMutation({
    mutationFn: (draft: Omit<MovementTemplate, 'id'>) => createTemplate(draft),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); setPanel('form'); setEditingId(null) },
  })

  const tplUpdateMut = useMutation({
    mutationFn: ({ id, draft }: { id: number; draft: Omit<MovementTemplate, 'id'> }) =>
      updateTemplate(id, draft),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }) },
  })

  const tplDeleteMut = useMutation({
    mutationFn: (id: number) => deleteTemplate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }) },
  })

  const saveTemplate = () => {
    if (!tplDraft.label.trim()) return
    if (editingId !== null) {
      tplUpdateMut.mutate({ id: editingId, draft: tplDraft }, {
        onSuccess: () => setPanel('form'),
      })
    } else {
      tplCreateMut.mutate(tplDraft)
    }
  }

  const handleDeleteTemplate = (id: number) => {
    tplDeleteMut.mutate(id)
    if (recurrenceId === id || editingId === id) setPanel('form')
  }

  const saveRecurrence = () => {
    const rec: TemplateRecurrence = { rule: recRule, startDate: recStart, autoCreate: recMode === 'auto', ...(recWeekendFallback ? { weekendFallback: recWeekendFallback } : {}) }
    const tpl = templates.find(t => t.id === recurrenceId)
    if (!tpl) return
    const { id, ...rest } = tpl
    tplUpdateMut.mutate({ id, draft: { ...rest, recurrence: rec } }, {
      onSuccess: () => setPanel('form'),
    })
  }

  const clearRecurrence = () => {
    const tpl = templates.find(t => t.id === recurrenceId)
    if (!tpl) return
    const { id, ...rest } = tpl
    tplUpdateMut.mutate({ id, draft: { ...rest, recurrence: undefined } }, {
      onSuccess: () => setPanel('form'),
    })
  }

  const bulkCreate = () => {
    const dates = computeDates(recRule, new Date(recStart), recBulkN)
      .map(d => recWeekendFallback ? shiftWeekend(d, recWeekendFallback) : d)
    bulkMut.mutate({ dates, numbered: recBulkNumbered })
  }

  const multiBulkCreate = () => {
    const dates = computeDates(recRule, new Date(recStart), recBulkN)
    const total = dates.length
    const baseAmount = parseFloat(form.money)
    const amount = recBulkDivide ? Math.round((baseAmount / total) * 100) / 100 : baseAmount
    const pending = pendingFiles
    Promise.all(
      dates.map(async (date, i) => {
        const dateStr = date.toISOString().split('T')[0]
        const mv = await createMovement({
          name: recBulkNumbered ? `${form.name} ${i + 1}/${total}` : form.name,
          money: amount,
          date: dateStr,
          bank_date: form.bank_date ? dateStr : undefined,
          movement_type_id: form.movement_type_id ? parseInt(form.movement_type_id) : undefined,
          account_id: form.account_id ? parseInt(form.account_id) : undefined,
          paid: form.paid,
          no_count: form.no_count,
          notes: form.notes || undefined,
        })
        if (i === 0 && pending.length) {
          const fd = new FormData()
          pending.forEach(f => fd.append('files', f))
          await import('../api/client').then(m => m.default.post(`/movements/${mv.id}/files`, fd))
        }
        return mv
      })
    ).then(() => {
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['annual'] })
      qc.invalidateQueries({ queryKey: ['accounts-summary'] })
      onClose()
    })
  }

  // ── Preview dates ────────────────────────────────────────────────────────────
  const previewDates = computeDates(recRule, new Date(recStart), 3)
    .map(d => recWeekendFallback ? shiftWeekend(d, recWeekendFallback) : d)
  const fmtPreview = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

  // ── Escape key ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') panel !== 'form' ? setPanel('form') : onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [panel, onClose])

  // ── Savings hint ─────────────────────────────────────────────────────────────
  const SavingsHint = ({ typeId, money }: { typeId: string; money: string }) => {
    const selType = types.find(t => String(t.id) === typeId)
    const linkedAcc = selType?.linked_account_id ? accounts.find(a => a.id === selType.linked_account_id) : null
    if (!linkedAcc) return null
    const isNeg = parseFloat(money) < 0
    return (
      <div className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-lg text-xs text-blue-600 dark:text-blue-400">
        {isNeg ? <><span className="font-semibold">{linkedAcc.name}</span> → De uso</> : <>De uso → <span className="font-semibold">{linkedAcc.name}</span></>}
      </div>
    )
  }

  const WARN_BYTES = 20 * 1024 * 1024
  const [largePending, setLargePending] = useState<File[] | null>(null)

  const addFiles = (files: FileList | null) => {
    if (!files || !files.length) return
    const arr = Array.from(files)
    const large = arr.filter(f => f.size > WARN_BYTES)
    if (large.length > 0) {
      setLargePending(arr)
    } else {
      setPendingFiles(prev => [...prev, ...arr])
    }
  }

  const fmtSize = (b: number) => b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`
  const removeFile = (i: number) => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))
  const valid = form.name.trim() && form.money && !isNaN(parseFloat(form.money))

  // ── Panel titles ─────────────────────────────────────────────────────────────
  const panelTitle = panel === 'template'
    ? (editingId ? t('form.editTemplate') : t('form.newTemplate'))
    : panel === 'recurrence'
    ? t('form.recurrenceTitle')
    : panel === 'multibulk'
    ? t('form.createMultipleTitle')
    : t('form.newMovement')

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-2xl flex overflow-hidden max-h-[90vh]">

        {/* ── Left panel ──────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
            <div className="flex items-center gap-2">
              {panel !== 'form' && (
                <button onClick={() => setPanel('form')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <h2 className="font-semibold text-gray-800 dark:text-white text-lg">{panelTitle}</h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-6 py-5 flex-1">

            {/* ── Movement form ── */}
            {panel === 'form' && (
              <form onSubmit={e => { e.preventDefault(); if (valid) mutation.mutate() }} className="space-y-4">
                <div>
                  <label className={LBL}>{t('common.name')} *</label>
                  <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                    placeholder={t('movement.namePh')} className={INP} autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LBL}>{t('form.amountLabel')} *</label>
                    <div className="relative">
                      <input type="number" step="0.01" value={form.money} onChange={e => set('money', e.target.value)}
                        placeholder="0.00" className={INP + ' pr-7'} />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('form.negativeHint')}</p>
                  </div>
                  <div>
                    <label className={LBL}>{t('common.date')} *</label>
                    <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={INP} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LBL}>{t('movement.type')}</label>
                    <div className="space-y-1.5">
                      {form.is_transfer
                        ? <p className="text-xs text-gray-400 dark:text-gray-500 italic py-1">Sin tipo — es una transferencia</p>
                        : <><TypeSelect value={form.movement_type_id} onChange={v => set('movement_type_id', v)} types={types} byCategory={byCategory} />
                          <SavingsHint typeId={form.movement_type_id} money={form.money} /></>
                      }
                    </div>
                  </div>
                  <div>
                    <label className={LBL}>{t('movement.bankDate')}</label>
                    <input type="date" value={form.bank_date} onChange={e => set('bank_date', e.target.value)} className={INP} />
                  </div>
                </div>
                {(() => {
                  const allAccounts = accounts.filter(a => a.category === 'corriente' || a.category === 'ahorro')
                  if (allAccounts.length === 0) return null
                  if (form.is_transfer) {
                    return (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={LBL}>Cuenta origen</label>
                          <select value={form.from_account_id} onChange={e => set('from_account_id', e.target.value)} className={INP}>
                            <option value="">— Selecciona —</option>
                            {allAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={LBL}>Cuenta destino</label>
                          <select value={form.account_id} onChange={e => set('account_id', e.target.value)} className={INP}>
                            <option value="">— Selecciona —</option>
                            {allAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </div>
                      </div>
                    )
                  }
                  if (allAccounts.length <= 1) return null
                  const mainAcc = allAccounts.find(a => a.is_main)
                  return (
                    <div>
                      <label className={LBL}>{t('settings.affectedAccount')}</label>
                      <select value={form.account_id} onChange={e => set('account_id', e.target.value)} className={INP}>
                        <option value="">{mainAcc ? `${mainAcc.name} ${t('settings.defaultSuffix')}` : t('settings.mainAccount')}</option>
                        {allAccounts.filter(a => !a.is_main).map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                  )
                })()}
                <div className={`grid gap-3 ${sharedEnabled ? 'grid-cols-4' : 'grid-cols-3'}`}>
                  {sharedEnabled && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('form.shared')}</label>
                      <Toggle
                        value={form.is_shared}
                        onChange={v => setForm(f => ({ ...f, is_shared: v, ...(v ? {} : { shared_between: '2', my_share: '' }) }))}
                        color="#3b82f6"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Transferencia</label>
                    <Toggle value={form.is_transfer} onChange={v => setForm(f => ({ ...f, is_transfer: v, movement_type_id: v ? '' : f.movement_type_id, from_account_id: v ? f.from_account_id : '' }))} color="#8b5cf6" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('form.paid')}</label>
                    <Toggle value={form.paid} onChange={v => set('paid', v)} color="#22c55e" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('form.noCount')}</label>
                    <Toggle value={form.no_count} onChange={v => set('no_count', v)} color="#f59e0b" />
                  </div>
                </div>
                {sharedEnabled && form.is_shared && (
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 space-y-2">
                    <p className="text-xs text-blue-600 dark:text-blue-400">El importe total resta del balance. Solo tu parte cuenta en las estadísticas.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nº personas</label>
                        <input type="number" min={2} max={99} className={INP}
                          value={form.shared_between}
                          onChange={e => setForm(f => ({ ...f, shared_between: e.target.value, my_share: '' }))}
                          placeholder="2" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">O mi importe</label>
                        <input type="number" step="0.01" min={0} className={INP}
                          value={form.my_share}
                          onChange={e => setForm(f => ({ ...f, my_share: e.target.value, shared_between: e.target.value ? '' : f.shared_between }))}
                          placeholder="ej. 10.00" />
                      </div>
                    </div>
                    {(() => {
                      const total = Math.abs(parseFloat(form.money) || 0)
                      if (form.my_share) {
                        const share = parseFloat(form.my_share) || 0
                        return <p className="text-xs text-blue-500">Tu parte: <strong>{share.toFixed(2)}€</strong> de {total.toFixed(2)}€</p>
                      }
                      const n = parseInt(form.shared_between) || 2
                      const share = total / n
                      return <p className="text-xs text-blue-500">Tu parte: <strong>{share.toFixed(2)}€</strong> ({n} personas)</p>
                    })()}
                  </div>
                )}
                <div>
                  <label className={LBL}>{t('common.notes')}</label>
                  <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                    rows={2} placeholder="Opcional..." className={INP + ' resize-none'} />
                </div>
                <div>
                  <label className={LBL}>{t('form.attachments')}</label>
                  {largePending && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 mb-2 space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" strokeWidth={1.5} />
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">{t('form.largeFileTitle')}</p>
                          <ul className="text-xs text-amber-700 dark:text-amber-400">
                            {largePending.filter(f => f.size > WARN_BYTES).map(f => (
                              <li key={f.name}>{f.name} — <strong>{fmtSize(f.size)}</strong></li>
                            ))}
                          </ul>
                          <p className="text-xs text-amber-600 dark:text-amber-500">
                            {t('form.largeFileHint')}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button type="button" onClick={() => { setLargePending(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                          className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                          {t('common.cancel')}
                        </button>
                        <button type="button" onClick={() => { setPendingFiles(prev => [...prev, ...largePending]); setLargePending(null) }}
                          className="text-xs px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white">
                          {t('form.uploadAnyway')}
                        </button>
                      </div>
                    </div>
                  )}
                  {pendingFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {pendingFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs">
                          <FileTypeIcon mime={f.type} />
                          <span className="max-w-[120px] truncate text-gray-700 dark:text-gray-300" title={f.name}>{f.name}</span>
                          <button type="button" onClick={() => removeFile(i)} className="text-gray-300 hover:text-red-500 ml-1"><X className="w-3 h-3" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div
                    onDragOver={e => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl px-4 py-3 text-center cursor-pointer transition-colors ${dragging ? 'border-gray-400 bg-gray-50 dark:bg-gray-800' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                  >
                    <span className="flex items-center justify-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                      <Paperclip className="w-3.5 h-3.5" strokeWidth={1.5} />
                      {t('form.dragOrClick')}
                    </span>
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => addFiles(e.target.files)} />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">{t('common.cancel')}</button>
                  <button type="button" disabled={!valid}
                    onClick={() => { setRecStart(form.date || today); setRecBulkDone(null); setMultiBulkDone(null); setRecBulkNumbered(false); setRecBulkDivide(false); setPanel('multibulk') }}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    {t('form.createMultiple')}
                  </button>
                  <button type="submit" disabled={!valid || mutation.isPending}
                    className="px-5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    {mutation.isPending ? t('form.saving') : t('common.save')}
                  </button>
                </div>
                {mutation.isError && <p className="text-red-500 text-sm">{t('form.saveError')}</p>}
              </form>
            )}

            {/* ── Template form ── */}
            {panel === 'template' && (
              <div className="space-y-4">
                <div>
                  <label className={LBL}>{t('form.templateNameLabel')} *</label>
                  <input autoFocus value={tplDraft.label} onChange={e => setTpl('label', e.target.value)}
                    placeholder={t('movement.savingsPh')} className={INP} />
                </div>
                <div>
                  <label className={LBL}>{t('form.movementNameLabel')}</label>
                  <input value={tplDraft.name} onChange={e => setTpl('name', e.target.value)}
                    placeholder={t('movement.savingsPhMonth')} className={INP} />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{mes}'}</code> mes actual ·{' '}
                    <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{año}'}</code> año actual ·{' '}
                    <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{mesfecha}'}</code> mes de la fecha ·{' '}
                    <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{mesfechabanco}'}</code> mes fecha banco
                  </p>
                </div>
                <div>
                  <label className={LBL}>{t('form.amountLabel')}</label>
                  <div className="relative">
                    <input type="number" step="0.01" value={tplDraft.money}
                      onChange={e => setTpl('money', e.target.value)} placeholder="0.00" className={INP + ' pr-7'} />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LBL}>{t('form.dateOnApply')}</label>
                    <div className="flex flex-col gap-2">
                      {(['today', 'manual'] as const).map(mode => (
                        <button key={mode} type="button" onClick={() => setTpl('dateMode', mode)} className={BTN_PILL(tplDraft.dateMode === mode)}>
                          {mode === 'today' ? t('form.creationDate') : t('form.empty')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={LBL}>{t('movement.bankDate')}</label>
                    <div className="flex flex-col gap-2">
                      {(['today', 'manual'] as const).map(mode => (
                        <button key={mode} type="button" onClick={() => setTpl('bankDateMode', mode)} className={BTN_PILL(tplDraft.bankDateMode === mode)}>
                          {mode === 'today' ? t('form.creationDate') : t('form.empty')}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <label className={LBL}>{t('movement.type')}</label>
                  <div className="space-y-1.5">
                    <TypeSelect value={tplDraft.movement_type_id} onChange={v => setTpl('movement_type_id', v)} types={types} byCategory={byCategory} />
                    <SavingsHint typeId={tplDraft.movement_type_id} money={tplDraft.money} />
                  </div>
                </div>
                <div className="flex gap-5">
                  <div className="flex items-center gap-2.5">
                    <Toggle value={tplDraft.paid} onChange={v => setTpl('paid', v)} color="#22c55e" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">{t('form.paid')}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Toggle value={tplDraft.no_count} onChange={v => setTpl('no_count', v)} color="#f59e0b" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">{t('form.noCount')}</span>
                  </div>
                </div>
                <div>
                  <label className={LBL}>{t('common.notes')}</label>
                  <textarea value={tplDraft.notes} onChange={e => setTpl('notes', e.target.value)}
                    rows={2} placeholder="Opcional..." className={INP + ' resize-none'} />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setPanel('form')}
                    className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">{t('common.cancel')}</button>
                  <button type="button" onClick={saveTemplate} disabled={!tplDraft.label.trim()}
                    className="px-5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    {editingId ? t('form.saveChanges') : t('form.saveTemplate')}
                  </button>
                </div>
              </div>
            )}

            {/* ── Multi-bulk panel ── */}
            {panel === 'multibulk' && (() => {
              const baseAmount = parseFloat(form.money) || 0
              const previewAmount = recBulkDivide
                ? Math.round((baseAmount / recBulkN) * 100) / 100
                : baseAmount
              return (
              <div className="space-y-5">
                <div className="px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                  <p><span className="text-gray-400">Nombre:</span> <span className="font-medium">{form.name}</span></p>
                  <p>
                    <span className="text-gray-400">Importe{recBulkDivide ? ' por pago' : ' total'}:</span>{' '}
                    <span className="font-medium">{previewAmount} €</span>
                    {recBulkDivide && <span className="text-gray-400 ml-1">({form.money} € ÷ {recBulkN})</span>}
                  </p>
                </div>

                <div>
                  <label className={LBL}>{t('recurrence.type')}</label>
                  <RuleEditor rule={recRule} onChange={setRecRule} />
                </div>

                <div>
                  <label className={LBL}>{t('recurrence.startDate')}</label>
                  <input type="date" value={recStart} onChange={e => setRecStart(e.target.value)} className={INP} />
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">{t('recurrence.preview')}</p>
                  <div className="space-y-1">
                    {computeDates(recRule, new Date(recStart), Math.min(recBulkN, 3)).map((d, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                        {fmtPreview(d)}
                        <span className="text-gray-400 truncate">
                          — {recBulkNumbered ? `${form.name} ${i + 1}/${recBulkN}` : form.name}
                          {' · '}{previewAmount} €
                        </span>
                      </div>
                    ))}
                    {recBulkN > 3 && <p className="text-xs text-gray-400 pl-3.5">… y {recBulkN - 3} más</p>}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('recurrence.create')}</span>
                  <input type="number" min={1} max={60} value={recBulkN}
                    onChange={e => { setRecBulkN(Math.max(1, parseInt(e.target.value) || 1)); setMultiBulkDone(null) }}
                    className="w-16 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-300" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('recurrence.movements')}</span>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                    <input type="checkbox" checked={recBulkDivide} onChange={e => setRecBulkDivide(e.target.checked)} className="rounded" />
                    {t('recurrence.divideAmount')} {recBulkN} {t('recurrence.payments')}
                    <span className="text-gray-400 dark:text-gray-500">(= {previewAmount} €)</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                    <input type="checkbox" checked={recBulkNumbered} onChange={e => setRecBulkNumbered(e.target.checked)} className="rounded" />
                    {t('recurrence.numberedPayments')} <span className="text-gray-400 dark:text-gray-500">(1/{recBulkN}, 2/{recBulkN}…)</span>
                  </label>
                </div>

                {multiBulkDone !== null && (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <Check className="w-4 h-4" />
                    {multiBulkDone !== 1 ? t('movement.createdPlural').replace('{n}', String(multiBulkDone)) : t('movement.created').replace('{n}', String(multiBulkDone))}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-1">
                  <button type="button" onClick={() => setPanel('form')}
                    className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">{t('common.back')}</button>
                  <button type="button" onClick={multiBulkCreate} disabled={multiBulkDone !== null}
                    className="px-5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    {t('recurrence.create')} {recBulkN} {t('recurrence.movements')}
                  </button>
                </div>
              </div>
              )
            })()}

            {/* ── Recurrence panel ── */}
            {panel === 'recurrence' && (() => {
              const tpl = templates.find(t => t.id === recurrenceId)
              return (
                <div className="space-y-5">
                  {tpl && <p className="text-sm text-gray-500 dark:text-gray-400">{t('form.template')}: <span className="font-medium text-gray-800 dark:text-white">{tpl.label}</span></p>}

                  {/* Rule editor */}
                  <div>
                    <label className={LBL}>{t('recurrence.type')}</label>
                    <RuleEditor rule={recRule} onChange={setRecRule} />
                  </div>

                  {/* Start date */}
                  <div>
                    <label className={LBL}>{t('recurrence.startDate')}</label>
                    <input type="date" value={recStart} onChange={e => setRecStart(e.target.value)} className={INP} />
                  </div>

                  {/* Weekend fallback */}
                  <div>
                    <label className={LBL}>Si cae en fin de semana</label>
                    <div className="flex gap-2">
                      {([null, 'friday', 'monday'] as const).map(v => (
                        <button key={v ?? 'none'} type="button"
                          onClick={() => setRecWeekendFallback(v)}
                          className={`flex-1 py-1.5 px-2 text-xs rounded-lg border transition-colors ${
                            recWeekendFallback === v
                              ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent'
                              : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}>
                          {v === null ? 'No mover' : v === 'friday' ? '→ Viernes' : '→ Lunes'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Preview */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">{t('recurrence.preview')}</p>
                    <div className="space-y-1">
                      {previewDates.map((d, i) => {
                        const baseName = tpl ? applyFormula(tpl.name || tpl.label, d, d) : ''
                        const displayName = (recMode === 'bulk' && recBulkNumbered)
                          ? `${baseName} ${i + 1}/${recBulkN}`
                          : baseName
                        return (
                          <div key={i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                            {fmtPreview(d)}
                            {tpl && <span className="text-gray-400 truncate">— {displayName}</span>}
                          </div>
                        )
                      })}
                      <p className="text-xs text-gray-400 pl-3.5">…</p>
                    </div>
                  </div>

                  {/* Mode selector */}
                  <div>
                    <label className={LBL}>{t('recurrence.whatToDo')}</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => { setRecMode('bulk'); setRecBulkDone(null) }}
                        className={`py-2.5 px-3 rounded-xl text-sm border transition-colors text-left ${recMode === 'bulk' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                        <p className="font-medium">{t('recurrence.createBulk')}</p>
                        <p className={`text-xs mt-0.5 ${recMode === 'bulk' ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400'}`}>{t('recurrence.createBulkDesc')}</p>
                      </button>
                      <button type="button" onClick={() => setRecMode('auto')}
                        className={`py-2.5 px-3 rounded-xl text-sm border transition-colors text-left ${recMode === 'auto' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                        <p className="font-medium">{t('recurrence.auto')}</p>
                        <p className={`text-xs mt-0.5 ${recMode === 'auto' ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400'}`}>{t('recurrence.autoDesc')}</p>
                      </button>
                    </div>
                  </div>

                  {/* Bulk */}
                  {recMode === 'bulk' && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600 dark:text-gray-400">{t('recurrence.next')}</span>
                        <input type="number" min={1} max={60} value={recBulkN} onChange={e => { setRecBulkN(Math.max(1, parseInt(e.target.value) || 1)); setRecBulkDone(null) }}
                          className="w-16 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-300" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">{t('recurrence.movements')}</span>
                        <button type="button" onClick={bulkCreate} disabled={bulkMut.isPending}
                          className="ml-auto px-4 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 transition-colors">
                          {bulkMut.isPending ? t('recurrence.creating') : t('recurrence.create')}
                        </button>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                        <input type="checkbox" checked={recBulkNumbered} onChange={e => setRecBulkNumbered(e.target.checked)} className="rounded" />
                        {t('recurrence.numberedPayments')} <span className="text-gray-400 dark:text-gray-500">(1/{recBulkN}, 2/{recBulkN}…)</span>
                      </label>
                      {recBulkDone !== null && (
                        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                          <Check className="w-4 h-4" />
                          {recBulkDone !== 1 ? t('movement.createdPlural').replace('{n}', String(recBulkDone)) : t('movement.created').replace('{n}', String(recBulkDone))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Auto */}
                  {recMode === 'auto' && (
                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-xl px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
                      {t('recurrence.autoInfo')}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    {tpl?.recurrence && (
                      <button type="button" onClick={clearRecurrence}
                        className="text-sm text-red-400 hover:text-red-600 transition-colors">
                        {t('recurrence.cancelRecurrence')}
                      </button>
                    )}
                    <div className="flex gap-3 ml-auto">
                      <button type="button" onClick={() => setPanel('form')}
                        className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">{t('common.cancel')}</button>
                      {recMode === 'auto' && (
                        <button type="button" onClick={saveRecurrence}
                          className="px-5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors">
                          {t('common.save')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>

        {/* ── Right: templates sidebar ─────────────────────────────────────── */}
        <div className="w-56 border-l border-gray-100 dark:border-gray-800 flex flex-col shrink-0 bg-gray-50/50 dark:bg-gray-800/30">
          <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-800">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{t('quickadd.templates')}</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {templates.length === 0 && (
              <p className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 italic">{t('form.noTemplates')}</p>
            )}
            {templates.map(tpl => (
              <div key={tpl.id}
                className={`group flex items-center gap-1 px-4 py-2.5 cursor-pointer transition-colors ${
                  recurrenceId === tpl.id && panel === 'recurrence'
                    ? 'bg-blue-50 dark:bg-blue-950/30'
                    : editingId === tpl.id && panel === 'template'
                    ? 'bg-gray-100 dark:bg-gray-800'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                onClick={() => applyTemplate(tpl)}>
                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{tpl.label}</span>
                  {tpl.recurrence?.autoCreate && (
                    <span title={describeRule(tpl.recurrence.rule)} className="shrink-0">
                      <Repeat className="w-3 h-3 text-blue-500 dark:text-blue-400" />
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                  <button type="button" onClick={e => { e.stopPropagation(); openEdit(tpl) }}
                    className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="Editar">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button type="button" onClick={e => { e.stopPropagation(); openRecurrence(tpl) }}
                    className="p-1 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors" title="Recurrencia">
                    <Calendar className="w-3 h-3" />
                  </button>
                  <button type="button" onClick={e => { e.stopPropagation(); handleDeleteTemplate(tpl.id) }}
                    className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors" title="Eliminar">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <button type="button" onClick={openCreate}
              className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors w-full">
              <Plus className="w-3.5 h-3.5" />
              {t('form.newTemplate')}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
