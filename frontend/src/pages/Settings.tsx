import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { getMovements } from '../api/movements'
import { getAccountsSummary, createAccount, updateAccountFull, deleteAccount, reorderAccounts, ACCOUNT_CATEGORIES, type Account, type AccountCategory } from '../api/accounts'
import { getRealAccounts, createRealAccount, updateRealAccount, deleteRealAccount, type RealAccount } from '../api/realAccounts'
import { getGroups, createGroup, updateGroup, deleteGroup, type Group } from '../api/groups'
import {
  getMovementTypes, createMovementType, updateMovementType, deleteMovementType,
  type MovementType,
} from '../api/movementTypes'
import { exportBackup, importBackup, resetSystem } from '../api/backup'
import { getAuditLog, clearAuditLog } from '../api/auditLog'
import { useDarkMode } from '../hooks/useDarkMode'
import { useCurrency } from '../hooks/useCurrency'
import { useDateFormat, DATE_FORMATS } from '../hooks/useDateFormat'
import { useUiZoom } from '../hooks/useUiZoom'
import { useSharedMovements } from '../hooks/useSharedMovements'
import { loadNavConfig, saveNavConfig, PAGE_META, type NavEntry } from '../hooks/useNavConfig'
import {
  Pencil, Sun, Moon, Lock, Trash2, Plus, Check, X, ChevronRight, ChevronDown, ChevronUp,
  LayoutDashboard, Download, Upload, AlertTriangle, Puzzle, Palette,
  Leaf, Package, ShoppingCart, Eye, EyeOff, RotateCcw, Search, RefreshCw,
} from 'lucide-react'
import {
  getAllCategoryInfo, setCatConfig, setCatHidden, deleteCat, addCustomCat, resetCat,
  type CategoryInfo, PRESET_ICONS, PRESET_COLORS, ICON_NAME_MAP,
} from '../utils/ticketCategories'
import { usePlugins, type PluginScanResult } from '../hooks/usePlugins'
import AppIcon, { ICON_KEYS } from '../components/AppIcon'
import { loadSkins, saveSkins, applySkinCSS, parseSkinFile, type Skin } from '../utils/skins'
import {
  t, BUILT_IN_LANGS, getLanguage, setLanguage,
  loadCustomLanguages, saveCustomLanguages, parseLanguageFile, type CustomLanguage,
} from '../utils/i18n'
import { syncPref } from '../utils/prefSync'
import { getAllPreferences, setPreference } from '../api/preferences'

// ── Account Card ──────────────────────────────────────────────────────────────

const PALETTE_COLORS = [
  '#6b7280','#ef4444','#f97316','#eab308','#22c55e',
  '#10b981','#14b8a6','#3b82f6','#6366f1','#8b5cf6','#ec4899',
]

function FadingScrollList({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [overflows, setOverflows] = useState(false)
  const [atBottom, setAtBottom] = useState(true)

  const check = useCallback(() => {
    const el = ref.current
    if (!el) return
    setOverflows(el.scrollHeight - el.clientHeight > 1)
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 2)
  }, [])

  useEffect(() => {
    check()
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [check, children])

  return (
    <div className="relative border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden">
      <div
        ref={ref}
        onScroll={check}
        className="max-h-40 overflow-y-auto p-2 space-y-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {overflows && !atBottom && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white dark:from-gray-900 to-transparent" />
      )}
    </div>
  )
}

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

