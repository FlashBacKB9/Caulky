import { useRef, useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import {
  Upload, Trash2, Receipt, ChevronDown, ChevronUp, AlertCircle, Loader2, Pencil, Plus, X, Check,
  Eye, EyeOff, Search, ArrowRightLeft,
  Droplets, GlassWater, Popcorn, Wheat, Candy, Baby, Wine, Coffee, Beef, Cookie, Sandwich,
  Snowflake, Archive, Scissors, Sparkles, Pill, Apple, Milk, Home, Palette, Fish, PawPrint,
  CakeSlice, Pizza, IceCreamCone, Tag, Citrus, Leaf, Package, ShoppingCart,
} from 'lucide-react'
import { analyzeTicket, getTickets, deleteTicket, updateTicketItems, ticketFileUrl, createMovementFromTicket, type Ticket, type TicketItem } from '../api/tickets'
import { getMovementTypes, type MovementType } from '../api/movementTypes'

// ── Supplies category set (mirrors backend SUPPLIES_CATEGORIES) ───────────────
const SUPPLIES_CATS = new Set([
  'Cuidado del cabello', 'Cuidado facial y corporal',
  'Fitoterapia y parafarmacia', 'Limpieza y hogar',
  'Maquillaje', 'Mascotas',
])

// ── Category config: icon + color ─────────────────────────────────────────────

type CatIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties }>
type CatCfgType = { icon: CatIcon; color: string }

const CAT_CFG: Record<string, CatCfgType> = {
  'Aceites especias y salsas':    { icon: Droplets,    color: '#d97706' },
  'Agua y refrescos':             { icon: GlassWater,  color: '#3b82f6' },
  'Aperitivos':                   { icon: Popcorn,     color: '#f97316' },
  'Arroz legumbres y pasta':      { icon: Wheat,       color: '#ca8a04' },
  'Azúcar caramelos y chocolate': { icon: Candy,       color: '#7c3aed' },
  'Bebé':                         { icon: Baby,        color: '#ec4899' },
  'Bodega':                       { icon: Wine,        color: '#b91c1c' },
  'Cacao café e infusiones':      { icon: Coffee,      color: '#92400e' },
  'Carne':                        { icon: Beef,        color: '#ef4444' },
  'Cereales y galletas':          { icon: Cookie,      color: '#b45309' },
  'Charcutería y quesos':         { icon: Sandwich,    color: '#f59e0b' },
  'Congelados':                   { icon: Snowflake,   color: '#0891b2' },
  'Conservas caldos y cremas':    { icon: Archive,     color: '#65a30d' },
  'Cuidado del cabello':          { icon: Scissors,    color: '#9333ea' },
  'Cuidado facial y corporal':    { icon: Sparkles,    color: '#db2777' },
  'Fitoterapia y parafarmacia':   { icon: Pill,        color: '#059669' },
  'Fruta y verdura':              { icon: Apple,       color: '#16a34a' },
  'Huevos leche y mantequilla':   { icon: Milk,        color: '#eab308' },
  'Limpieza y hogar':             { icon: Home,        color: '#4f46e5' },
  'Maquillaje':                   { icon: Palette,     color: '#e11d48' },
  'Marisco y pescado':            { icon: Fish,        color: '#0284c7' },
  'Mascotas':                     { icon: PawPrint,    color: '#ea580c' },
  'Panadería y pastelería':       { icon: CakeSlice,   color: '#c2410c' },
  'Pizzas y platos preparados':   { icon: Pizza,       color: '#dc2626' },
  'Postres y yogures':            { icon: IceCreamCone,color: '#c026d3' },
  'Sin categoría':                { icon: Tag,         color: '#6b7280' },
  'Zumos':                        { icon: Citrus,      color: '#ea580c' },
}

// ── Icon name → component map (for custom category serialization) ─────────────

const ICON_NAME_MAP: Record<string, CatIcon> = {
  Droplets, GlassWater, Popcorn, Wheat, Candy, Baby, Wine, Coffee, Beef, Cookie, Sandwich,
  Snowflake, Archive, Scissors, Sparkles, Pill, Apple, Milk, Home, Palette, Fish, PawPrint,
  CakeSlice, Pizza, IceCreamCone, Tag, Citrus, Leaf, Package, ShoppingCart, Upload, Receipt,
}

const KNOWN_CATEGORIES = Object.keys(CAT_CFG)

// ── Palette ────────────────────────────────────────────────────────────────────

const COLORS = [
  '#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#ec4899',
  '#14b8a6','#f97316','#8b5cf6','#22c55e','#e11d48','#0ea5e9',
  '#a855f7','#84cc16','#06b6d4','#fbbf24','#f43f5e','#34d399',
  '#818cf8','#fb923c','#a3e635','#38bdf8','#c084fc','#4ade80',
  '#f472b6','#2dd4bf',
]

// ── Custom category persistence ───────────────────────────────────────────────

let _customCats: Record<string, { iconName: string; color: string }> = (() => {
  try { return JSON.parse(localStorage.getItem('caulky_cat_cfg') ?? '{}') } catch { return {} }
})()

const registerCustomCat = (name: string, cfg: { iconName: string; color: string }) => {
  _customCats[name] = cfg
  try { localStorage.setItem('caulky_cat_cfg', JSON.stringify(_customCats)) } catch {}
}

const catCfg = (cat: string): CatCfgType => {
  if (CAT_CFG[cat]) return CAT_CFG[cat]
  const custom = _customCats[cat]
  if (custom) return { icon: ICON_NAME_MAP[custom.iconName] ?? Tag, color: custom.color }
  return { icon: Tag, color: '#6b7280' }
}

