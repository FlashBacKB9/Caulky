import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { useQueries, useQueryClient, useMutation, useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  AreaChart, Area,
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import {
  ScrollText, Upload, FileText, X, TrendingUp, TrendingDown,
  Minus, Loader2, ChevronDown, ChevronUp, Filter,
  ArrowUp, ArrowDown, ArrowUpDown,
  GripVertical, BarChart2, LineChart as LcLineChart, Table2,
} from 'lucide-react'
import {
  getMovements, uploadMovementFile, deleteMovementFile,
  movementFileDownloadUrl, type Movement, type MovementFile,
} from '../api/movements'
import { getMovementTypes, type MovementType } from '../api/movementTypes'
import { getGroups, type Group } from '../api/groups'
import FilterPanel, { EMPTY_FILTER, applyAdvancedFilter, type AdvancedFilter } from '../components/FilterPanel'

// ── Constants ─────────────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = new Set([
  'Gasto Casa', 'Transporte', 'Salud', 'Regalos',
  'Entretenimiento', 'Suscripciones', 'Vacaciones',
  'Vida Diaria', 'Coche', 'Moto',
])

const CURRENT_YEAR  = new Date().getFullYear()
const YEAR_OPTIONS  = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)
const MONTHS_SHORT  = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const COLORS_KEY    = 'caulky-expense-type-colors'
const FILTER_KEY    = 'caulky-expense-type-filter'
const ORDER_KEY     = 'caulky-expense-type-order'
const TOOLTIP_STYLE = { fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,.12)' }

const CHART_KINDS = [
  { id: 'bar'  as const, Icon: BarChart2   },
  { id: 'area' as const, Icon: TrendingUp  },
  { id: 'line' as const, Icon: LcLineChart },
]

type ChartKind = 'bar' | 'area' | 'line'
type StackMode  = 'normal' | 'stacked' | 'cumulative'
type SortField  = 'date' | 'name' | 'amount' | 'type'
type SortDir    = 'asc' | 'desc'

// ── Storage helpers ───────────────────────────────────────────────────────────

function loadColors(): Record<number, string> {
  try { return JSON.parse(localStorage.getItem(COLORS_KEY) ?? '{}') } catch { return {} }
}
function saveColors(c: Record<number, string>) { localStorage.setItem(COLORS_KEY, JSON.stringify(c)) }
function typeColor(t: MovementType, custom: Record<number, string>): string { return custom[t.id] ?? t.color }

function loadTypeFilter(): number[] | null {
  try {
    const s = localStorage.getItem(FILTER_KEY)
    if (!s) return null
    const a = JSON.parse(s)
    return Array.isArray(a) ? (a as number[]) : null
  } catch { return null }
}
function saveTypeFilter(ids: Set<number>) { localStorage.setItem(FILTER_KEY, JSON.stringify([...ids])) }

function loadTypeOrder(): number[] {
  try {
    const s = localStorage.getItem(ORDER_KEY)
    if (s) return JSON.parse(s) as number[]
  } catch { /**/ }
  return []
}
function saveTypeOrder(ids: number[]) { localStorage.setItem(ORDER_KEY, JSON.stringify(ids)) }

function makeCumulative(
  rows: Record<string, string | number>[],
  keys: string[],
): Record<string, string | number>[] {
  const acc: Record<string, number> = {}
  for (const k of keys) acc[k] = 0
  return rows.map(row => {
    const next: Record<string, string | number> = { month: row.month as string }
    for (const k of keys) {
      acc[k] = (acc[k] ?? 0) + Number(row[k] ?? 0)
      next[k] = Math.round(acc[k] * 100) / 100
    }
    return next
  })
}

// ── SummaryCard ───────────────────────────────────────────────────────────────

function SummaryCard({ type, cur, prev, customColors }: {
  type: MovementType; cur: number; prev: number; customColors: Record<number, string>
}) {
  const delta   = cur - prev
  const hasPrev = prev > 0.01
  const color   = typeColor(type, customColors)
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 truncate">{type.name}</span>
      </div>
      <p className="text-lg font-bold text-gray-900 dark:text-white">{cur.toFixed(2)} €</p>
      {hasPrev ? (
        <div className={`flex items-center gap-1 mt-1 text-[11px] font-medium ${
          delta >  0.01 ? 'text-red-500' : delta < -0.01 ? 'text-emerald-500' : 'text-gray-400'
        }`}>
          {delta >  0.01 ? <TrendingUp  className="w-3 h-3" /> :
           delta < -0.01 ? <TrendingDown className="w-3 h-3" /> :
           <Minus className="w-3 h-3" />}
          {delta > 0 ? '+' : ''}{delta.toFixed(2)} € vs mes ant.
        </div>
      ) : (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Sin datos mes anterior</p>
      )}
    </div>
  )
}

// ── FilePill ──────────────────────────────────────────────────────────────────

