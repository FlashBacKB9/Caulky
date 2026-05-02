import { useEffect, useRef, useState } from 'react'
import { X, Plus, ChevronDown } from 'lucide-react'
import type { MovementType } from '../api/movementTypes'
import type { Group } from '../api/groups'
import type { Movement } from '../api/movements'

// ── Types ─────────────────────────────────────────────────────────────────────

export type FilterField = 'name' | 'notes' | 'amount' | 'date' | 'bank_date' | 'group' | 'type' | 'paid' | 'no_count'
export type FilterOp = 'contains' | 'not_contains' | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'empty' | 'set'

export interface FilterCondition {
  id: string
  field: FilterField
  op: FilterOp
  value: string
  values: string[]
}

export interface AdvancedFilter {
  combinator: 'and' | 'or'
  conditions: FilterCondition[]
}

export const EMPTY_FILTER: AdvancedFilter = { combinator: 'and', conditions: [] }

// ── Apply ─────────────────────────────────────────────────────────────────────

function isConditionActive(c: FilterCondition): boolean {
  if (c.op === 'empty' || c.op === 'set') return true
  if (c.field === 'group' || c.field === 'type') return c.values.length > 0
  return c.value.trim() !== ''
}

function matchCond(
  m: Movement,
  c: FilterCondition,
  typeToGroupMap: Record<number, number>,
): boolean {
  switch (c.field) {
    case 'name': {
      const v = m.name.toLowerCase(), q = c.value.toLowerCase()
      if (c.op === 'contains')     return v.includes(q)
      if (c.op === 'not_contains') return !v.includes(q)
      if (c.op === 'eq')           return v === q
      return true
    }
    case 'notes': {
      const n = (m.notes ?? '').toLowerCase()
      if (c.op === 'contains')     return n.includes(c.value.toLowerCase())
      if (c.op === 'not_contains') return !n.includes(c.value.toLowerCase())
      if (c.op === 'empty')        return !m.notes
      if (c.op === 'set')          return !!m.notes
      return true
    }
    case 'amount': {
      const v = parseFloat(c.value)
      if (c.op === 'eq')  return m.dinero === v
      if (c.op === 'neq') return m.dinero !== v
      if (c.op === 'gt')  return m.dinero > v
      if (c.op === 'gte') return m.dinero >= v
      if (c.op === 'lt')  return m.dinero < v
      if (c.op === 'lte') return m.dinero <= v
      return true
    }
    case 'date':
    case 'bank_date': {
      const val = c.field === 'date' ? m.date : (m.bank_date ?? '')
      if (c.op === 'empty') return !val
      if (c.op === 'set')   return !!val
      if (c.op === 'eq')    return val === c.value
      if (c.op === 'gt')    return val > c.value
      if (c.op === 'gte')   return val >= c.value
      if (c.op === 'lt')    return val < c.value
      if (c.op === 'lte')   return val <= c.value
      return true
    }
    case 'group': {
      const groupId = String(typeToGroupMap[m.movement_type_id ?? -1] ?? '')
      if (c.op === 'empty')  return !m.movement_type_id
      if (c.op === 'set')    return !!m.movement_type_id
      if (c.op === 'in')     return c.values.includes(groupId)
      if (c.op === 'not_in') return !c.values.includes(groupId)
      return true
    }
    case 'type': {
      const id = String(m.movement_type_id ?? '')
      if (c.op === 'empty')  return !m.movement_type_id
      if (c.op === 'set')    return !!m.movement_type_id
      if (c.op === 'in')     return c.values.includes(id)
      if (c.op === 'not_in') return !c.values.includes(id)
      return true
    }
    case 'paid':
      if (c.op === 'eq')  return m.paid === (c.value === 'true')
      if (c.op === 'neq') return m.paid !== (c.value === 'true')
      return true
    case 'no_count':
      if (c.op === 'eq')  return m.no_count === (c.value === 'true')
      if (c.op === 'neq') return m.no_count !== (c.value === 'true')
      return true
    default: return true
  }
}

export function applyAdvancedFilter(
  movements: Movement[],
  filter: AdvancedFilter,
  typeToGroupMap: Record<number, number> = {},
): Movement[] {
  const active = filter.conditions.filter(isConditionActive)
  if (active.length === 0) return movements
  return movements.filter(m => {
    const results = active.map(c => matchCond(m, c, typeToGroupMap))
    return filter.combinator === 'and' ? results.every(Boolean) : results.some(Boolean)
  })
}

// ── Config ────────────────────────────────────────────────────────────────────

