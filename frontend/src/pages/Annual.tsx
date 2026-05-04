import React, { useRef, useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAnnualStats } from '../api/stats'
import { getMovements } from '../api/movements'
import { ChevronDown, ChevronRight, GripVertical, Eye, EyeOff, Download } from 'lucide-react'
import { useCurrency } from '../hooks/useCurrency'

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

interface MType { id: number; name: string; monthly: Record<string,number>; total: number; media: number }
interface Group { id: number; name: string; color: string; monthly: Record<string,number>; total: number; media: number; movement_types: MType[] }

function loadLS<T>(key: string, fallback: T): T {
  try { const s = localStorage.getItem(key); if (s) return JSON.parse(s) } catch { /**/ }
  return fallback
}
function saveLS(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /**/ }
}

export default function Annual() {
  const { fmt: fmtMoney } = useCurrency()
  const fmt = (v: number) => v === 0 ? '—' : fmtMoney(v, 0)
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [showYearPicker, setShowYearPicker] = useState(false)
  const yearPickerRef = useRef<HTMLDivElement>(null)

  const [groupOrder, setGroupOrder]   = useState<number[]>(() => loadLS('annual-group-order', []))
  const [typeOrder, setTypeOrder]     = useState<Record<number,number[]>>(() => loadLS('annual-type-order', {}))
  const [collapsed, setCollapsed]     = useState<Set<number>>(() => new Set(loadLS<number[]>('annual-collapsed', [])))
  const [showGroups, setShowGroups]   = useState<boolean>(() => loadLS('annual-show-groups', true))

  const dragging = useRef<
    | { kind: 'group'; idx: number }
    | { kind: 'type'; groupId: number; idx: number }
    | null
  >(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const { data: allMovements = [] } = useQuery({
    queryKey: ['movements-all'],
    queryFn: () => getMovements(),
  })
  const availableYears = useMemo(() =>
    [...new Set(allMovements.map(mv => new Date(mv.date + 'T00:00:00').getFullYear()))].sort((a, b) => b - a)
  , [allMovements])

  const { data, isLoading } = useQuery({ queryKey: ['annual', year], queryFn: () => getAnnualStats(year) })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (yearPickerRef.current && !yearPickerRef.current.contains(e.target as Node))
        setShowYearPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const sortedGroups = useMemo(() => {
    if (!data) return []
    const groups = [...(data.groups as Group[])]
    const ordered = groupOrder.map(id => groups.find(g => g.id === id)).filter(Boolean) as Group[]
    const missing  = groups.filter(g => !groupOrder.includes(g.id))
    return [...ordered, ...missing].map(g => ({
      ...g,
      movement_types: [...g.movement_types].sort((a, b) => {
        const ord = typeOrder[g.id] ?? []
        const ai = ord.indexOf(a.id), bi = ord.indexOf(b.id)
        if (ai === -1 && bi === -1) return 0
        if (ai === -1) return 1
        if (bi === -1) return -1
        return ai - bi
      }),
    }))
  }, [data, groupOrder, typeOrder])

  const allCollapsed = sortedGroups.length > 0 && sortedGroups.every(g => collapsed.has(g.id))

  function toggleAll() {
    if (allCollapsed) {
      setCollapsed(new Set())
      saveLS('annual-collapsed', [])
    } else {
      const all = new Set(sortedGroups.map(g => g.id))
      setCollapsed(all)
      saveLS('annual-collapsed', [...all])
    }
  }

  function toggleGroup(id: number) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      saveLS('annual-collapsed', [...next])
      return next
    })
  }

  function toggleShowGroups() {
    setShowGroups(prev => { saveLS('annual-show-groups', !prev); return !prev })
  }

  // ── Drag handlers ──────────────────────────────────────────────────────────────

  function onGroupDragStart(idx: number) { dragging.current = { kind: 'group', idx } }
  function onGroupDragOver(e: React.DragEvent, idx: number) { e.preventDefault(); setDropTarget(`g-${idx}`) }
  function onGroupDrop(e: React.DragEvent, toIdx: number) {
    e.preventDefault(); setDropTarget(null)
    if (!dragging.current || dragging.current.kind !== 'group') return
    const fromIdx = dragging.current.idx
    if (fromIdx === toIdx) { dragging.current = null; return }
    const ids = sortedGroups.map(g => g.id)
    const [moved] = ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, moved)
    setGroupOrder(ids); saveLS('annual-group-order', ids)
    dragging.current = null
  }

  function onTypeDragStart(groupId: number, idx: number) { dragging.current = { kind: 'type', groupId, idx } }
  function onTypeDragOver(e: React.DragEvent, groupId: number, idx: number) {
    e.preventDefault(); setDropTarget(`t-${groupId}-${idx}`)
  }
  function onTypeDrop(e: React.DragEvent, groupId: number, toIdx: number) {
    e.preventDefault(); setDropTarget(null)
    if (!dragging.current || dragging.current.kind !== 'type' || dragging.current.groupId !== groupId) return
    const fromIdx = dragging.current.idx
    if (fromIdx === toIdx) { dragging.current = null; return }
    const g = sortedGroups.find(g => g.id === groupId)
    if (!g) return
    const ids = g.movement_types.map(mt => mt.id)
    const [moved] = ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, moved)
    const next = { ...typeOrder, [groupId]: ids }
    setTypeOrder(next); saveLS('annual-type-order', next)
    dragging.current = null
  }

  function onDragEnd() { dragging.current = null; setDropTarget(null) }

  // ── Export ─────────────────────────────────────────────────────────────────────

  function exportCSV() {
    const rows: string[][] = [['Categoría / Tipo', ...MONTHS.map(m => m.slice(0, 3)), 'Media', 'Total']]
    for (const g of sortedGroups) {
      if (showGroups)
        rows.push([g.name, ...MONTHS.map(m => String(g.monthly[m] ?? 0)), String(Math.round(g.media)), String(g.total)])
      for (const mt of g.movement_types)
        rows.push([showGroups ? `  ${mt.name}` : mt.name, ...MONTHS.map(m => String(mt.monthly[m] ?? 0)), String(mt.media), String(mt.total)])
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `finanzas-${year}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) return <div className="p-8 text-gray-500">Cargando...</div>
  if (!data) return null

  const btnCls = 'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors'
  const GRIP   = 'cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors'

  return (
    <div className="p-3 md:p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
          Finanzas
          <div ref={yearPickerRef} className="relative">
            <button
              onClick={() => setShowYearPicker(v => !v)}
              className="flex items-center gap-1 text-2xl font-bold text-gray-800 dark:text-white hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
            >
              {year}
              <ChevronDown className="w-5 h-5 mt-0.5 text-gray-400" />
            </button>
            {showYearPicker && (
              <div className="absolute left-0 top-full mt-1 z-30 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-lg py-1 min-w-[100px]">
                {availableYears.map(y => (
                  <button key={y} onClick={() => { setYear(y); setShowYearPicker(false) }}
                    className={`w-full text-left px-4 py-1.5 text-sm transition-colors ${year === y
                      ? 'font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    {y}
                  </button>
                ))}
              </div>
            )}
          </div>
        </h1>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={toggleAll} className={btnCls}>
            {allCollapsed ? <ChevronDown className="w-3.5 h-3.5"/> : <ChevronRight className="w-3.5 h-3.5"/>}
            {allCollapsed ? 'Desplegar todos' : 'Plegar todos'}
          </button>
          <button onClick={toggleShowGroups} className={btnCls}>
            {showGroups ? <EyeOff className="w-3.5 h-3.5"/> : <Eye className="w-3.5 h-3.5"/>}
            {showGroups ? 'Ocultar tipos' : 'Mostrar tipos'}
          </button>
          <button onClick={exportCSV} className={btnCls}>
            <Download className="w-3.5 h-3.5"/>
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            <tr>
              <th className="w-6 px-0"></th>
              <th className="w-1 px-0"></th>
              <th className="px-4 py-3 text-left min-w-[180px]">Categoría / Tipo</th>
              {MONTHS.map(m => <th key={m} className="px-3 py-3 text-right capitalize">{m.slice(0,3)}</th>)}
              <th className="px-3 py-3 text-right">Media</th>
              <th className="px-3 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-950">
            {sortedGroups.map((group, gIdx) => (
              <React.Fragment key={group.id}>
                {/* ── Group header ── */}
                {showGroups && (
                  <tr
                    draggable
                    onDragStart={() => onGroupDragStart(gIdx)}
                    onDragOver={e => onGroupDragOver(e, gIdx)}
                    onDrop={e => onGroupDrop(e, gIdx)}
                    onDragEnd={onDragEnd}
                    className={`font-semibold border-t-2 transition-colors ${
                      dropTarget === `g-${gIdx}` ? 'border-t-blue-400' : 'border-t-gray-100 dark:border-t-gray-800'
                    }`}
                    style={{ backgroundColor: group.color + '12' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = group.color + '22')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = group.color + '12')}
                  >
                    <td className="w-6 px-1.5">
                      <GripVertical className={`w-3.5 h-3.5 ${GRIP}`}/>
                    </td>
                    <td className="w-1 p-0">
                      <div className="w-1.5 min-h-[36px]" style={{ backgroundColor: group.color }}/>
                    </td>
                    <td className="px-4 py-2.5 text-sm" style={{ color: group.color }}>
                      <button className="flex items-center gap-1 w-full text-left"
                        onClick={() => toggleGroup(group.id)}>
                        {collapsed.has(group.id)
                          ? <ChevronRight className="w-4 h-4 shrink-0"/>
                          : <ChevronDown className="w-4 h-4 shrink-0"/>}
                        {group.name}
                      </button>
                    </td>
                    {MONTHS.map(m => (
                      <td key={m} className="px-3 py-2.5 text-right font-mono" style={{ color: group.color }}>
                        {fmt(group.monthly[m])}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right text-gray-400">{fmt(group.media)}</td>
                    <td className="px-3 py-2.5 text-right font-mono" style={{ color: group.color }}>{fmt(group.total)}</td>
                  </tr>
                )}

                {/* ── Subtypes ── */}
                {(!showGroups || !collapsed.has(group.id)) && group.movement_types.map((mt, tIdx) => (
                  <tr
                    key={mt.id}
                    draggable
                    onDragStart={() => onTypeDragStart(group.id, tIdx)}
                    onDragOver={e => onTypeDragOver(e, group.id, tIdx)}
                    onDrop={e => onTypeDrop(e, group.id, tIdx)}
                    onDragEnd={onDragEnd}
                    className={`border-t-2 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-500 dark:text-gray-400 transition-colors ${
                      dropTarget === `t-${group.id}-${tIdx}` ? 'border-t-blue-400' : 'border-t-gray-50 dark:border-t-gray-800'
                    }`}
                  >
                    <td className="w-6 px-1.5">
                      <GripVertical className={`w-3 h-3 ${GRIP}`}/>
                    </td>
                    <td className="w-1 p-0">
                      <div className="w-1.5 min-h-[32px]" style={{ backgroundColor: group.color + '55' }}/>
                    </td>
                    <td className={`px-4 py-1.5 text-gray-600 dark:text-gray-400 ${showGroups ? 'pl-8' : ''}`}>{mt.name}</td>
                    {MONTHS.map(m => (
                      <td key={m} className="px-3 py-1.5 text-right font-mono"
                        style={{ color: mt.monthly[m] !== 0 ? group.color : undefined }}>
                        {fmt(mt.monthly[m])}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right text-gray-400">{fmt(mt.media)}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-medium text-gray-700 dark:text-gray-300">{fmt(mt.total)}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
