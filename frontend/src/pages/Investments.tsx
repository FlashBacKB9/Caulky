import { useState, useRef } from 'react'
import { t } from '../utils/i18n'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getFunds, getSummary, createFund, updateFund, deleteFund, fetchFundPrice,
  upsertPurchaseSupplement, deletePurchaseSupplement, fetchPurchasePrice,
  type InvestmentFund, type InvestmentPurchase,
} from '../api/investments'
import { getMovement } from '../api/movements'
import { getMovementTypes, type MovementType } from '../api/movementTypes'
import { useCurrency } from '../hooks/useCurrency'
import MovementDetailModal from '../components/MovementDetailModal'
import { TrendingUp, TrendingDown, Plus, Pencil, Trash2, X, Check, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'

const PALETTE = ['#6366f1','#8b5cf6','#ec4899','#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#6b7280']

function GainBadge({ eur, pct }: { eur: number; pct: number }) {
  const pos = eur >= 0
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
      pos ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
           : 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400'
    }`}>
      {pos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {pos ? '+' : ''}{eur.toFixed(2)}€ ({pos ? '+' : ''}{pct.toFixed(2)}%)
    </span>
  )
}

// ── Add/Edit Fund form ────────────────────────────────────────────────────────

function FundForm({ movementTypes, initial, onSave, onCancel, isSaving }: {
  movementTypes: MovementType[]
  initial: { name: string; ticker: string; color: string; notes: string; movement_type_id: number | '' }
  onSave: (v: typeof initial) => void
  onCancel: () => void
  isSaving: boolean
}) {
  const [v, setV] = useState(initial)
  const colorRef = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-2">
        <button onClick={() => colorRef.current?.click()}
          className="w-7 h-7 rounded-full shrink-0 border-2 border-white dark:border-gray-700 shadow ring-1 ring-gray-200 dark:ring-gray-600 hover:scale-110 transition-transform"
          style={{ backgroundColor: v.color }} />
        <input ref={colorRef} type="color" value={v.color} onChange={e => setV(p => ({ ...p, color: e.target.value }))} className="sr-only" />
        <input value={v.name} onChange={e => setV(p => ({ ...p, name: e.target.value }))}
          placeholder="Nombre del fondo (ej. MSCI World)" autoFocus
          className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {PALETTE.map(c => (
          <button key={c} onClick={() => setV(p => ({ ...p, color: c }))}
            className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
            style={{ backgroundColor: c, borderColor: v.color === c ? '#1e40af' : 'transparent' }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{t('invest.subtype')}</label>
          <select value={v.movement_type_id} onChange={e => setV(p => ({ ...p, movement_type_id: e.target.value ? Number(e.target.value) : '' }))}
            className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="">{t('invest.noLink')}</option>
            {movementTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{t('invest.ticker')}</label>
          <input value={v.ticker} onChange={e => setV(p => ({ ...p, ticker: e.target.value.toUpperCase() }))}
            placeholder="ej. IWDA.AS — opcional"
            className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
      </div>
      <input value={v.notes} onChange={e => setV(p => ({ ...p, notes: e.target.value }))}
        placeholder={t('invest.notesOpt')}
        className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">{t('common.cancel')}</button>
        <button onClick={() => v.name.trim() && onSave(v)} disabled={isSaving || !v.name.trim()}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 transition-colors">
          {isSaving ? '...' : t('common.save')}
        </button>
      </div>
    </div>
  )
}

// ── Purchase row (with inline price/units editing) ────────────────────────────

function PurchaseRow({ p, fund, fmt, onOpen }: { p: InvestmentPurchase; fund: InvestmentFund; fmt: (n: number) => string; onOpen: () => void }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [price, setPrice] = useState(String(p.price_at_purchase ?? ''))
  const [units, setUnits] = useState(String(p.units ?? ''))

  const invalidate = () => qc.invalidateQueries({ queryKey: ['investment-funds'] })

  const mutSave = useMutation({
    mutationFn: () => upsertPurchaseSupplement(p.movement_id, {
      price_at_purchase: price ? parseFloat(price) : null,
      units: units ? parseFloat(units) : null,
    }),
    onSuccess: () => { invalidate(); setEditing(false) },
  })

  const mutFetch = useMutation({
    mutationFn: () => fetchPurchasePrice(p.movement_id),
    onSuccess: () => invalidate(),
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setFetchError(msg ?? 'Error al obtener precio')
    },
  })
  const [fetchError, setFetchError] = useState<string | null>(null)

  const mutClear = useMutation({
    mutationFn: () => deletePurchaseSupplement(p.movement_id),
    onSuccess: () => invalidate(),
  })

  const currentVal = (p.price_at_purchase != null && fund.current_price != null)
    ? p.amount_eur * (fund.current_price / p.price_at_purchase)
    : (p.units && fund.current_price) ? p.units * fund.current_price : null
  const gain = currentVal != null ? currentVal - p.amount_eur : null
  const gainPct = (p.price_at_purchase != null && fund.current_price != null)
    ? (fund.current_price - p.price_at_purchase) / p.price_at_purchase * 100
    : null

  if (editing) {
    return (
      <tr className="bg-blue-50/30 dark:bg-blue-900/10">
        <td className="px-4 py-2 text-xs text-gray-500">{p.bank_date ?? p.date}</td>
        <td className="px-3 py-2 text-right text-xs font-mono text-gray-600 dark:text-gray-400">{fmt(p.amount_eur)}</td>
        <td className="px-3 py-2">
          <input type="number" step="0.0001" value={price} onChange={e => setPrice(e.target.value)}
            placeholder="precio"
            className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </td>
        <td className="px-3 py-2">
          <input type="number" step="0.000001" value={units} onChange={e => setUnits(e.target.value)}
            placeholder="auto"
            className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </td>
        <td className="px-3 py-2 text-right text-xs text-gray-300">—</td>
        <td className="px-3 py-2 text-right text-xs text-gray-300">—</td>
        <td className="px-2 py-2">
          <div className="flex items-center gap-0.5 justify-end">
            <button onClick={() => mutSave.mutate()} disabled={mutSave.isPending} className="p-1 text-green-500 hover:text-green-600"><Check className="w-3 h-3" /></button>
            <button onClick={() => setEditing(false)} className="p-1 text-gray-400 hover:text-gray-500"><X className="w-3 h-3" /></button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/40 text-gray-600 dark:text-gray-400 cursor-pointer" onClick={onOpen}>
      <td className="px-4 py-2 text-xs">{p.bank_date ?? p.date}</td>
      <td className="px-3 py-2 text-right text-xs font-mono">{fmt(p.amount_eur)}</td>
      <td className="px-3 py-2 text-right text-xs font-mono">
        {p.price_at_purchase != null
          ? <span>{p.price_at_purchase.toFixed(4)} €</span>
          : fund.ticker
            ? <div className="flex flex-col items-end gap-0.5">
                <button onClick={() => { setFetchError(null); mutFetch.mutate() }} disabled={mutFetch.isPending}
                  className="text-blue-400 hover:text-blue-600 flex items-center gap-1 ml-auto disabled:opacity-40">
                  <RefreshCw className={`w-3 h-3 ${mutFetch.isPending ? 'animate-spin' : ''}`} />
                  {t('invest.getPrice')}
                </button>
                {fetchError && <span className="text-red-400 text-xs max-w-28 text-right leading-tight">{fetchError}</span>}
              </div>
            : <span className="text-gray-300 dark:text-gray-600">—</span>
        }
      </td>
      <td className="px-3 py-2 text-right text-xs font-mono">
        {p.price_at_purchase != null
          ? (p.amount_eur / p.price_at_purchase).toFixed(4)
          : p.units != null ? p.units.toFixed(4) : '—'}
      </td>
      <td className="px-3 py-2 text-right text-xs font-mono">
        {currentVal != null
          ? <span className={gain != null && gain >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>{fmt(currentVal)}</span>
          : '—'
        }
      </td>
      <td className="px-3 py-2 text-right text-xs font-mono">
        {gainPct != null
          ? <span className={gainPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
              {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}%
            </span>
          : '—'
        }
      </td>
      <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-0.5 justify-end">
          <button onClick={() => { setPrice(String(p.price_at_purchase ?? '')); setUnits(String(p.units ?? '')); setEditing(true) }}
            className="p-1 text-gray-300 hover:text-gray-500 rounded"><Pencil className="w-3 h-3" /></button>
          {(p.price_at_purchase != null || p.units != null) && (
            <button onClick={() => mutClear.mutate()} disabled={mutClear.isPending}
              title={t('invest.clearPrice')}
              className="p-1 text-gray-300 hover:text-red-400 rounded"><X className="w-3 h-3" /></button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Fund card ─────────────────────────────────────────────────────────────────

function FundCard({ fund, movementTypes }: { fund: InvestmentFund; movementTypes: MovementType[] }) {
  const qc = useQueryClient()
  const { fmt } = useCurrency()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editingPrice, setEditingPrice] = useState(false)
  const [editingValue, setEditingValue] = useState(false)
  const [priceInput, setPriceInput] = useState(String(fund.current_price ?? ''))
  const [valueInput, setValueInput] = useState(String(fund.current_value_override ?? ''))
  const [confirming, setConfirming] = useState(false)
  const [selectedMovementId, setSelectedMovementId] = useState<number | null>(null)
  const { data: selectedMovement } = useQuery({
    queryKey: ['movement', selectedMovementId],
    queryFn: () => getMovement(selectedMovementId!),
    enabled: selectedMovementId !== null,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['investment-funds'] })
  const mutUpdate     = useMutation({ mutationFn: (p: Parameters<typeof updateFund>[1]) => updateFund(fund.id, p), onSuccess: invalidate })
  const mutDelete     = useMutation({ mutationFn: () => deleteFund(fund.id), onSuccess: invalidate })
  const mutFetchPrice = useMutation({ mutationFn: () => fetchFundPrice(fund.id), onSuccess: invalidate })

  const linkedType = movementTypes.find(t => t.id === fund.movement_type_id)

  const savePrice = () => { mutUpdate.mutate({ current_price: priceInput ? parseFloat(priceInput) : null }); setEditingPrice(false) }
  const saveValue = () => { mutUpdate.mutate({ current_value_override: valueInput ? parseFloat(valueInput) : null }); setEditingValue(false) }

  return (
    <>
    {selectedMovement && (
      <MovementDetailModal
        movement={selectedMovement}
        types={movementTypes}
        onClose={() => setSelectedMovementId(null)}
      />
    )}
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden"
      style={{ borderLeftColor: fund.color, borderLeftWidth: 3 }}>

      {editing ? (
        <div className="p-3">
          <FundForm
            movementTypes={movementTypes}
            initial={{ name: fund.name, ticker: fund.ticker ?? '', color: fund.color, notes: fund.notes ?? '', movement_type_id: fund.movement_type_id ?? '' }}
            onSave={v => {
              mutUpdate.mutate({ name: v.name, ticker: v.ticker || null, color: v.color, notes: v.notes || null, movement_type_id: v.movement_type_id || null })
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
            isSaving={mutUpdate.isPending}
          />
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3">
            <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: fund.color }} />
              <span className="text-sm font-semibold text-gray-800 dark:text-white truncate">{fund.name}</span>
              {fund.ticker && <span className="text-xs text-gray-400 font-mono shrink-0">{fund.ticker}</span>}
              {linkedType && <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">· {linkedType.name}</span>}
              {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
            </button>

            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right hidden sm:block">
                <p className="text-xs text-gray-400 dark:text-gray-500">{t('invest.invested')}</p>
                <p className="text-sm font-mono font-medium text-gray-700 dark:text-gray-200">{fmt(fund.total_invested)}</p>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-xs text-gray-400 dark:text-gray-500">{t('invest.currentValue')}</p>
                {editingValue ? (
                  <div className="flex items-center gap-1">
                    <input type="number" step="0.01" value={valueInput} onChange={e => setValueInput(e.target.value)} autoFocus
                      className="w-24 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    <button onClick={saveValue} className="p-0.5 text-green-500"><Check className="w-3 h-3" /></button>
                    <button onClick={() => setEditingValue(false)} className="p-0.5 text-gray-400"><X className="w-3 h-3" /></button>
                  </div>
                ) : (
                  <button onClick={() => { setValueInput(String(fund.current_value_override ?? fund.current_value ?? '')); setEditingValue(true) }}
                    className="text-sm font-mono font-medium text-gray-700 dark:text-gray-200 hover:text-blue-500 transition-colors text-right block">
                    {fund.current_value != null ? fmt(fund.current_value) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    {fund.current_value_override != null && <span className="text-xs text-blue-400 ml-1">✎</span>}
                  </button>
                )}
              </div>
              {fund.gain_eur != null && fund.gain_pct != null && (
                <GainBadge eur={fund.gain_eur} pct={fund.gain_pct} />
              )}
            </div>

            <div className="flex items-center gap-0.5 shrink-0 ml-1">
              {fund.ticker && (
                <button onClick={() => mutFetchPrice.mutate()} title={t('invest.updatePrice')} disabled={mutFetchPrice.isPending}
                  className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-blue-400 rounded transition-colors disabled:opacity-40">
                  <RefreshCw className={`w-3.5 h-3.5 ${mutFetchPrice.isPending ? 'animate-spin' : ''}`} />
                </button>
              )}
              <button onClick={() => setEditing(true)} className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-gray-500 rounded transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              {confirming ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => mutDelete.mutate()} disabled={mutDelete.isPending}
                    className="px-2 py-1 text-xs rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 transition-colors">
                    {mutDelete.isPending ? '...' : t('common.delete')}
                  </button>
                  <button onClick={() => setConfirming(false)} className="p-1 text-gray-300 hover:text-gray-500"><X className="w-3 h-3" /></button>
                </div>
              ) : (
                <button onClick={() => setConfirming(true)} className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-red-400 rounded transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Price row */}
          <div className="px-4 pb-2.5 flex items-center gap-3">
            <span className="text-xs text-gray-400 dark:text-gray-500">{t('invest.currentPrice')}</span>
            {editingPrice ? (
              <div className="flex items-center gap-1">
                <input type="number" step="0.0001" value={priceInput} onChange={e => setPriceInput(e.target.value)} autoFocus
                  className="w-28 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
                <button onClick={savePrice} className="p-0.5 text-green-500"><Check className="w-3 h-3" /></button>
                <button onClick={() => setEditingPrice(false)} className="p-0.5 text-gray-400"><X className="w-3 h-3" /></button>
              </div>
            ) : (
              <button onClick={() => { setPriceInput(String(fund.current_price ?? '')); setEditingPrice(true) }}
                className="text-xs font-mono text-gray-600 dark:text-gray-300 hover:text-blue-500 transition-colors">
                {fund.current_price != null
                  ? `${fund.current_price.toFixed(4)} €/${t('invest.units')}`
                  : <span className="text-gray-300 dark:text-gray-600">{t('invest.noPrice')}</span>}
              </button>
            )}
            {fund.total_units != null && (
              <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
                {fund.total_units.toFixed(4)} {t('invest.units')}
              </span>
            )}
          </div>

          {/* Expanded: purchases from movements */}
          {expanded && (
            <div className="border-t border-gray-50 dark:border-gray-800">
              {fund.purchases.length === 0 ? (
                <p className="px-4 py-4 text-xs text-gray-400 dark:text-gray-500">
                  {fund.movement_type_id
                    ? t('invest.noPurchasesLinked')
                    : t('invest.noSubtype')}
                </p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500">
                    <tr>
                      <th className="px-4 py-2 text-left">{t('common.date')}</th>
                      <th className="px-3 py-2 text-right">{t('common.amount')}</th>
                      <th className="px-3 py-2 text-right">{t('invest.pricePerShare')}</th>
                      <th className="px-3 py-2 text-right">{t('invest.colUnits')}</th>
                      <th className="px-3 py-2 text-right">{t('invest.currentValue')}</th>
                      <th className="px-3 py-2 text-right">{t('invest.colYield')}</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {fund.purchases.map(p => (
                      <PurchaseRow key={p.movement_id} p={p} fund={fund} fmt={fmt} onOpen={() => setSelectedMovementId(p.movement_id)} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Investments() {
  const { fmt } = useCurrency()
  const qc = useQueryClient()
  const [addingFund, setAddingFund] = useState(false)

  const { data: funds = [], isLoading } = useQuery({ queryKey: ['investment-funds'], queryFn: getFunds })
  const { data: summary } = useQuery({ queryKey: ['investment-summary'], queryFn: getSummary })
  const { data: movementTypes = [] } = useQuery({ queryKey: ['movement-types'], queryFn: getMovementTypes })

  const mutCreate = useMutation({
    mutationFn: (v: { name: string; ticker: string; color: string; notes: string; movement_type_id: number | '' }) =>
      createFund({
        name: v.name,
        ticker: v.ticker || undefined,
        color: v.color,
        notes: v.notes || undefined,
        movement_type_id: v.movement_type_id || null,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['investment-funds'] }); setAddingFund(false) },
  })

  if (isLoading) return <div className="p-8 text-gray-500">{t('common.loading')}</div>

  const hasValue = summary?.total_current_value != null

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">{t('nav.investments')}</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('invest.pageDesc')}</p>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t('invest.invested'),     value: fmt(summary.total_invested),                                                                                                color: 'text-gray-700 dark:text-gray-200' },
            { label: t('invest.currentValue'), value: hasValue ? fmt(summary.total_current_value!) : '—',                                                                        color: 'text-gray-700 dark:text-gray-200' },
            { label: t('invest.gainEur'),       value: hasValue ? `${summary.gain_eur! >= 0 ? '+' : ''}${fmt(summary.gain_eur!)}` : '—',                                         color: !hasValue ? 'text-gray-400' : summary.gain_eur! >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400' },
            { label: t('invest.yield'),         value: hasValue && summary.gain_pct != null ? `${summary.gain_pct >= 0 ? '+' : ''}${summary.gain_pct.toFixed(2)}%` : '—',        color: !hasValue ? 'text-gray-400' : (summary.gain_pct ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400' },
          ].map(c => (
            <div key={c.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 px-4 py-3">
              <p className="text-xs text-gray-400 dark:text-gray-500">{c.label}</p>
              <p className={`text-xl font-bold font-mono mt-0.5 ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {funds.map(fund => <FundCard key={fund.id} fund={fund} movementTypes={movementTypes} />)}

        {addingFund ? (
          <FundForm
            movementTypes={movementTypes}
            initial={{ name: '', ticker: '', color: '#6366f1', notes: '', movement_type_id: '' }}
            onSave={v => mutCreate.mutate(v)}
            onCancel={() => setAddingFund(false)}
            isSaving={mutCreate.isPending}
          />
        ) : (
          <button onClick={() => setAddingFund(true)}
            className="flex items-center gap-2 w-full px-4 py-3 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
            <Plus className="w-4 h-4" />
            {t('invest.addFund')}
          </button>
        )}
      </div>
    </div>
  )
}