const FIELDS: { value: FilterField; label: string }[] = [
  { value: 'name',      label: 'Nombre' },
  { value: 'notes',     label: 'Notas' },
  { value: 'amount',    label: 'Importe' },
  { value: 'date',      label: 'Fecha' },
  { value: 'bank_date', label: 'Fecha banco' },
  { value: 'group',     label: 'Tipo' },
  { value: 'type',      label: 'Subtipo' },
  { value: 'paid',      label: 'Pagado' },
  { value: 'no_count',  label: 'No contar' },
]

const OPS: Record<FilterField, { value: FilterOp; label: string }[]> = {
  name:      [{ value: 'contains', label: 'contiene' }, { value: 'not_contains', label: 'no contiene' }, { value: 'eq', label: 'es igual a' }],
  notes:     [{ value: 'contains', label: 'contiene' }, { value: 'not_contains', label: 'no contiene' }, { value: 'empty', label: 'está vacío' }, { value: 'set', label: 'tiene valor' }],
  amount:    [{ value: 'gt', label: 'mayor que' }, { value: 'gte', label: 'mayor o igual' }, { value: 'lt', label: 'menor que' }, { value: 'lte', label: 'menor o igual' }, { value: 'eq', label: 'igual a' }, { value: 'neq', label: 'distinto de' }],
  date:      [{ value: 'gte', label: 'desde' }, { value: 'lte', label: 'hasta' }, { value: 'eq', label: 'exactamente' }, { value: 'empty', label: 'vacío' }, { value: 'set', label: 'con valor' }],
  bank_date: [{ value: 'gte', label: 'desde' }, { value: 'lte', label: 'hasta' }, { value: 'eq', label: 'exactamente' }, { value: 'empty', label: 'vacío' }, { value: 'set', label: 'con valor' }],
  group:     [{ value: 'in', label: 'es uno de' }, { value: 'not_in', label: 'no es ninguno de' }, { value: 'empty', label: 'sin tipo' }, { value: 'set', label: 'con tipo' }],
  type:      [{ value: 'in', label: 'es uno de' }, { value: 'not_in', label: 'no es ninguno de' }, { value: 'empty', label: 'sin subtipo' }, { value: 'set', label: 'con subtipo' }],
  paid:      [{ value: 'eq', label: 'es' }, { value: 'neq', label: 'no es' }],
  no_count:  [{ value: 'eq', label: 'es' }, { value: 'neq', label: 'no es' }],
}

const DEFAULT_OP: Record<FilterField, FilterOp> = {
  name: 'contains', notes: 'contains', amount: 'gt', date: 'gte',
  bank_date: 'gte', group: 'in', type: 'in', paid: 'eq', no_count: 'eq',
}

function newCondition(): FilterCondition {
  return { id: Math.random().toString(36).slice(2), field: 'name', op: 'contains', value: '', values: [] }
}

// ── Shared select style ───────────────────────────────────────────────────────

const SEL = 'border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600'

// ── GroupMultiSelect ──────────────────────────────────────────────────────────

