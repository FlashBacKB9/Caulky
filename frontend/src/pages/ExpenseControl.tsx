import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import {
  ScrollText, Upload, FileText, X, TrendingUp, TrendingDown,
  Minus, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react'
import {
  getMovements, uploadMovementFile, deleteMovementFile,
  movementFileDownloadUrl, type Movement, type MovementFile,
} from '../api/movements'
import { getMovementTypes, type MovementType } from '../api/movementTypes'

// ── Constants ─────────────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = new Set([
  'Gasto Casa', 'Transporte', 'Salud', 'Regalos',
  'Entretenimiento', 'Suscripciones', 'Vacaciones',
  'Vida Diaria', 'Coche', 'Moto',
])

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2]

const TOOLTIP_STYLE = {
  fontSize: 12, borderRadius: 8, border: 'none',
  boxShadow: '0 2px 8px rgba(0,0,0,.12)',
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({ type, cur, prev }: { type: MovementType; cur: number; prev: number }) {
  const delta = cur - prev
  const hasPrev = prev > 0.01

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: type.color }} />
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 truncate">{type.name}</span>
      </div>
      <p className="text-lg font-bold text-gray-900 dark:text-white">{cur.toFixed(2)} €</p>
      {hasPrev && (
        <div className={`flex items-center gap-1 mt-1 text-[11px] font-medium ${
          delta >  0.01 ? 'text-red-500' :
          delta < -0.01 ? 'text-emerald-500' :
          'text-gray-400'
        }`}>
          {delta >  0.01 ? <TrendingUp  className="w-3 h-3" /> :
           delta < -0.01 ? <TrendingDown className="w-3 h-3" /> :
           <Minus className="w-3 h-3" />}
          {delta > 0 ? '+' : ''}{delta.toFixed(2)} € vs mes ant.
        </div>
      )}
      {!hasPrev && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Sin datos mes anterior</p>
      )}
    </div>
  )
}

// ── File pill ─────────────────────────────────────────────────────────────────

