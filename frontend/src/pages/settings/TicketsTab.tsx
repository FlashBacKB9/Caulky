import { useRef, useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Pencil, Check, ChevronDown, ChevronUp,
  Leaf, Package, ShoppingCart, Eye, EyeOff, RotateCcw, Search, Trash2, Plus,
} from 'lucide-react'
import { getMovementTypes } from '../../api/movementTypes'
import { getAllPreferences, setPreference } from '../../api/preferences'
import { syncPref } from '../../utils/prefSync'
import {
  getAllCategoryInfo, setCatConfig, setCatHidden, deleteCat, addCustomCat, resetCat,
  type CategoryInfo, PRESET_ICONS, PRESET_COLORS, ICON_NAME_MAP,
} from '../../utils/ticketCategories'
import { Section } from './shared'

// ── Tickets section ───────────────────────────────────────────────────────────

const TICKET_TYPE_ROWS = [
  { key: 'ticket_food_type_id',     label: 'Supermercado / Comida',  icon: Leaf         },
  { key: 'ticket_supplies_type_id', label: 'Suministros',            icon: Package      },
  { key: 'ticket_combined_type_id', label: 'Combinado (todo el ticket)', icon: ShoppingCart },
] as const

const API_KEY_ROWS = [
  { key: 'gemini_api_key',  label: 'Gemini API Key',  hint: 'aistudio.google.com/apikey', color: 'text-blue-500'   },
  { key: 'mistral_api_key', label: 'Mistral API Key', hint: 'console.mistral.ai',          color: 'text-orange-500' },
] as const