function FilePill({ file, onDelete }: { file: MovementFile; onDelete: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-full text-[11px] pl-1.5 pr-1 py-0.5">
      <FileText className="w-3 h-3 shrink-0" />
      <a href={movementFileDownloadUrl(file.id)} target="_blank" rel="noreferrer" className="hover:underline max-w-[120px] truncate">
        {file.original_name}
      </a>
      <button type="button" onClick={e => { e.stopPropagation(); onDelete() }}
        className="ml-0.5 text-blue-400 hover:text-red-500 transition-colors" title="Eliminar archivo">
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}

// ── MovementRow ───────────────────────────────────────────────────────────────

function MovementRow({ movement, type, onRefresh }: {
  movement: Movement; type: MovementType | undefined; onRefresh: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [expanded, setExpanded]   = useState(false)

  const deleteMut = useMutation({ mutationFn: deleteMovementFile, onSuccess: onRefresh })

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try { await uploadMovementFile(movement.id, file); onRefresh(); setExpanded(true) }
    finally { setUploading(false); e.target.value = '' }
  }

  const dateStr  = movement.date
    ? new Date(movement.date + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—'
  const hasFiles = movement.files.length > 0

  return (
    <div className="border-b border-gray-50 dark:border-gray-800/60 last:border-0">
      <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
        <span className="text-xs text-gray-400 dark:text-gray-500 w-16 shrink-0">{dateStr}</span>
        {type ? (
          <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
            style={{ background: type.color + '22', color: type.color }}>
            {type.name}
          </span>
        ) : <span className="w-20 shrink-0" />}
        <span className="flex-1 min-w-0 text-xs text-gray-700 dark:text-gray-300 truncate">{movement.name}</span>
        {hasFiles && (
          <button type="button" onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-[10px] font-medium text-blue-500 bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 rounded-full hover:bg-blue-100 transition-colors shrink-0">
            <FileText className="w-2.5 h-2.5" />
            {movement.files.length}
            {expanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          </button>
        )}
        <span className="text-xs font-semibold text-gray-800 dark:text-white whitespace-nowrap shrink-0 w-20 text-right">
          {Math.abs(movement.money).toFixed(2)} €
        </span>
        <div className="shrink-0">
          <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleUpload} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
            title="Adjuntar factura" className="p-1 text-gray-300 dark:text-gray-600 hover:text-blue-500 transition-colors disabled:opacity-50">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      {expanded && hasFiles && (
        <div className="px-4 pb-2.5 flex flex-wrap gap-1.5 bg-blue-50/30 dark:bg-blue-950/10">
          {movement.files.map(f => <FilePill key={f.id} file={f} onDelete={() => deleteMut.mutate(f.id)} />)}
        </div>
      )}
    </div>
  )
}

// ── TypeFilterDropdown ────────────────────────────────────────────────────────

function TypeFilterDropdown({ typesByCategory, selectedTypeIds, customColors, onToggleType, onToggleCategory, onColorChange }: {
  typesByCategory: Record<string, MovementType[]>
  selectedTypeIds: Set<number>
  customColors: Record<number, string>
  onToggleType: (id: number) => void
  onToggleCategory: (cat: string) => void
  onColorChange: (id: number, color: string) => void
}) {
  const [open, setOpen] = useState(false)
  const totalTypes = Object.values(typesByCategory).reduce((s, a) => s + a.length, 0)

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors rounded-xl">
        <span className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          Filtrar por tipo de gasto
          <span className="text-[10px] font-normal text-gray-400">{selectedTypeIds.size}/{totalTypes} sel.</span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 dark:border-gray-800">
          {Object.entries(typesByCategory).map(([cat, types]) => {
            const allSel  = types.every(t => selectedTypeIds.has(t.id))
            const someSel = types.some(t => selectedTypeIds.has(t.id))
            return (
              <div key={cat} className="pt-3 space-y-2">
                <button type="button" onClick={() => onToggleCategory(cat)}
                  className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${
                    allSel  ? 'text-gray-700 dark:text-gray-200' :
                    someSel ? 'text-gray-500 dark:text-gray-400' : 'text-gray-300 dark:text-gray-600'
                  }`}>
                  {cat}
                </button>
                <div className="flex flex-wrap gap-2">
                  {types.map(t => {
                    const color = typeColor(t, customColors)
                    return (
                      <div key={t.id} className="flex items-center gap-1">
                        <label
                          className="w-3.5 h-3.5 rounded-full cursor-pointer shrink-0 relative overflow-hidden ring-1 ring-offset-1 ring-transparent hover:ring-gray-300 dark:hover:ring-gray-600 transition-all"
                          style={{ background: color }} title="Cambiar color">
                          <input type="color" value={color} onChange={e => onColorChange(t.id, e.target.value)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        </label>
                        <button type="button" onClick={() => onToggleType(t.id)}
                          className={`text-xs px-2.5 py-0.5 rounded-full font-medium transition-all ${
                            selectedTypeIds.has(t.id) ? 'opacity-100' : 'opacity-25 hover:opacity-60'
                          }`}
                          style={{ background: color + '22', color, border: `1px solid ${color}44` }}>
                          {t.name}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── TableView ─────────────────────────────────────────────────────────────────

function TableView({ chartTypes, chartRows, annualByType, allYears, customColors }: {
  chartTypes: MovementType[]
  chartRows: Record<string, string | number>[]
  annualByType: Record<number, Record<number, number>>
  allYears: number[]
  customColors: Record<number, string>
}) {
  const [tableMode, setTableMode] = useState<'monthly' | 'annual'>('monthly')
  const multiYear   = allYears.length > 1
  const singleYear  = allYears[0]!
  const sortedYears = [...allYears].sort((a, b) => a - b)
  const baseYear    = sortedYears[0]!
  const latestYear  = sortedYears[sortedYears.length - 1]!

  const tdName = 'px-3 py-2 sticky left-0 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300'

  if (chartTypes.length === 0) return (
    <p className="text-center text-sm text-gray-400 py-8">Sin datos para mostrar.</p>
  )

  return (
    <div className="space-y-3">
      {/* Mode toggle — only when multi-year */}
      {multiYear && (
        <div className="flex gap-1.5">
          {(['monthly', 'annual'] as const).map(m => (
            <button key={m} type="button" onClick={() => setTableMode(m)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                tableMode === m
                  ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 font-semibold border-gray-800 dark:border-gray-100'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 bg-white dark:bg-gray-900'
              }`}>
              {m === 'monthly' ? 'Por mes' : 'Anual'}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">

        {/* ── Single year: types × months ── */}
        {(!multiYear || tableMode === 'monthly' && !multiYear) && !multiYear && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="text-left px-3 py-2 text-gray-400 font-semibold sticky left-0 bg-white dark:bg-gray-900 min-w-[120px]">Tipo</th>
                {MONTHS_SHORT.map(m => <th key={m} className="text-right px-2 py-2 text-gray-400 font-semibold min-w-[44px]">{m}</th>)}
                <th className="text-right px-3 py-2 text-gray-400 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {chartTypes.map(t => {
                const color  = typeColor(t, customColors)
                const values = chartRows.map(row => Number(row[`${t.id}_${singleYear}`] ?? 0))
                const total  = values.reduce((a, b) => a + b, 0)
                return (
                  <tr key={t.id} className="border-b border-gray-50 dark:border-gray-800/60 hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
                    <td className={tdName}>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        {t.name}
                      </span>
                    </td>
                    {values.map((v, i) => (
                      <td key={i} className={`text-right px-2 py-2 tabular-nums ${v > 0.01 ? 'text-gray-700 dark:text-gray-300' : 'text-gray-300 dark:text-gray-600'}`}>
                        {v > 0.01 ? v.toFixed(0) : '—'}
                      </td>
                    ))}
                    <td className="text-right px-3 py-2 font-semibold text-gray-800 dark:text-white tabular-nums">
                      {total > 0.01 ? `${total.toFixed(0)} €` : '—'}
                    </td>
                  </tr>
                )
              })}
              <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 font-semibold">
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-800/30">Total</td>
                {MONTHS_SHORT.map((_, mi) => {
                  const total = chartTypes.reduce((s, t) => s + Number(chartRows[mi]?.[`${t.id}_${singleYear}`] ?? 0), 0)
                  return (
                    <td key={mi} className={`text-right px-2 py-2 tabular-nums ${total > 0.01 ? 'text-gray-800 dark:text-white' : 'text-gray-300 dark:text-gray-600'}`}>
                      {total > 0.01 ? total.toFixed(0) : '—'}
                    </td>
                  )
                })}
                <td className="text-right px-3 py-2 tabular-nums text-gray-800 dark:text-white">
                  {chartTypes.reduce((s, t) => s + (annualByType[t.id]?.[singleYear] ?? 0), 0).toFixed(0)} €
                </td>
              </tr>
            </tbody>
          </table>
        )}

        {/* ── Multi-year monthly: grouped type → year rows + ∆% ── */}
        {multiYear && tableMode === 'monthly' && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="text-left px-3 py-2 text-gray-400 font-semibold sticky left-0 bg-white dark:bg-gray-900 min-w-[110px]">Tipo · Año</th>
                {MONTHS_SHORT.map(m => <th key={m} className="text-right px-2 py-2 text-gray-400 font-semibold min-w-[40px]">{m}</th>)}
                <th className="text-right px-3 py-2 text-gray-400 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {chartTypes.map(t => {
                const color    = typeColor(t, customColors)
                const yearData = sortedYears.map(y => ({
                  y,
                  vals:  chartRows.map(row => Number(row[`${t.id}_${y}`] ?? 0)),
                  total: annualByType[t.id]?.[y] ?? 0,
                }))
                const baseVals  = yearData.find(d => d.y === baseYear)?.vals   ?? Array(12).fill(0) as number[]
                const topVals   = yearData.find(d => d.y === latestYear)?.vals ?? Array(12).fill(0) as number[]
                const baseTotal = yearData.find(d => d.y === baseYear)?.total   ?? 0
                const topTotal  = yearData.find(d => d.y === latestYear)?.total ?? 0

                return (
                  <Fragment key={t.id}>
                    {/* Type header */}
                    <tr className="bg-gray-50/70 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800">
                      <td colSpan={14} className="px-3 py-1.5">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                          {t.name}
                        </span>
                      </td>
                    </tr>
                    {/* Year rows */}
                    {yearData.map(({ y, vals, total }) => (
                      <tr key={y} className="border-b border-gray-50 dark:border-gray-800/40">
                        <td className="pl-5 pr-3 py-1.5 text-gray-500 dark:text-gray-400 sticky left-0 bg-white dark:bg-gray-900 tabular-nums">{y}</td>
                        {vals.map((v, i) => (
                          <td key={i} className={`text-right px-2 py-1.5 tabular-nums ${v > 0.01 ? 'text-gray-700 dark:text-gray-300' : 'text-gray-300 dark:text-gray-600'}`}>
                            {v > 0.01 ? v.toFixed(0) : '—'}
                          </td>
                        ))}
                        <td className="text-right px-3 py-1.5 font-semibold tabular-nums text-gray-800 dark:text-white">
                          {total > 0.01 ? `${total.toFixed(0)} €` : '—'}
                        </td>
                      </tr>
                    ))}
                    {/* ∆% row: latestYear vs baseYear */}
                    <tr className="border-b-2 border-gray-100 dark:border-gray-800">
                      <td className="pl-5 pr-3 py-1 text-[10px] text-gray-400 sticky left-0 bg-white dark:bg-gray-900">
                        ∆% {baseYear}→{latestYear}
                      </td>
                      {topVals.map((tv, i) => {
                        const bv = (baseVals[i] ?? 0)
                        const d  = bv > 0.01 ? ((tv - bv) / bv) * 100 : null
                        return (
                          <td key={i} className={`text-right px-2 py-1 text-[10px] tabular-nums font-medium ${
                            d == null ? 'text-gray-300 dark:text-gray-600' : d > 0 ? 'text-red-500' : d < 0 ? 'text-emerald-500' : 'text-gray-400'
                          }`}>
                            {d == null ? '—' : `${d > 0 ? '+' : ''}${Math.round(d)}%`}
                          </td>
                        )
                      })}
                      {(() => {
                        const d = baseTotal > 0.01 ? ((topTotal - baseTotal) / baseTotal) * 100 : null
                        return (
                          <td className={`text-right px-3 py-1 text-[10px] tabular-nums font-medium ${
                            d == null ? 'text-gray-300 dark:text-gray-600' : d > 0 ? 'text-red-500' : d < 0 ? 'text-emerald-500' : 'text-gray-400'
                          }`}>
                            {d == null ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(1)}%`}
                          </td>
                        )
                      })()}
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}

        {/* ── Multi-year annual: types × years + ∆% ── */}
        {multiYear && tableMode === 'annual' && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="text-left px-3 py-2 text-gray-400 font-semibold sticky left-0 bg-white dark:bg-gray-900 min-w-[120px]">Tipo</th>
                {sortedYears.map(y => <th key={y} className="text-right px-3 py-2 text-gray-400 font-semibold min-w-[80px]">{y}</th>)}
                <th className="text-right px-3 py-2 text-gray-400 font-semibold min-w-[80px]">∆% {baseYear}→{latestYear}</th>
              </tr>
            </thead>
            <tbody>
              {chartTypes.map(t => {
                const color  = typeColor(t, customColors)
                const base   = annualByType[t.id]?.[baseYear]   ?? 0
                const latest = annualByType[t.id]?.[latestYear] ?? 0
                const delta  = base > 0.01 ? ((latest - base) / base) * 100 : null
                return (
                  <tr key={t.id} className="border-b border-gray-50 dark:border-gray-800/60 hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
                    <td className={tdName}>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        {t.name}
                      </span>
                    </td>
                    {sortedYears.map(y => {
                      const v = annualByType[t.id]?.[y] ?? 0
                      return (
                        <td key={y} className={`text-right px-3 py-2 tabular-nums ${v > 0.01 ? 'text-gray-700 dark:text-gray-300' : 'text-gray-300 dark:text-gray-600'}`}>
                          {v > 0.01 ? `${v.toFixed(0)} €` : '—'}
                        </td>
                      )
                    })}
                    <td className={`text-right px-3 py-2 tabular-nums font-medium ${
                      delta == null ? 'text-gray-400' : delta > 0 ? 'text-red-500' : delta < 0 ? 'text-emerald-500' : 'text-gray-400'
                    }`}>
                      {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
                    </td>
                  </tr>
                )
              })}
              <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 font-semibold">
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-800/30">Total</td>
                {sortedYears.map(y => {
                  const total = chartTypes.reduce((s, t) => s + (annualByType[t.id]?.[y] ?? 0), 0)
                  return <td key={y} className="text-right px-3 py-2 tabular-nums text-gray-800 dark:text-white">{total > 0.01 ? `${total.toFixed(0)} €` : '—'}</td>
                })}
                {(() => {
                  const tb = chartTypes.reduce((s, t) => s + (annualByType[t.id]?.[baseYear]   ?? 0), 0)
                  const tl = chartTypes.reduce((s, t) => s + (annualByType[t.id]?.[latestYear] ?? 0), 0)
                  const d  = tb > 0.01 ? ((tl - tb) / tb) * 100 : null
                  return (
                    <td className={`text-right px-3 py-2 tabular-nums font-medium ${d == null ? 'text-gray-400' : d > 0 ? 'text-red-500' : d < 0 ? 'text-emerald-500' : 'text-gray-400'}`}>
                      {d == null ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(1)}%`}
                    </td>
                  )
                })()}
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── MovementsPanel ────────────────────────────────────────────────────────────

function MovementsPanel({ movements, allTypes, groups, typeMap, typeToGroupMap, selectedTypeIds, onRefresh }: {
  movements: Movement[]
  allTypes: MovementType[]
  groups: Group[]
  typeMap: Record<number, MovementType>
  typeToGroupMap: Record<number, number>
  selectedTypeIds: Set<number>
  onRefresh: () => void
}) {
  const [open, setOpen]                       = useState(false)
  const [panelTypeFilter, setPanelTypeFilter] = useState<Set<number>>(new Set())
  const [filter, setFilter]                   = useState<AdvancedFilter>(EMPTY_FILTER)
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [sortField, setSortField]             = useState<SortField>('date')
  const [sortDir, setSortDir]                 = useState<SortDir>('desc')

  const selectedTypes = useMemo(() =>
    allTypes.filter(t => selectedTypeIds.has(t.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [allTypes, selectedTypeIds]
  )

  const togglePanelType = (id: number) => {
    setPanelTypeFilter(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const sortIcon = (field: SortField) => sortField === field
    ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
    : <ArrowUpDown className="w-3 h-3 opacity-40" />

  const filtered = useMemo(() => {
    let mvs = movements.filter(m => {
      if (m.movement_type_id == null || !selectedTypeIds.has(m.movement_type_id)) return false
      if (panelTypeFilter.size > 0 && !panelTypeFilter.has(m.movement_type_id)) return false
      return true
    })
    mvs = applyAdvancedFilter(mvs, filter, typeToGroupMap)
    return [...mvs].sort((a, b) => {
      let cmp = 0
      if      (sortField === 'date')   cmp = a.date.localeCompare(b.date)
      else if (sortField === 'name')   cmp = a.name.localeCompare(b.name)
      else if (sortField === 'amount') cmp = Math.abs(a.money) - Math.abs(b.money)
      else {
        const ta = typeMap[a.movement_type_id ?? 0]?.name ?? ''
        const tb = typeMap[b.movement_type_id ?? 0]?.name ?? ''
        cmp = ta.localeCompare(tb)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [movements, selectedTypeIds, panelTypeFilter, filter, typeToGroupMap, sortField, sortDir, typeMap])

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors rounded-xl">
        <span>Movimientos<span className="ml-2 text-[10px] font-normal text-gray-400">{filtered.length} registros</span></span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 dark:border-gray-800">
          {selectedTypes.length > 0 && (
            <div className="px-4 py-3 flex flex-wrap gap-1.5 border-b border-gray-50 dark:border-gray-800/60">
              {selectedTypes.map(t => (
                <button key={t.id} type="button" onClick={() => togglePanelType(t.id)}
                  className={`text-[11px] px-2 py-0.5 rounded-full font-medium transition-all ${
                    panelTypeFilter.size === 0 || panelTypeFilter.has(t.id) ? 'opacity-100' : 'opacity-25 hover:opacity-60'
                  }`}
                  style={{ background: t.color + '22', color: t.color, border: `1px solid ${t.color}44` }}>
                  {t.name}
                </button>
              ))}
            </div>
          )}
          <div className="px-4 py-2 border-b border-gray-50 dark:border-gray-800/60">
            <button type="button" onClick={() => setShowFilterPanel(v => !v)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
              <Filter className="w-3.5 h-3.5" />
              Filtro avanzado
              {filter.conditions.length > 0 && (
                <span className="bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                  {filter.conditions.length}
                </span>
              )}
            </button>
          </div>
          {showFilterPanel && (
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <FilterPanel filter={filter} onChange={setFilter} types={allTypes} groups={groups} />
            </div>
          )}
          <div className="flex items-center gap-3 px-4 py-1.5 bg-gray-50/70 dark:bg-gray-800/40 border-b border-gray-100 dark:border-gray-800 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            <button type="button" onClick={() => handleSort('date')} className="flex items-center gap-1 w-16 shrink-0 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              Fecha {sortIcon('date')}
            </button>
            <button type="button" onClick={() => handleSort('type')} className="flex items-center gap-1 w-20 shrink-0 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              Tipo {sortIcon('type')}
            </button>
            <button type="button" onClick={() => handleSort('name')} className="flex items-center gap-1 flex-1 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              Nombre {sortIcon('name')}
            </button>
            <button type="button" onClick={() => handleSort('amount')} className="flex items-center gap-1 justify-end w-20 shrink-0 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              {sortIcon('amount')} Importe
            </button>
            <span className="w-7 shrink-0" />
          </div>
          {filtered.map(mv => (
            <MovementRow key={mv.id} movement={mv}
              type={mv.movement_type_id != null ? typeMap[mv.movement_type_id] : undefined}
              onRefresh={onRefresh} />
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-6">
              No hay movimientos para los filtros aplicados.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ExpenseControl() {
  const qc = useQueryClient()

  const [selectedTypeIds, setSelectedTypeIds] = useState<Set<number>>(new Set())
  const [initialized, setInitialized]         = useState(false)
  const [chartKind, setChartKind]             = useState<ChartKind>('bar')
  const [stackMode, setStackMode]             = useState<StackMode>('stacked')
  const [showTable, setShowTable]             = useState(false)
  const [activeYears, setActiveYears]         = useState<number[]>([CURRENT_YEAR])
  const [customColors, setCustomColors]       = useState<Record<number, string>>(loadColors)
  const [typeOrderIds, setTypeOrderIds]       = useState<number[]>(loadTypeOrder)
  const [dragTypeId, setDragTypeId]           = useState<number | null>(null)
  const [dragOverId, setDragOverId]           = useState<number | null>(null)

  // ── Queries ───────────────────────────────────────────────────────────────────
  const { data: allTypes = [] } = useQuery({ queryKey: ['movement-types'], queryFn: getMovementTypes, staleTime: 5 * 60 * 1000 })
  const { data: groups   = [] } = useQuery({ queryKey: ['groups'],         queryFn: getGroups,        staleTime: 5 * 60 * 1000 })

  const allYears = useMemo(() => [...activeYears].sort((a, b) => a - b), [activeYears])

  const yearQueries = useQueries({
    queries: allYears.map(y => ({
      queryKey: ['movements-expense', y] as const,
      queryFn: () => getMovements({ year: y }),
      staleTime: 60_000,
    })),
  })

  const movementsByYear = useMemo(() => {
    const r: Record<number, Movement[]> = {}
    allYears.forEach((y, i) => { r[y] = yearQueries[i]?.data ?? [] })
    return r
  }, [allYears, yearQueries])

  const isLoading   = yearQueries.some(q => q.isLoading)
  const primaryYear = Math.max(...allYears)
  const nYears      = allYears.length

  // ── Init filter ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (initialized || allTypes.length === 0) return
    setInitialized(true)
    const saved = loadTypeFilter()
    setSelectedTypeIds(
      saved !== null
        ? new Set(saved.filter(id => allTypes.some(t => t.id === id)))
        : new Set(allTypes.filter(t => EXPENSE_CATEGORIES.has(t.category)).map(t => t.id))
    )
  }, [allTypes, initialized])

  // ── Derived ───────────────────────────────────────────────────────────────────
  const typeMap = useMemo(
    () => Object.fromEntries(allTypes.map(t => [t.id, t])) as Record<number, MovementType>,
    [allTypes]
  )

  const typesByCategory = useMemo(() => {
    const grouped: Record<string, MovementType[]> = {}
    for (const t of allTypes) {
      if (!grouped[t.category]) grouped[t.category] = []
      grouped[t.category].push(t)
    }
    for (const g of Object.values(grouped)) g.sort((a, b) => a.name.localeCompare(b.name))
    return grouped
  }, [allTypes])

  const typeToGroupMap = useMemo(
    () => Object.fromEntries(allTypes.map(t => [t.id, t.income_expense_group_id])) as Record<number, number>,
    [allTypes]
  )

  const chartTypes = useMemo(() => {
    const selected = allTypes.filter(t => selectedTypeIds.has(t.id))
    return [...selected].sort((a, b) => {
      const ia = typeOrderIds.indexOf(a.id), ib = typeOrderIds.indexOf(b.id)
      if (ia >= 0 && ib >= 0) return ia - ib
      if (ia >= 0) return -1
      if (ib >= 0) return  1
      return a.name.localeCompare(b.name)
    })
  }, [allTypes, selectedTypeIds, typeOrderIds])

  const { chartRows, annualByType } = useMemo(() => {
    const chartRows = MONTHS_SHORT.map(label => {
      const row: Record<string, string | number> = { month: label }
      for (const y of allYears) for (const t of chartTypes) row[`${t.id}_${y}`] = 0
      return row
    })
    const annualByType: Record<number, Record<number, number>> = {}
    for (const t of chartTypes) { annualByType[t.id] = {}; for (const y of allYears) annualByType[t.id][y] = 0 }

    for (const y of allYears) {
      for (const mv of movementsByYear[y] ?? []) {
        if (mv.movement_type_id == null || !selectedTypeIds.has(mv.movement_type_id) || !annualByType[mv.movement_type_id]) continue
        const mi = new Date(mv.date + 'T00:00:00').getMonth()
        const key = `${mv.movement_type_id}_${y}`
        chartRows[mi][key] = Math.round((Number(chartRows[mi][key]) + Math.abs(mv.money)) * 100) / 100
        annualByType[mv.movement_type_id][y] = (annualByType[mv.movement_type_id][y] ?? 0) + Math.abs(mv.money)
      }
    }
    return { chartRows, annualByType }
  }, [movementsByYear, allYears, chartTypes, selectedTypeIds])

  // Series: newest first so opacity gradation works (yi=0 = newest)
  const chartSeries = useMemo(() => {
    const newestFirst = [...allYears].sort((a, b) => b - a)
    return allYears.flatMap(y => {
      const yi = newestFirst.indexOf(y)
      return chartTypes.map(t => ({ key: `${t.id}_${y}`, color: typeColor(t, customColors), yi, y, t }))
    })
  }, [allYears, chartTypes, customColors])

  // Cumulative transform when stackMode === 'cumulative'
  const displayRows = useMemo(() => {
    if (stackMode !== 'cumulative') return chartRows
    return makeCumulative(chartRows, chartSeries.map(s => s.key))
  }, [chartRows, chartSeries, stackMode])

  // Summary for primary year
  const summaryData = useMemo(() => {
    const now    = new Date()
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const prev   = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prvKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
    const byType: Record<number, { cur: number; prev: number }> = {}
    for (const mv of movementsByYear[primaryYear] ?? []) {
      if (!mv.movement_type_id || !selectedTypeIds.has(mv.movement_type_id)) continue
      const k = mv.date.slice(0, 7)
      if (k !== curKey && k !== prvKey) continue
      if (!byType[mv.movement_type_id]) byType[mv.movement_type_id] = { cur: 0, prev: 0 }
      const a = Math.abs(mv.money)
      if (k === curKey) byType[mv.movement_type_id].cur  += a
      else              byType[mv.movement_type_id].prev += a
    }
    return Object.entries(byType)
      .map(([id, { cur, prev }]) => ({ type: typeMap[Number(id)], cur: Math.round(cur * 100) / 100, prev: Math.round(prev * 100) / 100 }))
      .filter(d => d.type)
      .sort((a, b) => b.cur - a.cur)
  }, [movementsByYear, primaryYear, selectedTypeIds, typeMap])

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const toggleType = (id: number) => {
    setSelectedTypeIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); saveTypeFilter(n); return n })
  }
  const toggleCategory = (cat: string) => {
    const ids    = (typesByCategory[cat] ?? []).map(t => t.id)
    const allSel = ids.every(id => selectedTypeIds.has(id))
    setSelectedTypeIds(prev => { const n = new Set(prev); ids.forEach(id => allSel ? n.delete(id) : n.add(id)); saveTypeFilter(n); return n })
  }
  const handleColorChange = (id: number, color: string) => {
    setCustomColors(prev => { const n = { ...prev, [id]: color }; saveColors(n); return n })
  }
  const toggleYear = (y: number) => {
    setActiveYears(prev => {
      if (prev.includes(y)) { if (prev.length === 1) return prev; return prev.filter(ay => ay !== y) }
      return [...prev, y].sort((a, b) => a - b)
    })
  }
  const handleChartKindChange = (kind: ChartKind) => {
    setChartKind(kind)
    setShowTable(false)
    if (kind === 'line' && stackMode === 'stacked') setStackMode('normal')
  }

  // Drag-to-reorder legend
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: number) => {
    setDragTypeId(id)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, id: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverId(id)
  }
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetId: number) => {
    e.preventDefault()
    if (dragTypeId == null || dragTypeId === targetId) { setDragTypeId(null); setDragOverId(null); return }
    const ids = chartTypes.map(t => t.id)
    const fi = ids.indexOf(dragTypeId), ti = ids.indexOf(targetId)
    if (fi < 0 || ti < 0) { setDragTypeId(null); setDragOverId(null); return }
    const newOrder = [...ids]; newOrder.splice(fi, 1); newOrder.splice(ti, 0, dragTypeId)
    setTypeOrderIds(newOrder); saveTypeOrder(newOrder)
    setDragTypeId(null); setDragOverId(null)
  }
  const handleDragEnd = () => { setDragTypeId(null); setDragOverId(null) }

  const onRefresh = () => allYears.forEach(y => qc.invalidateQueries({ queryKey: ['movements-expense', y] }))

  const fmtTooltip = (v: unknown, name: string | number | undefined): [string, string] => {
    const s   = String(name ?? ''), idx = s.indexOf('_')
    const tid = Number(idx >= 0 ? s.slice(0, idx) : s)
    const yr  = idx >= 0 ? s.slice(idx + 1) : ''
    const tName = typeMap[tid]?.name ?? s
    return [`${Number(v).toFixed(2)} €`, nYears > 1 && yr ? `${tName} (${yr})` : tName]
  }

  const axisProps = { tick: { fontSize: 11, fill: '#9ca3af' } as const, axisLine: false as const, tickLine: false as const }

  // Stack mode buttons depend on chart kind
  const stackModes: { id: StackMode; label: string }[] = chartKind === 'line'
    ? [{ id: 'normal', label: 'Normal' }, { id: 'cumulative', label: 'Acumulado' }]
    : [{ id: 'normal', label: 'Normal' }, { id: 'stacked', label: 'Apilado' }, { id: 'cumulative', label: 'Acumulado' }]

  const useStackId = stackMode !== 'normal'  // stacked AND cumulative use stackId

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-2">
        <ScrollText className="w-5 h-5 text-gray-600 dark:text-gray-400" strokeWidth={1.5} />
        <h1 className="text-xl font-bold text-gray-800 dark:text-white">Control de Gastos</h1>
        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400 ml-1" />}
      </div>

      {/* Type filter */}
      <TypeFilterDropdown
        typesByCategory={typesByCategory} selectedTypeIds={selectedTypeIds} customColors={customColors}
        onToggleType={toggleType} onToggleCategory={toggleCategory} onColorChange={handleColorChange}
      />

      {/* Summary cards */}
      {summaryData.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {summaryData.slice(0, 8).map(({ type, cur, prev }) => (
            <SummaryCard key={type.id} type={type} cur={cur} prev={prev} customColors={customColors} />
          ))}
        </div>
      )}

      {/* Chart section */}
      {chartTypes.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 space-y-4">

          {/* Controls row */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white pt-1">Evolución mensual</h2>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Chart kind icons */}
              <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                {CHART_KINDS.map(({ id, Icon }) => (
                  <button key={id} type="button" onClick={() => handleChartKindChange(id)}
                    title={id === 'bar' ? 'Barras' : id === 'area' ? 'Área' : 'Líneas'}
                    className={`px-2.5 py-2 transition-colors ${
                      chartKind === id && !showTable
                        ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900'
                        : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}>
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>

              {/* Stack mode buttons — only when not in table */}
              {!showTable && (
                <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-[11px]">
                  {stackModes.map(({ id, label }) => (
                    <button key={id} type="button" onClick={() => setStackMode(id)}
                      className={`px-2.5 py-1.5 transition-colors whitespace-nowrap ${
                        stackMode === id
                          ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 font-semibold'
                          : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* Table icon button */}
              <button type="button" onClick={() => setShowTable(v => !v)} title="Tabla"
                className={`px-2.5 py-2 rounded-lg border transition-colors ${
                  showTable
                    ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-800 dark:border-gray-100'
                    : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-white dark:bg-gray-900'
                }`}>
                <Table2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Year chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider shrink-0">Años:</span>
            <div className="flex gap-1.5 flex-wrap">
              {YEAR_OPTIONS.map(y => (
                <button key={y} type="button" onClick={() => toggleYear(y)}
                  className={`text-xs px-2.5 py-0.5 rounded-full font-medium border transition-all ${
                    activeYears.includes(y)
                      ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                      : 'bg-white dark:bg-gray-900 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-500'
                  }`}>
                  {y}
                </button>
              ))}
            </div>
          </div>

          {/* Legend + year opacity key */}
          {!showTable && (
            <div className="space-y-2">
              {/* Draggable type chips */}
              <div className="flex flex-wrap gap-x-1 gap-y-1">
                {chartTypes.map(t => (
                  <div key={t.id} draggable
                    onDragStart={e => handleDragStart(e, t.id)}
                    onDragOver={e => handleDragOver(e, t.id)}
                    onDrop={e => handleDrop(e, t.id)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-md cursor-grab active:cursor-grabbing select-none transition-all ${
                      dragTypeId === t.id ? 'opacity-40 ring-1 ring-blue-300' : ''
                    } ${
                      dragOverId === t.id && dragTypeId !== t.id ? 'ring-2 ring-blue-400 bg-blue-50 dark:bg-blue-950/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'
                    }`}>
                    <GripVertical className="w-3 h-3 text-gray-300 dark:text-gray-600 shrink-0" />
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: typeColor(t, customColors) }} />
                    {t.name}
                  </div>
                ))}
              </div>

              {/* Year opacity key — only when multiple years active */}
              {nYears > 1 && (
                <div className="flex items-center gap-3 flex-wrap pt-0.5">
                  {[...allYears].sort((a, b) => b - a).map((y, yi) => (
                    <span key={y} className="flex items-center gap-1.5 text-[11px] text-gray-400">
                      <span className="w-5 h-1.5 rounded-full inline-block bg-gray-500"
                        style={{ opacity: Math.max(0.28, 1 - yi * 0.22) }} />
                      {y}
                    </span>
                  ))}
                  {chartKind === 'line' && <span className="text-[10px] text-gray-400 italic">— años anteriores con línea discontinua</span>}
                </div>
              )}
            </div>
          )}

          {/* Chart or Table */}
          {showTable ? (
            <TableView chartTypes={chartTypes} chartRows={chartRows} annualByType={annualByType}
              allYears={allYears} customColors={customColors} />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                {chartKind === 'line' ? (
                  <LineChart data={displayRows} margin={{ top: 4, right: 8, left: -12, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,.12)" vertical={false} />
                    <XAxis dataKey="month" {...axisProps} />
                    <YAxis {...axisProps} tickFormatter={v => `${v}€`} width={48} />
                    <Tooltip formatter={fmtTooltip} contentStyle={TOOLTIP_STYLE} />
                    {chartSeries.map(s => (
                      <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color}
                        strokeWidth={s.yi === 0 ? 2 : 1.5}
                        strokeOpacity={nYears > 1 ? Math.max(0.4, 1 - s.yi * 0.22) : 1}
                        strokeDasharray={s.yi > 0 ? `${4 + s.yi * 2} 4` : undefined}
                        dot={false} activeDot={{ r: 4 }} connectNulls />
                    ))}
                  </LineChart>
                ) : chartKind === 'area' ? (
                  <AreaChart data={displayRows} margin={{ top: 4, right: 8, left: -12, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,.12)" vertical={false} />
                    <XAxis dataKey="month" {...axisProps} />
                    <YAxis {...axisProps} tickFormatter={v => `${v}€`} width={48} />
                    <Tooltip formatter={fmtTooltip} contentStyle={TOOLTIP_STYLE} />
                    {chartSeries.map(s => (
                      <Area key={s.key} type="monotone" dataKey={s.key}
                        stroke={s.color} fill={s.color} strokeWidth={1.5}
                        strokeOpacity={nYears > 1 ? Math.max(0.4, 1 - s.yi * 0.2) : 1}
                        fillOpacity={nYears > 1 ? Math.max(0.06, 0.22 - s.yi * 0.07) : 0.22}
                        stackId={useStackId ? String(s.y) : undefined}
                        connectNulls />
                    ))}
                  </AreaChart>
                ) : (
                  <BarChart data={displayRows} margin={{ top: 4, right: 8, left: -12, bottom: 4 }} barCategoryGap="22%">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,.12)" vertical={false} />
                    <XAxis dataKey="month" {...axisProps} />
                    <YAxis {...axisProps} tickFormatter={v => `${v}€`} width={48} />
                    <Tooltip formatter={fmtTooltip} contentStyle={TOOLTIP_STYLE} />
                    {chartSeries.map(s => (
                      <Bar key={s.key} dataKey={s.key} fill={s.color}
                        fillOpacity={nYears > 1 ? Math.max(0.35, 1 - s.yi * 0.22) : 1}
                        stackId={useStackId ? String(s.y) : undefined} />
                    ))}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Movements */}
      <MovementsPanel
        movements={movementsByYear[primaryYear] ?? []}
        allTypes={allTypes} groups={groups} typeMap={typeMap}
        typeToGroupMap={typeToGroupMap} selectedTypeIds={selectedTypeIds} onRefresh={onRefresh}
      />
    </div>
  )
}
