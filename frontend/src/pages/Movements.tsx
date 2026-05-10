import { useEffect, useMemo, useRef, useState } from 'react'
import { syncPref } from '../utils/prefSync'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMovements, updateMovement, deleteMovement, createMovement, type Movement } from '../api/movements'
import { getMovementTypes, type MovementType } from '../api/movementTypes'
import { getGroups } from '../api/groups'
import MovementForm from '../components/MovementForm'
import MovementDetailModal, { type DraftRow, toDraft, draftPayload, duplicatePayload } from '../components/MovementDetailModal'
import { runAutoRecurring, computeDates, applyFormula } from '../utils/recurringTemplates'
import { getTemplates, updateTemplate } from '../api/templates'
import FilterPanel, { applyAdvancedFilter, EMPTY_FILTER, type AdvancedFilter } from '../components/FilterPanel'
import { MessageSquare, Paperclip, Inbox, X, Check, Plus, SlidersHorizontal, ChevronUp, ChevronDown, Filter, Bookmark, Trash2, Table2, CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, Copy, GripVertical, Download, Users, Search } from 'lucide-react'
import { useCurrency } from '../hooks/useCurrency'
import { useDateFormat } from '../hooks/useDateFormat'
import { t, getDayNames, getMonthNames } from '../utils/i18n'

interface FilterFavorite { id: string; name: string; filter: AdvancedFilter }

function loadFavorites(): FilterFavorite[] {
  try { const s = localStorage.getItem('movements-filter-favorites'); if (s) return JSON.parse(s) } catch { /**/ }
  return []
}
function saveFavorites(favs: FilterFavorite[]) {
  syncPref('movements-filter-favorites', JSON.stringify(favs))
}

// ── Column definitions ───────────────────────────────────────────────────────

const COLS = [
  { key: 'date',      label: t('movements.colDate'),     defaultWidth: 106, align: 'left'   },
  { key: 'name',      label: t('movements.colName'),     defaultWidth: 220, align: 'left'   },
  { key: 'type',      label: t('movements.colType'),     defaultWidth: 150, align: 'left'   },
  { key: 'amount',    label: t('movements.colAmount'),   defaultWidth: 110, align: 'right'  },
  { key: 'paid',      label: t('movements.colPaid'),     defaultWidth: 72,  align: 'center' },
  { key: 'bank_date', label: t('movements.colBankDate'), defaultWidth: 106, align: 'left'   },
  { key: 'notes',     label: t('movements.colNotes'),    defaultWidth: 180, align: 'left'   },
  { key: 'no_count',  label: t('movements.colNoCount'),  defaultWidth: 84,  align: 'center' },
] as const

type ColKey = typeof COLS[number]['key']

const DEFAULT_VISIBLE = new Set<ColKey>(['date', 'name', 'type', 'amount', 'paid'])

const EXPORT_FIELDS = [
  { key: 'date',      label: t('movements.colDate') },
  { key: 'bank_date', label: t('movements.colBankDate') },
  { key: 'name',      label: t('movements.colName') },
  { key: 'type',      label: t('movements.colType') },
  { key: 'group',     label: t('movements.exportGroup') },
  { key: 'money',     label: t('movements.colAmount') },
  { key: 'paid',      label: t('movements.colPaid') },
  { key: 'no_count',  label: t('movements.colNoCount') },
  { key: 'notes',     label: t('movements.colNotes') },
  { key: 'account',   label: t('movements.exportAccount') },
] as const

function loadSet<T extends string>(key: string, fallback: Set<T>): Set<T> {
  try { const s = localStorage.getItem(key); if (s) return new Set(JSON.parse(s) as T[]) } catch { /**/ }
  return new Set(fallback)
}
function saveSet<T extends string>(key: string, set: Set<T>) {
  syncPref(key, JSON.stringify([...set]))
}
function loadWidths(): Record<ColKey, number> {
  const defaults = Object.fromEntries(COLS.map(c => [c.key, c.defaultWidth])) as Record<ColKey, number>
  try { const s = localStorage.getItem('movements-widths'); if (s) return { ...defaults, ...JSON.parse(s) } } catch { /**/ }
  return defaults
}
function loadColOrder(): ColKey[] {
  const all = COLS.map(c => c.key)
  try {
    const s = localStorage.getItem('movements-col-order')
    if (s) {
      const parsed = JSON.parse(s) as ColKey[]
      const known = parsed.filter(k => all.includes(k))
      const missing = all.filter(k => !known.includes(k))
      return [...known, ...missing]
    }
  } catch { /**/ }
  return all
}

// ── Shared input className ───────────────────────────────────────────────────

const INPUT = 'w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-400'

// ── Shared constants ──────────────────────────────────────────────────────────

const DAYS_SHORT = getDayNames('narrow')
const MONTHS_ES = getMonthNames('long')
const MONTHS_SHORT_CAL = getMonthNames('short')

// ── Context menu ──────────────────────────────────────────────────────────────

interface CtxMenu { x: number; y: number; mv: Movement }

function MovementContextMenu({ menu, onDuplicate, onDelete, onClose }: {
  menu: CtxMenu
  onDuplicate: (mv: Movement) => void
  onDelete: (mv: Movement) => void
  onClose: () => void
}) {
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    window.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Escape') close() })
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [onClose])

  // Adjust position to stay within viewport
  const x = Math.min(menu.x, window.innerWidth - 180)
  const y = Math.min(menu.y, window.innerHeight - 100)

  return (
    <div
      className="fixed z-[100] bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-2xl py-1 min-w-[160px]"
      style={{ left: x, top: y }}
      onClick={e => e.stopPropagation()}
      onContextMenu={e => e.preventDefault()}
    >
      <button
        onClick={() => { onDuplicate(menu.mv); onClose() }}
        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <Copy className="w-3.5 h-3.5 text-gray-400" />
        {t('movements.duplicate')}
      </button>
      <div className="my-1 h-px bg-gray-100 dark:bg-gray-800" />
      <button
        onClick={() => { onDelete(menu.mv); onClose() }}
        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        {t('common.delete')}
      </button>
    </div>
  )
}

// ── Calendar view ────────────────────────────────────────────────────────────