function FilePill({
  file,
  onDelete,
}: {
  file: MovementFile
  onDelete: () => void
}) {
  return (
    <span className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-full text-[11px] pl-1.5 pr-1 py-0.5">
      <FileText className="w-3 h-3 shrink-0" />
      <a
        href={movementFileDownloadUrl(file.id)}
        target="_blank"
        rel="noreferrer"
        className="hover:underline max-w-[120px] truncate"
      >
        {file.original_name}
      </a>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="ml-0.5 text-blue-400 hover:text-red-500 transition-colors"
        title="Eliminar archivo"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}

// ── Movement row ──────────────────────────────────────────────────────────────

function MovementRow({
  movement,
  type,
  onRefresh,
}: {
  movement: Movement
  type: MovementType | undefined
  onRefresh: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const deleteMut = useMutation({
    mutationFn: deleteMovementFile,
    onSuccess: onRefresh,
  })

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadMovementFile(movement.id, file)
      onRefresh()
      setExpanded(true)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const dateStr = movement.date
    ? new Date(movement.date + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—'

  const hasFiles = movement.files.length > 0

  return (
    <div className="border-b border-gray-50 dark:border-gray-800/60 last:border-0">
      <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
        {/* Date */}
        <span className="text-xs text-gray-400 dark:text-gray-500 w-16 shrink-0">{dateStr}</span>

        {/* Type badge */}
        {type ? (
          <span
            className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
            style={{ background: type.color + '22', color: type.color }}
          >
            {type.name}
          </span>
        ) : (
          <span className="w-20 shrink-0" />
        )}

        {/* Name */}
        <span className="flex-1 min-w-0 text-xs text-gray-700 dark:text-gray-300 truncate">{movement.name}</span>

        {/* File count badge */}
        {hasFiles && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-[10px] font-medium text-blue-500 bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 rounded-full hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors shrink-0"
          >
            <FileText className="w-2.5 h-2.5" />
            {movement.files.length}
            {expanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          </button>
        )}

        {/* Amount */}
        <span className="text-xs font-semibold text-gray-800 dark:text-white whitespace-nowrap shrink-0 w-20 text-right">
          {Math.abs(movement.money).toFixed(2)} €
        </span>

        {/* Upload button */}
        <div className="shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Adjuntar factura"
            className="p-1 text-gray-300 dark:text-gray-600 hover:text-blue-500 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
          >
            {uploading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Upload className="w-3.5 h-3.5" />
            }
          </button>
        </div>
      </div>

      {/* Expanded files */}
      {expanded && hasFiles && (
        <div className="px-4 pb-2.5 flex flex-wrap gap-1.5 bg-blue-50/30 dark:bg-blue-950/10">
          {movement.files.map(f => (
            <FilePill
              key={f.id}
              file={f}
              onDelete={() => deleteMut.mutate(f.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ExpenseControl() {
  const qc = useQueryClient()
  const [year, setYear] = useState(CURRENT_YEAR)
  const [selectedTypeIds, setSelectedTypeIds] = useState<Set<number>>(new Set())
  const [initialized, setInitialized] = useState(false)
  const [chartMode, setChartMode] = useState<'bar' | 'line'>('bar')

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: allTypes = [] } = useQuery({
    queryKey: ['movement-types'],
    queryFn: getMovementTypes,
    staleTime: 5 * 60 * 1000,
  })

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['movements-expense', year],
    queryFn: () => getMovements({ year }),
  })

  // ── Initialize selection to expense categories ───────────────────────────────
  useEffect(() => {
    if (initialized || allTypes.length === 0) return
    setInitialized(true)
    setSelectedTypeIds(new Set(
      allTypes.filter(t => EXPENSE_CATEGORIES.has(t.category)).map(t => t.id)
    ))
  }, [allTypes, initialized])

  // ── Derived data ─────────────────────────────────────────────────────────────
  const typeMap = useMemo(
    () => Object.fromEntries(allTypes.map(t => [t.id, t])) as Record<number, MovementType>,
    [allTypes]
  )

  const typesByCategory = useMemo(() => {
    const groups: Record<string, MovementType[]> = {}
    for (const t of allTypes) {
      if (!groups[t.category]) groups[t.category] = []
      groups[t.category].push(t)
    }
    // Sort types within each group by name
    for (const g of Object.values(groups)) g.sort((a, b) => a.name.localeCompare(b.name))
    return groups
  }, [allTypes])

  // Movements filtered by selected types, newest first
  const filtered = useMemo(() =>
    movements
      .filter(m => m.movement_type_id != null && selectedTypeIds.has(m.movement_type_id))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [movements, selectedTypeIds]
  )

  // Monthly chart: one series per selected type
  const { chartData, chartTypes } = useMemo(() => {
    const chartTypes = allTypes
      .filter(t => selectedTypeIds.has(t.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 12)

    const months = Array.from({ length: 12 }, (_, i) => ({
      key: `${year}-${String(i + 1).padStart(2, '0')}`,
      label: new Date(year, i, 1).toLocaleDateString('es-ES', { month: 'short' }),
    }))

    const agg: Record<string, Record<number, number>> = {}
    for (const m of months) agg[m.key] = {}

    for (const mv of filtered) {
      const key = mv.date.slice(0, 7)
      if (!agg[key] || mv.movement_type_id == null) continue
      agg[key][mv.movement_type_id] = (agg[key][mv.movement_type_id] ?? 0) + Math.abs(mv.money)
    }

    const chartData = months.map(m => {
      const row: Record<string, string | number> = { month: m.label }
      for (const t of chartTypes) row[String(t.id)] = Math.round((agg[m.key][t.id] ?? 0) * 100) / 100
      return row
    })

    return { chartData, chartTypes }
  }, [filtered, allTypes, selectedTypeIds, year])

  // Current + previous month summaries
  const summaryData = useMemo(() => {
    const now = new Date()
    const curKey  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const prev    = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`

    const byType: Record<number, { cur: number; prev: number }> = {}
    for (const mv of movements) {
      if (!mv.movement_type_id || !selectedTypeIds.has(mv.movement_type_id)) continue
      const key = mv.date.slice(0, 7)
      if (key !== curKey && key !== prevKey) continue
      if (!byType[mv.movement_type_id]) byType[mv.movement_type_id] = { cur: 0, prev: 0 }
      const a = Math.abs(mv.money)
      if (key === curKey) byType[mv.movement_type_id].cur += a
      else              byType[mv.movement_type_id].prev += a
    }

    return Object.entries(byType)
      .map(([id, { cur, prev }]) => ({
        type: typeMap[Number(id)],
        cur:  Math.round(cur  * 100) / 100,
        prev: Math.round(prev * 100) / 100,
      }))
      .filter(d => d.type)
      .sort((a, b) => b.cur - a.cur)
  }, [movements, selectedTypeIds, typeMap])

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const toggleType = (id: number) => {
    setSelectedTypeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleCategory = (cat: string) => {
    const ids = (typesByCategory[cat] ?? []).map(t => t.id)
    const allSelected = ids.every(id => selectedTypeIds.has(id))
    setSelectedTypeIds(prev => {
      const next = new Set(prev)
      ids.forEach(id => allSelected ? next.delete(id) : next.add(id))
      return next
    })
  }

  const onRefresh = () => qc.invalidateQueries({ queryKey: ['movements-expense', year] })

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-gray-600 dark:text-gray-400" strokeWidth={1.5} />
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">Control de Gastos</h1>
        </div>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400"
        >
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Type filter grouped by category */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 space-y-4">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Filtrar por tipo de gasto</p>
        {Object.entries(typesByCategory).map(([cat, types]) => {
          const allSel  = types.every(t => selectedTypeIds.has(t.id))
          const someSel = types.some(t => selectedTypeIds.has(t.id))
          return (
            <div key={cat} className="space-y-2">
              <button
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${
                  allSel  ? 'text-gray-700 dark:text-gray-200' :
                  someSel ? 'text-gray-500 dark:text-gray-400' :
                            'text-gray-300 dark:text-gray-600'
                }`}
              >
                {cat}
              </button>
              <div className="flex flex-wrap gap-1.5">
                {types.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleType(t.id)}
                    className={`text-xs px-2.5 py-0.5 rounded-full font-medium transition-all ${
                      selectedTypeIds.has(t.id) ? 'opacity-100' : 'opacity-25 hover:opacity-60'
                    }`}
                    style={{ background: t.color + '22', color: t.color, border: `1px solid ${t.color}44` }}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary cards */}
      {summaryData.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {summaryData.slice(0, 8).map(({ type, cur, prev }) => (
            <SummaryCard key={type.id} type={type} cur={cur} prev={prev} />
          ))}
        </div>
      )}

      {/* Monthly chart */}
      {chartTypes.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
              Evolución mensual · {year}
            </h2>
            <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-[11px]">
              {(['bar', 'line'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setChartMode(mode)}
                  className={`px-2.5 py-1 transition-colors ${
                    chartMode === mode
                      ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 font-semibold'
                      : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {mode === 'bar' ? 'Barras' : 'Líneas'}
                </button>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3">
            {chartTypes.map(t => (
              <span key={t.id} className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: t.color }} />
                {t.name}
              </span>
            ))}
          </div>

          <div className="h-64">
            {chartMode === 'bar' ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 4 }} barCategoryGap="22%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,.15)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}€`} width={48} />
                  <Tooltip
                    formatter={(v: unknown, key: string) => [
                      `${Number(v).toFixed(2)} €`,
                      typeMap[Number(key)]?.name ?? key,
                    ]}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  {chartTypes.map(t => (
                    <Bar key={t.id} dataKey={String(t.id)} stackId="stack" fill={t.color} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,.15)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}€`} width={48} />
                  <Tooltip
                    formatter={(v: unknown, key: string) => [
                      `${Number(v).toFixed(2)} €`,
                      typeMap[Number(key)]?.name ?? key,
                    ]}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  {chartTypes.map(t => (
                    <Line
                      key={t.id}
                      type="monotone"
                      dataKey={String(t.id)}
                      stroke={t.color}
                      strokeWidth={2}
                      dot={{ fill: t.color, r: 3, strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* Movement list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : filtered.length > 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
              Movimientos
            </h2>
            <span className="text-xs text-gray-400">{filtered.length} registros · {year}</span>
          </div>
          {/* Column headers */}
          <div className="flex items-center gap-3 px-4 py-1.5 bg-gray-50/70 dark:bg-gray-800/40 border-b border-gray-100 dark:border-gray-800 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            <span className="w-16 shrink-0">Fecha</span>
            <span className="w-20 shrink-0">Tipo</span>
            <span className="flex-1">Nombre</span>
            <span className="w-20 text-right shrink-0">Importe</span>
            <span className="w-7 shrink-0" />
          </div>
          {filtered.map(mv => (
            <MovementRow
              key={mv.id}
              movement={mv}
              type={mv.movement_type_id != null ? typeMap[mv.movement_type_id] : undefined}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      ) : selectedTypeIds.size > 0 ? (
        <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
          No hay movimientos para los tipos seleccionados en {year}.
        </p>
      ) : (
        <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
          Selecciona uno o más tipos de gasto para ver los datos.
        </p>
      )}
    </div>
  )
}
