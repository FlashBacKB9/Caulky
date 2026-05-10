import { useRef, useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { getAccountsSummary, createAccount, updateAccountFull, deleteAccount, type Account } from '../api/accounts'
import { getGroups, createGroup, updateGroup, deleteGroup, type Group } from '../api/groups'
import {
  getMovementTypes, createMovementType, updateMovementType, deleteMovementType,
  type MovementType,
} from '../api/movementTypes'
import { exportBackup, importBackup, resetSystem } from '../api/backup'
import { useDarkMode } from '../hooks/useDarkMode'
import { useCurrency } from '../hooks/useCurrency'
import { useDateFormat, DATE_FORMATS } from '../hooks/useDateFormat'
import { useUiZoom } from '../hooks/useUiZoom'
import { useSharedMovements } from '../hooks/useSharedMovements'
import { loadNavConfig, saveNavConfig, PAGE_META, type NavEntry } from '../hooks/useNavConfig'
import {
  Pencil, Sun, Moon, Lock, Trash2, Plus, Check, X, ChevronRight, ChevronDown, ChevronUp,
  LayoutDashboard, Download, Upload, AlertTriangle, Puzzle, Palette,
} from 'lucide-react'
import { usePlugins, type PluginScanResult } from '../hooks/usePlugins'
import AppIcon, { ICON_KEYS } from '../components/AppIcon'
import { loadSkins, saveSkins, applySkinCSS, parseSkinFile, type Skin } from '../utils/skins'
import {
  t, BUILT_IN_LANGS, getLanguage, setLanguage,
  loadCustomLanguages, saveCustomLanguages, parseLanguageFile, type CustomLanguage,
} from '../utils/i18n'

// ── Account Card ──────────────────────────────────────────────────────────────

const PALETTE_COLORS = [
  '#6b7280','#ef4444','#f97316','#eab308','#22c55e',
  '#10b981','#14b8a6','#3b82f6','#6366f1','#8b5cf6','#ec4899',
]

function DeleteMovementsModal({ accountName, movCount, isPending, onDeleteMovements, onConvertToExpense, onCancel }: {
  accountName: string; movCount: number; isPending: boolean
  onDeleteMovements: () => void; onConvertToExpense: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white">{t('settings.accountMovements')}</h2>
          <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            La cuenta <span className="font-semibold text-gray-800 dark:text-white">{accountName}</span> tiene{' '}
            <span className="font-semibold">{movCount}</span> movimiento{movCount !== 1 ? 's' : ''} de ahorro asociados.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">¿Qué quieres hacer con ellos?</p>
        </div>
        <div className="px-5 pb-5 space-y-2">
          <button
            onClick={onDeleteMovements} disabled={isPending}
            className="w-full flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-left transition-colors disabled:opacity-50"
          >
            <div className="mt-0.5 w-2 h-2 rounded-full bg-red-500 shrink-0 mt-1.5" />
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">{t('settings.deleteMovementsBtn')}</p>
              <p className="text-xs text-red-500/80 dark:text-red-400/70 mt-0.5">{t('settings.deleteMovementsDesc')}</p>
            </div>
          </button>
          <button
            onClick={onConvertToExpense} disabled={isPending}
            className="w-full flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-left transition-colors disabled:opacity-50"
          >
            <div className="mt-0.5 w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1.5" />
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{t('settings.convertToExpense')}</p>
              <p className="text-xs text-amber-500/80 dark:text-amber-400/70 mt-0.5">{t('settings.convertToExpenseDesc')}</p>
            </div>
          </button>
          <button
            onClick={onCancel}
            className="w-full px-4 py-2.5 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-center"
          >
            {t('settings.keepAccount')}
          </button>
        </div>
      </div>
    </div>
  )
}

function AccountCard({ account, allTypes, fmt, onDeleted }: {
  account: Account; allTypes: MovementType[]; fmt: (v: number) => string; onDeleted: () => void
}) {
  const qc = useQueryClient()
  const colorRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing]       = useState(false)
  const [name, setName]             = useState(account.name)
  const [color, setColor]           = useState(account.color)
  const [icon, setIcon]             = useState(account.icon)
  const [balance, setBalance]       = useState(String(account.initial_balance))
  const [confirming, setConfirming] = useState(false)
  const [movCount, setMovCount]     = useState(0)
  const [showModal, setShowModal]   = useState(false)
  const [linkedIds, setLinkedIds]   = useState<Set<number>>(
    () => new Set(allTypes.filter(t => t.linked_account_id === account.id).map(t => t.id))
  )

  const linkedTypes = allTypes.filter(t => t.linked_account_id === account.id)
  const invalidate  = () => qc.invalidateQueries({ queryKey: ['accounts-summary'] })

  const mutUpdate = useMutation({
    mutationFn: async () => {
      await updateAccountFull(account.id, {
        name: name.trim() || account.name,
        color, icon,
        initial_balance: isNaN(parseFloat(balance.replace(',', '.'))) ? account.initial_balance : parseFloat(balance.replace(',', '.')),
      })
      if (!account.is_main) {
        const prevLinked = new Set(allTypes.filter(t => t.linked_account_id === account.id).map(t => t.id))
        const toLink   = allTypes.filter(t =>  linkedIds.has(t.id) && !prevLinked.has(t.id))
        const toUnlink = allTypes.filter(t => !linkedIds.has(t.id) &&  prevLinked.has(t.id))
        await Promise.all([
          ...toLink.map(t => updateMovementType(t.id, {
            name: t.name, category: t.category,
            income_expense_group_id: t.income_expense_group_id,
            color: t.color, linked_account_id: account.id,
          })),
          ...toUnlink.map(t => updateMovementType(t.id, {
            name: t.name, category: t.category,
            income_expense_group_id: t.income_expense_group_id,
            color: t.color, linked_account_id: null,
          })),
        ])
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts-summary'] })
      qc.invalidateQueries({ queryKey: ['movement-types'] })
      setEditing(false)
    },
  })

  const mutDelete = useMutation({
    mutationFn: (opts: { deleteMovements?: boolean; convertToExpense?: boolean }) =>
      deleteAccount(account.id, opts),
    onSuccess: () => { invalidate(); onDeleted(); setShowModal(false); setConfirming(false) },
    onError: (err: unknown) => {
      const e = err as { response?: { status?: number; data?: { detail?: string } } }
      if (e?.response?.status === 409) {
        setMovCount(parseInt(e.response?.data?.detail ?? '0', 10))
        setConfirming(false)
        setShowModal(true)
      }
    },
  })

  const cancelEdit = () => {
    setName(account.name); setColor(account.color)
    setIcon(account.icon); setBalance(String(account.initial_balance))
    setLinkedIds(new Set(allTypes.filter(t => t.linked_account_id === account.id).map(t => t.id)))
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden"
        style={{ borderLeftColor: color, borderLeftWidth: 3 }}>
        <div className="px-4 py-3 space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={() => colorRef.current?.click()}
              className="w-6 h-6 rounded-full shrink-0 border-2 border-white dark:border-gray-700 shadow ring-1 ring-gray-200 dark:ring-gray-600 hover:scale-110 transition-transform"
              style={{ backgroundColor: color }} title="Color" />
            <input ref={colorRef} type="color" value={color} onChange={e => setColor(e.target.value)} className="sr-only" />
            <input
              value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
              autoFocus
              className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Nombre de la cuenta"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {PALETTE_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                style={{ backgroundColor: c, borderColor: color === c ? '#1e40af' : 'transparent' }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ICON_KEYS.map(k => (
              <button key={k} onClick={() => setIcon(k)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${icon === k ? 'ring-2' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                style={icon === k ? { backgroundColor: color + '20' } : {}}>
                <AppIcon name={k} className="w-4 h-4" style={{ color: icon === k ? color : undefined }} strokeWidth={1.5} />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{t('settings.initialBalance')}</span>
            <input
              type="number" step="0.01" value={balance} onChange={e => setBalance(e.target.value)}
              className="w-32 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          {!account.is_main && (
            <div className="space-y-1.5">
              <span className="text-xs text-gray-500 dark:text-gray-400">{t('settings.subtypesFeeding')}</span>
              {allTypes.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 px-1">{t('settings.noSubtypes')}</p>
              ) : (
                <div className="border border-gray-100 dark:border-gray-800 rounded-lg p-2 max-h-40 overflow-y-auto space-y-0.5">
                  {allTypes.map(t => {
                    const isLinkedHere      = linkedIds.has(t.id)
                    const isLinkedElsewhere = t.linked_account_id != null && t.linked_account_id !== account.id
                    return (
                      <label key={t.id}
                        className={`flex items-center gap-2 px-1 py-1 rounded transition-colors ${
                          isLinkedElsewhere
                            ? 'opacity-40 cursor-not-allowed'
                            : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isLinkedHere}
                          disabled={isLinkedElsewhere}
                          onChange={e => {
                            const next = new Set(linkedIds)
                            e.target.checked ? next.add(t.id) : next.delete(t.id)
                            setLinkedIds(next)
                          }}
                          className="w-3.5 h-3.5 rounded accent-blue-500"
                        />
                        <span className="text-xs text-gray-700 dark:text-gray-200 flex-1">{t.name}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">{t.category}</span>
                        {isLinkedElsewhere && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">otra cuenta</span>
                        )}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={cancelEdit} className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              {t('common.cancel')}
            </button>
            <button onClick={() => mutUpdate.mutate()} disabled={mutUpdate.isPending}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 transition-colors">
              {mutUpdate.isPending ? '...' : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {showModal && (
        <DeleteMovementsModal
          accountName={account.name}
          movCount={movCount}
          isPending={mutDelete.isPending}
          onDeleteMovements={() => mutDelete.mutate({ deleteMovements: true })}
          onConvertToExpense={() => mutDelete.mutate({ convertToExpense: true })}
          onCancel={() => setShowModal(false)}
        />
      )}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden"
        style={{ borderLeftColor: account.color, borderLeftWidth: 3 }}>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: account.color + '20' }}>
            <AppIcon name={account.icon} className="w-4 h-4" style={{ color: account.color }} strokeWidth={1.5} />
          </div>
          <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-200">{account.name}</span>
          <span className="text-sm font-mono text-gray-400 dark:text-gray-500">{fmt(account.initial_balance)}</span>
          <button onClick={() => setEditing(true)}
            className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-300 rounded transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {!account.is_main && (
            confirming ? (
              <div className="flex items-center gap-1">
                <button onClick={() => mutDelete.mutate({})} disabled={mutDelete.isPending}
                  className="px-2 py-1 text-xs rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
                  {mutDelete.isPending ? '...' : t('common.delete')}
                </button>
                <button onClick={() => setConfirming(false)} className="p-1 text-gray-300 hover:text-gray-500">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirming(true)}
                className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-red-400 rounded transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )
          )}
        </div>
        {!account.is_main && linkedTypes.length > 0 && (
          <div className="px-4 pb-2.5 flex flex-wrap gap-1 -mt-1">
            {linkedTypes.map(t => (
              <span key={t.id} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                {t.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ── Inline text input ─────────────────────────────────────────────────────────

function InlineInput({
  value, onChange, onConfirm, onCancel, placeholder, autoFocus = true,
}: {
  value: string; onChange: (v: string) => void; onConfirm: () => void; onCancel: () => void
  placeholder?: string; autoFocus?: boolean
}) {
  return (
    <input
      type="text" value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') onCancel() }}
      placeholder={placeholder} autoFocus={autoFocus}
      className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-full"
    />
  )
}

// ── Color swatch picker ───────────────────────────────────────────────────────

function ColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="relative flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="w-6 h-6 rounded-full border-2 border-white dark:border-gray-700 shadow ring-1 ring-gray-200 dark:ring-gray-600 transition-transform hover:scale-110"
        style={{ backgroundColor: color }}
        title={t('settings.changeColor')}
      />
      <input
        ref={ref}
        type="color"
        value={color}
        onChange={e => onChange(e.target.value)}
        style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, opacity: 0, border: 'none', padding: 0 }}
      />
    </div>
  )
}

// ── Type form (edit + add) ────────────────────────────────────────────────────

interface TypeFormState {
  name: string
  color: string
  kind: 'gasto' | 'ingreso' | 'ahorro'
  income_expense_group_id: number
  linked_account_id: number | null
}

const SEL = 'border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400'

function TypeForm({
  initial, onSave, onCancel, isSaving,
  expenseGroups, savingsAccounts, ingresoGroupId, ahorroGroupId,
}: {
  initial: TypeFormState
  onSave: (s: TypeFormState) => void
  onCancel: () => void
  isSaving: boolean
  expenseGroups: Group[]
  savingsAccounts: Account[]
  ingresoGroupId: number | undefined
  ahorroGroupId: number | undefined
}) {
  const [s, setS] = useState(initial)
  const set = <K extends keyof TypeFormState>(k: K, v: TypeFormState[K]) => setS(p => ({ ...p, [k]: v }))

  const changeKind = (kind: TypeFormState['kind']) => {
    if (kind === 'ingreso') {
      setS(p => ({ ...p, kind, income_expense_group_id: ingresoGroupId ?? p.income_expense_group_id, linked_account_id: null }))
    } else if (kind === 'ahorro') {
      setS(p => ({ ...p, kind, income_expense_group_id: ahorroGroupId ?? p.income_expense_group_id, linked_account_id: savingsAccounts[0]?.id ?? null }))
    } else {
      setS(p => ({ ...p, kind, income_expense_group_id: expenseGroups[0]?.id ?? p.income_expense_group_id, linked_account_id: null }))
    }
  }

  const kindBtn = (k: TypeFormState['kind'], label: string) => (
    <button
      type="button"
      onClick={() => changeKind(k)}
      className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
        s.kind === k
          ? 'bg-gray-800 dark:bg-white text-white dark:text-gray-900'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="px-3 py-3 space-y-2.5 bg-gray-50 dark:bg-gray-800/50">
      {/* Row 1: name */}
      <input
        type="text"
        value={s.name}
        onChange={e => set('name', e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
        placeholder="Nombre del subtipo"
        autoFocus
        className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />

      {/* Row 2: kind selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{t('settings.kindLabel')}</span>
        <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 gap-0.5">
          {kindBtn('gasto', t('settings.kindExpense'))}
          {kindBtn('ingreso', t('settings.kindIncome'))}
          {kindBtn('ahorro', t('settings.kindSavings'))}
        </div>

        {s.kind === 'gasto' && expenseGroups.length > 0 && (
          <select
            value={s.income_expense_group_id}
            onChange={e => set('income_expense_group_id', parseInt(e.target.value))}
            className={SEL}
          >
            {expenseGroups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}

        {s.kind === 'ahorro' && savingsAccounts.length > 0 && (
          <select
            value={s.linked_account_id ?? ''}
            onChange={e => set('linked_account_id', parseInt(e.target.value))}
            className={SEL}
          >
            {savingsAccounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          {t('common.cancel')}
        </button>
        <button
          onClick={() => s.name.trim() && onSave(s)}
          disabled={isSaving || !s.name.trim()}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 transition-colors"
        >
          {isSaving ? '...' : t('common.save')}
        </button>
      </div>
    </div>
  )
}

// ── Types section ─────────────────────────────────────────────────────────────

interface EditingGroup { id: number; name: string; color: string }
type AddingTypeState = TypeFormState & { parentGroupId: number }

function TypesSection() {
  const qc = useQueryClient()
  const { data: groups = [] }          = useQuery({ queryKey: ['groups'],           queryFn: getGroups })
  const { data: types  = [] }          = useQuery({ queryKey: ['movement-types'],   queryFn: getMovementTypes })
  const { data: accountsSummary }      = useQuery({ queryKey: ['accounts-summary'], queryFn: getAccountsSummary })

  const [openGroups,    setOpenGroups]   = useState<Set<number>>(new Set())
  const [editingTypeId, setEditingTypeId] = useState<number | null>(null)
  const [addingType,    setAddingType]   = useState<AddingTypeState | null>(null)
  const [editingGroup,  setEditingGroup] = useState<EditingGroup | null>(null)
  const [addingGroup,   setAddingGroup]  = useState(false)
  const [newGroupName,  setNewGroupName] = useState('')

  const ingresoGroupId = groups.find(g => g.name === 'Ingreso')?.id
  const ahorroGroupId  = groups.find(g => g.name === 'Ahorro')?.id
  const expenseGroups  = groups.filter(g => g.id !== ingresoGroupId && g.id !== ahorroGroupId)
  const savingsAccounts = (accountsSummary?.accounts ?? []).filter(a => !a.is_main)

  const getKind = (t: MovementType): TypeFormState['kind'] => {
    if (t.income_expense_group_id === ingresoGroupId) return 'ingreso'
    if (t.income_expense_group_id === ahorroGroupId)  return 'ahorro'
    return 'gasto'
  }

  const invalidate = () => {
    qc.refetchQueries({ queryKey: ['groups'], type: 'all' })
    qc.refetchQueries({ queryKey: ['movement-types'], type: 'all' })
    qc.refetchQueries({ queryKey: ['annual'], type: 'all' })
    qc.refetchQueries({ queryKey: ['dashboard'], type: 'all' })
  }

  const buildPayload = (s: TypeFormState) => {
    const group = groups.find(g => g.id === s.income_expense_group_id)
    return {
      name: s.name.trim(),
      category: group?.name ?? s.name,
      income_expense_group_id: s.income_expense_group_id,
      color: null,
      linked_account_id: s.kind === 'ahorro' ? s.linked_account_id : null,
    }
  }

  const mutUpdateType  = useMutation({ mutationFn: ({ id, s }: { id: number; s: TypeFormState }) => updateMovementType(id, buildPayload(s)), onSuccess: () => { invalidate(); setEditingTypeId(null) } })
  const mutCreateType  = useMutation({ mutationFn: (s: AddingTypeState) => createMovementType(buildPayload(s)), onSuccess: () => { invalidate(); setAddingType(null) } })
  const mutDeleteType  = useMutation({ mutationFn: deleteMovementType, onSuccess: invalidate })
  const mutUpdateGroup = useMutation({ mutationFn: ({ id, g }: { id: number; g: Group }) => updateGroup(id, g), onSuccess: () => { invalidate(); setEditingGroup(null) } })
  const mutDeleteGroup = useMutation({ mutationFn: deleteGroup, onSuccess: invalidate })
  const mutCreateGroup = useMutation({ mutationFn: (name: string) => createGroup({ name, color: '#6b7280' }), onSuccess: () => { invalidate(); setAddingGroup(false); setNewGroupName('') } })

  const typesByGroup       = (id: number) => types.filter(t => t.income_expense_group_id === id)
  const groupHasLockedType = (id: number) => typesByGroup(id).some(t => t.linked_account_id != null)
  const toggleGroup        = (id: number) => setOpenGroups(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const startAdd = (group: Group) => {
    const kind = getKind({ income_expense_group_id: group.id } as MovementType)
    const defaultLinked = kind === 'ahorro' ? (savingsAccounts[0]?.id ?? null) : null
    setAddingType({
      parentGroupId: group.id,
      name: '',
      color: group.color,
      kind,
      income_expense_group_id: group.id,
      linked_account_id: defaultLinked,
    })
    setOpenGroups(prev => new Set([...prev, group.id]))
  }

  return (
    <div className="space-y-2">
      {groups.map(group => {
        const groupTypes = typesByGroup(group.id)
        const hasLocked  = groupHasLockedType(group.id)
        const isOpen     = openGroups.has(group.id)
        const isEditingG = editingGroup?.id === group.id

        const confirmGroupEdit = () => {
          const g = groups.find(g => g.id === editingGroup!.id)!
          mutUpdateGroup.mutate({ id: editingGroup!.id, g: { ...g, name: editingGroup!.name, color: editingGroup!.color } })
        }

        return (
          <div key={group.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">

            {/* Group header */}
            <div className="flex items-center gap-2 px-3 py-2.5">
              {/* Color picker always visible; saves immediately when not editing */}
              <ColorPicker
                color={isEditingG ? editingGroup.color : group.color}
                onChange={c => {
                  if (isEditingG) {
                    setEditingGroup({ ...editingGroup, color: c })
                  } else {
                    const g = groups.find(g => g.id === group.id)!
                    mutUpdateGroup.mutate({ id: group.id, g: { ...g, color: c } })
                  }
                }}
              />

              {/* Name: stays in same position — text or input */}
              {isEditingG ? (
                <div className="flex-1 min-w-0">
                  <InlineInput
                    value={editingGroup.name}
                    onChange={v => setEditingGroup({ ...editingGroup, name: v })}
                    onConfirm={confirmGroupEdit}
                    onCancel={() => setEditingGroup(null)}
                  />
                </div>
              ) : (
                <button onClick={() => toggleGroup(group.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                  <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{group.name}</span>
                  {!isOpen && <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{groupTypes.length} tipos</span>}
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                </button>
              )}

              {isEditingG ? (
                <>
                  <button onClick={confirmGroupEdit} className="p-1 text-green-500 shrink-0"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setEditingGroup(null)} className="p-1 text-gray-400 shrink-0"><X className="w-3.5 h-3.5" /></button>
                </>
              ) : (
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => setEditingGroup({ id: group.id, name: group.name, color: group.color })} className="p-1 text-gray-300 dark:text-gray-600 hover:text-gray-500 rounded transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {!hasLocked && (
                    <button
                      onClick={() => { if (groupTypes.length === 0) mutDeleteGroup.mutate(group.id) }}
                      className={`p-1 rounded transition-colors ${groupTypes.length === 0 ? 'text-gray-300 dark:text-gray-600 hover:text-red-400' : 'text-gray-200 dark:text-gray-700 cursor-not-allowed'}`}
                      title={groupTypes.length > 0 ? t('settings.deleteGroupFirst') : t('settings.deleteGroup')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Types list (collapsible) */}
            {isOpen && (
              <div className="border-t border-gray-50 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
                {groupTypes.map(type => {
                  const locked = type.linked_account_id != null
                  const isEditingThis = editingTypeId === type.id

                  if (isEditingThis) {
                    return (
                      <TypeForm
                        key={type.id}
                        initial={{ name: type.name, color: type.color, kind: getKind(type), income_expense_group_id: type.income_expense_group_id, linked_account_id: type.linked_account_id }}
                        onSave={s => mutUpdateType.mutate({ id: type.id, s })}
                        onCancel={() => setEditingTypeId(null)}
                        isSaving={mutUpdateType.isPending}
                        expenseGroups={expenseGroups}
                        savingsAccounts={savingsAccounts}
                        ingresoGroupId={ingresoGroupId}
                        ahorroGroupId={ahorroGroupId}
                      />
                    )
                  }

                  return (
                    <div key={type.id} className="flex items-center gap-2 px-4 py-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: type.color }} />
                      <span className="flex-1 text-sm text-gray-700 dark:text-gray-200">{type.name}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                        {getKind(type) === 'ingreso' ? t('settings.kindIncome') : getKind(type) === 'ahorro' ? t('settings.kindSavings') : ''}
                      </span>
                      {locked ? (
                        <Lock className="w-3 h-3 text-gray-300 dark:text-gray-600 shrink-0" />
                      ) : (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => setEditingTypeId(type.id)} className="p-1 text-gray-300 dark:text-gray-600 hover:text-gray-500 rounded transition-colors">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => mutDeleteType.mutate(type.id)} className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-400 rounded transition-colors">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Add type */}
                {addingType?.parentGroupId === group.id ? (
                  <TypeForm
                    initial={addingType}
                    onSave={s => mutCreateType.mutate({ ...s, parentGroupId: group.id })}
                    onCancel={() => setAddingType(null)}
                    isSaving={mutCreateType.isPending}
                    expenseGroups={expenseGroups}
                    savingsAccounts={savingsAccounts}
                    ingresoGroupId={ingresoGroupId}
                    ahorroGroupId={ahorroGroupId}
                  />
                ) : (
                  <button
                    onClick={() => startAdd(group)}
                    className="flex items-center gap-2 w-full px-4 py-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Añadir tipo
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Add group */}
      {addingGroup ? (
        <div className="flex items-center gap-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 px-3 py-2.5">
          <div className="flex-1">
            <InlineInput value={newGroupName} onChange={setNewGroupName}
              onConfirm={() => { if (newGroupName.trim()) mutCreateGroup.mutate(newGroupName.trim()) }}
              onCancel={() => { setAddingGroup(false); setNewGroupName('') }}
              placeholder="Nombre del grupo" />
          </div>
          <button onClick={() => { if (newGroupName.trim()) mutCreateGroup.mutate(newGroupName.trim()) }} className="p-1 text-green-500 shrink-0"><Check className="w-3.5 h-3.5" /></button>
          <button onClick={() => { setAddingGroup(false); setNewGroupName('') }} className="p-1 text-gray-400 shrink-0"><X className="w-3.5 h-3.5" /></button>
        </div>
      ) : (
        <button
          onClick={() => setAddingGroup(true)}
          className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Añadir grupo
        </button>
      )}
    </div>
  )
}


// ── Shared layout helpers ─────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{title}</h2>
      {children}
    </div>
  )
}

// ── Nav config section ────────────────────────────────────────────────────────

function NavSection({ entries, onChange }: { entries: NavEntry[]; onChange: (e: NavEntry[]) => void }) {
  const toggle = (id: string) =>
    onChange(entries.map(e => e.id === id ? { ...e, visible: !e.visible } : e))

  const move = (id: string, dir: -1 | 1) => {
    const idx = entries.findIndex(e => e.id === id)
    if (idx < 0) return
    const target = idx + dir
    if (target < 0 || target >= entries.length) return
    const next = [...entries]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
      {entries.map((entry, i) => {
        const meta = PAGE_META[entry.id]
        if (!meta) return null
        const Icon = meta.Icon
        return (
          <div key={entry.id} className="flex items-center gap-2 px-3 py-2.5">
            <div className="flex flex-col -space-y-0.5 shrink-0">
              <button onClick={() => move(entry.id, -1)} disabled={i === 0}
                className="p-0.5 text-gray-300 dark:text-gray-700 hover:text-gray-500 dark:hover:text-gray-400 disabled:opacity-20 transition-colors">
                <ChevronUp className="w-3 h-3" />
              </button>
              <button onClick={() => move(entry.id, 1)} disabled={i === entries.length - 1}
                className="p-0.5 text-gray-300 dark:text-gray-700 hover:text-gray-500 dark:hover:text-gray-400 disabled:opacity-20 transition-colors">
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
            <Icon className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0" strokeWidth={1.5} />
            <Link to={entry.id} className={`flex-1 text-sm transition-colors hover:underline underline-offset-2 ${
              entry.visible ? 'text-gray-700 dark:text-gray-200' : 'text-gray-300 dark:text-gray-600'
            }`}>
              {t(meta.labelKey)}
            </Link>
            <button
              onClick={() => toggle(entry.id)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none shrink-0 ${
                entry.visible ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                entry.visible ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ── Accounts section ──────────────────────────────────────────────────────────

function AccountsSection({ accounts, fmt }: { accounts: Account[]; fmt: (v: number) => string }) {
  const qc = useQueryClient()
  const colorRef = useRef<HTMLInputElement>(null)
  const [adding, setAdding]     = useState(false)
  const [newName, setNewName]   = useState('')
  const [newColor, setNewColor] = useState('#3b82f6')
  const [newIcon, setNewIcon]   = useState('wallet')
  const [newBal, setNewBal]     = useState('0')

  const { data: allTypes = [] } = useQuery({ queryKey: ['movement-types'], queryFn: getMovementTypes })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['accounts-summary'] })

  const mutCreate = useMutation({
    mutationFn: () => createAccount({
      name: newName.trim(),
      color: newColor,
      icon: newIcon,
      initial_balance: isNaN(parseFloat(newBal.replace(',', '.'))) ? 0 : parseFloat(newBal.replace(',', '.')),
    }),
    onSuccess: () => {
      invalidate()
      setAdding(false); setNewName(''); setNewColor('#3b82f6'); setNewIcon('wallet'); setNewBal('0')
    },
  })

  return (
    <div className="space-y-2">
      {accounts.map(account => (
        <AccountCard key={account.id} account={account} allTypes={allTypes} fmt={fmt} onDeleted={invalidate} />
      ))}

      {adding ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden"
          style={{ borderLeftColor: newColor, borderLeftWidth: 3 }}>
          <div className="px-4 py-3 space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={() => colorRef.current?.click()}
                className="w-6 h-6 rounded-full shrink-0 border-2 border-white dark:border-gray-700 shadow ring-1 ring-gray-200 dark:ring-gray-600 hover:scale-110 transition-transform"
                style={{ backgroundColor: newColor }} />
              <input ref={colorRef} type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="sr-only" />
              <input
                value={newName} onChange={e => setNewName(e.target.value)} autoFocus
                onKeyDown={e => { if (e.key === 'Escape') setAdding(false) }}
                className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Nombre de la cuenta"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {PALETTE_COLORS.map(c => (
                <button key={c} onClick={() => setNewColor(c)}
                  className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                  style={{ backgroundColor: c, borderColor: newColor === c ? '#1e40af' : 'transparent' }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ICON_KEYS.map(k => (
                <button key={k} onClick={() => setNewIcon(k)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${newIcon === k ? 'ring-2' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                  style={newIcon === k ? { backgroundColor: newColor + '20' } : {}}>
                  <AppIcon name={k} className="w-4 h-4" style={{ color: newIcon === k ? newColor : undefined }} strokeWidth={1.5} />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{t('settings.initialBalance')}</span>
              <input
                type="number" step="0.01" value={newBal} onChange={e => setNewBal(e.target.value)}
                className="w-32 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                {t('common.cancel')}
              </button>
              <button onClick={() => newName.trim() && mutCreate.mutate()} disabled={!newName.trim() || mutCreate.isPending}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 transition-colors">
                {mutCreate.isPending ? '...' : t('settings.createAccount')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
          <Plus className="w-4 h-4" />
          Nueva cuenta
        </button>
      )}
    </div>
  )
}

// ── Backup section ────────────────────────────────────────────────────────────

import type { RestoreOptions } from '../api/backup'

const ALL_ON: RestoreOptions = {
  groups: true, accounts: true, types: true, movements: true, investments: true,
  dashboard: true, charts: true, budgets: true, templates: true,
  appearance: true, tablePrefs: true,
}
const ALL_OFF: RestoreOptions = {
  groups: false, accounts: false, types: false, movements: false, investments: false,
  dashboard: false, charts: false, budgets: false, templates: false,
  appearance: false, tablePrefs: false,
}

const DB_OPTS = [
  { key: 'groups'      as const, labelKey: 'backup.optGroups',       warn: true },
  { key: 'accounts'    as const, labelKey: 'settings.accounts',      warn: true },
  { key: 'types'       as const, labelKey: 'settings.movementTypes', warn: true },
  { key: 'movements'   as const, labelKey: 'nav.movements',          warn: true },
  { key: 'investments' as const, labelKey: 'nav.investments',        warn: true },
  { key: 'templates'   as const, labelKey: 'backup.optTemplates',    warn: false },
]
const LS_OPTS = [
  { key: 'dashboard'  as const, labelKey: 'nav.dashboard'         },
  { key: 'charts'     as const, labelKey: 'backup.optCharts'      },
  { key: 'budgets'    as const, labelKey: 'nav.budgets'           },
  { key: 'appearance' as const, labelKey: 'backup.optAppearance'  },
  { key: 'tablePrefs' as const, labelKey: 'backup.optTablePrefs'  },
]

function BackupSection() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting]   = useState(false)
  const [importing, setImporting]   = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [opts, setOpts]             = useState<RestoreOptions>(ALL_ON)
  const [error, setError]           = useState<string | null>(null)
  const [success, setSuccess]       = useState(false)

  const toggle = (k: keyof RestoreOptions) =>
    setOpts(p => ({ ...p, [k]: !p[k] }))

  const allChecked = Object.values(opts).every(Boolean)
  const toggleAll  = () => setOpts(allChecked ? ALL_OFF : ALL_ON)
  const noneSelected = Object.values(opts).every(v => !v)

  const handleExport = async () => {
    setExporting(true); setError(null)
    try { await exportBackup() }
    catch { setError(t('backup.exportError')) }
    finally { setExporting(false) }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) { setPendingFile(file); setError(null); setOpts(ALL_ON) }
    e.target.value = ''
  }

  const handleRestore = async () => {
    if (!pendingFile) return
    setImporting(true); setError(null)
    try {
      await importBackup(pendingFile, opts)
      setPendingFile(null)
      setSuccess(true)
      qc.invalidateQueries()
      setTimeout(() => setSuccess(false), 4000)
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? (e instanceof Error ? e.message : t('backup.importError')))
    } finally { setImporting(false) }
  }

  const hasDbSelected = opts.groups || opts.accounts || opts.types || opts.movements

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">

      {/* Export */}
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm text-gray-700 dark:text-gray-200">{t('backup.export')}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('backup.exportDesc')}</p>
        </div>
        <button onClick={handleExport} disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors">
          <Download className="w-3.5 h-3.5" />
          {exporting ? t('backup.exporting') : t('backup.exportBtn')}
        </button>
      </div>

      {/* Import trigger */}
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-700 dark:text-gray-200">{t('backup.import')}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('backup.importDesc')}</p>
          </div>
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <Upload className="w-3.5 h-3.5" />
            {t('backup.selectFile')}
          </button>
          <input ref={fileRef} type="file" accept=".json" onChange={handleFileChange} className="sr-only" />
        </div>

        {/* Checklist */}
        {pendingFile && (
          <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
              <span className="text-xs font-mono text-gray-400 truncate flex-1">{pendingFile.name}</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={allChecked} onChange={toggleAll}
                  className="w-3.5 h-3.5 rounded accent-blue-500" />
                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{t('backup.selectAll')}</span>
              </label>
            </div>

            {/* DB section */}
            <div className="px-3 py-2 space-y-1">
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">{t('backup.dbSection')}</p>
              {DB_OPTS.map(o => (
                <label key={o.key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 px-1 py-0.5 rounded">
                  <input type="checkbox" checked={opts[o.key]} onChange={() => toggle(o.key)}
                    className="w-3.5 h-3.5 rounded accent-blue-500" />
                  <span className="text-xs text-gray-700 dark:text-gray-200 flex-1">{t(o.labelKey)}</span>
                </label>
              ))}
            </div>

            {/* localStorage section */}
            <div className="px-3 py-2 space-y-1 border-t border-gray-50 dark:border-gray-800">
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">{t('backup.configSection')}</p>
              {LS_OPTS.map(o => (
                <label key={o.key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 px-1 py-0.5 rounded">
                  <input type="checkbox" checked={opts[o.key]} onChange={() => toggle(o.key)}
                    className="w-3.5 h-3.5 rounded accent-blue-500" />
                  <span className="text-xs text-gray-700 dark:text-gray-200">{t(o.labelKey)}</span>
                </label>
              ))}
            </div>

            {/* Warning + actions */}
            <div className="px-3 py-2.5 border-t border-gray-100 dark:border-gray-800 space-y-2">
              {hasDbSelected && (
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t('backup.warning')}
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => setPendingFile(null)}
                  className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                  {t('common.cancel')}
                </button>
                <button onClick={handleRestore} disabled={importing || noneSelected}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-40 transition-colors">
                  {importing ? t('backup.restoring') : t('backup.restore')}
                </button>
              </div>
            </div>
          </div>
        )}

        {error   && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
        {success && <p className="text-xs text-green-600 dark:text-green-400">{t('backup.success')}</p>}
      </div>
    </div>
  )
}

// ── Plugins section ───────────────────────────────────────────────────────────

function PluginsSection() {
  const { plugins, addPlugin, removePlugin, togglePlugin, removeAll } = usePlugins()
  const fileRef = useRef<HTMLInputElement>(null)
  const [scan, setScan] = useState<PluginScanResult | null>(null)
  const [generalError, setGeneralError] = useState<string | null>(null)

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setScan(null)
    setGeneralError(null)
    try {
      const result = await addPlugin(file)
      if (result.blocked.length > 0 || result.warnings.length > 0) setScan(result)
    } catch {
      setGeneralError(t('settings.pluginsLoadError'))
    }
  }, [addPlugin])

  const blocked  = scan?.blocked  ?? []
  const warnings = scan?.warnings ?? []

  return (
    <div className="space-y-2">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
        {plugins.length === 0 && (
          <p className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">{t('settings.pluginsNone')}</p>
        )}
        {plugins.map(p => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3">
            <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center shrink-0">
              <Puzzle className="w-3.5 h-3.5 text-purple-500" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{p.name}</p>
                {p.autoDisabled && (
                  <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                    {t('settings.pluginsAutoDisabled')}
                  </span>
                )}
              </div>
              {p.description && (
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{p.description}</p>
              )}
            </div>
            <span className="text-xs text-gray-300 dark:text-gray-600 shrink-0">v{p.version}</span>
            <button
              onClick={() => togglePlugin(p.id)}
              title={p.autoDisabled ? t('settings.pluginsReactivate') : undefined}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none shrink-0 ${
                p.enabled ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                p.enabled ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
            <button onClick={() => removePlugin(p.id)} className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-400 rounded transition-colors shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {blocked.length > 0 && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-red-600 dark:text-red-400">{t('settings.pluginsBlocked')}</p>
          {blocked.map((msg, i) => (
            <p key={i} className="text-xs text-red-500 dark:text-red-400 flex gap-1.5"><span>•</span>{msg}</p>
          ))}
        </div>
      )}

      {warnings.length > 0 && blocked.length === 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">{t('settings.pluginsWarnings')}</p>
          {warnings.map((msg, i) => (
            <p key={i} className="text-xs text-amber-600 dark:text-amber-400 flex gap-1.5"><span>•</span>{msg}</p>
          ))}
        </div>
      )}

      {generalError && <p className="text-xs text-red-500">{generalError}</p>}

      <input ref={fileRef} type="file" accept=".js" onChange={handleFile} className="sr-only" />
      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 flex-1 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
        >
          <Upload className="w-4 h-4" />
          {t('settings.pluginsInstall')}
        </button>
        <a
          href="/plugins/fuente-personalizada.js"
          download="fuente-personalizada.js"
          className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          {t('settings.languageExample')}
        </a>
        <a
          href="/plugins/plugin-dev-guide.md"
          download="plugin-dev-guide.md"
          className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          {t('settings.languageGuide')}
        </a>
      </div>

      {plugins.length > 0 && (
        <button
          onClick={() => { if (confirm(t('settings.pluginsDeleteAllConfirm'))) removeAll() }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          {t('settings.pluginsDeleteAll')}
        </button>
      )}
    </div>
  )
}

// ── Language section ──────────────────────────────────────────────────────────

function LanguageSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [activeLang, setActiveLang] = useState(getLanguage)
  const [customLangs, setCustomLangs] = useState<CustomLanguage[]>(loadCustomLanguages)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const persistCustom = (next: CustomLanguage[]) => {
    setCustomLangs(next)
    saveCustomLanguages(next)
  }

  const handleSelect = (id: string) => {
    setActiveLang(id)
    setLanguage(id)
  }

  const removeCustom = (id: string) => {
    const wasActive = activeLang === id
    persistCustom(customLangs.filter(l => l.id !== id))
    if (wasActive) setLanguage('es')
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLoading(true); setError(null)
    try {
      const meta = await parseLanguageFile(file)
      const id = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
      persistCustom([...customLangs, { ...meta, id }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el idioma')
    } finally { setLoading(false) }
  }

  const btnCls = (active: boolean) =>
    `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
      active
        ? 'bg-blue-500 border-blue-500 text-white'
        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 bg-white dark:bg-gray-800'
    }`

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {BUILT_IN_LANGS.map(lang => (
          <button key={lang.id} onClick={() => handleSelect(lang.id)} className={btnCls(activeLang === lang.id)}>
            <span>{lang.flag}</span>
            <span>{lang.name}</span>
          </button>
        ))}
        {customLangs.map(lang => (
          <div key={lang.id} className="flex items-center gap-0.5">
            <button onClick={() => handleSelect(lang.id)} className={btnCls(activeLang === lang.id)}>
              {lang.flag && <span>{lang.flag}</span>}
              <span>{lang.name}</span>
            </button>
            <button onClick={() => removeCustom(lang.id)} className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-400 rounded transition-colors">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

      <input ref={fileRef} type="file" accept=".js" onChange={handleFile} className="sr-only" />
      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="flex items-center gap-2 flex-1 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors disabled:opacity-40"
        >
          <Upload className="w-4 h-4" />
          {loading ? t('common.loading') : t('settings.languageInstall')}
        </button>
        <a
          href="/locales/example-translation.js"
          download="example-translation.js"
          className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          {t('settings.languageExample')}
        </a>
        <a
          href="/locales/lang-dev-guide.md"
          download="lang-dev-guide.md"
          className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          {t('settings.languageGuide')}
        </a>
      </div>
    </div>
  )
}

// ── Skins section ─────────────────────────────────────────────────────────────

function SkinsSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [skins, setSkins] = useState<Skin[]>(loadSkins)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const persist = (next: Skin[]) => {
    setSkins(next)
    saveSkins(next)
  }

  const toggle = (id: string) => {
    // Only one skin active at a time; toggling active skin deactivates it
    const next = skins.map(s => ({ ...s, enabled: s.id === id ? !s.enabled : false }))
    persist(next)
    const active = next.find(s => s.enabled)
    applySkinCSS(active?.css)
    window.location.reload()
  }

  const remove = (id: string) => {
    const wasActive = skins.find(s => s.id === id)?.enabled
    const next = skins.filter(s => s.id !== id)
    persist(next)
    if (wasActive) { applySkinCSS(undefined); window.location.reload() }
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLoading(true); setError(null)
    try {
      const meta = await parseSkinFile(file)
      const id = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
      const newSkin: Skin = { ...meta, id, enabled: false }
      persist([...skins, newSkin])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.skinsLoadError'))
    } finally { setLoading(false) }
  }

  const LAYOUT_LABEL: Record<string, string> = { topnav: t('settings.skinsTopNav'), sidebar: t('settings.skinsSidebar') }

  return (
    <div className="space-y-2">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
        {skins.length === 0 && (
          <p className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">{t('settings.skinsNone')}</p>
        )}
        {skins.map(skin => (
          <div key={skin.id} className="flex items-center gap-3 px-4 py-3">
            <div className="w-7 h-7 rounded-lg bg-pink-50 dark:bg-pink-900/20 flex items-center justify-center shrink-0">
              <Palette className="w-3.5 h-3.5 text-pink-500" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{skin.name}</p>
                {skin.layout && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                    {LAYOUT_LABEL[skin.layout] ?? skin.layout}
                  </span>
                )}
              </div>
              {skin.description && (
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{skin.description}</p>
              )}
              {skin.author && (
                <p className="text-xs text-gray-300 dark:text-gray-600">{t('settings.skinsBy')} {skin.author}</p>
              )}
            </div>
            <button
              onClick={() => toggle(skin.id)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none shrink-0 ${
                skin.enabled ? 'bg-pink-500' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                skin.enabled ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
            <button onClick={() => remove(skin.id)} className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-400 rounded transition-colors shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

      <input ref={fileRef} type="file" accept=".js" onChange={handleFile} className="sr-only" />
      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="flex items-center gap-2 flex-1 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors disabled:opacity-40"
        >
          <Upload className="w-4 h-4" />
          {loading ? t('common.loading') : t('settings.skinsInstall')}
        </button>
        <a
          href="/skins/cute-pastel.js"
          download="cute-pastel.js"
          className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          {t('settings.languageExample')}
        </a>
        <a
          href="/skins/skin-dev-guide.md"
          download="skin-dev-guide.md"
          className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          {t('settings.languageGuide')}
        </a>
      </div>
    </div>
  )
}

// ── Reset section ─────────────────────────────────────────────────────────────

function ResetSection() {
  const [showModal, setShowModal] = useState(false)
  const [input, setInput]         = useState('')
  const [resetting, setResetting] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const confirmed = input === 'DELETE'

  async function handleReset() {
    if (!confirmed) return
    setResetting(true); setError(null)
    try {
      await resetSystem()
      window.location.reload()
    } catch {
      setError(t('settings.resetError'))
      setResetting(false)
    }
  }

  function closeModal() {
    if (resetting) return
    setShowModal(false); setInput(''); setError(null)
  }

  return (
    <>
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={closeModal}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4 text-red-500" strokeWidth={1.5} />
                </div>
                <h2 className="text-sm font-semibold text-gray-800 dark:text-white">{t('settings.resetTitle')}</h2>
              </div>
              <button onClick={closeModal} disabled={resetting} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 disabled:opacity-40">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2.5 text-xs text-red-700 dark:text-red-400 space-y-1">
                <p className="font-semibold">{t('settings.resetIrreversible')}</p>
                <p>{t('settings.resetDesc')}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500 dark:text-gray-400">
                  Escribe <span className="font-mono font-bold text-gray-700 dark:text-gray-200">DELETE</span> para confirmar
                </label>
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onPaste={e => e.preventDefault()}
                  placeholder="DELETE"
                  autoFocus
                  className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-300 dark:placeholder:text-gray-600"
                />
              </div>
              {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
            </div>
            <div className="px-5 pb-5 flex justify-end gap-2">
              <button onClick={closeModal} disabled={resetting}
                className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40">
                {t('common.cancel')}
              </button>
              <button onClick={handleReset} disabled={!confirmed || resetting}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500 hover:bg-red-600 text-white disabled:opacity-40 transition-colors">
                {resetting ? t('settings.resetBtnDoing') : t('settings.resetBtnAll')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-red-100 dark:border-red-900/30 divide-y divide-gray-50 dark:divide-gray-800">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm text-red-600 dark:text-red-400">{t('settings.resetTitle')}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('settings.resetSystemDesc')}</p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
            {t('settings.resetBtn')}
          </button>
        </div>
      </div>
    </>
  )
}

export default function Settings() {
  const { dark, toggle } = useDarkMode()
  const { currency, setCurrency, fmt, currencies } = useCurrency()
  const { format: dateFormat, setFormat: setDateFormat } = useDateFormat()
  const { zoom, setZoom, inc: zoomIn, dec: zoomOut, min: zoomMin, max: zoomMax } = useUiZoom()
  const { sharedEnabled, setSharedEnabled } = useSharedMovements()
  const { data, isLoading } = useQuery({ queryKey: ['accounts-summary'], queryFn: getAccountsSummary })
  const navigate = useNavigate()
  const [navEntries, setNavEntries] = useState<NavEntry[]>(loadNavConfig)
  const [configOriginalOpen, setConfigOriginalOpen] = useState(false)

  function updateNav(next: NavEntry[]) {
    setNavEntries(next)
    saveNavConfig(next)
  }

  if (isLoading) return <div className="p-8 text-gray-500">{t('common.loading')}</div>
  if (!data) return null

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white">{t('settings.title')}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* ── Col 1: config original + apariencia + movimientos ────── */}
        <div className="space-y-6">

          {/* Configuración Original — desplegable */}
          <div className="space-y-3">
            <button
              onClick={() => setConfigOriginalOpen(v => !v)}
              className="flex items-center justify-between w-full group"
            >
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-400 transition-colors">
                {t('settings.originalConfig')}
              </h2>
              <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-400 transition-all ${configOriginalOpen ? 'rotate-180' : ''}`} />
            </button>
            <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">
              {t('settings.originalConfigDesc')}
            </p>
            {configOriginalOpen && (
              <div className="space-y-6">
                <Section title={t('settings.accounts')}>
                  <AccountsSection accounts={data.accounts} fmt={fmt} />
                </Section>
                <Section title={t('settings.movementTypes')}>
                  <TypesSection />
                </Section>
              </div>
            )}
          </div>

          <Section title={t('settings.appearance')}>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-700 dark:text-gray-200">{t('settings.theme')}</span>
                <button
                  onClick={toggle}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  {dark ? <Sun className="w-3.5 h-3.5" strokeWidth={1.5} /> : <Moon className="w-3.5 h-3.5" strokeWidth={1.5} />}
                  {dark ? t('settings.lightMode') : t('settings.darkMode')}
                </button>
              </div>
              <div className="px-4 py-3">
                <span className="text-sm text-gray-700 dark:text-gray-200">{t('settings.currency')}</span>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {currencies.map(c => (
                    <button
                      key={c.code} onClick={() => setCurrency(c.code)} title={c.label}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        currency === c.code
                          ? 'bg-blue-500 border-blue-500 text-white'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 bg-white dark:bg-gray-800'
                      }`}
                    >
                      {c.symbol} {c.code}
                    </button>
                  ))}
                </div>
              </div>
              <div className="px-4 py-3">
                <span className="text-sm text-gray-700 dark:text-gray-200">{t('settings.dateFormat')}</span>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {DATE_FORMATS.map(f => (
                    <button
                      key={f.value} onClick={() => setDateFormat(f.value)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border font-mono transition-colors ${
                        dateFormat === f.value
                          ? 'bg-blue-500 border-blue-500 text-white'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 bg-white dark:bg-gray-800'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-700 dark:text-gray-200">{t('settings.uiSize')}</span>
                <div className="flex items-center gap-2">
                  <button onClick={zoomOut} disabled={zoom <= zoomMin}
                    className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 text-base font-medium flex items-center justify-center transition-colors">−</button>
                  <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 overflow-hidden">
                    <input
                      type="number" min={zoomMin} max={zoomMax} value={zoom}
                      onChange={e => setZoom(parseInt(e.target.value) || zoom)}
                      onBlur={e => setZoom(parseInt(e.target.value) || zoom)}
                      className="w-10 text-center text-xs font-mono font-medium text-gray-700 dark:text-gray-200 bg-transparent focus:outline-none py-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <span className="text-xs text-gray-400 dark:text-gray-500 pr-1.5">%</span>
                  </div>
                  <button onClick={zoomIn} disabled={zoom >= zoomMax}
                    className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 text-base font-medium flex items-center justify-center transition-colors">+</button>
                </div>
              </div>
            </div>
          </Section>

          <Section title={t('settings.language')}>
            <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">
              {t('settings.languageDesc')}
            </p>
            <LanguageSection />
          </Section>

          <Section title={t('settings.skins')}>
            <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">
              {t('settings.skinsDesc')}
            </p>
            <SkinsSection />
          </Section>

          <Section title={t('settings.movements')}>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('settings.sharedMovements')}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">
                    {t('settings.sharedMovementsDesc')}
                  </p>
                </div>
                <button
                  onClick={() => setSharedEnabled(!sharedEnabled)}
                  className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                    sharedEnabled ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    sharedEnabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            </div>
          </Section>

        </div>

        {/* ── Col 2: navegación ────────────────────────────────────── */}
        <div className="space-y-6">

          <Section title={t('settings.navigation')}>
            <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">
              {t('settings.navigationDesc')}
            </p>
            <NavSection entries={navEntries} onChange={updateNav} />
          </Section>

        </div>

        {/* ── Col 3: dashboard + backup + plugins + peligro ────────── */}
        <div className="space-y-6">

          <Section title={t('settings.dashboard')}>
            <button
              onClick={() => navigate('/?edit=1')}
              className="flex items-center gap-3 w-full px-4 py-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <LayoutDashboard className="w-4 h-4 text-blue-500" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('settings.editDashboard')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('settings.editDashboardDesc')}</p>
              </div>
            </button>
          </Section>

          <Section title={t('settings.backup')}>
            <BackupSection />
          </Section>

          <Section title={t('settings.plugins')}>
            <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">
              {t('settings.pluginsDesc')}
            </p>
            <PluginsSection />
          </Section>

          <Section title={t('settings.danger')}>
            <ResetSection />
          </Section>

        </div>

      </div>
    </div>
  )
}
