import { useRef, useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area } from 'recharts'
import { Leaf, Package, ShoppingCart, Tag } from 'lucide-react'
import {
  Upload, Trash2, Receipt, ChevronDown, ChevronUp, AlertCircle, Loader2, Pencil, Plus, X, Check,
  Eye, EyeOff, Search, ArrowRightLeft, ExternalLink,
} from 'lucide-react'
import { analyzeTicket, getTickets, deleteTicket, updateTicketItems, updateTicketMeta, ticketFileUrl, attachTicketToMovement, type Ticket, type TicketItem } from '../api/tickets'
import { compressTicketImage } from '../utils/imageCompressor'
import { getMovementTypes, type MovementType } from '../api/movementTypes'
import MovementForm from '../components/MovementForm'
import {
  catCfg, getVisibleCategories, addCustomCat as registerCustomCat,
  ICON_NAME_MAP, PRESET_ICONS, PRESET_COLORS,
} from '../utils/ticketCategories'

// ── Supplies category set (mirrors backend SUPPLIES_CATEGORIES) ───────────────
const SUPPLIES_CATS = new Set([
  'Cuidado del cabello', 'Cuidado facial y corporal',
  'Fitoterapia y parafarmacia', 'Limpieza y hogar',
  'Maquillaje', 'Mascotas',
])

// ── Palette ────────────────────────────────────────────────────────────────────

const COLORS = [
  '#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#ec4899',
  '#14b8a6','#f97316','#8b5cf6','#22c55e','#e11d48','#0ea5e9',
  '#a855f7','#84cc16','#06b6d4','#fbbf24','#f43f5e','#34d399',
  '#818cf8','#fb923c','#a3e635','#38bdf8','#c084fc','#4ade80',
  '#f472b6','#2dd4bf',
]