function AccountCard({ account, allTypes, fmt, onDeleted, onMoveUp, onMoveDown, canMoveUp, canMoveDown, dragHandlers, isDragging, isDropTarget }: {
  account: Account; allTypes: MovementType[]; fmt: (v: number) => string; onDeleted: () => void
  onMoveUp: () => void; onMoveDown: () => void; canMoveUp: boolean; canMoveDown: boolean
  dragHandlers: {
    onDragStart: (e: React.DragEvent) => void
    onDragEnd: (e: React.DragEvent) => void
    onDragOver: (e: React.DragEvent) => void
    onDragLeave: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
  }
  isDragging: boolean
  isDropTarget: boolean
}) {
  const qc = useQueryClient()
  const colorRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing]       = useState(false)
  const [name, setName]             = useState(account.name)
  const [color, setColor]           = useState(account.color)
  const [icon, setIcon]             = useState(account.icon)
  const [category, setCategory]     = useState<AccountCategory>(account.category)
  const [balance, setBalance]       = useState(String(account.initial_balance))
  const [deprRate, setDeprRate]     = useState(String(account.depreciation_rate ?? ''))
  const [valueDate, setValueDate]   = useState(account.value_date ?? '')
  const [newCar, setNewCar]         = useState(account.new_car ?? false)
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
        color, icon, category,
        initial_balance: isNaN(parseFloat(balance.replace(',', '.'))) ? account.initial_balance : parseFloat(balance.replace(',', '.')),
        depreciation_rate: category === 'vehiculo' && deprRate !== '' ? parseFloat(deprRate) : null,
        value_date: category === 'vehiculo' && valueDate !== '' ? valueDate : null,
        new_car: category === 'vehiculo' ? newCar : false,
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
    setCategory(account.category)
    setDeprRate(String(account.depreciation_rate ?? ''))
    setValueDate(account.value_date ?? '')
    setNewCar(account.new_car ?? false)
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
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${icon === k ? 'ring-2' : 'text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                style={icon === k ? { backgroundColor: color + '20' } : {}}>
                <AppIcon name={k} className="w-4 h-4" style={icon === k ? { color } : undefined} strokeWidth={1.5} />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{t('settings.category')}</span>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as AccountCategory)}
              className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {ACCOUNT_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{t(c.labelKey)}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{t('settings.initialBalance')}</span>
            <input
              type="number" step="0.01" value={balance} onChange={e => setBalance(e.target.value)}
              className="w-32 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          {category === 'vehiculo' && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{t('account.vehicleValueDate')}</span>
                <input
                  type="date" value={valueDate} onChange={e => setValueDate(e.target.value)}
                  className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{t('account.vehicleDepRate')}</span>
                <input
                  type="number" step="0.1" min="0" max="100" value={deprRate} onChange={e => setDeprRate(e.target.value)}
                  placeholder="ej. 15"
                  className="w-24 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={newCar} onChange={e => setNewCar(e.target.checked)}
                  className="mt-0.5 w-3.5 h-3.5 rounded accent-blue-500 shrink-0" />
                <span className="text-xs text-gray-500 dark:text-gray-400">{t('account.newCar')}</span>
              </label>
            </>
          )}
          {!account.is_main && (
            <div className="space-y-1.5">
              <span className="text-xs text-gray-500 dark:text-gray-400">{t('settings.subtypesFeeding')}</span>
              {allTypes.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 px-1">{t('settings.noSubtypes')}</p>
              ) : (
                <FadingScrollList>
                  {allTypes.map(mt => {
                    const isLinkedHere      = linkedIds.has(mt.id)
                    const isLinkedElsewhere = mt.linked_account_id != null && mt.linked_account_id !== account.id
                    return (
                      <label key={mt.id}
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
                            e.target.checked ? next.add(mt.id) : next.delete(mt.id)
                            setLinkedIds(next)
                          }}
                          className="w-3.5 h-3.5 rounded accent-blue-500"
                        />
                        <span className="text-xs text-gray-700 dark:text-gray-200 flex-1">{mt.name}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">{mt.category}</span>
                        {isLinkedElsewhere && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{t('settings.otherAccount')}</span>
                        )}
                      </label>
                    )
                  })}
                </FadingScrollList>
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
      <div
        draggable={true}
        onDragStart={dragHandlers.onDragStart}
        onDragEnd={dragHandlers.onDragEnd}
        onDragOver={dragHandlers.onDragOver}
        onDragLeave={dragHandlers.onDragLeave}
        onDrop={dragHandlers.onDrop}
        className={`bg-white dark:bg-gray-900 rounded-xl border overflow-hidden transition-all ${
          isDropTarget
            ? 'border-blue-400 dark:border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900/50'
            : 'border-gray-100 dark:border-gray-800'
        } ${isDragging ? 'opacity-40' : ''}`}
        style={{ borderLeftColor: account.color, borderLeftWidth: 3 }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing"
            style={{ backgroundColor: account.color + '20' }}
            title={t('settings.dragToReorder')}>
            <AppIcon name={account.icon} className="w-4 h-4" style={{ color: account.color }} strokeWidth={1.5} />
          </div>
          <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-200">{account.name}</span>
          <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {(() => {
              const c = ACCOUNT_CATEGORIES.find(c => c.value === account.category)
              return c ? t(c.labelKey) : account.category
            })()}
          </span>
          <span className="text-sm font-mono text-gray-400 dark:text-gray-500">{fmt(account.initial_balance)}</span>
          <div className="flex items-center">
            <button onClick={onMoveUp} disabled={!canMoveUp}
              className="p-1 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-300 disabled:opacity-20 disabled:hover:text-gray-300 dark:disabled:hover:text-gray-600 rounded transition-colors">
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button onClick={onMoveDown} disabled={!canMoveDown}
              className="p-1 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-300 disabled:opacity-20 disabled:hover:text-gray-300 dark:disabled:hover:text-gray-600 rounded transition-colors">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
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
    qc.invalidateQueries({ queryKey: ['groups'] })
    qc.invalidateQueries({ queryKey: ['movement-types'] })
    qc.invalidateQueries({ queryKey: ['annual'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
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
  const mutUpdateGroup = useMutation({
    mutationFn: ({ id, g }: { id: number; g: Group }) => updateGroup(id, g),
    onSuccess: (updatedGroup) => {
      qc.setQueryData<Group[]>(['groups'], old => old?.map(g => g.id === updatedGroup.id ? updatedGroup : g))
      qc.invalidateQueries({ queryKey: ['movement-types'] })
      qc.invalidateQueries({ queryKey: ['annual'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setEditingGroup(null)
    },
  })
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
  const [adding, setAdding]         = useState(false)
  const [newName, setNewName]       = useState('')
  const [newColor, setNewColor]     = useState('#3b82f6')
  const [newIcon, setNewIcon]       = useState('wallet')
  const [newBal, setNewBal]         = useState('0')
  const [newCategory, setNewCategory] = useState<AccountCategory>('corriente')
  const [newDeprRate, setNewDeprRate] = useState('')
  const [newValueDate, setNewValueDate] = useState('')
  const [newCarFlag, setNewCarFlag] = useState(false)

  const { data: allTypes = [] } = useQuery({ queryKey: ['movement-types'], queryFn: getMovementTypes })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['accounts-summary'] })

  const mutCreate = useMutation({
    mutationFn: () => createAccount({
      name: newName.trim(),
      color: newColor,
      icon: newIcon,
      category: newCategory,
      initial_balance: isNaN(parseFloat(newBal.replace(',', '.'))) ? 0 : parseFloat(newBal.replace(',', '.')),
      depreciation_rate: newCategory === 'vehiculo' && newDeprRate !== '' ? parseFloat(newDeprRate) : null,
      value_date: newCategory === 'vehiculo' && newValueDate !== '' ? newValueDate : null,
      new_car: newCategory === 'vehiculo' ? newCarFlag : false,
    }),
    onSuccess: () => {
      invalidate()
      setAdding(false); setNewName(''); setNewColor('#3b82f6'); setNewIcon('wallet'); setNewBal('0'); setNewCategory('corriente')
      setNewDeprRate(''); setNewValueDate(''); setNewCarFlag(false)
    },
  })

  const mutReorder = useMutation({
    mutationFn: (ids: number[]) => reorderAccounts(ids),
    onSuccess: invalidate,
  })

  const move = (id: number, dir: -1 | 1) => {
    const ids = accounts.map(a => a.id)
    const i = ids.indexOf(id)
    if (i < 0 || i + dir < 0 || i + dir >= ids.length) return
    const next = [...ids]
    ;[next[i], next[i + dir]] = [next[i + dir], next[i]]
    mutReorder.mutate(next)
  }

  const [dragId, setDragId] = useState<number | null>(null)
  const [dropTargetId, setDropTargetId] = useState<number | null>(null)

  const reorderByDrop = (targetId: number) => {
    if (dragId == null || dragId === targetId) return
    const ids = accounts.map(a => a.id)
    const fromIdx = ids.indexOf(dragId)
    const toIdx   = ids.indexOf(targetId)
    if (fromIdx < 0 || toIdx < 0) return
    const next = [...ids]
    next.splice(fromIdx, 1)
    next.splice(toIdx, 0, dragId)
    mutReorder.mutate(next)
  }

  return (
    <div className="space-y-2">
      {accounts.map((account, idx) => (
        <AccountCard
          key={account.id} account={account} allTypes={allTypes} fmt={fmt}
          onDeleted={invalidate}
          onMoveUp={() => move(account.id, -1)}
          onMoveDown={() => move(account.id, 1)}
          canMoveUp={idx > 0}
          canMoveDown={idx < accounts.length - 1}
          isDragging={dragId === account.id}
          isDropTarget={dropTargetId === account.id && dragId !== account.id}
          dragHandlers={{
            onDragStart: (e) => { setDragId(account.id); e.dataTransfer.effectAllowed = 'move' },
            onDragEnd:   ()  => { setDragId(null); setDropTargetId(null) },
            onDragOver:  (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dropTargetId !== account.id) setDropTargetId(account.id) },
            onDragLeave: ()  => { if (dropTargetId === account.id) setDropTargetId(null) },
            onDrop:      (e) => { e.preventDefault(); reorderByDrop(account.id); setDragId(null); setDropTargetId(null) },
          }}
        />
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
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${newIcon === k ? 'ring-2' : 'text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                  style={newIcon === k ? { backgroundColor: newColor + '20' } : {}}>
                  <AppIcon name={k} className="w-4 h-4" style={newIcon === k ? { color: newColor } : undefined} strokeWidth={1.5} />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{t('settings.category')}</span>
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value as AccountCategory)}
                className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {ACCOUNT_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{t(c.labelKey)}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{t('settings.initialBalance')}</span>
              <input
                type="number" step="0.01" value={newBal} onChange={e => setNewBal(e.target.value)}
                className="w-32 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            {newCategory === 'vehiculo' && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{t('account.vehicleValueDate')}</span>
                  <input
                    type="date" value={newValueDate} onChange={e => setNewValueDate(e.target.value)}
                    className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{t('account.vehicleDepRate')}</span>
                  <input
                    type="number" step="0.1" min="0" max="100" value={newDeprRate} onChange={e => setNewDeprRate(e.target.value)}
                    placeholder="ej. 15"
                    className="w-24 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={newCarFlag} onChange={e => setNewCarFlag(e.target.checked)}
                    className="mt-0.5 w-3.5 h-3.5 rounded accent-blue-500 shrink-0" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">{t('account.newCar')}</span>
                </label>
              </>
            )}
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

// ── Suscripciones ─────────────────────────────────────────────────────────────

export type SubPeriod = 'mensual' | 'anual'
export interface SubEntry { period: SubPeriod }
const SUBS_CFG_KEY = 'suscripciones-config'
const SUBS_IDS_KEY = 'suscripciones-ids'  // legacy

export function loadSubsConfig(): Record<number, SubEntry> {
  try {
    const raw = localStorage.getItem(SUBS_CFG_KEY)
    if (raw) return JSON.parse(raw)
    // Migrate from old number[] format
    const legacy = JSON.parse(localStorage.getItem(SUBS_IDS_KEY) ?? '[]')
    if (Array.isArray(legacy) && legacy.length > 0) {
      const migrated: Record<number, SubEntry> = {}
      legacy.forEach((id: number) => { migrated[id] = { period: 'mensual' } })
      localStorage.setItem(SUBS_CFG_KEY, JSON.stringify(migrated))
      return migrated
    }
    return {}
  } catch { return {} }
}
function saveSubsConfig(cfg: Record<number, SubEntry>) {
  localStorage.setItem(SUBS_CFG_KEY, JSON.stringify(cfg))
}

function detectSuggestions(movements: { date: string; dinero: number; movement_type_id?: number | null }[], excluded: Set<number>): number[] {
  const byType: Record<number, string[]> = {}
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 18)
  for (const mv of movements) {
    if (!mv.movement_type_id || mv.dinero >= 0 || excluded.has(mv.movement_type_id)) continue
    if (new Date(mv.date + 'T00:00:00') < cutoff) continue
    ;(byType[mv.movement_type_id] ??= []).push(mv.date)
  }
  return Object.entries(byType).flatMap(([tid, dates]) => {
    if (dates.length < 2) return []
    const sorted = [...dates].sort()
    const intervals = sorted.slice(1).map((d, i) =>
      (new Date(d + 'T00:00:00').getTime() - new Date(sorted[i] + 'T00:00:00').getTime()) / 86400000
    )
    const avg = intervals.reduce((s, x) => s + x, 0) / intervals.length
    const ok = (avg >= 25 && avg <= 40) || (avg >= 340 && avg <= 390)
    return ok ? [Number(tid)] : []
  })
}

function SubscripcionesSection() {
  const { data: types = [] }     = useQuery({ queryKey: ['movement-types'], queryFn: getMovementTypes })
  const { data: movements = [] } = useQuery({ queryKey: ['movements'],      queryFn: () => getMovements(), staleTime: 5 * 60 * 1000 })
  const [config, setConfig]      = useState<Record<number, SubEntry>>(loadSubsConfig)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const activeIds = useMemo(() => new Set(Object.keys(config).map(Number)), [config])

  const expenseTypes = useMemo(() => types.filter(tp => {
    const cat = tp.category?.toLowerCase() ?? ''
    return cat !== 'ingreso' && cat !== 'ahorro' && tp.income_expense_group_id != null
  }), [types])

  const suggestions = useMemo(
    () => detectSuggestions(movements, activeIds),
    [movements, activeIds]
  )

  const typeMap = useMemo(() => Object.fromEntries(types.map(tp => [tp.id, tp])), [types])

  const toggleSub = (id: number, defaultPeriod: SubPeriod = 'mensual') => {
    setConfig(prev => {
      const next = { ...prev }
      if (next[id]) delete next[id]
      else next[id] = { period: defaultPeriod }
      saveSubsConfig(next)
      return next
    })
  }

  const setPeriod = (id: number, period: SubPeriod) => {
    setConfig(prev => {
      const next = { ...prev, [id]: { period } }
      saveSubsConfig(next)
      return next
    })
  }

  const periodBtn = (id: number, p: SubPeriod) => (
    <button
      key={p}
      onClick={() => setPeriod(id, p)}
      className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors ${
        config[id]?.period === p
          ? 'bg-blue-500 text-white'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
      }`}
    >
      {p === 'mensual' ? 'Mensual' : 'Anual'}
    </button>
  )

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Elige qué subtipos son suscripciones y si se cobran mensual o anualmente.
      </p>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
        {expenseTypes.length === 0 && (
          <p className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">No hay subtipos de gasto definidos.</p>
        )}
        {expenseTypes.map(tp => {
          const active = activeIds.has(tp.id)
          return (
            <div key={tp.id} className="flex items-center gap-2 px-4 py-2.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tp.color }} />
              <span className="flex-1 text-sm text-gray-700 dark:text-gray-200 truncate">{tp.name}</span>
              {active && (
                <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5 shrink-0">
                  {periodBtn(tp.id, 'mensual')}
                  {periodBtn(tp.id, 'anual')}
                </div>
              )}
              <button
                onClick={() => toggleSub(tp.id)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none shrink-0 ${active ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${active ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Auto-suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowSuggestions(v => !v)}
            className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            {suggestions.length} sugerencia{suggestions.length !== 1 ? 's' : ''} detectada{suggestions.length !== 1 ? 's' : ''}
            {showSuggestions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showSuggestions && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 divide-y divide-blue-100 dark:divide-blue-800/50">
              {suggestions.map(id => {
                const tp = typeMap[id]
                if (!tp) return null
                return (
                  <div key={id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tp.color }} />
                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-200">{tp.name}</span>
                    <span className="text-xs text-blue-500 dark:text-blue-400 shrink-0">recurrente</span>
                    <button onClick={() => toggleSub(id, 'mensual')}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors">
                      Añadir
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

const ACTION_COLOR: Record<string, string> = {
  create: 'text-green-400',
  update: 'text-blue-400',
  delete: 'text-red-400',
}

function fmtTs(iso: string) {
  return iso.replace('T', ' ').slice(0, 19)
}

function LogsSection() {
  const queryClient = useQueryClient()
  const { data: entries = [], isLoading, refetch } = useQuery({
    queryKey: ['audit-log'],
    queryFn: () => getAuditLog({ limit: 500 }),
  })
  const clearMut = useMutation({
    mutationFn: clearAuditLog,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['audit-log'] }),
  })

  const download = () => {
    const lines = entries
      .map(e => `${fmtTs(e.created_at)}  [${e.action.toUpperCase()}]  ${e.summary}`)
      .join('\n')
    const blob = new Blob([lines], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activity-${new Date().toISOString().slice(0, 10)}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {isLoading ? '…' : `${entries.length} ${t('settings.entries')}`}
        </span>
        <div className="flex items-center gap-3">
          <button onClick={() => refetch()} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            {t('settings.refresh')}
          </button>
          {entries.length > 0 && (
            <button onClick={download} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              {t('settings.download')}
            </button>
          )}
          {entries.length > 0 && (
            <button
              onClick={() => { if (confirm(t('settings.clearActivityConfirm'))) clearMut.mutate() }}
              className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors"
            >
              {t('settings.clearAll')}
            </button>
          )}
        </div>
      </div>
      <div className="font-mono text-xs bg-gray-950 text-gray-300 rounded-xl p-3 overflow-y-auto max-h-72 leading-5">
        {isLoading
          ? <span className="text-gray-500">{t('common.loading')}</span>
          : entries.length === 0
            ? <span className="text-gray-500">{t('settings.noActivity')}</span>
            : entries.map(e => (
              <div key={e.id}>
                <span className="text-gray-500">{fmtTs(e.created_at)}</span>
                {'  '}
                <span className={ACTION_COLOR[e.action] ?? 'text-gray-400'}>
                  [{e.action.toUpperCase()}]
                </span>
                {'  '}
                <span>{e.summary}</span>
              </div>
            ))
        }
      </div>
    </div>
  )
}

const PALETTE_COLORS_RA = [
  '#6b7280','#ef4444','#f97316','#eab308','#22c55e',
  '#10b981','#14b8a6','#3b82f6','#6366f1','#8b5cf6','#ec4899',
]

function RealAccountForm({
  accounts, name, entityName, accountNumber, color, linkedIds, saving, error,
  onName, onEntityName, onAccountNumber, onColor, onToggleLinked, onSave, onCancel,
}: {
  accounts: Account[]
  name: string
  entityName: string
  accountNumber: string
  color: string
  linkedIds: number[]
  saving: boolean
  error: string
  onName: (v: string) => void
  onEntityName: (v: string) => void
  onAccountNumber: (v: string) => void
  onColor: (v: string) => void
  onToggleLinked: (id: number) => void
  onSave: () => void
  onCancel: () => void
}) {
  const colorRef = useRef<HTMLInputElement>(null)
  const IN = 'w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Nombre</label>
          <input className={IN} placeholder="ej. Cuenta ahorro" value={name} onChange={e => onName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Color</label>
          <div className="flex flex-wrap gap-1 mt-1">
            {PALETTE_COLORS_RA.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => onColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-all ${color === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'}`}
                style={{ background: c }}
              />
            ))}
            <button
              type="button"
              onClick={() => colorRef.current?.click()}
              className="w-5 h-5 rounded-full border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center"
              title="Color personalizado"
            >
              <input ref={colorRef} type="color" value={color} onChange={e => onColor(e.target.value)} className="sr-only" />
              <span className="text-[8px] text-gray-400">+</span>
            </button>
          </div>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Entidad bancaria</label>
        <input className={IN} placeholder="ej. Trade Republic" value={entityName} onChange={e => onEntityName(e.target.value)} />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Número de cuenta (opcional)</label>
        <input className={IN} placeholder="ES12 3456 7890 1234 5678" value={accountNumber} onChange={e => onAccountNumber(e.target.value)} />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Cuentas ficticias asociadas</label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {accounts.map(acc => (
            <button
              key={acc.id}
              type="button"
              onClick={() => onToggleLinked(acc.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                linkedIds.includes(acc.id)
                  ? 'text-white border-transparent'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 hover:border-gray-300'
              }`}
              style={linkedIds.includes(acc.id) ? { background: acc.color } : {}}
            >
              {acc.name}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onSave}
          disabled={!name.trim() || !entityName.trim() || saving}
          className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

function RealAccountsSection({ accounts }: { accounts: Account[] }) {
  const qc = useQueryClient()
  const { data: realAccounts = [] } = useQuery({
    queryKey: ['real-accounts'],
    queryFn: getRealAccounts,
  })

  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [name, setName] = useState('')
  const [entityName, setEntityName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [color, setColor] = useState('#3b82f6')
  const [linkedIds, setLinkedIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  function startNew() {
    setEditingId('new')
    setName('')
    setEntityName('')
    setAccountNumber('')
    setColor('#3b82f6')
    setLinkedIds([])
    setSaveError('')
  }

  function startEdit(ra: RealAccount) {
    setEditingId(ra.id)
    setName(ra.name)
    setEntityName(ra.entity_name)
    setAccountNumber(ra.account_number ?? '')
    setColor(ra.color)
    setLinkedIds(ra.linked_account_ids)
    setSaveError('')
  }

  function cancel() {
    setEditingId(null)
    setSaveError('')
  }

  async function save() {
    setSaving(true)
    setSaveError('')
    try {
      const payload = {
        name: name.trim(),
        entity_name: entityName.trim(),
        account_number: accountNumber.trim() || null,
        color,
        linked_account_ids: linkedIds,
      }
      if (editingId === 'new') {
        await createRealAccount(payload)
      } else if (editingId != null) {
        await updateRealAccount(editingId, payload)
      }
      await qc.invalidateQueries({ queryKey: ['real-accounts'] })
      setEditingId(null)
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSaveError(detail ? `Error: ${detail}` : 'No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: number) {
    try {
      await deleteRealAccount(id)
      qc.invalidateQueries({ queryKey: ['real-accounts'] })
    } catch { /* ignore */ }
  }

  const formProps = {
    accounts,
    name, entityName, accountNumber, color, linkedIds,
    saving, error: saveError,
    onName: setName, onEntityName: setEntityName, onAccountNumber: setAccountNumber,
    onColor: setColor, onToggleLinked: (id: number) => setLinkedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]),
    onSave: save, onCancel: cancel,
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Agrupa tus cuentas ficticias por entidad bancaria para comparar con los saldos reales.
      </p>
      {realAccounts.map(ra => (
        <div key={ra.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
          {editingId === ra.id ? (
            <div className="p-3"><RealAccountForm {...formProps} /></div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ra.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{ra.name}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                  {ra.entity_name}{ra.account_number ? ` · ${ra.account_number}` : ''}
                  {ra.linked_account_ids.length > 0 && ` · ${ra.linked_account_ids.length} cuenta${ra.linked_account_ids.length !== 1 ? 's' : ''}`}
                </p>
              </div>
              <button type="button" onClick={() => startEdit(ra)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => remove(ra.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      ))}
      {editingId === 'new' ? (
        <RealAccountForm {...formProps} />
      ) : (
        <button
          type="button"
          onClick={startNew}
          className="flex items-center gap-2 w-full px-4 py-2.5 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Añadir cuenta real
        </button>
      )}
    </div>
  )
}

const SETTINGS_TABS = [
  { id: 'cuentas',        labelKey: 'settings.accounts'  },
  { id: 'apariencia',     labelKey: 'settings.appearance' },
  { id: 'movimientos',    labelKey: 'settings.movements'  },
  { id: 'navegacion',     labelKey: 'settings.navigation' },
  { id: 'backup',         labelKey: 'settings.backup'     },
  { id: 'tickets',        label:    'Tickets'              },
  { id: 'suscripciones',  label:    'Suscripciones'        },
  { id: 'plugins',        labelKey: 'settings.plugins'     },
  { id: 'sistema',        label:    'Sistema'              },
] as const

export default function Settings() {
  const { dark, toggle } = useDarkMode()
  const { currency, setCurrency, fmt, currencies } = useCurrency()
  const { format: dateFormat, setFormat: setDateFormat } = useDateFormat()
  const { zoom, setZoom, inc: zoomIn, dec: zoomOut, min: zoomMin, max: zoomMax } = useUiZoom()
  const { sharedEnabled, setSharedEnabled } = useSharedMovements()
  const { data, isLoading } = useQuery({ queryKey: ['accounts-summary'], queryFn: getAccountsSummary })
  const navigate = useNavigate()
  const [navEntries, setNavEntries] = useState<NavEntry[]>(loadNavConfig)
  const [activeTab, setActiveTab] = useState<string>('cuentas')

  function updateNav(next: NavEntry[]) {
    setNavEntries(next)
    saveNavConfig(next)
  }

  if (isLoading) return <div className="p-8 text-gray-500">{t('common.loading')}</div>
  if (!data) return null

  return (
    <div className="p-3 md:p-6 space-y-0">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">{t('settings.title')}</h1>

      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-gray-100 dark:border-gray-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SETTINGS_TABS.map(tab => {
          const label = 'label' in tab ? tab.label : t(tab.labelKey)
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="max-w-xl space-y-6 pt-6">

        {activeTab === 'cuentas' && (
          <>
            <Section title={t('settings.accounts')}>
              <AccountsSection accounts={data.accounts} fmt={fmt} />
            </Section>
            <Section title={t('settings.movementTypes')}>
              <TypesSection />
            </Section>
            <Section title="Cuentas reales">
              <RealAccountsSection accounts={data.accounts} />
            </Section>
          </>
        )}

        {activeTab === 'apariencia' && (
          <>
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
                <div className="hidden md:flex items-center justify-between px-4 py-3">
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
              <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">{t('settings.languageDesc')}</p>
              <LanguageSection />
            </Section>
            <Section title={t('settings.skins')}>
              <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">{t('settings.skinsDesc')}</p>
              <SkinsSection />
            </Section>
          </>
        )}

        {activeTab === 'movimientos' && (
          <Section title={t('settings.movements')}>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('settings.sharedMovements')}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">{t('settings.sharedMovementsDesc')}</p>
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
        )}

        {activeTab === 'navegacion' && (
          <>
            <Section title={t('settings.navigation')}>
              <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">{t('settings.navigationDesc')}</p>
              <NavSection entries={navEntries} onChange={updateNav} />
            </Section>
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
          </>
        )}

        {activeTab === 'backup' && (
          <Section title={t('settings.backup')}>
            <BackupSection />
          </Section>
        )}

        {activeTab === 'tickets' && (
          <>
            <Section title="Tickets">
              <TicketsSection />
            </Section>
            <Section title="Categorías de tickets">
              <TicketCategoriesSection />
            </Section>
          </>
        )}

        {activeTab === 'suscripciones' && (
          <Section title="Suscripciones">
            <SubscripcionesSection />
          </Section>
        )}

        {activeTab === 'plugins' && (
          <Section title={t('settings.plugins')}>
            <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">{t('settings.pluginsDesc')}</p>
            <PluginsSection />
          </Section>
        )}

        {activeTab === 'sistema' && (
          <>
            <Section title={t('settings.activityLog')}>
              <LogsSection />
            </Section>
            <Section title={t('settings.danger')}>
              <ResetSection />
            </Section>
          </>
        )}

      </div>
    </div>
  )
}