function CalendarView({ movements, types, selectedYear }: {
  movements: Movement[]
  types: MovementType[]
  selectedYear?: number | null
}) {
  const { fmt } = useCurrency()
  const fmtCal = (v: number) => (v >= 0 ? '+' : '') + fmt(v)
  const today = new Date()
  const curYear = today.getFullYear()
  const curMonth = today.getMonth()
  const [calYear, setCalYear] = useState(selectedYear ?? curYear)
  const [calMonth, setCalMonth] = useState(
    selectedYear != null && selectedYear !== curYear ? 0 : curMonth
  )
  const [formDate, setFormDate] = useState<string | null>(null)

  useEffect(() => {
    if (selectedYear != null) {
      setCalYear(selectedYear)
      setCalMonth(selectedYear !== curYear ? 0 : curMonth)
    }
  }, [selectedYear, curYear, curMonth])
  const [dateField, setDateField] = useState<'date' | 'bank_date'>('date')
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  const byDate = useMemo(() => {
    const map: Record<string, Movement[]> = {}
    for (const mv of movements) {
      const d = dateField === 'date' ? mv.date : (mv.bank_date ?? null)
      if (!d) continue
      if (!map[d]) map[d] = []
      map[d].push(mv)
    }
    return map
  }, [movements, dateField])

  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: getTemplates })

  const previewByDate = useMemo(() => {
    if (dateField !== 'date') return {}
    const map: Record<string, { name: string; money: number; movement_type_id?: number }[]> = {}
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const previewEnd = new Date(now); previewEnd.setMonth(previewEnd.getMonth() + 6)
    for (const tpl of templates) {
      if (!tpl.recurrence?.rule) continue
      const allDates = computeDates(tpl.recurrence.rule, new Date(tpl.recurrence.startDate), 300)
      for (const d of allDates) {
        const dd = new Date(d); dd.setHours(0, 0, 0, 0)
        if (dd <= now || dd > previewEnd) continue
        const dateStr = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`
        if (!map[dateStr]) map[dateStr] = []
        map[dateStr].push({
          name: applyFormula(tpl.name || tpl.label, dd),
          money: parseFloat(tpl.money) || 0,
          movement_type_id: tpl.movement_type_id ? parseInt(tpl.movement_type_id) : undefined,
        })
      }
    }
    return map
  }, [templates, dateField])

  const firstDow = (new Date(calYear, calMonth, 1).getDay() + 6) % 7
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()

  const cells: { dateStr: string; day: number; current: boolean }[] = []
  const localDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  for (let i = 0; i < firstDow; i++) {
    const d = new Date(calYear, calMonth, 1 - (firstDow - i))
    cells.push({ dateStr: localDateStr(d), day: d.getDate(), current: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ dateStr: `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, day: d, current: true })
  }
  const remaining = cells.length % 7 === 0 ? 0 : 7 - (cells.length % 7)
  for (let d = 1; d <= remaining; d++) {
    const nd = new Date(calYear, calMonth + 1, d)
    cells.push({ dateStr: localDateStr(nd), day: d, current: false })
  }

  const typeMap = useMemo(() => Object.fromEntries(types.map(t => [t.id, t])), [types])
  const [selectedMv, setSelectedMv] = useState<Movement | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const qc = useQueryClient()
  const moveDateMut = useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) =>
      updateMovement(id, { [dateField]: date }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['annual'] })
    },
  })
  const calDupMut = useMutation({
    mutationFn: (mv: Movement) => createMovement(duplicatePayload(mv)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['movements'] }),
  })
  const calDelMut = useMutation({
    mutationFn: (mv: Movement) => deleteMovement(mv.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['annual'] })
    },
  })
  const todayStr = today.toISOString().split('T')[0]
  const prevMonth = () => calMonth === 0 ? (setCalYear(y => y - 1), setCalMonth(11)) : setCalMonth(m => m - 1)
  const nextMonth = () => calMonth === 11 ? (setCalYear(y => y + 1), setCalMonth(0)) : setCalMonth(m => m + 1)
  const MAX = 4
  const btnCls = (active: boolean) => `px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${active ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-800 dark:text-gray-100' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`

  return (
    <>
      {selectedMv && <MovementDetailModal movement={selectedMv} types={types} onClose={() => setSelectedMv(null)} />}
      {formDate && <MovementForm key={formDate} initialDate={formDate} onClose={() => setFormDate(null)} />}
      {ctxMenu && (
        <MovementContextMenu
          menu={ctxMenu}
          onDuplicate={mv => calDupMut.mutate(mv)}
          onDelete={mv => { if (confirm(t('movements.deleteConfirm').replace('{name}', mv.name))) calDelMut.mutate(mv) }}
          onClose={() => setCtxMenu(null)}
        />
      )}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          </button>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-800 dark:text-white">{MONTHS_ES[calMonth]} {calYear}</span>
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button className={btnCls(dateField === 'date')} onClick={() => setDateField('date')}>{t('movements.dateField')}</button>
              <button className={btnCls(dateField === 'bank_date')} onClick={() => setDateField('bank_date')}>{t('movements.bankDateField')}</button>
            </div>
          </div>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-800">
          {DAYS_SHORT.map(d => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            const mvs = byDate[cell.dateStr] ?? []
            const previews = cell.current && cell.dateStr > todayStr ? (previewByDate[cell.dateStr] ?? []) : []
            const isToday = cell.dateStr === todayStr
            const extra = mvs.length > MAX ? mvs.length - MAX : 0
            const isDropTarget = dragOverDate === cell.dateStr
            return (
              <div key={i}
                onDragOver={e => { e.preventDefault(); setDragOverDate(cell.dateStr) }}
                onDragLeave={() => setDragOverDate(null)}
                onDrop={e => {
                  e.preventDefault()
                  if (draggingId !== null) moveDateMut.mutate({ id: draggingId, date: cell.dateStr })
                  setDraggingId(null); setDragOverDate(null)
                }}
                onDoubleClick={() => cell.current && setFormDate(cell.dateStr)}
                className={`min-h-[110px] border-r border-b border-gray-100 dark:border-gray-800 p-1.5 transition-colors ${
                  isDropTarget ? 'bg-blue-50 dark:bg-blue-950/40 ring-1 ring-inset ring-blue-300 dark:ring-blue-700' :
                  isToday ? 'bg-blue-50/60 dark:bg-blue-950/20' :
                  !cell.current ? 'bg-gray-50/50 dark:bg-gray-800/30' : 'cursor-pointer'
                }`}>
                <div className={`text-xs font-medium text-right mb-1 ${
                  isToday ? 'text-blue-600 dark:text-blue-400 font-bold'
                    : cell.current ? 'text-gray-500 dark:text-gray-400' : 'text-gray-300 dark:text-gray-600'
                }`}>{cell.day}</div>
                {(expandedDays.has(cell.dateStr) ? mvs : mvs.slice(0, MAX)).map(mv => {
                  const typ = typeMap[mv.movement_type_id ?? 0]
                  return (
                    <div key={mv.id}
                      draggable
                      onDragStart={e => { e.stopPropagation(); setDraggingId(mv.id) }}
                      onDragEnd={() => { setDraggingId(null); setDragOverDate(null) }}
                      onClick={() => setSelectedMv(mv)}
                      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, mv }) }}
                      className={`mb-1 rounded-md bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-1.5 py-1 cursor-grab active:cursor-grabbing hover:border-gray-300 dark:hover:border-gray-500 transition-all ${draggingId === mv.id ? 'opacity-40' : ''}`}>
                      <span className="truncate text-[11px] text-gray-700 dark:text-gray-300 leading-tight block">{mv.name}</span>
                      <span className={`text-[11px] font-mono ${mv.dinero >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                        {fmtCal(mv.dinero)}
                      </span>
                      {typ && (
                        <span className="block text-[10px] px-1 rounded mt-0.5 w-full" style={{ backgroundColor: typ.color + '22', color: typ.color }}>
                          {typ.name}
                        </span>
                      )}
                    </div>
                  )
                })}
                {previews.map((pv, pi) => {
                  const typ = pv.movement_type_id ? typeMap[pv.movement_type_id] : undefined
                  return (
                    <div key={`preview-${pi}`} className="mb-1 rounded-md border border-dashed border-gray-300 dark:border-gray-600 px-1.5 py-1 opacity-45 pointer-events-none">
                      <span className="truncate text-[11px] text-gray-500 dark:text-gray-400 leading-tight block">{pv.name}</span>
                      <span className={`text-[11px] font-mono ${pv.money >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                        {fmtCal(pv.money)}
                      </span>
                      {typ && (
                        <span className="block text-[10px] px-1 rounded mt-0.5 w-full" style={{ backgroundColor: typ.color + '22', color: typ.color }}>
                          {typ.name}
                        </span>
                      )}
                    </div>
                  )
                })}
                {extra > 0 && !expandedDays.has(cell.dateStr) && (
                  <button
                    onClick={e => { e.stopPropagation(); setExpandedDays(prev => { const n = new Set(prev); n.add(cell.dateStr); return n }) }}
                    className="text-[10px] text-blue-500 dark:text-blue-400 pl-0.5 hover:underline leading-tight block"
                  >+{extra} {t('movements.more')}</button>
                )}
                {expandedDays.has(cell.dateStr) && (
                  <button
                    onClick={e => { e.stopPropagation(); setExpandedDays(prev => { const n = new Set(prev); n.delete(cell.dateStr); return n }) }}
                    className="text-[10px] text-blue-500 dark:text-blue-400 pl-0.5 hover:underline leading-tight block"
                  >− {t('movements.collapse')}</button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ── Kanban view ───────────────────────────────────────────────────────────────

function KanbanView({ allTypes }: { allTypes: MovementType[] }) {
  const { fmt } = useCurrency()
  const fmtCal = (v: number) => (v >= 0 ? '+' : '') + fmt(v)
  const today = new Date()
  const [kanbanYear, setKanbanYear] = useState(today.getFullYear())
  const [kanbanMonth, setKanbanMonth] = useState<number | null>(today.getMonth())
  const [selectedMv, setSelectedMv] = useState<Movement | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set())
  const [expandedTypes, setExpandedTypes] = useState<Set<number>>(new Set())
  const [groupOrder, setGroupOrder] = useState<number[]>(() => {
    try { const s = localStorage.getItem('kanban-group-order'); if (s) return JSON.parse(s) } catch { /**/ }
    return []
  })
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)

  const qc = useQueryClient()
  const kanbanDupMut = useMutation({
    mutationFn: (mv: Movement) => createMovement(duplicatePayload(mv)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['movements'] }),
  })
  const kanbanDelMut = useMutation({
    mutationFn: (mv: Movement) => deleteMovement(mv.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['annual'] })
    },
  })

  const { data: allMovements = [] } = useQuery({
    queryKey: ['movements-all'],
    queryFn: () => getMovements(),
  })
  const { data: rawMovements = [] } = useQuery({
    queryKey: ['movements', kanbanYear],
    queryFn: () => getMovements({ year: kanbanYear }),
  })
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: getGroups })

  const availableYears = useMemo(() =>
    [...new Set(allMovements.map(mv => new Date(mv.date + 'T00:00:00').getFullYear()))].sort((a, b) => a - b)
  , [allMovements])

  const availableMonths = useMemo(() =>
    new Set(rawMovements.map(mv => new Date(mv.date + 'T00:00:00').getMonth()))
  , [rawMovements])

  const movements = useMemo(() => {
    if (kanbanMonth === null) return rawMovements
    return rawMovements.filter(mv => new Date(mv.date + 'T00:00:00').getMonth() === kanbanMonth)
  }, [rawMovements, kanbanMonth])

  const typeMap = useMemo(() => Object.fromEntries(allTypes.map(t => [t.id, t])), [allTypes])

  // For monthly view: flat columns per type
  const columns = useMemo(() => {
    const cols: Record<string, { typeId: number | null; name: string; color: string; movements: Movement[] }> = {}
    for (const mv of movements) {
      const key = mv.movement_type_id != null ? String(mv.movement_type_id) : '__none__'
      if (!cols[key]) {
        const typ = mv.movement_type_id != null ? typeMap[mv.movement_type_id] : null
        cols[key] = { typeId: mv.movement_type_id ?? null, name: typ?.name ?? t('movements.noType'), color: typ?.color ?? '#6b7280', movements: [] }
      }
      cols[key].movements.push(mv)
    }
    return Object.values(cols).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [movements, typeMap])

  // For annual view: 3-level hierarchy group > type > movements
  const tree = useMemo(() => {
    const mvsByType: Record<number | string, Movement[]> = {}
    for (const mv of rawMovements) {
      const key = mv.movement_type_id ?? '__none__'
      if (!mvsByType[key]) mvsByType[key] = []
      mvsByType[key].push(mv)
    }
    return groups
      .filter(g => allTypes.some(t => t.income_expense_group_id === g.id))
      .map(g => {
        const types = allTypes
          .filter(t => t.income_expense_group_id === g.id)
          .map(t => ({ ...t, movements: mvsByType[t.id] ?? [] }))
          .filter(t => t.movements.length > 0)
          .sort((a, b) => a.name.localeCompare(b.name, 'es'))
        const total = types.reduce((s, t) => s + t.movements.reduce((ss, mv) => ss + mv.dinero, 0), 0)
        return { ...g, types, total }
      })
      .filter(g => g.types.length > 0)
  }, [rawMovements, groups, allTypes])

  const sortedTree = useMemo(() => {
    if (groupOrder.length === 0) return tree
    const orderMap = Object.fromEntries(groupOrder.map((id, i) => [id, i]))
    return [...tree].sort((a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999))
  }, [tree, groupOrder])

  const dropGroup = (targetId: number) => {
    if (draggingId === null || draggingId === targetId) return
    const ids = sortedTree.map(g => g.id)
    const from = ids.indexOf(draggingId)
    const to = ids.indexOf(targetId)
    const next = [...ids]
    next.splice(from, 1)
    next.splice(to, 0, draggingId)
    setGroupOrder(next)
    syncPref('kanban-group-order', JSON.stringify(next))
    setDraggingId(null)
    setDragOverId(null)
  }

  const fmtDate = (s: string) => { const d = new Date(s + 'T00:00:00'); return `${d.getDate()} ${MONTHS_SHORT_CAL[d.getMonth()]}` }
  const pillCls = (active: boolean) =>
    `px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${active
      ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`

  const toggleGroup = (id: number) =>
    setExpandedGroups(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const toggleType = (id: number) =>
    setExpandedTypes(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const amtCls = (v: number) => v >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'

  return (
    <div className="space-y-3">
      {selectedMv && <MovementDetailModal movement={selectedMv} types={allTypes} onClose={() => setSelectedMv(null)} />}
      {ctxMenu && (
        <MovementContextMenu
          menu={ctxMenu}
          onDuplicate={mv => kanbanDupMut.mutate(mv)}
          onDelete={mv => { if (confirm(t('movements.deleteConfirm').replace('{name}', mv.name))) kanbanDelMut.mutate(mv) }}
          onClose={() => setCtxMenu(null)}
        />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={kanbanYear}
          onChange={e => setKanbanYear(Number(e.target.value))}
          className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
        >
          {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="flex items-center gap-1 flex-wrap">
          <button className={pillCls(kanbanMonth === null)} onClick={() => setKanbanMonth(null)}>{t('movements.fullYear')}</button>
          {MONTHS_SHORT_CAL.map((m, i) => availableMonths.has(i) && (
            <button key={i} className={pillCls(kanbanMonth === i)} onClick={() => setKanbanMonth(i)}>{m}</button>
          ))}
        </div>
      </div>

      {/* ── Año completo: acordeón 3 niveles ── */}
      {kanbanMonth === null && (
        tree.length === 0
          ? <div className="text-center text-gray-400 py-16">{t('movements.noMovements')}</div>
          : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(22rem, 1fr))' }}>
              {sortedTree.map(group => {
                const groupOpen = expandedGroups.has(group.id)
                const isDragging = draggingId === group.id
                const isOver = dragOverId === group.id && draggingId !== group.id
                return (
                  <div
                    key={group.id}
                    draggable
                    onDragStart={() => setDraggingId(group.id)}
                    onDragOver={e => { e.preventDefault(); setDragOverId(group.id) }}
                    onDrop={() => dropGroup(group.id)}
                    onDragEnd={() => { setDraggingId(null); setDragOverId(null) }}
                    className={`bg-white dark:bg-gray-900 rounded-xl border shadow-sm overflow-hidden transition-opacity ${
                      isDragging ? 'opacity-40' : 'opacity-100'
                    } ${isOver ? 'border-blue-400 dark:border-blue-500 ring-2 ring-blue-300 dark:ring-blue-600' : 'border-gray-100 dark:border-gray-800'}`}
                  >
                    {/* Group header */}
                    <button
                      onClick={() => toggleGroup(group.id)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-grab active:cursor-grabbing"
                      style={{ borderLeft: `4px solid ${group.color}` }}
                    >
                      <div className="flex items-center gap-2">
                        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${groupOpen ? 'rotate-90' : ''}`} />
                        <span className="font-semibold text-gray-800 dark:text-gray-100">{group.name}</span>
                        <span className="text-xs text-gray-400">{group.types.length} {t('movements.nTypes')}</span>
                      </div>
                      <span className={`text-sm font-mono font-semibold ${amtCls(group.total)}`}>{fmtCal(group.total)}</span>
                    </button>

                    {groupOpen && (
                      <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800/60">
                        {group.types.map(type => {
                          const typeOpen = expandedTypes.has(type.id)
                          const typeTotal = type.movements.reduce((s, mv) => s + mv.dinero, 0)
                          return (
                            <div key={type.id}>
                              {/* Type header */}
                              <button
                                onClick={() => toggleType(type.id)}
                                className="w-full flex items-center justify-between pl-10 pr-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform ${typeOpen ? 'rotate-90' : ''}`} />
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: type.color }} />
                                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{type.name}</span>
                                  <span className="text-xs text-gray-400">{type.movements.length} {t('movements.nMov')}</span>
                                </div>
                                <span className={`text-sm font-mono font-semibold ${amtCls(typeTotal)}`}>{fmtCal(typeTotal)}</span>
                              </button>

                              {typeOpen && (
                                <div className="divide-y divide-gray-50 dark:divide-gray-800/40">
                                  {type.movements.map(mv => (
                                    <div key={mv.id} onClick={() => setSelectedMv(mv)}
                                      onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, mv }) }}
                                      className="flex items-center gap-3 pl-16 pr-4 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                      <span className="text-xs text-gray-400 shrink-0 w-16">{fmtDate(mv.date)}</span>
                                      <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 min-w-0 truncate">{mv.name}</span>
                                      <span className={`text-sm font-mono shrink-0 ${amtCls(mv.dinero)}`}>{fmtCal(mv.dinero)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
      )}

      {/* ── Mes concreto: grid plano por tipo ── */}
      {kanbanMonth !== null && (
        columns.length === 0
          ? <div className="text-center text-gray-400 py-16">{t('movements.noMovements')}</div>
          : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(22rem, 1fr))' }}>
              {columns.map(col => {
                const total = col.movements.reduce((s, mv) => s + mv.dinero, 0)
                return (
                  <div key={col.typeId ?? '__none__'} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5" style={{ borderLeft: `4px solid ${col.color}` }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{col.name}</span>
                        <span className="text-xs text-gray-400 shrink-0">{col.movements.length} {t('movements.nMov')}</span>
                      </div>
                      <span className={`text-sm font-mono font-semibold shrink-0 ml-3 ${amtCls(total)}`}>{fmtCal(total)}</span>
                    </div>
                    <div className="divide-y divide-gray-50 dark:divide-gray-800">
                      {col.movements.map(mv => (
                        <div key={mv.id} onClick={() => setSelectedMv(mv)}
                          onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, mv }) }}
                          className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                          <span className="text-xs text-gray-400 shrink-0 w-12">{fmtDate(mv.date)}</span>
                          <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 min-w-0 truncate">{mv.name}</span>
                          <span className={`text-sm font-mono shrink-0 ${amtCls(mv.dinero)}`}>{fmtCal(mv.dinero)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Movements() {
  const { fmt } = useCurrency()
  const { fmtDate } = useDateFormat()
  const currentYear = new Date().getFullYear()
  const qcOuter = useQueryClient()

  useEffect(() => {
    let cancelled = false
    getTemplates().then(templates => {
      if (cancelled) return
      return runAutoRecurring(
        templates,
        data => createMovement(data as Parameters<typeof createMovement>[0]),
        async (id, updatedRecurrence) => {
          const tpl = templates.find(t => t.id === id)
          if (tpl) await updateTemplate(id, { ...tpl, recurrence: updatedRecurrence })
        }
      )
    }).then(n => {
      if (cancelled || !n) return
      qcOuter.invalidateQueries({ queryKey: ['movements'] })
      qcOuter.invalidateQueries({ queryKey: ['dashboard'] })
      qcOuter.invalidateQueries({ queryKey: ['annual'] })
      qcOuter.invalidateQueries({ queryKey: ['accounts-summary'] })
    })
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [year, setYear] = useState<number | null>(currentYear)
  const [showForm, setShowForm] = useState(false)
  const [selectedMv, setSelectedMv] = useState<Movement | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [draft, setDraft] = useState<DraftRow | null>(null)
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => loadSet('movements-cols', DEFAULT_VISIBLE))
  const [colWidths, setColWidths] = useState<Record<ColKey, number>>(loadWidths)
  const [colOrder, setColOrder] = useState<ColKey[]>(loadColOrder)
  const [showColPicker, setShowColPicker] = useState(false)
  const [dragCol, setDragCol] = useState<ColKey | null>(null)
  const [dragOver, setDragOver] = useState<{ col: ColKey; side: 'left' | 'right' } | null>(null)
  const [sort, setSort] = useState<{ key: ColKey; dir: 'asc' | 'desc' } | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [advFilter, setAdvFilter] = useState<AdvancedFilter>(EMPTY_FILTER)
  const [favorites, setFavorites] = useState<FilterFavorite[]>(loadFavorites)
  const [activeFavId, setActiveFavId] = useState<string | null>(null)
  const [savingName, setSavingName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkField, setBulkField] = useState('')
  const [bulkValue, setBulkValue] = useState('')
  const [isBulkPending, setIsBulkPending] = useState(false)
  const [viewMode, setViewMode] = useState<'table' | 'calendar' | 'kanban'>('table')
  const [showYearPicker, setShowYearPicker] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [quickSearch, setQuickSearch] = useState('')
  const colPickerRef = useRef<HTMLDivElement>(null)
  const yearPickerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const exportPickerRef = useRef<HTMLDivElement>(null)
  const [showExportPicker, setShowExportPicker] = useState(false)
  const [exportFields, setExportFields] = useState<Set<string>>(() => new Set(EXPORT_FIELDS.map(f => f.key)))
  const qc = useQueryClient()
  const [dayOrder, setDayOrder] = useState<Record<string, number[]>>(() => {
    try { return JSON.parse(localStorage.getItem('movements-day-order') ?? '{}') } catch { return {} }
  })
  const rowDragRef = useRef<{ id: number; date: string } | null>(null)
  const [rowDragOver, setRowDragOver] = useState<number | null>(null)

  const activeFilterCount = advFilter.conditions.length

  const applyFilter = (f: AdvancedFilter, favId: string | null = null) => {
    setAdvFilter(f); setActiveFavId(favId); setShowFilters(f.conditions.length > 0)
  }

  const commitSave = () => {
    const name = savingName.trim(); if (!name) return
    const fav: FilterFavorite = { id: Date.now().toString(), name, filter: advFilter }
    const next = [...favorites, fav]; setFavorites(next); saveFavorites(next)
    setActiveFavId(fav.id); setSavingName(''); setShowSaveInput(false)
  }

  const deleteFavorite = (id: string) => {
    const next = favorites.filter(f => f.id !== id); setFavorites(next); saveFavorites(next)
    if (activeFavId === id) setActiveFavId(null)
  }

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  const toggleAll = () => {
    const allSelected = filteredMovements.length > 0 && filteredMovements.every(m => selected.has(m.id))
    setSelected(allSelected ? new Set() : new Set(filteredMovements.map(m => m.id)))
  }

  const clearBulk = () => { setSelected(new Set()); setBulkField(''); setBulkValue('') }

  function exportCSV() {
    const selectedMvs = filteredMovements.filter(mv => selected.has(mv.id))
    const flds = EXPORT_FIELDS.filter(f => exportFields.has(f.key))
    const headers = flds.map(f => f.label)
    const rows = selectedMvs.map(mv => flds.map(f => {
      switch (f.key) {
        case 'date':      return mv.date
        case 'bank_date': return mv.bank_date ?? ''
        case 'name':      return mv.name
        case 'type':      return typeMap[mv.movement_type_id ?? 0]?.name ?? ''
        case 'group':     return mv.label ?? ''
        case 'money':     return String(mv.dinero)
        case 'paid':      return mv.paid ? t('common.yes') : t('common.no')
        case 'no_count':  return mv.no_count ? t('common.yes') : t('common.no')
        case 'notes':     return mv.notes ?? ''
        case 'account':   return mv.account_id ? (accountMap[mv.account_id] ?? '') : ''
        default:          return ''
      }
    }))
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'movimientos.csv'; a.click()
    URL.revokeObjectURL(url)
    setShowExportPicker(false)
  }

  const bulkDelete = async () => {
    if (!confirm(t('movements.bulkDeleteConfirm').replace('{n}', String(selected.size)))) return
    setIsBulkPending(true)
    try {
      await Promise.all([...selected].map(id => deleteMovement(id)))
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['annual'] })
      qc.invalidateQueries({ queryKey: ['accounts-summary'] })
      clearBulk()
    } finally { setIsBulkPending(false) }
  }

  const bulkDuplicate = async () => {
    setIsBulkPending(true)
    try {
      const mvs = filteredMovements.filter(m => selected.has(m.id))
      await Promise.all(mvs.map(mv => createMovement(duplicatePayload(mv))))
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['annual'] })
      clearBulk()
    } finally { setIsBulkPending(false) }
  }

  const bulkApply = async () => {
    if (!bulkField) return
    let payload: Record<string, unknown> = {}
    switch (bulkField) {
      case 'account_id':
        payload = { account_id: bulkValue ? (parseInt(bulkValue) || null) : null }; break
      case 'movement_type_id':
        payload = { movement_type_id: bulkValue ? (parseInt(bulkValue) || null) : null }; break
      case 'paid': case 'no_count':
        payload = { [bulkField]: bulkValue === 'true' }; break
      case 'money':
        payload = { money: parseFloat(bulkValue) }; break
      case 'name':
        if (!bulkValue.trim()) return
        payload = { name: bulkValue.trim() }; break
      default:
        payload = { [bulkField]: bulkValue || null }
    }
    setIsBulkPending(true)
    try {
      await Promise.all([...selected].map(id => updateMovement(id, payload)))
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['annual'] })
      qc.invalidateQueries({ queryKey: ['accounts-summary'] })
      clearBulk()
    } finally { setIsBulkPending(false) }
  }

  const BSEL = 'border border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400'

  const bulkValueInput = () => {
    switch (bulkField) {
      case 'account_id':
        return (
          <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className={BSEL}>
            <option value="">{t('movements.choose')}</option>
            <option value="0">{t('movements.bulkNoAccount')}</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )
      case 'movement_type_id':
        return (
          <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className={BSEL}>
            <option value="">{t('movements.choose')}</option>
            <option value="0">{t('movements.bulkNoCategory')}</option>
            {types.map(tp => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
          </select>
        )
      case 'paid': case 'no_count':
        return (
          <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className={BSEL}>
            <option value="">{t('movements.choose')}</option>
            <option value="true">{t('common.yes')}</option>
            <option value="false">{t('common.no')}</option>
          </select>
        )
      case 'date': case 'bank_date':
        return <input type="date" value={bulkValue} onChange={e => setBulkValue(e.target.value)} className={BSEL} />
      case 'name':
        return <input type="text" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder={t('movements.bulkNewName')} className={BSEL + ' min-w-[160px]'} />
      case 'notes':
        return <input type="text" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder={t('movements.bulkNewValue')} className={BSEL + ' min-w-[160px]'} />
      case 'money':
        return <input type="number" step="0.01" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder={t('movements.bulkAmountPh')} className={BSEL + ' w-28'} />
      default: return null
    }
  }
  const toggleSort = (key: ColKey) =>
    setSort(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node))
        setShowColPicker(false)
      if (yearPickerRef.current && !yearPickerRef.current.contains(e.target as Node))
        setShowYearPicker(false)
      if (exportPickerRef.current && !exportPickerRef.current.contains(e.target as Node))
        setShowExportPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!selectAllRef.current) return
    const total = filteredMovements.length
    const n = filteredMovements.filter(m => selected.has(m.id)).length
    selectAllRef.current.checked = total > 0 && n === total
    selectAllRef.current.indeterminate = n > 0 && n < total
  })

  const toggleCol = (key: ColKey) => {
    const next = new Set(visibleCols)
    if (next.has(key)) { if (next.size > 1) next.delete(key) } else next.add(key)
    setVisibleCols(next); saveSet('movements-cols', next)
  }

  const startResize = (key: ColKey, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startW = colWidths[key]
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(50, startW + ev.clientX - startX)
      setColWidths(prev => { const next = { ...prev, [key]: w }; syncPref('movements-widths', JSON.stringify(next)); return next })
    }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }

  const reorderCol = (from: ColKey, to: ColKey, side: 'left' | 'right') => {
    if (from === to) return
    const order = [...colOrder]
    order.splice(order.indexOf(from), 1)
    const toIdx = order.indexOf(to)
    order.splice(side === 'right' ? toIdx + 1 : toIdx, 0, from)
    setColOrder(order)
    syncPref('movements-col-order', JSON.stringify(order))
  }

  const { data: allMovementsForYears = [] } = useQuery({
    queryKey: ['movements-all'],
    queryFn: () => getMovements(),
  })
  const availableYears = useMemo(() =>
    [...new Set(allMovementsForYears.map(mv => new Date(mv.date + 'T00:00:00').getFullYear()))].sort((a, b) => b - a)
  , [allMovementsForYears])

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['movements', year],
    queryFn: () => getMovements(year !== null ? { year } : undefined),
  })
  const { data: types = [] } = useQuery({ queryKey: ['movement-types'], queryFn: getMovementTypes })
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: getGroups })
  const typeMap = Object.fromEntries(types.map(t => [t.id, { name: t.name, color: t.color }]))
  const typeToGroupMap = useMemo(() => Object.fromEntries(types.map(t => [t.id, t.income_expense_group_id])), [types])
  const { data: accountsSummary } = useQuery({ queryKey: ['accounts-summary'], queryFn: () => import('../api/accounts').then(m => m.getAccountsSummary()) })
  const accounts = accountsSummary?.accounts ?? []
  const accountMap = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a.name])), [accounts])

  // Daily balance: balance of the main account at the END of each calendar day.
  // All movements on the same date show the same value — avoids same-day ordering issues.
  const dailyBalance = useMemo(() => {
    const main = accounts.find(a => a.is_main)
    if (!main) return new Map<string, number>()
    const byDate = new Map<string, number>()
    for (const mv of allMovementsForYears) {
      byDate.set(mv.date, (byDate.get(mv.date) ?? 0) + mv.dinero)
    }
    const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a)) // newest first
    const map = new Map<string, number>()
    let bal = main.balance
    for (const date of dates) {
      map.set(date, bal)        // balance after all movements of this day
      bal -= byDate.get(date)!  // step back before this day
    }
    return map
  }, [allMovementsForYears, accounts])

  const sortedMovements = useMemo(() => {
    if (!sort) {
      // When no explicit sort, apply dayOrder overrides within same-day groups only
      if (Object.keys(dayOrder).length === 0) return movements
      const apiPos = new Map(movements.map((mv, i) => [mv.id, i]))
      return [...movements].sort((a, b) => {
        if (a.date !== b.date) return apiPos.get(a.id)! - apiPos.get(b.id)!
        const order = dayOrder[a.date]
        if (!order) return apiPos.get(a.id)! - apiPos.get(b.id)!
        const pa = order.indexOf(a.id), pb = order.indexOf(b.id)
        if (pa !== -1 && pb !== -1) return pa - pb
        return apiPos.get(a.id)! - apiPos.get(b.id)!
      })
    }
    return [...movements].sort((a, b) => {
      const d = sort.dir === 'asc' ? 1 : -1
      switch (sort.key) {
        case 'date': {
          const dc = a.date.localeCompare(b.date)
          if (dc !== 0) return d * dc
          const order = dayOrder[a.date]
          if (order) {
            const pa = order.indexOf(a.id), pb = order.indexOf(b.id)
            if (pa !== -1 && pb !== -1) return pa - pb
          }
          return a.id - b.id
        }
        case 'bank_date': return d * ((a.bank_date ?? '').localeCompare(b.bank_date ?? ''))
        case 'name':      return d * a.name.localeCompare(b.name, 'es')
        case 'amount':    return d * (a.dinero - b.dinero)
        case 'type': {
          const na = typeMap[a.movement_type_id ?? 0]?.name ?? ''
          const nb = typeMap[b.movement_type_id ?? 0]?.name ?? ''
          return d * na.localeCompare(nb, 'es')
        }
        case 'paid':     return d * (Number(a.paid) - Number(b.paid))
        case 'no_count': return d * (Number(a.no_count) - Number(b.no_count))
        case 'notes':    return d * ((a.notes ?? '').localeCompare(b.notes ?? '', 'es'))
        default: return 0
      }
    })
  }, [movements, sort, typeMap, dayOrder])

  const filteredMovements = useMemo(() => {
    const base = applyAdvancedFilter(sortedMovements, advFilter, typeToGroupMap)
    if (!quickSearch.trim()) return base
    const q = quickSearch.toLowerCase()
    return base.filter(mv => mv.name.toLowerCase().includes(q))
  }, [sortedMovements, advFilter, typeToGroupMap, quickSearch])

  // Dates that have more than one movement in the current view (eligible for drag reorder)
  const sameDayDates = useMemo(() => {
    const counts = new Map<string, number>()
    for (const mv of filteredMovements) counts.set(mv.date, (counts.get(mv.date) ?? 0) + 1)
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([d]) => d))
  }, [filteredMovements])

  // For date-grouped view: maps the first movement's id in each day → rowspan count.
  // Movements that are NOT first in their day are absent from this map (their balance cell is skipped).
  const daySpans = useMemo(() => {
    const grouped = !sort || sort.key === 'date'
    if (!grouped) return new Map<number, number>()
    const firstId = new Map<string, number>()
    const count = new Map<string, number>()
    for (const mv of filteredMovements) {
      if (!firstId.has(mv.date)) firstId.set(mv.date, mv.id)
      count.set(mv.date, (count.get(mv.date) ?? 0) + 1)
    }
    const result = new Map<number, number>()
    for (const [date, id] of firstId.entries()) result.set(id, count.get(date)!)
    return result
  }, [filteredMovements, sort])

  function reorderDay(date: string, fromId: number, toId: number) {
    const dayMvIds = filteredMovements.filter(mv => mv.date === date).map(mv => mv.id)
    const existing = dayOrder[date]
    let order = existing
      ? [...existing.filter(id => dayMvIds.includes(id)), ...dayMvIds.filter(id => !existing.includes(id))]
      : [...dayMvIds]
    const withoutFrom = order.filter(id => id !== fromId)
    const toIdx = withoutFrom.indexOf(toId)
    if (toIdx === -1) return
    withoutFrom.splice(toIdx, 0, fromId)
    const next = { ...dayOrder, [date]: withoutFrom }
    setDayOrder(next)
    syncPref('movements-day-order', JSON.stringify(next))
  }

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => updateMovement(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['annual'] })
      qc.invalidateQueries({ queryKey: ['accounts-summary'] })
      setDraft(null)
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteMovement,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['annual'] })
      qc.invalidateQueries({ queryKey: ['accounts-summary'] })
    },
  })

  const enterEdit = (e: React.MouseEvent, mv: Movement) => {
    e.stopPropagation()
    if (draft?.id === mv.id) return
    setDraft(toDraft(mv))
  }

  const setField = <K extends keyof DraftRow>(k: K, v: DraftRow[K]) =>
    setDraft(d => d ? { ...d, [k]: v } : d)

  const saveRow = (mv: Movement) => {
    if (!draft || draft.id !== mv.id) return
    updateMut.mutate({ id: mv.id, data: draftPayload(draft, mv) })
  }

  const visibleList = colOrder.filter(k => visibleCols.has(k)).map(k => COLS.find(c => c.key === k)!)

  const thCls = (align: string) =>
    `py-3 text-${align} text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 relative select-none overflow-hidden`

  // Balance column only makes sense when rows are in date order
  const showBalance = !sort || sort.key === 'date'

  return (
    <div className="p-3 md:p-6 space-y-4">
      {showForm && <MovementForm onClose={() => setShowForm(false)} />}
      {selectedMv && (
        <MovementDetailModal
          movement={selectedMv}
          types={types}
          onClose={() => setSelectedMv(null)}
        />
      )}
      {ctxMenu && (
        <MovementContextMenu
          menu={ctxMenu}
          onDuplicate={mv => { createMovement(duplicatePayload(mv)).then(() => { qc.invalidateQueries({ queryKey: ['movements'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }) }) }}
          onDelete={mv => { if (confirm(t('movements.deleteConfirm').replace('{name}', mv.name))) deleteMut.mutate(mv.id) }}
          onClose={() => setCtxMenu(null)}
        />
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button onClick={() => setViewMode('table')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-800 dark:text-gray-100' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`} title={t('movements.tableTitle')}>
              <Table2 className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('calendar')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'calendar' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-800 dark:text-gray-100' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`} title={t('movements.calendarTitle')}>
              <CalendarDays className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('kanban')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'kanban' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-800 dark:text-gray-100' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`} title={t('movements.kanbanTitle')}>
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
            {t('movements.title')}
            <div ref={yearPickerRef} className="relative">
              <button
                onClick={() => setShowYearPicker(v => !v)}
                className="flex items-center gap-1 text-2xl font-bold text-gray-800 dark:text-white hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
              >
                {year ?? t('movements.all')}
                <ChevronDown className="w-5 h-5 mt-0.5 text-gray-400" />
              </button>
              {showYearPicker && (
                <div className="absolute left-0 top-full mt-1 z-30 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-lg py-1 min-w-[100px]">
                  {[null, ...availableYears].map(y => (
                    <button
                      key={y ?? 'all'}
                      onClick={() => { setYear(y); setShowYearPicker(false) }}
                      className={`w-full text-left px-4 py-1.5 text-sm transition-colors ${
                        year === y
                          ? 'font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      {y ?? t('movements.all')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Favoritos guardados */}
          {favorites.map(fav => (
            <button key={fav.id} onClick={() => applyFilter(fav.filter, fav.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                activeFavId === fav.id
                  ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 border-transparent'
                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}>
              {fav.name}
            </button>
          ))}

          {/* Búsqueda rápida */}
          {showSearch && (
            <input
              ref={searchInputRef}
              autoFocus
              type="text"
              value={quickSearch}
              onChange={e => setQuickSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { setShowSearch(false); setQuickSearch('') } }}
              placeholder={t('movements.searchPh')}
              className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
            />
          )}
          <button
            onClick={() => { const next = !showSearch; setShowSearch(next); if (!next) setQuickSearch('') }}
            title={t('movements.searchTitle')}
            className={`p-1.5 rounded-lg border transition-colors ${
              showSearch || quickSearch
                ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 border-transparent'
                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          {/* Filtros */}
          <button onClick={() => setShowFilters(v => !v)}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 border text-sm font-medium rounded-lg transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 border-transparent'
                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}>
            <Filter className="w-3.5 h-3.5" strokeWidth={1.5} />
            {t('movements.filtersBtn')}
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center font-bold">{activeFilterCount}</span>
            )}
          </button>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors">
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            {t('movements.newBtn')}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="space-y-2">
          {favorites.length > 0 && (
            <div className="flex flex-wrap gap-2 px-1">
              {favorites.map(fav => (
                <span key={fav.id} className={`flex items-center gap-1 rounded-lg text-sm border transition-colors ${
                  activeFavId === fav.id
                    ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 border-transparent'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                }`}>
                  <button onClick={() => applyFilter(fav.filter, fav.id)} className="pl-3 pr-1 py-1">{fav.name}</button>
                  <button onClick={() => deleteFavorite(fav.id)} className={`pr-2 py-1 transition-colors ${activeFavId === fav.id ? 'text-gray-400 hover:text-white' : 'text-gray-300 dark:text-gray-600 hover:text-red-400'}`}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <FilterPanel filter={advFilter} onChange={f => { setAdvFilter(f); setActiveFavId(null) }} types={types} groups={groups} />
        </div>
      )}

      {showFilters && activeFilterCount > 0 && (
        <div className="flex items-center gap-2">
          {showSaveInput ? (
            <>
              <input
                autoFocus
                type="text"
                value={savingName}
                onChange={e => setSavingName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitSave(); if (e.key === 'Escape') { setShowSaveInput(false); setSavingName('') } }}
                placeholder={t('movements.filterNamePh')}
                className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
              />
              <button onClick={commitSave} disabled={!savingName.trim()} className="px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors">
                {t('common.save')}
              </button>
              <button onClick={() => { setShowSaveInput(false); setSavingName('') }} className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">
                {t('common.cancel')}
              </button>
            </>
          ) : (
            <button onClick={() => setShowSaveInput(true)} className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
              <Bookmark className="w-3.5 h-3.5" strokeWidth={1.5} />
              {t('movements.saveFilter')}
            </button>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex items-center gap-2.5 flex-wrap px-4 py-2.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl text-sm">
          <span className="font-semibold text-blue-700 dark:text-blue-300 shrink-0">
            {selected.size} {t('movements.nSelected')}
          </span>

          <div className="w-px h-4 bg-blue-200 dark:bg-blue-700 shrink-0" />

          <button onClick={bulkDelete} disabled={isBulkPending}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800 transition-colors disabled:opacity-50">
            <Trash2 className="w-3.5 h-3.5" />
            {t('common.delete')}
          </button>
          <button onClick={bulkDuplicate} disabled={isBulkPending}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-blue-200 dark:border-blue-800 transition-colors disabled:opacity-50">
            <Copy className="w-3.5 h-3.5" />
            {t('movements.duplicate')}
          </button>

          <div className="relative" ref={exportPickerRef}>
            <button onClick={() => setShowExportPicker(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${showExportPicker ? 'bg-gray-100 dark:bg-gray-700 border-blue-300 dark:border-blue-700 text-gray-700 dark:text-gray-200' : 'bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              <Download className="w-3.5 h-3.5" />
              {t('movements.exportBtn')}
            </button>
            {showExportPicker && (
              <div className="absolute left-0 top-full mt-1 z-30 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-3 min-w-[190px]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('movements.exportFields')}</span>
                  <div className="flex gap-2 text-xs">
                    <button onClick={() => setExportFields(new Set(EXPORT_FIELDS.map(f => f.key)))} className="text-blue-500 hover:text-blue-700 dark:hover:text-blue-300">{t('movements.exportAll')}</button>
                    <button onClick={() => setExportFields(new Set())} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">{t('movements.exportNone')}</button>
                  </div>
                </div>
                {EXPORT_FIELDS.map(f => (
                  <label key={f.key} className="flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                    <input type="checkbox" checked={exportFields.has(f.key)}
                      onChange={() => setExportFields(prev => { const n = new Set(prev); n.has(f.key) ? n.delete(f.key) : n.add(f.key); return n })}
                      className="rounded border-gray-300 dark:border-gray-600" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{f.label}</span>
                  </label>
                ))}
                <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <button onClick={exportCSV} disabled={exportFields.size === 0}
                    className="w-full px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors disabled:opacity-40">
                    {t('movements.downloadCSV')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-blue-200 dark:bg-blue-700 shrink-0" />

          <select value={bulkField} onChange={e => { const f = e.target.value; setBulkField(f); setBulkValue(f === 'paid' || f === 'no_count' ? 'true' : '') }} className={BSEL}>
            <option value="">{t('movements.bulkModifyField')}</option>
            <option value="name">{t('movements.colName')}</option>
            <option value="money">{t('movements.colAmount')}</option>
            <option value="account_id">{t('common.account')}</option>
            <option value="movement_type_id">{t('common.type')}</option>
            <option value="paid">{t('movements.colPaid')}</option>
            <option value="no_count">{t('movements.colNoCount')}</option>
            <option value="date">{t('movements.dateField')}</option>
            <option value="bank_date">{t('movements.bankDateField')}</option>
            <option value="notes">{t('movements.colNotes')}</option>
          </select>

          {bulkField && bulkValueInput()}

          {bulkField && bulkValue !== '' && (
            <button onClick={bulkApply} disabled={isBulkPending}
              className="px-3 py-1 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
              {isBulkPending ? t('movements.bulkApplying') : t('movements.bulkApply')}
            </button>
          )}

          <div className="flex-1" />

          <button onClick={clearBulk} className="text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-200 transition-colors">
            {t('movements.bulkClear')}
          </button>
        </div>
      )}

      {viewMode === 'calendar' && (
        <CalendarView movements={filteredMovements} types={types} selectedYear={year} />
      )}

      {viewMode === 'kanban' && (
        <KanbanView allTypes={types} />
      )}

      {viewMode === 'table' && (isLoading ? <p className="text-gray-400">{t('common.loading')}</p> : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-x-auto">
          <table className="text-sm" style={{ tableLayout: 'fixed', width: '100%', minWidth: visibleList.reduce((s, c) => s + colWidths[c.key], 0) + 4 + 20 + 36 + 64 + (showBalance ? 110 : 0) }}>
            <colgroup>
              <col style={{ width: 4 }} />
              <col style={{ width: 20 }} />
              <col style={{ width: 36 }} />
              {visibleList.map(c => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
              <col style={{ width: 64 }} />
              {showBalance && <col style={{ width: 110 }} />}
            </colgroup>

            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="w-1 px-0" />
                <th className="w-5 px-0" />
                <th className="py-3 text-center">
                  <input ref={selectAllRef} type="checkbox" onChange={toggleAll}
                    className="rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 cursor-pointer" />
                </th>
                {visibleList.map(col => (
                  <th
                    key={col.key}
                    draggable
                    onDragStart={e => {
                      const ghost = new Image(); ghost.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
                      e.dataTransfer.setDragImage(ghost, 0, 0)
                      setDragCol(col.key)
                    }}
                    onDragOver={e => {
                      e.preventDefault()
                      const rect = e.currentTarget.getBoundingClientRect()
                      setDragOver({ col: col.key, side: e.clientX < rect.left + rect.width / 2 ? 'left' : 'right' })
                    }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={e => {
                      e.preventDefault()
                      if (dragCol && dragOver) reorderCol(dragCol, dragOver.col, dragOver.side)
                      setDragCol(null); setDragOver(null)
                    }}
                    onDragEnd={() => { setDragCol(null); setDragOver(null) }}
                    onClick={() => toggleSort(col.key)}
                    className={`${thCls(col.align)} cursor-grab ${dragCol === col.key ? 'opacity-40' : ''}`}
                    style={{
                      paddingLeft: 16,
                      paddingRight: 24,
                      boxShadow: dragOver?.col === col.key
                        ? dragOver.side === 'left' ? '-2px 0 0 #3b82f6' : '2px 0 0 #3b82f6'
                        : undefined,
                    }}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sort?.key === col.key && (
                        sort.dir === 'asc'
                          ? <ChevronUp className="w-3 h-3" />
                          : <ChevronDown className="w-3 h-3" />
                      )}
                    </span>
                    <div
                      draggable={false}
                      onClick={e => e.stopPropagation()}
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize flex items-center justify-center group/r"
                      onMouseDown={e => startResize(col.key, e)}
                    >
                      <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 group-hover/r:bg-gray-400 transition-colors" />
                    </div>
                  </th>
                ))}
                <th className="px-2 py-3 text-right w-16">
                  <div className="relative inline-block" ref={colPickerRef}>
                    <button onClick={() => setShowColPicker(v => !v)}
                      className={`p-1 rounded-lg transition-colors ${showColPicker ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                      <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    {showColPicker && (
                      <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-2 min-w-[150px]">
                        {COLS.map(col => (
                          <label key={col.key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                            <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => toggleCol(col.key)} className="rounded" />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{col.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </th>
                {showBalance && (
                  <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t('movements.colBalance')}
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {filteredMovements.map((mv: Movement) => {
                const typeInfo = mv.movement_type_id ? typeMap[mv.movement_type_id] : null
                const color = mv.color ?? '#e5e7eb'
                const isEditing = draft?.id === mv.id
                const d = isEditing ? draft! : null

                const p = (align: string) => ({ paddingLeft: 16, paddingRight: align === 'center' ? 16 : 24 })

                const cellCls = `py-2.5 overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer`

                const isSameDay = sameDayDates.has(mv.date)
                const balRowSpan = daySpans.get(mv.id)
                return (
                  <>
                    <tr key={mv.id}
                      className={`transition-colors group border-t border-gray-50 dark:border-gray-800 ${isEditing ? 'bg-blue-50/40 dark:bg-blue-950/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer'} ${rowDragOver === mv.id ? 'outline outline-2 -outline-offset-2 outline-blue-400' : ''}`}
                      onClick={() => { if (!isEditing) setDraft(toDraft(mv)) }}
                      onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, mv }) }}
                      onDragOver={e => {
                        const drag = rowDragRef.current
                        if (drag && drag.date === mv.date && drag.id !== mv.id) { e.preventDefault(); setRowDragOver(mv.id) }
                      }}
                      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setRowDragOver(null) }}
                      onDrop={e => {
                        e.preventDefault()
                        const drag = rowDragRef.current
                        if (drag && drag.date === mv.date && drag.id !== mv.id) reorderDay(mv.date, drag.id, mv.id)
                        rowDragRef.current = null; setRowDragOver(null)
                      }}
                    >

                      <td className="w-1 p-0">
                        <div className="w-1 min-h-[44px]" style={{ backgroundColor: color }} />
                      </td>

                      <td className="w-5 p-0" onClick={e => e.stopPropagation()}>
                        {isSameDay && (
                          <div
                            draggable
                            className="w-5 min-h-[44px] flex items-center justify-center cursor-grab text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
                            onDragStart={e => {
                              e.stopPropagation()
                              e.dataTransfer.effectAllowed = 'move'
                              e.dataTransfer.setData('text/plain', String(mv.id))
                              rowDragRef.current = { id: mv.id, date: mv.date }
                            }}
                            onDragEnd={() => { rowDragRef.current = null; setRowDragOver(null) }}
                          >
                            <GripVertical className="w-3 h-3" />
                          </div>
                        )}
                      </td>

                      <td className="text-center" onClick={e => toggleSelect(mv.id, e)}>
                        <input type="checkbox" readOnly checked={selected.has(mv.id)}
                          className={`rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 cursor-pointer pointer-events-none transition-opacity ${selected.size > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                      </td>

                      {visibleList.map(col => {
                        const st = p(col.align)
                        switch (col.key) {
                          case 'date': return (
                            <td key="date" className={cellCls + ' text-gray-500 dark:text-gray-400 tabular-nums'} style={st} onClick={e => enterEdit(e, mv)}>
                              {isEditing ? <input type="date" value={d!.date} className={INPUT} onChange={e => setField('date', e.target.value)} onClick={e => e.stopPropagation()} /> : fmtDate(mv.date)}
                            </td>
                          )
                          case 'name': return (
                            <td key="name" className={cellCls + ' font-medium text-gray-800 dark:text-gray-100'} style={st}
                              onClick={e => { e.stopPropagation(); setSelectedMv(mv) }}>
                              <span className="flex items-center gap-1.5 min-w-0">
                                <span className="truncate">{mv.name}</span>
                                {mv.is_shared && (() => {
                                  const label = mv.my_share != null
                                    ? `${mv.my_share.toFixed(2)}€ tuyo`
                                    : mv.shared_between ? `1/${mv.shared_between}` : 'compartido'
                                  return <span title={`Compartido: ${label}`} className="flex items-center gap-0.5 text-blue-400 shrink-0"><Users className="w-3 h-3" /><span className="text-xs">{label}</span></span>
                                })()}
                                {mv.notes && <span title={mv.notes}><MessageSquare className="w-3 h-3 text-gray-400 shrink-0" /></span>}
                                {mv.files.length > 0 && <span className="flex items-center gap-0.5 text-gray-400 shrink-0"><Paperclip className="w-3 h-3" /><span className="text-xs">{mv.files.length}</span></span>}
                              </span>
                            </td>
                          )
                          case 'type': return (
                            <td key="type" className={cellCls} style={st} onClick={e => enterEdit(e, mv)}>
                              {isEditing
                                ? <select value={d!.movement_type_id} className={INPUT + ' text-xs'} onChange={e => setField('movement_type_id', e.target.value)} onClick={e => e.stopPropagation()}>
                                    <option value="">{t('movements.bulkNoCategory')}</option>
                                    {types.map(tp => <option key={tp.id} value={tp.id}>{tp.category} / {tp.name}</option>)}
                                  </select>
                                : typeInfo
                                  ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: color + '22', color }}>{typeInfo.name}</span>
                                  : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
                            </td>
                          )
                          case 'amount': return (
                            <td key="amount" className={cellCls + ` font-mono font-semibold text-right ${mv.dinero >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`} style={st} onClick={e => enterEdit(e, mv)}>
                              {isEditing ? <input type="number" step="0.01" value={d!.money} className={INPUT + ' text-right'} onChange={e => setField('money', e.target.value)} onClick={e => e.stopPropagation()} /> : fmt(mv.dinero)}
                            </td>
                          )
                          case 'paid': return (
                            <td key="paid" className={cellCls + ' text-center'} style={st} onClick={e => { if (isEditing) { e.stopPropagation(); setField('paid', !d!.paid) } else enterEdit(e, mv) }}>
                              {(isEditing ? d!.paid : mv.paid) ? <Check className="w-3.5 h-3.5 mx-auto text-gray-400" strokeWidth={2.5} /> : <span className="text-gray-200 dark:text-gray-700">—</span>}
                            </td>
                          )
                          case 'bank_date': return (
                            <td key="bank_date" className={cellCls + ' text-gray-500 dark:text-gray-400 tabular-nums'} style={st} onClick={e => enterEdit(e, mv)}>
                              {isEditing ? <input type="date" value={d!.bank_date} className={INPUT} onChange={e => setField('bank_date', e.target.value)} onClick={e => e.stopPropagation()} /> : mv.bank_date ? fmtDate(mv.bank_date) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                            </td>
                          )
                          case 'notes': return (
                            <td key="notes" className={cellCls + ' text-gray-500 dark:text-gray-400'} style={st} onClick={e => enterEdit(e, mv)}>
                              {isEditing ? <input type="text" value={d!.notes} className={INPUT} onChange={e => setField('notes', e.target.value)} onClick={e => e.stopPropagation()} /> : mv.notes ? <span className="truncate block">{mv.notes}</span> : <span className="text-gray-300 dark:text-gray-600">—</span>}
                            </td>
                          )
                          case 'no_count': return (
                            <td key="no_count" className={cellCls + ' text-center'} style={st} onClick={e => { if (isEditing) { e.stopPropagation(); setField('no_count', !d!.no_count) } else enterEdit(e, mv) }}>
                              {(isEditing ? d!.no_count : mv.no_count) ? <Check className="w-3.5 h-3.5 mx-auto text-gray-400" strokeWidth={2.5} /> : <span className="text-gray-200 dark:text-gray-700">—</span>}
                            </td>
                          )
                        }
                      })}

                      {/* Acciones */}
                      <td className="py-2.5 px-2 text-right" onClick={e => e.stopPropagation()}>
                        {isEditing ? (
                          <span className="flex items-center justify-end gap-1">
                            <button onClick={() => saveRow(mv)} disabled={updateMut.isPending}
                              className="p-1 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-950 transition-colors" title={t('common.save')}>
                              <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                            </button>
                            <button onClick={() => setDraft(null)}
                              className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title={t('common.cancel')}>
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ) : (
                          <button onClick={() => { if (confirm(t('movements.deleteConfirm').replace('{name}', mv.name))) deleteMut.mutate(mv.id) }}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all p-1">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                      {(() => {
                        if (!showBalance || balRowSpan === undefined) return null
                        const bal = dailyBalance.get(mv.date)
                        return (
                          <td rowSpan={balRowSpan} onClick={e => e.stopPropagation()}
                            className="py-2.5 px-4 font-mono tabular-nums text-sm text-right text-gray-600 dark:text-gray-300"
                            style={balRowSpan > 1 ? { verticalAlign: 'middle' } : undefined}>
                            {bal !== undefined
                              ? <span className={bal >= 0 ? 'text-gray-600 dark:text-gray-300' : 'text-red-500 dark:text-red-400'}>{fmt(bal)}</span>
                              : <span className="text-gray-300 dark:text-gray-600">—</span>}
                          </td>
                        )
                      })()}
                    </tr>
                  </>
                )
              })}
            </tbody>
          </table>

          {filteredMovements.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Inbox className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" strokeWidth={1} />
              <p>{t('movements.noMovementsMsg')}</p>
              <button onClick={() => setShowForm(true)} className="mt-3 text-sm text-gray-500 underline hover:text-gray-700">
                {t('movements.addFirst')}
              </button>
            </div>
          )}
        </div>
      ))}

    </div>
  )
}