function CategoryPicker({
  value,
  onChange,
  allCategories,
}: {
  value: string
  onChange: (cat: string) => void
  allCategories: string[]
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [showFade, setShowFade] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newIconName, setNewIconName] = useState('Tag')
  const [newColor, setNewColor] = useState('#6b7280')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(
    () => allCategories.filter(c => c.toLowerCase().includes(search.toLowerCase())),
    [allCategories, search]
  )

  // ── Position: computed fresh from DOM at render time (no stale state) ────────
  const getDropStyle = (): React.CSSProperties => {
    const el = triggerRef.current
    if (!el) return { display: 'none' }
    const r = el.getBoundingClientRect()
    const w = Math.max(r.width, 260)
    const spaceBelow = window.innerHeight - r.bottom - 8
    const spaceAbove = r.top - 8
    const openBelow = spaceBelow >= 180 || spaceBelow >= spaceAbove
    const left = Math.max(0, Math.min(r.left, window.innerWidth - w - 8))
    if (openBelow) {
      return { position: 'fixed', top: r.bottom + 6, left, width: w, maxHeight: Math.min(320, spaceBelow + 8), zIndex: 999 }
    } else {
      // Anchor to BOTTOM so the dropdown sits flush against the trigger regardless of content height
      return { position: 'fixed', bottom: window.innerHeight - r.top + 6, left, width: w, maxHeight: Math.min(320, spaceAbove), zIndex: 999 }
    }
  }

  // ── Scroll fade ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => {
      const el = listRef.current
      if (el) setShowFade(el.scrollHeight > el.clientHeight + 4)
    })
  }, [open, filtered.length, adding])

  const handleListScroll = () => {
    const el = listRef.current
    if (el) setShowFade(el.scrollTop + el.clientHeight < el.scrollHeight - 4)
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleOpen = () => {
    setOpen(true); setSearch(''); setAdding(false)
    setTimeout(() => searchRef.current?.focus(), 40)
  }
  const handleSelect = (cat: string) => { onChange(cat); setOpen(false) }
  const handleCreate = () => {
    const name = search.trim()
    if (!name) return
    registerCustomCat(name, newIconName, newColor)
    onChange(name)
    setOpen(false); setAdding(false); setSearch('')
  }

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!triggerRef.current?.contains(e.target as Node)) {
        setOpen(false); setAdding(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const cfg = catCfg(value)
  const noResults = filtered.length === 0 && search.trim() !== ''

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium transition-opacity hover:opacity-75 whitespace-nowrap max-w-[180px]"
        style={{ background: cfg.color + '22', color: cfg.color, border: `1px solid ${cfg.color}55` }}
      >
        <cfg.icon className="w-3 h-3 shrink-0" />
        <span className="truncate">{value || 'Sin categoría'}</span>
        <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[998]" onMouseDown={() => { setOpen(false); setAdding(false) }} />
          <div
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden"
            style={getDropStyle()}
            onMouseDown={e => e.stopPropagation()}
          >
            {/* Search bar */}
            <div className="p-2 border-b border-gray-100 dark:border-gray-800 flex items-center gap-1.5 shrink-0">
              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                ref={searchRef}
                className="flex-1 text-xs bg-transparent outline-none text-gray-700 dark:text-gray-300 placeholder-gray-400"
                placeholder="Buscar categoría…"
                value={search}
                onChange={e => { setSearch(e.target.value); setAdding(false) }}
              />
            </div>

            {/* List with hidden scrollbar + fade */}
            {!adding && (
              <div className="relative flex-1 min-h-0">
                <div
                  ref={listRef}
                  onScroll={handleListScroll}
                  className="overflow-y-auto h-full [&::-webkit-scrollbar]:hidden"
                  style={{ scrollbarWidth: 'none' } as React.CSSProperties}
                >
                  {filtered.map(cat => {
                    const cc = catCfg(cat)
                    const selected = cat === value
                    return (
                      <button
                        key={cat}
                        type="button"
                        onMouseDown={() => handleSelect(cat)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/70 ${selected ? 'bg-gray-50 dark:bg-gray-800/70' : ''}`}
                      >
                        <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: cc.color + '22', color: cc.color }}>
                          <cc.icon className="w-4 h-4" />
                        </span>
                        <span className="flex-1 text-gray-700 dark:text-gray-300">{cat}</span>
                        {selected && <Check className="w-3 h-3 shrink-0" style={{ color: cc.color }} />}
                      </button>
                    )
                  })}

                  {/* No results → add new */}
                  {noResults && (
                    <button
                      type="button"
                      onMouseDown={() => { setAdding(true); setNewIconName('Tag'); setNewColor('#6b7280') }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/70"
                    >
                      <span className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                        <Plus className="w-3.5 h-3.5 text-gray-400" />
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        Añadir <span className="font-medium text-gray-700 dark:text-gray-200">"{search.trim()}"</span>
                      </span>
                    </button>
                  )}
                </div>
                {/* Bottom fade */}
                {showFade && (
                  <div className="absolute bottom-0 inset-x-0 h-10 pointer-events-none bg-gradient-to-t from-white dark:from-gray-900 to-transparent" />
                )}
              </div>
            )}

            {/* New category form */}
            {adding && (
              <div className="p-3 space-y-3">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Nueva categoría: <span className="font-semibold">{search.trim()}</span>
                </p>
                {/* Icon picker */}
                <div>
                  <p className="text-[11px] text-gray-400 mb-1.5">Icono</p>
                  <div className="grid grid-cols-8 gap-1">
                    {PRESET_ICONS.map(({ name, Icon }) => (
                      <button
                        key={name}
                        type="button"
                        onMouseDown={() => setNewIconName(name)}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${newIconName === name ? 'bg-blue-100 dark:bg-blue-900/40 ring-1 ring-blue-400 text-blue-500' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300'}`}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                </div>
                {/* Color picker */}
                <div>
                  <p className="text-[11px] text-gray-400 mb-1.5">Color</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_COLORS.map(col => (
                      <button
                        key={col}
                        type="button"
                        onMouseDown={() => setNewColor(col)}
                        className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                        style={{ background: col, outline: newColor === col ? `2px solid ${col}` : 'none', outlineOffset: 2 }}
                      />
                    ))}
                  </div>
                </div>
                {/* Preview + confirm */}
                <div className="flex items-center justify-between pt-1">
                  {(() => { const PreviewIcon = ICON_NAME_MAP[newIconName] ?? Tag; return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                      style={{ background: newColor + '22', color: newColor, border: `1px solid ${newColor}55` }}>
                      <PreviewIcon className="w-3.5 h-3.5 shrink-0" />
                      {search.trim()}
                    </span>
                  ) })()}
                  <div className="flex gap-1.5">
                    <button type="button" onMouseDown={() => setAdding(false)}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2 py-1">
                      Atrás
                    </button>
                    <button type="button" onMouseDown={handleCreate}
                      className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2.5 py-1 rounded transition-colors">
                      Crear
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  )
}

// ── Upload area ────────────────────────────────────────────────────────────────

function UploadArea({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handle = (f: File) => {
    if (f) onFile(f)
  }

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors select-none
        ${dragging
          ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
          : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 bg-white dark:bg-gray-900'}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handle(f) }}
    >
      <Upload className="w-8 h-8 text-gray-400 dark:text-gray-500" strokeWidth={1.5} />
      <div className="text-center">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Sube una foto o PDF del ticket</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">JPG, PNG, PDF · máx. 10 MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = '' }}
      />
    </div>
  )
}

// ── Inline editable metadata field ────────────────────────────────────────────

function TicketMetaField({
  value, placeholder, type = 'text', className = '', format, onSave,
}: {
  value: string
  placeholder?: string
  type?: 'text' | 'date'
  className?: string
  format?: (v: string) => string
  onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const commit = (v: string) => {
    setEditing(false)
    if (v !== value) onSave(v)
  }

  if (editing) {
    return (
      <input
        type={type}
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.currentTarget.blur() }
          if (e.key === 'Escape') { setEditing(false); setDraft(value) }
        }}
        className={`${className} bg-transparent border-b border-blue-400 outline-none w-full`}
      />
    )
  }

  const display = format ? format(value) : (value || placeholder || '')
  return (
    <p
      className={`${className} truncate cursor-text group/meta`}
      title="Haz clic para editar"
      onClick={() => { setDraft(value); setEditing(true) }}
    >
      {display || <span className="text-gray-300 dark:text-gray-600">{placeholder}</span>}
      <Pencil className="w-3 h-3 inline ml-1 opacity-0 group-hover/meta:opacity-40 transition-opacity" />
    </p>
  )
}

// ── Ticket card ────────────────────────────────────────────────────────────────

function TicketCard({
  ticket: initialTicket,
  onDelete,
  extraCategories,
  movementTypes,
}: {
  ticket: Ticket
  onDelete: () => void
  extraCategories: string[]
  movementTypes: MovementType[]
}) {
  const qc = useQueryClient()
  const [ticket, setTicket] = useState(initialTicket)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [viewFile, setViewFile] = useState(false)
  const [editItems, setEditItems] = useState<TicketItem[] | null>(null)
  const [showMovPanel, setShowMovPanel] = useState(false)
  const [movSuccess, setMovSuccess] = useState<string | null>(null)
  const [movFormConfig, setMovFormConfig] = useState<{
    mode: 'food' | 'supplies' | 'combined'
    name: string; money: string; date: string; movement_type_id: string
  } | null>(null)

  useEffect(() => { setTicket(initialTicket) }, [initialTicket])

  const isDirty = editItems !== null
  const displayItems = editItems ?? ticket.items

  const allCats = useMemo(() => {
    const set = new Set([...getVisibleCategories(), ...extraCategories])
    return Array.from(set).sort()
  }, [extraCategories])


  const updateMut = useMutation({
    mutationFn: (items: TicketItem[]) => updateTicketItems(ticket.id, items),
    onSuccess: (updated) => {
      setTicket(updated)
      setEditItems(null)
      qc.invalidateQueries({ queryKey: ['tickets'] })
    },
  })

  const updItem = (i: number, patch: Partial<TicketItem>) =>
    setEditItems(prev => prev!.map((item, idx) => idx === i ? { ...item, ...patch } : item))
  const delItem = (i: number) =>
    setEditItems(prev => prev!.filter((_, idx) => idx !== i))
  const addItem = () =>
    setEditItems(prev => [...(prev ?? ticket.items.map(it => ({ ...it }))), { name: '', amount: 0, category: 'Sin categoría' }])

  // ── Movement generation ──────────────────────────────────────────────────────
  const suppliesTotal = ticket.items.filter(i => SUPPLIES_CATS.has(i.category)).reduce((s, i) => s + i.amount, 0)
  const foodTotal     = ticket.items.filter(i => !SUPPLIES_CATS.has(i.category)).reduce((s, i) => s + i.amount, 0)
  const combinedTotal = ticket.items.reduce((s, i) => s + i.amount, 0)

  const foodTypeId     = parseInt(localStorage.getItem('ticket_food_type_id') || '') || null
  const suppliesTypeId = parseInt(localStorage.getItem('ticket_supplies_type_id') || '') || null
  const combinedTypeId = parseInt(localStorage.getItem('ticket_combined_type_id') || '') || null

  const typeNameById = (id: number | null) =>
    movementTypes.find(mt => mt.id === id)?.name ?? null

  const genMovements = ticket.generated_movements ?? {}

  const openMovForm = (mode: 'food' | 'supplies' | 'combined', total: number, typeId: number | null) => {
    if (!typeId) return
    const name = ticket.store_name ?? ticket.original_name.replace(/\.[^.]+$/, '')
    setMovFormConfig({
      mode,
      name,
      money: total.toFixed(2),
      date: ticket.ticket_date ?? new Date().toLocaleDateString('en-CA'),
      movement_type_id: String(typeId),
    })
    setShowMovPanel(false)
  }

  const handleMovementCreated = async (movId: number) => {
    if (!movFormConfig) return
    await attachTicketToMovement(ticket.id, movId, movFormConfig.mode)
    qc.invalidateQueries({ queryKey: ['tickets'] })
    setMovFormConfig(null)
    setMovSuccess('Movimiento creado correctamente')
    setTimeout(() => setMovSuccess(null), 4000)
  }

  const MOV_OPTIONS = [
    { mode: 'food'     as const, label: 'Comida / Supermercado', icon: Leaf,         color: '#16a34a', total: foodTotal,     typeId: foodTypeId     },
    { mode: 'supplies' as const, label: 'Suministros',           icon: Package,      color: '#4f46e5', total: suppliesTotal, typeId: suppliesTypeId },
    { mode: 'combined' as const, label: 'Combinado',             icon: ShoppingCart, color: '#6b7280', total: combinedTotal, typeId: combinedTypeId },
  ]

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Receipt className="w-4 h-4 text-gray-400 shrink-0" strokeWidth={1.5} />
        <div className="flex-1 min-w-0">
          <TicketMetaField
            value={ticket.store_name ?? 'Supermercado'}
            placeholder="Nombre del establecimiento"
            className="text-sm font-medium text-gray-800 dark:text-white"
            onSave={v => updateTicketMeta(ticket.id, { store_name: v }).then(() => qc.invalidateQueries({ queryKey: ['tickets'] }))}
          />
          <TicketMetaField
            value={ticket.ticket_date ?? ''}
            placeholder="Fecha"
            type="date"
            className="text-xs text-gray-400 dark:text-gray-500"
            format={v => {
              if (!v) return ticket.total != null ? `${ticket.total.toFixed(2)} €` : 'Sin fecha'
              const parts = [new Date(v + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })]
              if (ticket.total != null) parts.push(`${ticket.total.toFixed(2)} €`)
              return parts.join(' · ')
            }}
            onSave={v => updateTicketMeta(ticket.id, { ticket_date: v }).then(() => qc.invalidateQueries({ queryKey: ['tickets'] }))}
          />
        </div>
        <button
          className={`p-1.5 transition-colors ${viewFile ? 'text-blue-500' : 'text-gray-400 hover:text-blue-500'}`}
          onClick={() => { setViewFile(v => !v); if (!open) setOpen(true) }}
          title={viewFile ? 'Ocultar archivo' : 'Ver archivo'}
        >
          {viewFile ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
        <button
          className={`p-1.5 transition-colors ${showMovPanel ? 'text-emerald-500' : 'text-gray-400 hover:text-emerald-500'}`}
          onClick={() => setShowMovPanel(v => !v)}
          title="Generar movimiento"
        >
          <ArrowRightLeft className="w-4 h-4" />
        </button>
        <button
          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
          onClick={onDelete}
          title="Eliminar ticket"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          onClick={() => setOpen(v => !v)}
        >
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* ── Movement generation panel ── */}
      {showMovPanel && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-2 bg-emerald-50/50 dark:bg-emerald-950/20">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Generar movimiento</p>
          {MOV_OPTIONS.map(({ mode, label, icon: ModeIcon, color, total, typeId }) => {
            const typeName = typeNameById(typeId)
            const existingMovId = genMovements[mode]
            const canCreate = !!typeId && total > 0
            return (
              <div key={mode} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                    <ModeIcon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                    <span>{label}</span>
                    {typeName
                      ? <span className="text-gray-400 dark:text-gray-500">· {typeName}</span>
                      : <span className="text-amber-500">· Sin configurar</span>
                    }
                  </div>
                </div>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {total.toFixed(2)} €
                </span>
                {existingMovId ? (
                  <button
                    onClick={() => navigate('/movements')}
                    className="flex items-center gap-1 text-xs bg-blue-500 hover:bg-blue-600 text-white px-2.5 py-1 rounded transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Ver
                  </button>
                ) : (
                  <button
                    disabled={!canCreate}
                    onClick={() => openMovForm(mode, total, typeId)}
                    className="flex items-center gap-1 text-xs bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-2.5 py-1 rounded transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Crear
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Success toast ── */}
      {movSuccess && (
        <div className="border-t border-emerald-100 dark:border-emerald-900 px-4 py-2 flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-700 dark:text-emerald-400">
          <Check className="w-3.5 h-3.5 shrink-0" />
          {movSuccess}
        </div>
      )}

      {/* ── Movement form modal ── */}
      {movFormConfig && (
        <MovementForm
          onClose={() => setMovFormConfig(null)}
          initialValues={{
            name: movFormConfig.name,
            money: movFormConfig.money,
            date: movFormConfig.date,
            movement_type_id: movFormConfig.movement_type_id,
          }}
          onMovementCreated={handleMovementCreated}
        />
      )}

      {open && (
        <div className="border-t border-gray-100 dark:border-gray-800">

          {/* ── File viewer ── */}
          {viewFile && (
            <div className="border-b border-gray-100 dark:border-gray-800">
              {ticket.mime_type.startsWith('image/') ? (
                <img
                  src={ticketFileUrl(ticket.id)}
                  alt="Ticket"
                  className="w-full max-h-[480px] object-contain bg-gray-50 dark:bg-gray-800"
                />
              ) : (
                <iframe
                  src={ticketFileUrl(ticket.id)}
                  className="w-full h-[480px] bg-gray-50 dark:bg-gray-800"
                  title="Ticket PDF"
                />
              )}
            </div>
          )}

          {/* ── Items table ── */}
          {displayItems.length > 0 || isDirty ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-gray-400 dark:text-gray-500">
                    <th className="px-4 py-2 text-left font-medium">Producto</th>
                    <th className="px-2 py-2 text-left font-medium">Categoría</th>
                    <th className="px-4 py-2 text-right font-medium">Importe</th>
                    {isDirty && <th className="w-7" />}
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((item, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-gray-800/60 last:border-0">
                      <td className="px-4 py-1.5">
                        {isDirty
                          ? <input
                              className="w-full min-w-[120px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400"
                              value={item.name}
                              onChange={e => updItem(i, { name: e.target.value })}
                              placeholder="Nombre del producto"
                            />
                          : <span className="text-gray-700 dark:text-gray-300">{item.name}</span>
                        }
                      </td>
                      <td className="px-2 py-1.5">
                        {isDirty
                          ? <CategoryPicker
                              value={item.category}
                              onChange={cat => updItem(i, { category: cat })}
                              allCategories={allCats}
                            />
                          : (() => {
                              const cc = catCfg(item.category)
                              return (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium"
                                  style={{ background: cc.color + '18', color: cc.color }}
                                >
                                  <cc.icon className="w-3 h-3 shrink-0" />
                                  <span className="max-w-[110px] truncate">{item.category}</span>
                                </span>
                              )
                            })()
                        }
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        {isDirty
                          ? <input
                              className="w-20 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 text-right text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400"
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.amount}
                              onChange={e => updItem(i, { amount: parseFloat(e.target.value) || 0 })}
                            />
                          : <span className="text-gray-700 dark:text-gray-300 whitespace-nowrap">{item.amount.toFixed(2)} €</span>
                        }
                      </td>
                      {isDirty && (
                        <td className="pr-3 py-1.5">
                          <button
                            onClick={() => delItem(i)}
                            className="p-0.5 text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors"
                            title="Eliminar producto"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">
              No se detectaron productos en este ticket.
            </p>
          )}

          {/* ── Actions bar ── */}
          <div className="px-4 py-2 flex items-center gap-2 border-t border-gray-50 dark:border-gray-800/60">
            {isDirty ? (
              <>
                <button
                  onClick={addItem}
                  className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Añadir producto
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => setEditItems(null)}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2 py-1 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => updateMut.mutate(editItems.filter(it => it.name.trim() !== ''))}
                  disabled={updateMut.isPending}
                  className="flex items-center gap-1 text-xs bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white px-2.5 py-1 rounded transition-colors"
                >
                  {updateMut.isPending
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Check className="w-3 h-3" />
                  }
                  Guardar
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditItems(ticket.items.map(it => ({ ...it })))}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> Editar productos
              </button>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

// ── Category chart ─────────────────────────────────────────────────────────────

type DateRange = 'all' | 'month' | '3m' | 'year'
type GroupBy   = 'cat' | 'store' | 'month'
type ChartView = 'donut' | 'bar' | 'area'

interface ChartDatum { name: string; value: number; pct: number; color: string }

const TOOLTIP_STYLE = { fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,.12)' }

/** Small pill toggle-group */
function TGroup<T extends string>({
  value, onChange, options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-[11px]">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 transition-colors whitespace-nowrap ${
            value === o.value
              ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 font-semibold'
              : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Donut + legend list */
function DonutView({ data, grand }: { data: ChartDatum[]; grand: number }) {
  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="w-full lg:w-56 h-52 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={46} outerRadius={84} paddingAngle={2} dataKey="value">
              {data.map((_e, i) => <Cell key={i} fill={data[i].color} />)}
            </Pie>
            <Tooltip formatter={(v) => [`${Number(v).toFixed(2)} €`]} contentStyle={TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 content-start overflow-y-auto max-h-52">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 py-0.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-xs text-gray-600 dark:text-gray-400 truncate flex-1">{d.name}</span>
            <span className="text-xs font-semibold text-gray-800 dark:text-white whitespace-nowrap">{d.pct}%</span>
            <span className="text-xs text-gray-400 whitespace-nowrap">{d.value.toFixed(2)} €</span>
          </div>
        ))}
        {data.length > 0 && (
          <div className="flex items-center gap-2 py-0.5 col-span-full border-t border-gray-100 dark:border-gray-800 mt-1 pt-1">
            <span className="w-2.5 h-2.5 shrink-0" />
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex-1">Total</span>
            <span className="text-xs font-bold text-gray-800 dark:text-white whitespace-nowrap">{grand.toFixed(2)} €</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** Horizontal bars (categories / stores) */
function HBarView({ data }: { data: ChartDatum[] }) {
  const shown = data.slice(0, 15)
  const max = shown[0]?.value ?? 1
  return (
    <div className="space-y-1.5">
      {shown.map((d, i) => (
        <div key={i} className="flex items-center gap-2.5">
          <span className="w-32 text-xs text-gray-600 dark:text-gray-400 truncate text-right shrink-0">{d.name}</span>
          <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color }}
            />
          </div>
          <span className="w-18 text-xs text-gray-500 dark:text-gray-400 text-right whitespace-nowrap shrink-0">{d.value.toFixed(2)} €</span>
          <span className="text-[10px] text-gray-400 w-8 text-right shrink-0">{d.pct}%</span>
        </div>
      ))}
    </div>
  )
}

/** Vertical bars (monthly totals via recharts) */
function VBarView({ data }: { data: ChartDatum[] }) {
  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 4 }} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,.15)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}€`} width={48} />
          <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(2)} €`]} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((_e, i) => <Cell key={i} fill={data[i].color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Area chart (monthly trend) */
function AreaView({ data }: { data: ChartDatum[] }) {
  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 4 }}>
          <defs>
            <linearGradient id="ticketAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,.15)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}€`} width={48} />
          <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(2)} €`]} contentStyle={TOOLTIP_STYLE} />
          <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fill="url(#ticketAreaGrad)" dot={{ fill: '#6366f1', r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function CategoryChart({ tickets }: { tickets: Ticket[] }) {
  const [range,   setRange]   = useState<DateRange>('all')
  const [groupBy, setGroupBy] = useState<GroupBy>('cat')
  const [view,    setView]    = useState<ChartView>('donut')

  // ── Date filter ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (range === 'all') return tickets
    const now = new Date()
    return tickets.filter(t => {
      const raw = t.ticket_date ?? t.created_at.slice(0, 10)
      const d   = new Date(raw + 'T00:00:00')
      if (range === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      if (range === 'year')  return d.getFullYear() === now.getFullYear()
      // 3m: last 3 calendar months including current
      const cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      return d >= cutoff
    })
  }, [tickets, range])

  // ── Compute chart data ───────────────────────────────────────────────────────
  const { data, grand } = useMemo(() => {
    const totals: Record<string, number> = {}

    if (groupBy === 'cat') {
      for (const t of filtered)
        for (const [cat, amt] of Object.entries(t.categories))
          totals[cat] = (totals[cat] ?? 0) + amt
    } else if (groupBy === 'store') {
      for (const t of filtered) {
        const key = t.store_name?.trim() || 'Desconocida'
        totals[key] = (totals[key] ?? 0) + (t.total ?? 0)
      }
    } else { // month
      for (const t of filtered) {
        const raw = t.ticket_date ?? t.created_at.slice(0, 10)
        const d   = new Date(raw + 'T00:00:00')
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        totals[key] = (totals[key] ?? 0) + (t.total ?? 0)
      }
    }

    const entries = groupBy === 'month'
      ? Object.entries(totals).sort((a, b) => a[0].localeCompare(b[0]))
      : Object.entries(totals).sort((a, b) => b[1] - a[1])

    const grand = entries.reduce((s, [, v]) => s + v, 0)

    const data: ChartDatum[] = entries.map(([key, value], i) => {
      let name = key
      if (groupBy === 'month') {
        const [y, m] = key.split('-')
        name = new Date(+y, +m - 1).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
      }
      const color = groupBy === 'cat' ? (catCfg(key).color) : COLORS[i % COLORS.length]
      return { name, value: Math.round(value * 100) / 100, pct: grand > 0 ? Math.round((value / grand) * 1000) / 10 : 0, color }
    })

    return { data, grand }
  }, [filtered, groupBy])

  // Derive view: donut not valid for month; area not valid for cat/store
  const effectiveView: ChartView =
    (view === 'donut' && groupBy === 'month') ? 'bar' :
    (view === 'area'  && groupBy !== 'month') ? 'donut' :
    view

  const viewOpts: { value: ChartView; label: string }[] =
    groupBy === 'month'
      ? [{ value: 'bar', label: 'Barras' }, { value: 'area', label: 'Área' }]
      : [{ value: 'donut', label: 'Dona' }, { value: 'bar', label: 'Barras' }]

  if (tickets.length === 0) return null

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 space-y-3">
      {/* Row 1: total + period filter */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-gray-800 dark:text-white">
          Desglose
          {grand > 0 && <span className="ml-1.5 text-gray-500 font-normal">— {grand.toFixed(2)} €</span>}
          {filtered.length < tickets.length && (
            <span className="text-xs font-normal text-gray-400 ml-2">({filtered.length} ticket{filtered.length !== 1 ? 's' : ''})</span>
          )}
        </span>
        <TGroup value={range} onChange={setRange} options={[
          { value: 'all',   label: 'Todo'  },
          { value: 'month', label: 'Mes'   },
          { value: '3m',    label: '3M'    },
          { value: 'year',  label: 'Año'   },
        ]} />
      </div>

      {/* Row 2: groupBy + chart type */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TGroup value={groupBy} onChange={v => setGroupBy(v as GroupBy)} options={[
          { value: 'cat',   label: 'Categoría' },
          { value: 'store', label: 'Tienda'    },
          { value: 'month', label: 'Mes'       },
        ]} />
        <TGroup value={effectiveView} onChange={v => setView(v as ChartView)} options={viewOpts} />
      </div>

      {/* Chart */}
      {data.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
          No hay datos para el período seleccionado.
        </p>
      ) : effectiveView === 'donut' ? (
        <DonutView data={data} grand={grand} />
      ) : effectiveView === 'bar' && groupBy !== 'month' ? (
        <HBarView data={data} />
      ) : effectiveView === 'bar' ? (
        <VBarView data={data} />
      ) : (
        <AreaView data={data} />
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Tickets() {
  const qc = useQueryClient()
  const [uploadError, setUploadError] = useState<string | null>(null)

  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets'],
    queryFn: getTickets,
  })

  const { data: movementTypes = [] } = useQuery({
    queryKey: ['movement-types'],
    queryFn: getMovementTypes,
    staleTime: 5 * 60 * 1000,
  })

  const analyzeMut = useMutation({
    mutationFn: analyzeTicket,
    onSuccess: (ticket) => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      if (ticket.items.length === 0) {
        setUploadError('Ticket guardado, pero no se detectaron productos. Comprueba que Tesseract OCR está instalado en el servidor o que la imagen tiene suficiente calidad.')
      } else {
        setUploadError(null)
      }
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setUploadError(detail ? `Error: ${detail}` : 'Error al subir el ticket. Comprueba la conexión con el servidor.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteTicket,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  })

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Receipt className="w-5 h-5 text-gray-600 dark:text-gray-400" strokeWidth={1.5} />
        <h1 className="text-xl font-bold text-gray-800 dark:text-white">Tickets</h1>
      </div>

      <div className="relative">
        <UploadArea onFile={async f => { setUploadError(null); analyzeMut.mutate(await compressTicketImage(f)) }} />
        {analyzeMut.isPending && (
          <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 rounded-xl flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <span className="text-sm text-gray-600 dark:text-gray-300">Analizando ticket…</span>
          </div>
        )}
      </div>

      {uploadError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {uploadError}
        </div>
      )}

      {tickets.length > 0 && (
        <>
          <CategoryChart tickets={tickets} />
          <div className="space-y-2">
            {tickets.map(t => (
              <TicketCard
                key={t.id}
                ticket={t}
                onDelete={() => deleteMut.mutate(t.id)}
                extraCategories={Object.keys(
                  tickets.reduce((acc, tk) => ({ ...acc, ...tk.categories }), {} as Record<string, number>)
                )}
                movementTypes={movementTypes}
              />
            ))}
          </div>
        </>
      )}

      {tickets.length === 0 && !analyzeMut.isPending && (
        <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
          Aún no has subido ningún ticket. Sube una foto o PDF para empezar.
        </p>
      )}
    </div>
  )
}