function GroupMultiSelect({ groups, selected, onChange }: {
  groups: Group[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter(v => v !== id) : [...selected, id])

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(v => !v)} className={SEL + ' flex items-center gap-2 min-w-[160px]'}>
        <span className="flex-1 text-left">
          {selected.length === 0 ? 'Seleccionar...' : `${selected.length} tipo${selected.length > 1 ? 's' : ''}`}
        </span>
        <ChevronDown className="w-3 h-3 shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-1.5 min-w-[220px] max-h-72 overflow-y-auto">
          {groups.map(g => (
            <label key={g.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
              <input type="checkbox" checked={selected.includes(String(g.id))} onChange={() => toggle(String(g.id))} className="rounded accent-gray-800 dark:accent-gray-200 w-3.5 h-3.5 shrink-0" />
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
              <span className="text-sm text-gray-800 dark:text-gray-100">{g.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── TypeMultiSelect ───────────────────────────────────────────────────────────

function TypeMultiSelect({ types, selected, onChange }: {
  types: MovementType[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter(v => v !== id) : [...selected, id])

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(v => !v)} className={SEL + ' flex items-center gap-2 min-w-[160px]'}>
        <span className="flex-1 text-left">
          {selected.length === 0 ? 'Seleccionar...' : `${selected.length} subtipo${selected.length > 1 ? 's' : ''}`}
        </span>
        <ChevronDown className="w-3 h-3 shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-1.5 min-w-[260px] max-h-80 overflow-y-auto">
          {types.map(t => (
            <label key={t.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
              <input type="checkbox" checked={selected.includes(String(t.id))} onChange={() => toggle(String(t.id))} className="rounded accent-gray-800 dark:accent-gray-200 w-3.5 h-3.5 shrink-0" />
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
              <span className="text-sm text-gray-800 dark:text-gray-100">{t.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── ConditionRow ──────────────────────────────────────────────────────────────

function ConditionRow({ cond, types, groups, onChange, onRemove }: {
  cond: FilterCondition
  types: MovementType[]
  groups: Group[]
  onChange: (c: FilterCondition) => void
  onRemove: () => void
}) {
  const ops = OPS[cond.field] ?? []
  const needsValue = cond.op !== 'empty' && cond.op !== 'set'
  const active = isConditionActive(cond)

  const changeField = (field: FilterField) =>
    onChange({ ...cond, field, op: DEFAULT_OP[field], value: '', values: [] })
  const changeOp = (op: FilterOp) =>
    onChange({ ...cond, op })

  const valueInput = () => {
    if (!needsValue) return null
    switch (cond.field) {
      case 'name':
      case 'notes':
        return <input type="text" value={cond.value} onChange={e => onChange({ ...cond, value: e.target.value })} className={SEL + ' flex-1 min-w-[120px]'} placeholder="valor..." />
      case 'amount':
        return <input type="number" step="0.01" value={cond.value} onChange={e => onChange({ ...cond, value: e.target.value })} className={SEL + ' w-28'} placeholder="0.00" />
      case 'date':
      case 'bank_date':
        return <input type="date" value={cond.value} onChange={e => onChange({ ...cond, value: e.target.value })} className={SEL} />
      case 'group':
        return <GroupMultiSelect groups={groups} selected={cond.values} onChange={values => onChange({ ...cond, values })} />
      case 'type':
        return <TypeMultiSelect types={types} selected={cond.values} onChange={values => onChange({ ...cond, values })} />
      case 'paid':
      case 'no_count':
        return (
          <select value={cond.value || 'true'} onChange={e => onChange({ ...cond, value: e.target.value })} className={SEL}>
            <option value="true">Sí</option>
            <option value="false">No</option>
          </select>
        )
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap rounded-lg">
      <select value={cond.field} onChange={e => changeField(e.target.value as FilterField)} className={SEL + (!active ? ' opacity-50' : '')}>
        {FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      <select value={cond.op} onChange={e => changeOp(e.target.value as FilterOp)} className={SEL + (!active ? ' opacity-50' : '')}>
        {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {valueInput()}
      {active && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" title="Filtro activo" />}
      <button onClick={onRemove} className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ── FilterPanel ───────────────────────────────────────────────────────────────

interface Props {
  filter: AdvancedFilter
  onChange: (f: AdvancedFilter) => void
  types: MovementType[]
  groups: Group[]
}

export default function FilterPanel({ filter, onChange, types, groups }: Props) {
  const set = (conditions: FilterCondition[]) => onChange({ ...filter, conditions })
  const update = (id: string, c: FilterCondition) => set(filter.conditions.map(x => x.id === id ? c : x))
  const remove = (id: string) => set(filter.conditions.filter(x => x.id !== id))

  return (
    <div className="p-3 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-sm space-y-2.5">

      {filter.conditions.length > 1 && (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span>Combinar condiciones con</span>
          {(['and', 'or'] as const).map(c => (
            <button key={c} onClick={() => onChange({ ...filter, combinator: c })}
              className={`px-2.5 py-0.5 rounded-md text-xs font-bold uppercase transition-colors ${
                filter.combinator === c
                  ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900'
                  : 'border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}>
              {c === 'and' ? 'Y' : 'O'}
            </button>
          ))}
        </div>
      )}

      {filter.conditions.map((cond, i) => (
        <div key={cond.id} className="flex items-start gap-2">
          {filter.conditions.length > 1 && (
            <span className="text-xs font-semibold uppercase text-gray-300 dark:text-gray-600 w-6 text-center pt-2 shrink-0">
              {i === 0 ? '' : filter.combinator === 'and' ? 'Y' : 'O'}
            </span>
          )}
          <ConditionRow
            cond={cond}
            types={types}
            groups={groups}
            onChange={c => update(cond.id, c)}
            onRemove={() => remove(cond.id)}
          />
        </div>
      ))}

      <div className="flex items-center gap-4 pt-0.5">
        <button
          onClick={() => set([...filter.conditions, newCondition()])}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2} />
          Añadir condición
        </button>
        {filter.conditions.length > 0 && (
          <button onClick={() => onChange(EMPTY_FILTER)} className="text-sm text-gray-400 hover:text-red-500 transition-colors">
            Limpiar todo
          </button>
        )}
      </div>
    </div>
  )
}