// ── Category picker ───────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#3b82f6','#8b5cf6','#ec4899','#6b7280',
  '#0891b2','#b91c1c','#92400e','#166534',
]

const PRESET_ICONS: { name: string; Icon: CatIcon }[] = [
  { name: 'Apple',       Icon: Apple       },
  { name: 'Fish',        Icon: Fish        },
  { name: 'Beef',        Icon: Beef        },
  { name: 'Milk',        Icon: Milk        },
  { name: 'Coffee',      Icon: Coffee      },
  { name: 'Cookie',      Icon: Cookie      },
  { name: 'Pizza',       Icon: Pizza       },
  { name: 'Candy',       Icon: Candy       },
  { name: 'Wine',        Icon: Wine        },
  { name: 'GlassWater',  Icon: GlassWater  },
  { name: 'Snowflake',   Icon: Snowflake   },
  { name: 'Pill',        Icon: Pill        },
  { name: 'PawPrint',    Icon: PawPrint    },
  { name: 'Scissors',    Icon: Scissors    },
  { name: 'Palette',     Icon: Palette     },
  { name: 'Sparkles',    Icon: Sparkles    },
  { name: 'Home',        Icon: Home        },
  { name: 'Package',     Icon: Package     },
  { name: 'ShoppingCart',Icon: ShoppingCart},
  { name: 'Leaf',        Icon: Leaf        },
  { name: 'Wheat',       Icon: Wheat       },
  { name: 'Archive',     Icon: Archive     },
  { name: 'Sandwich',    Icon: Sandwich    },
  { name: 'IceCreamCone',Icon: IceCreamCone},
  { name: 'Tag',         Icon: Tag         },
  { name: 'Citrus',      Icon: Citrus      },
  { name: 'Droplets',    Icon: Droplets    },
  { name: 'Baby',        Icon: Baby        },
  { name: 'CakeSlice',   Icon: CakeSlice   },
  { name: 'Popcorn',     Icon: Popcorn     },
  { name: 'Receipt',     Icon: Receipt     },
  { name: 'Upload',      Icon: Upload      },
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
    const top = openBelow ? r.bottom + 6 : r.top - Math.min(320, spaceAbove) - 6
    const left = Math.min(r.left, window.innerWidth - w - 8)
    return { position: 'fixed', top, left, width: w, maxHeight: 320, zIndex: 999 }
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
    registerCustomCat(name, { iconName: newIconName, color: newColor })
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
  const [open, setOpen] = useState(false)
  const [viewFile, setViewFile] = useState(false)
  const [editItems, setEditItems] = useState<TicketItem[] | null>(null)
  const [showMovPanel, setShowMovPanel] = useState(false)
  const [movSuccess, setMovSuccess] = useState<string | null>(null)

  useEffect(() => { setTicket(initialTicket) }, [initialTicket])

  const isDirty = editItems !== null
  const displayItems = editItems ?? ticket.items

  const allCats = useMemo(() => {
    const set = new Set([...KNOWN_CATEGORIES, ...extraCategories])
    return Array.from(set).sort()
  }, [extraCategories])

  const dateLabel = ticket.ticket_date
    ? new Date(ticket.ticket_date + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    : null

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

  const movMut = useMutation({
    mutationFn: ({ mode, typeId }: { mode: 'food' | 'supplies' | 'combined'; typeId: number }) =>
      createMovementFromTicket(ticket.id, mode, typeId, ticket.ticket_date ?? undefined),
    onSuccess: (res) => {
      setMovSuccess(`Movimiento creado: ${res.name} — ${res.amount.toFixed(2)} €`)
      setShowMovPanel(false)
      setTimeout(() => setMovSuccess(null), 4000)
      qc.invalidateQueries({ queryKey: ['movements'] })
    },
  })

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
          <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
            {ticket.store_name ?? ticket.original_name}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {[dateLabel, ticket.total != null ? `${ticket.total.toFixed(2)} €` : null].filter(Boolean).join(' · ')}
          </p>
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
            const disabled = !typeId || total <= 0 || movMut.isPending
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
                <button
                  disabled={disabled}
                  onClick={() => typeId && movMut.mutate({ mode, typeId })}
                  className="flex items-center gap-1 text-xs bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-2.5 py-1 rounded transition-colors"
                >
                  {movMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Crear
                </button>
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

function CategoryChart({ tickets }: { tickets: Ticket[] }) {
  const data = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const t of tickets) {
      for (const [cat, amt] of Object.entries(t.categories)) {
        totals[cat] = (totals[cat] ?? 0) + amt
      }
    }
    const grand = Object.values(totals).reduce((a, b) => a + b, 0)
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({
        name,
        value: Math.round(value * 100) / 100,
        pct: grand > 0 ? Math.round((value / grand) * 1000) / 10 : 0,
        color: COLORS[i % COLORS.length],
      }))
  }, [tickets])

  if (data.length === 0) return null

  const grand = data.reduce((a, b) => a + b.value, 0)

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-white mb-4">
        Desglose por categoría — {grand.toFixed(2)} €
      </h2>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-64 h-56 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => [`${Number(v).toFixed(2)} €`]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,.1)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 content-start">
          {data.map((d, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
              <span className="text-xs text-gray-600 dark:text-gray-400 truncate flex-1">{d.name}</span>
              <span className="text-xs font-medium text-gray-800 dark:text-white whitespace-nowrap">
                {d.pct}%
              </span>
              <span className="text-xs text-gray-400 whitespace-nowrap">{d.value.toFixed(2)} €</span>
            </div>
          ))}
        </div>
      </div>
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
        <UploadArea onFile={f => { setUploadError(null); analyzeMut.mutate(f) }} />
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
