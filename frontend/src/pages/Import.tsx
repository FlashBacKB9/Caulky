import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Upload, ChevronRight, ChevronLeft, Check, AlertCircle, FileSpreadsheet, X } from 'lucide-react'
import { parseExcel, runImport, type ParseResult, type TypeMapping, type TypeAction, type DryRunResult, type RunResult } from '../api/importExcel'
import { getMovementTypes, type MovementType } from '../api/movementTypes'
import { getGroups, type Group } from '../api/groups'
import { getAccountsSummary, type Account } from '../api/accounts'

// ── API helpers ──────────────────────────────────────────────────────────────

type ColMap = { date: number | null; name: number | null; money: number | null; bankDate: number | null; type: number | null; notes: number | null; shared: number | null; sharedBetween: number | null; myShare: number | null }

const PREVIEW_ROWS = 5

// ── Step indicator ───────────────────────────────────────────────────────────

function Steps({ current, hasTypes }: { current: number; hasTypes: boolean }) {
  const steps = ['Archivo', 'Columnas', ...(hasTypes ? ['Tipos'] : []), 'Importar']
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((label, i) => {
        const n = i + 1
        const done = n < current
        const active = n === current
        return (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && <div className={`h-px w-8 ${done ? 'bg-gray-800 dark:bg-gray-200' : 'bg-gray-200 dark:bg-gray-700'}`} />}
            <div className="flex items-center gap-1.5">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                done ? 'bg-gray-800 dark:bg-white text-white dark:text-gray-900'
                  : active ? 'bg-gray-800 dark:bg-white text-white dark:text-gray-900 ring-4 ring-gray-200 dark:ring-gray-700'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
              }`}>
                {done ? <Check className="w-3 h-3" /> : n}
              </div>
              <span className={`text-sm font-medium ${active ? 'text-gray-800 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>{label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Step 1: Upload ───────────────────────────────────────────────────────────

function StepUpload({ onParsed }: { onParsed: (r: ParseResult) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (file: File) => {
    setError(null)
    setLoading(true)
    try {
      const result = await parseExcel(file)
      onParsed(result)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Error al procesar el archivo'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !loading && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-colors ${
          dragging ? 'border-gray-400 bg-gray-50 dark:bg-gray-800'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900'
        }`}
      >
        {loading ? (
          <div className="space-y-3">
            <div className="w-12 h-12 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-500">Procesando archivo...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <FileSpreadsheet className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600" strokeWidth={1} />
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Arrastra tu Excel aquí</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">o haz clic para seleccionar · .xlsx · .csv</p>
            </div>
          </div>
        )}
        <input ref={inputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </div>
      {error && (
        <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  )
}

// ── Step 2: Map columns ──────────────────────────────────────────────────────

const FIELDS = [
  { key: 'date',          label: 'Fecha',              required: true },
  { key: 'name',          label: 'Nombre',              required: true },
  { key: 'money',         label: 'Importe',             required: true },
  { key: 'bankDate',      label: 'Fecha banco',         required: false },
  { key: 'type',          label: 'Tipo de movimiento',  required: false },
  { key: 'notes',         label: 'Notas',               required: false },
  { key: 'shared',        label: 'Compartido',          required: false },
  { key: 'sharedBetween', label: 'Nº personas',         required: false },
  { key: 'myShare',       label: 'Mi importe',          required: false },
] as const

function StepColumns({
  parsed, colMap, setColMap, accounts, accountId, setAccountId, onNext, onBack,
}: {
  parsed: ParseResult
  colMap: ColMap
  setColMap: (c: ColMap) => void
  accounts: Account[]
  accountId: number | null
  setAccountId: (id: number | null) => void
  onNext: () => void
  onBack: () => void
}) {
  const valid = colMap.date !== null && colMap.name !== null && colMap.money !== null

  const set = (key: keyof ColMap, val: number | null) => setColMap({ ...colMap, [key]: val })

  const preview = parsed.rows.slice(0, PREVIEW_ROWS)
  const activeCols = [colMap.date, colMap.name, colMap.money, colMap.type, colMap.notes, colMap.shared, colMap.sharedBetween, colMap.myShare].filter(c => c !== null) as number[]

  return (
    <div className="space-y-6">
      {/* Field mapping */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Asigna cada campo a una columna del Excel</p>
        </div>
        <div className="divide-y divide-gray-50 dark:divide-gray-800">
          {FIELDS.map(field => (
            <div key={field.key} className="flex items-center px-5 py-3 gap-4">
              <div className="w-44 shrink-0">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{field.label}</span>
                {field.required && <span className="text-red-400 ml-1 text-xs">*</span>}
              </div>
              <select
                value={colMap[field.key] ?? ''}
                onChange={e => set(field.key, e.target.value === '' ? null : Number(e.target.value))}
                className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
              >
                <option value="">— Sin asignar —</option>
                {parsed.columns.map((col, i) => (
                  <option key={i} value={i}>{col}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Account selector */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Cuenta destino</p>
        </div>
        <div className="px-5 py-4 flex items-center gap-4">
          <span className="w-44 shrink-0 text-sm font-medium text-gray-700 dark:text-gray-300">Asignar a cuenta</span>
          {(() => {
            const selected = accounts.find(a => a.id === accountId)
            return (
              <div className="relative flex-1">
                {selected && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: selected.color }} />
                )}
                <select
                  value={accountId ?? ''}
                  onChange={e => setAccountId(e.target.value ? Number(e.target.value) : null)}
                  className={`w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg py-1.5 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 ${selected ? 'pl-8' : 'pl-3'}`}
                >
                  <option value="">— Sin cuenta —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Preview table */}
      {preview.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Previsualización ({parsed.total} filas)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {parsed.columns.map((col, i) => (
                    <th key={i} className={`px-3 py-2 text-left font-medium border-b border-gray-50 dark:border-gray-800 ${activeCols.includes(i) ? 'text-gray-800 dark:text-white bg-gray-50 dark:bg-gray-800' : 'text-gray-400 dark:text-gray-600'}`}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, ri) => (
                  <tr key={ri} className="border-t border-gray-50 dark:border-gray-800">
                    {row.map((cell, ci) => (
                      <td key={ci} className={`px-3 py-1.5 whitespace-nowrap ${activeCols.includes(ci) ? 'text-gray-800 dark:text-gray-200' : 'text-gray-300 dark:text-gray-600'}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
          <ChevronLeft className="w-4 h-4" /> Atrás
        </button>
        <button onClick={onNext} disabled={!valid}
          className="flex items-center gap-1.5 px-5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          Siguiente <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Map types ────────────────────────────────────────────────────────

function StepTypes({
  uniqueTypes, types, groups, typeMap, setTypeMap, onNext, onBack,
}: {
  uniqueTypes: { name: string; count: number }[]
  types: MovementType[]
  groups: Group[]
  typeMap: Record<string, TypeMapping>
  setTypeMap: (m: Record<string, TypeMapping>) => void
  onNext: () => void
  onBack: () => void
}) {
  const existingNames = new Set(types.map(t => t.name))

  const set = (name: string, mapping: TypeMapping) =>
    setTypeMap({ ...typeMap, [name]: mapping })

  const pendingCount = uniqueTypes.filter(({ name }) => {
    const m = typeMap[name]
    if (!m) return true
    if (m.action === 'existing' && !m.type_id) return true
    if (m.action === 'create' && !m.group_id) return true
    return false
  }).length

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            {uniqueTypes.length} tipos encontrados en el archivo
          </p>
          {pendingCount === 0 && (
            <span className="text-xs text-green-600 dark:text-green-400 font-medium">Todo resuelto</span>
          )}
        </div>

        <div className="divide-y divide-gray-50 dark:divide-gray-800">
          {uniqueTypes.map(({ name, count }) => {
            const isAuto = existingNames.has(name)
            const mapping = typeMap[name] ?? (isAuto ? { action: 'auto' as TypeAction } : { action: 'skip' as TypeAction })

            return (
              <div key={name} className="px-5 py-3 space-y-2">
                <div className="flex items-center gap-3">
                  {/* Name + count */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{name}</span>
                    <span className="ml-2 text-xs text-gray-400">{count} movimiento{count !== 1 ? 's' : ''}</span>
                    {isAuto && mapping.action === 'auto' && (
                      <span className="ml-2 text-xs text-green-600 dark:text-green-400 font-medium">· coincidencia automática</span>
                    )}
                  </div>

                  {/* Action selector */}
                  <select
                    value={mapping.action}
                    onChange={e => {
                      const action = e.target.value as TypeAction
                      set(name, { action })
                    }}
                    className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
                  >
                    {isAuto && <option value="auto">Usar coincidencia</option>}
                    <option value="skip">Ignorar</option>
                    <option value="existing">Mapear a existente</option>
                    <option value="create">Crear nuevo</option>
                  </select>
                </div>

                {/* Conditional sub-selector */}
                {mapping.action === 'existing' && (
                  <div className="pl-4">
                    <select
                      value={mapping.type_id ?? ''}
                      onChange={e => set(name, { action: 'existing', type_id: Number(e.target.value) || undefined })}
                      className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
                    >
                      <option value="">— Selecciona tipo existente —</option>
                      {types.map(t => (
                        <option key={t.id} value={t.id}>{t.category} / {t.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {mapping.action === 'create' && (
                  <div className="pl-4">
                    <select
                      value={mapping.group_id ?? ''}
                      onChange={e => set(name, { action: 'create', group_id: Number(e.target.value) || undefined })}
                      className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
                    >
                      <option value="">— Selecciona grupo —</option>
                      {groups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
          <ChevronLeft className="w-4 h-4" /> Atrás
        </button>
        <button onClick={onNext}
          className="flex items-center gap-1.5 px-5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors">
          Siguiente <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ── Step 4: Preview + Import ─────────────────────────────────────────────────

function StepImport({
  parsed, colMap, typeMap, accountId, onCancel, onDone,
}: {
  parsed: ParseResult
  colMap: ColMap
  typeMap: Record<string, TypeMapping>
  accountId: number | null
  onCancel: () => void
  onDone: () => void
}) {
  const [preview, setPreview] = useState<DryRunResult | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)

  const baseParams = {
    session_id: parsed.session_id,
    col_date: colMap.date!,
    col_name: colMap.name!,
    col_money: colMap.money!,
    col_bank_date: colMap.bankDate ?? undefined,
    col_type: colMap.type ?? undefined,
    col_notes: colMap.notes ?? undefined,
    col_shared: colMap.shared ?? undefined,
    col_shared_between: colMap.sharedBetween ?? undefined,
    col_my_share: colMap.myShare ?? undefined,
    account_id: accountId ?? undefined,
    type_map: typeMap,
  }

  useEffect(() => {
    setLoadingPreview(true)
    runImport({ ...baseParams, dry_run: true })
      .then(r => setPreview(r as DryRunResult))
      .finally(() => setLoadingPreview(false))
  }, [])

  const doImport = async (skipDuplicates: boolean) => {
    setImporting(true)
    try {
      const res = await runImport({ ...baseParams, skip_duplicates: skipDuplicates })
      setResult(res as RunResult)
    } finally {
      setImporting(false)
    }
  }

  const fmt = (v: number) => v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })

  if (result) {
    return (
      <div className="space-y-6">
        <div className={`rounded-2xl border p-6 text-center ${result.errors.length === 0 ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' : 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800'}`}>
          <Check className={`w-10 h-10 mx-auto mb-3 ${result.errors.length === 0 ? 'text-green-500' : 'text-yellow-500'}`} />
          <p className="text-xl font-bold text-gray-800 dark:text-white">{result.imported} movimientos importados</p>
          {result.skipped > 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{result.skipped} duplicados omitidos</p>
          )}
          {result.errors.length > 0 && (
            <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">{result.errors.length} filas con error</p>
          )}
        </div>
        {result.errors.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 space-y-1 max-h-40 overflow-y-auto">
            {result.errors.map((e, i) => <p key={i} className="text-xs text-red-500">{e}</p>)}
          </div>
        )}
        <button onClick={onDone} className="w-full px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors">
          Ir a Movimientos
        </button>
      </div>
    )
  }

  if (loadingPreview) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-10 h-10 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Analizando el archivo...</p>
      </div>
    )
  }

  const ok = preview?.ok ?? []
  const errors = preview?.errors ?? []

  return (
    <div className="space-y-5">
      {/* OK rows */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            Movimientos a importar
          </p>
          <span className="text-xs font-semibold text-green-600 dark:text-green-400">{ok.length} filas</span>
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
          {ok.map((row, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-2 text-sm">
              <span className="text-gray-400 dark:text-gray-500 shrink-0 w-24 font-mono text-xs">{row.date}</span>
              <span className="flex-1 text-gray-700 dark:text-gray-300 truncate">{row.name}</span>
              <span className={`font-mono shrink-0 text-xs font-semibold ${row.money >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                {fmt(row.money)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Error rows */}
      {errors.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-red-100 dark:border-red-900 overflow-hidden">
          <div className="px-5 py-3 border-b border-red-50 dark:border-red-900 bg-red-50 dark:bg-red-950/40 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-red-500">Filas con error</p>
            <span className="text-xs font-semibold text-red-500">{errors.length} filas</span>
          </div>
          <div className="max-h-40 overflow-y-auto divide-y divide-red-50 dark:divide-red-900/30">
            {errors.map((e, i) => (
              <div key={i} className="flex items-start gap-2 px-5 py-2">
                <X className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                <span className="text-xs text-red-500">{e}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onCancel} disabled={importing}
          className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40">
          Cancelar
        </button>
        <div className="flex-1" />
        <button onClick={() => doImport(true)} disabled={importing || ok.length === 0}
          className="flex items-center gap-1.5 px-5 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors">
          {importing ? <div className="w-3.5 h-3.5 border-2 border-gray-400/30 border-t-gray-600 rounded-full animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Importar sin duplicados
        </button>
        <button onClick={() => doImport(false)} disabled={importing || ok.length === 0}
          className="flex items-center gap-1.5 px-5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 transition-colors">
          {importing ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Importar todo
        </button>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Import() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [colMap, setColMap] = useState<ColMap>({ date: null, name: null, money: null, bankDate: null, type: null, notes: null, shared: null, sharedBetween: null, myShare: null })
  const [typeMap, setTypeMap] = useState<Record<string, TypeMapping>>({})
  const [accountId, setAccountId] = useState<number | null>(null)

  const { data: types = [] } = useQuery({ queryKey: ['movement-types'], queryFn: getMovementTypes })
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: getGroups })
  const { data: accountsSummary } = useQuery({ queryKey: ['accounts-summary'], queryFn: getAccountsSummary })
  const accounts = accountsSummary?.accounts ?? []

  const uniqueTypes: { name: string; count: number }[] = (() => {
    if (!parsed || colMap.type === null) return []
    const counts: Record<string, number> = {}
    for (const row of parsed.rows) {
      const val = (row[colMap.type!] ?? '').trim()
      if (val) counts[val] = (counts[val] ?? 0) + 1
    }
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
  })()

  const hasTypes = colMap.type !== null && uniqueTypes.length > 0

  const goToStep2 = (result: ParseResult) => { setParsed(result); setStep(2) }

  const goToStep3or4 = () => {
    if (hasTypes) {
      // Pre-fill type map with auto-matches
      const existingNames = new Set(types.map(t => t.name))
      const initial: Record<string, TypeMapping> = {}
      for (const { name } of uniqueTypes) {
        initial[name] = existingNames.has(name) ? { action: 'auto' } : { action: 'skip' }
      }
      setTypeMap(prev => {
        const merged = { ...initial }
        for (const [k, v] of Object.entries(prev)) if (k in initial) merged[k] = v
        return merged
      })
      setStep(3)
    } else {
      setStep(4)
    }
  }

  const goToStep4 = () => setStep(4)

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Importar Excel</h1>
        <p className="text-sm text-gray-400 mt-1">Importa movimientos desde un archivo .xlsx</p>
      </div>

      <Steps current={step} hasTypes={hasTypes} />

      {step === 1 && <StepUpload onParsed={goToStep2} />}
      {step === 2 && parsed && (
        <StepColumns
          parsed={parsed}
          colMap={colMap}
          setColMap={setColMap}
          accounts={accounts}
          accountId={accountId}
          setAccountId={setAccountId}
          onNext={goToStep3or4}
          onBack={() => { setParsed(null); setStep(1) }}
        />
      )}
      {step === 3 && parsed && (
        <StepTypes
          uniqueTypes={uniqueTypes}
          types={types}
          groups={groups}
          typeMap={typeMap}
          setTypeMap={setTypeMap}
          onNext={goToStep4}
          onBack={() => setStep(2)}
        />
      )}
      {step === 4 && parsed && (
        <StepImport
          parsed={parsed}
          colMap={colMap}
          typeMap={typeMap}
          accountId={accountId}
          onCancel={() => { setParsed(null); setStep(1) }}
          onDone={() => navigate('/movements')}
        />
      )}
    </div>
  )
}