function TicketsSection() {
  const { data: types = [] } = useQuery({ queryKey: ['movement-types'], queryFn: getMovementTypes })
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(TICKET_TYPE_ROWS.map(r => [r.key, localStorage.getItem(r.key) ?? '']))
  )

  // API keys — server-only, never localStorage
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({ gemini_api_key: '', mistral_api_key: '' })
  const [apiKeySaving, setApiKeySaving] = useState<Record<string, boolean>>({})
  const [apiKeySaved, setApiKeySaved]   = useState<Record<string, boolean>>({})
  const [showKey, setShowKey] = useState<Record<string, boolean>>({})

  useEffect(() => {
    getAllPreferences().then(prefs => {
      setApiKeys({
        gemini_api_key:  prefs['gemini_api_key']  ?? '',
        mistral_api_key: prefs['mistral_api_key'] ?? '',
      })
    }).catch(() => {})
  }, [])

  const saveApiKey = async (key: string) => {
    setApiKeySaving(p => ({ ...p, [key]: true }))
    try {
      await setPreference(key, apiKeys[key])
      setApiKeySaved(p => ({ ...p, [key]: true }))
      setTimeout(() => setApiKeySaved(p => ({ ...p, [key]: false })), 2500)
    } finally {
      setApiKeySaving(p => ({ ...p, [key]: false }))
    }
  }

  const handleChange = (key: string, val: string) => {
    setVals(v => ({ ...v, [key]: val }))
    syncPref(key, val)
  }

  return (
    <div className="space-y-5">
      {/* API Keys */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Claves de IA para OCR</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">
          Si configuras una clave aquí tendrá prioridad sobre la variable de entorno del servidor.
          La clave se guarda cifrada en tu perfil de usuario.
        </p>
        {API_KEY_ROWS.map(({ key, label, hint, color }) => (
          <div key={key}>
            <p className={`text-xs font-medium mb-1 ${color}`}>{label}</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey[key] ? 'text' : 'password'}
                  className="w-full text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 pr-8 outline-none focus:border-blue-400 text-gray-700 dark:text-gray-300 font-mono"
                  placeholder={`Pega tu ${label}…`}
                  value={apiKeys[key]}
                  onChange={e => setApiKeys(p => ({ ...p, [key]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') saveApiKey(key) }}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(p => ({ ...p, [key]: !p[key] }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showKey[key] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                onClick={() => saveApiKey(key)}
                disabled={apiKeySaving[key]}
                className="flex items-center gap-1 px-3 py-2 text-xs rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 transition-colors shrink-0"
              >
                {apiKeySaved[key] ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Check className="w-3.5 h-3.5" />}
                {apiKeySaved[key] ? 'Guardada' : 'Guardar'}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{hint}</p>
          </div>
        ))}
      </div>

      {/* Movement type assignment */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tipos de movimiento</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">
          Elige el tipo de movimiento que se usará al generar un movimiento desde un ticket.
        </p>
        {TICKET_TYPE_ROWS.map(({ key, label, icon: RowIcon }) => (
          <div key={key}>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1.5">
              <RowIcon className="w-3.5 h-3.5 shrink-0" />
              {label}
            </p>
            <select
              className="w-full text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none focus:border-blue-400 text-gray-700 dark:text-gray-300"
              value={vals[key]}
              onChange={e => handleChange(key, e.target.value)}
            >
              <option value="">— Sin asignar —</option>
              {types.map(mt => (
                <option key={mt.id} value={String(mt.id)}>{mt.name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Ticket categories section ─────────────────────────────────────────────────

// CatRow must live OUTSIDE TicketCategoriesSection so React never unmounts
// it during a re-render (inner functions create a new component type each time,
// causing unmount → mount → scroll-to-top).
interface CatRowProps {
  cat: CategoryInfo
  isEditing: boolean
  editForm: { iconName: string; color: string }
  onEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
  onHide: (hidden: boolean) => void
  onReset: () => void
  onDelete: () => void
  onFormChange: (f: Partial<{ iconName: string; color: string }>) => void
}
function CatRow({ cat, isEditing, editForm, onEdit, onCancelEdit, onSave, onHide, onReset, onDelete, onFormChange }: CatRowProps) {
  const Icon = ICON_NAME_MAP[cat.iconName] ?? ICON_NAME_MAP['Tag']!
  const editRef = useRef<HTMLDivElement>(null)

  // Scroll the edit form into view when it opens
  useEffect(() => {
    if (isEditing) editRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [isEditing])

  return (
    <div className="border-b border-gray-50 dark:border-gray-800/60 last:border-0">
      <div className="flex items-center gap-2.5 px-3 py-2.5 group">
        <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: cat.color + '22', color: cat.color }}>
          <Icon className="w-4 h-4" />
        </span>
        <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{cat.name}</span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {!cat.hidden && (
            <button type="button" onClick={isEditing ? onCancelEdit : onEdit}
              className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors" title="Editar">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {cat.isBuiltin && (
            <button type="button" onClick={onReset}
              className="p-1.5 text-gray-400 hover:text-amber-500 transition-colors" title="Restaurar por defecto">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <button type="button"
            onClick={() => onHide(!cat.hidden)}
            className={`p-1.5 transition-colors ${cat.hidden ? 'text-gray-400 hover:text-green-500' : 'text-gray-400 hover:text-gray-600'}`}
            title={cat.hidden ? 'Mostrar' : 'Ocultar'}>
            {cat.hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
          {!cat.isBuiltin && (
            <button type="button" onClick={onDelete}
              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="Eliminar">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {isEditing && (
        <div ref={editRef} className="px-3 pb-3">
          <EditCatForm
            iconName={editForm.iconName}
            color={editForm.color}
            onChange={onFormChange}
            onSave={onSave}
            onCancel={onCancelEdit}
          />
        </div>
      )}
    </div>
  )
}

function CatIconPicker({ value, onChange }: { value: string; onChange: (n: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1">
      {PRESET_ICONS.map(({ name, Icon }) => (
        <button
          key={name}
          type="button"
          onClick={() => onChange(name)}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${value === name ? 'bg-blue-100 dark:bg-blue-900/40 ring-1 ring-blue-400 text-blue-500' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  )
}

function CatColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRESET_COLORS.map(col => (
        <button
          key={col}
          type="button"
          onClick={() => onChange(col)}
          className="w-6 h-6 rounded-full transition-transform hover:scale-110 shrink-0"
          style={{ background: col, outline: value === col ? `2px solid ${col}` : 'none', outlineOffset: 2 }}
        />
      ))}
    </div>
  )
}

function EditCatForm({
  iconName, color, nameEditable, nameValue,
  onChange, onSave, onCancel,
}: {
  iconName: string; color: string; nameEditable?: boolean; nameValue?: string
  onChange: (f: Partial<{ iconName: string; color: string; name: string }>) => void
  onSave: () => void; onCancel: () => void
}) {
  const PreviewIcon = ICON_NAME_MAP[iconName] ?? ICON_NAME_MAP['Tag']!
  return (
    <div className="mt-2 p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 space-y-3">
      {nameEditable && (
        <div>
          <p className="text-[11px] text-gray-400 mb-1">Nombre</p>
          <input
            className="w-full text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-400 text-gray-700 dark:text-gray-300"
            value={nameValue ?? ''}
            placeholder="Nombre de la categoría"
            onChange={e => onChange({ name: e.target.value })}
          />
        </div>
      )}
      <div>
        <p className="text-[11px] text-gray-400 mb-1.5">Icono</p>
        <CatIconPicker value={iconName} onChange={v => onChange({ iconName: v })} />
      </div>
      <div>
        <p className="text-[11px] text-gray-400 mb-1.5">Color</p>
        <CatColorPicker value={color} onChange={v => onChange({ color: v })} />
      </div>
      <div className="flex items-center justify-between pt-1">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: color + '22', color, border: `1px solid ${color}55` }}>
          <PreviewIcon className="w-3.5 h-3.5 shrink-0" />
          {nameEditable ? (nameValue?.trim() || 'Nueva categoría') : ''}
        </span>
        <div className="flex gap-1.5">
          <button type="button" onClick={onCancel}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2 py-1">
            Cancelar
          </button>
          <button type="button" onClick={onSave}
            className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2.5 py-1 rounded transition-colors">
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

function TicketCategoriesSection() {
  const [rev, setRev] = useState(0)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editForm, setEditForm] = useState<{ iconName: string; color: string; name?: string }>({ iconName: 'Tag', color: '#6b7280' })
  const [showHidden, setShowHidden] = useState(false)
  const refresh = () => setRev(r => r + 1)

  const allCats = useMemo(() => getAllCategoryInfo(), [rev]) // eslint-disable-line react-hooks/exhaustive-deps
  const visible = useMemo(() => allCats.filter((c: CategoryInfo) => !c.hidden && c.name.toLowerCase().includes(search.toLowerCase())), [allCats, search])
  const hiddenCats = useMemo(() => allCats.filter((c: CategoryInfo) => c.hidden), [allCats])

  const startEdit = (cat: CategoryInfo) => {
    setEditing(cat.name)
    setEditForm({ iconName: cat.iconName, color: cat.color })
    setAdding(false)
  }
  const saveEdit = (name: string) => {
    setCatConfig(name, editForm.iconName, editForm.color)
    setEditing(null)
    refresh()
  }
  const startAdd = () => {
    setAdding(true)
    setEditing(null)
    setEditForm({ iconName: 'Tag', color: '#6b7280', name: '' })
  }
  const saveAdd = () => {
    const name = (editForm.name ?? '').trim()
    if (!name) return
    addCustomCat(name, editForm.iconName, editForm.color)
    setAdding(false)
    setEditForm({ iconName: 'Tag', color: '#6b7280', name: '' })
    refresh()
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">
        Personaliza las categorías que aparecen al analizar tickets. Puedes editar el icono y color, ocultar las que no uses, o añadir las tuyas.
      </p>

      {/* Search + Add */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5">
          <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <input
            className="flex-1 text-xs bg-transparent outline-none text-gray-700 dark:text-gray-300 placeholder-gray-400"
            placeholder="Buscar categoría…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button type="button" onClick={startAdd}
          className="flex items-center gap-1 text-xs bg-blue-500 hover:bg-blue-600 text-white px-2.5 py-1.5 rounded-lg transition-colors shrink-0">
          <Plus className="w-3.5 h-3.5" />
          Añadir
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="rounded-xl border border-gray-100 dark:border-gray-800">
          <div className="px-3 pt-3">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nueva categoría</p>
          </div>
          <div className="px-3 pb-3">
            <EditCatForm
              nameEditable
              nameValue={editForm.name}
              iconName={editForm.iconName}
              color={editForm.color}
              onChange={f => setEditForm(prev => ({ ...prev, ...f }))}
              onSave={saveAdd}
              onCancel={() => setAdding(false)}
            />
          </div>
        </div>
      )}

      {/* Visible categories — scrollable to avoid taking over the whole page */}
      <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden max-h-[400px] overflow-y-auto">
        {visible.length === 0 && (
          <p className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">No hay categorías que coincidan.</p>
        )}
        {visible.map((cat: CategoryInfo) => (
          <CatRow
            key={cat.name}
            cat={cat}
            isEditing={editing === cat.name}
            editForm={editForm}
            onEdit={() => startEdit(cat)}
            onCancelEdit={() => setEditing(null)}
            onSave={() => saveEdit(cat.name)}
            onHide={hidden => { setCatHidden(cat.name, hidden); setEditing(null); refresh() }}
            onReset={() => { resetCat(cat.name); refresh() }}
            onDelete={() => { deleteCat(cat.name); setEditing(null); refresh() }}
            onFormChange={f => setEditForm(prev => ({ ...prev, ...f }))}
          />
        ))}
      </div>

      {/* Hidden categories */}
      {hiddenCats.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowHidden(v => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <EyeOff className="w-3.5 h-3.5" />
            {hiddenCats.length} categoría{hiddenCats.length !== 1 ? 's' : ''} oculta{hiddenCats.length !== 1 ? 's' : ''}
            {showHidden ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showHidden && (
            <div className="mt-2 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden opacity-60">
              {hiddenCats.map((cat: CategoryInfo) => (
                <CatRow
                  key={cat.name}
                  cat={cat}
                  isEditing={editing === cat.name}
                  editForm={editForm}
                  onEdit={() => startEdit(cat)}
                  onCancelEdit={() => setEditing(null)}
                  onSave={() => saveEdit(cat.name)}
                  onHide={hidden => { setCatHidden(cat.name, hidden); setEditing(null); refresh() }}
                  onReset={() => { resetCat(cat.name); refresh() }}
                  onDelete={() => { deleteCat(cat.name); setEditing(null); refresh() }}
                  onFormChange={f => setEditForm(prev => ({ ...prev, ...f }))}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tab entry point ────────────────────────────────────────────────────────────

export default function TicketsTab() {
  return (
    <>
      <Section title="Tickets">
        <TicketsSection />
      </Section>
      <Section title="Categorías de tickets">
        <TicketCategoriesSection />
      </Section>
    </>
  )
}
