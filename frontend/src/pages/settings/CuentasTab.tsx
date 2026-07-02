import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Pencil, Trash2, X, Check, ChevronRight, ChevronDown, ChevronUp, Lock, Plus,
} from 'lucide-react'
import { getAccountsSummary, createAccount, updateAccountFull, deleteAccount, reorderAccounts, ACCOUNT_CATEGORIES, type Account, type AccountCategory } from '../../api/accounts'
import { getRealAccounts, createRealAccount, updateRealAccount, deleteRealAccount, type RealAccount } from '../../api/realAccounts'
import { getGroups, createGroup, updateGroup, deleteGroup, type Group } from '../../api/groups'
import {
  getMovementTypes, createMovementType, updateMovementType, deleteMovementType,
  type MovementType,
} from '../../api/movementTypes'
import { t } from '../../utils/i18n'
import AppIcon, { ICON_KEYS } from '../../components/AppIcon'
import { Section, PALETTE_COLORS, FadingScrollList, InlineInput, ColorPicker } from './shared'

// ── Account Card ──────────────────────────────────────────────────────────────

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

// ── Real accounts section ─────────────────────────────────────────────────────

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

// ── Tab entry point ────────────────────────────────────────────────────────────

export default function CuentasTab({ accounts, fmt }: { accounts: Account[]; fmt: (v: number) => string }) {
  return (
    <>
      <Section title={t('settings.accounts')}>
        <AccountsSection accounts={accounts} fmt={fmt} />
      </Section>
      <Section title={t('settings.movementTypes')}>
        <TypesSection />
      </Section>
      <Section title="Cuentas reales">
        <RealAccountsSection accounts={accounts} />
      </Section>
    </>
  )
}
