import { useRef, useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAnnualStats } from '../api/stats'
import { getMovements } from '../api/movements'
import { ChevronDown } from 'lucide-react'
import { useCurrency } from '../hooks/useCurrency'

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

interface MType { id: number; name: string; monthly: Record<string,number>; total: number; media: number }
interface Group { id: number; name: string; color: string; monthly: Record<string,number>; total: number; movement_types: MType[] }

export default function Annual() {
  const { fmt: fmtMoney } = useCurrency()
  const fmt = (v: number) => v === 0 ? '—' : fmtMoney(v, 0)
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [showYearPicker, setShowYearPicker] = useState(false)
  const yearPickerRef = useRef<HTMLDivElement>(null)

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

  if (isLoading) return <div className="p-8 text-gray-500">Cargando...</div>
  if (!data) return null

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
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
                <button
                  key={y}
                  onClick={() => { setYear(y); setShowYearPicker(false) }}
                  className={`w-full text-left px-4 py-1.5 text-sm transition-colors ${
                    year === y
                      ? 'font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
        </div>
      </h1>
      <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            <tr>
              <th className="w-1 px-0"></th>
              <th className="px-4 py-3 text-left min-w-[180px]">Categoría / Tipo</th>
              {MONTHS.map(m => <th key={m} className="px-3 py-3 text-right capitalize">{m.slice(0,3)}</th>)}
              <th className="px-3 py-3 text-right">Total</th>
              <th className="px-3 py-3 text-right">Media</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-950">
            {data.groups.map((group: Group) => (
              <>
                <tr key={`g-${group.id}`}
                  className="font-semibold border-t border-gray-100 dark:border-gray-800"
                  style={{ backgroundColor: group.color + '12' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = group.color + '22')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = group.color + '12')}
                >
                  <td className="w-1 p-0">
                    <div className="w-1.5 min-h-[36px]" style={{ backgroundColor: group.color }} />
                  </td>
                  <td className="px-4 py-2.5 text-sm" style={{ color: group.color }}>{group.name}</td>
                  {MONTHS.map(m => (
                    <td key={m} className="px-3 py-2.5 text-right font-mono" style={{ color: group.color }}>
                      {fmt(group.monthly[m])}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right font-mono" style={{ color: group.color }}>{fmt(group.total)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-400">—</td>
                </tr>
                {group.movement_types.map((mt: MType) => (
                  <tr key={`mt-${mt.id}`} className="border-t border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-500 dark:text-gray-400">
                    <td className="w-1 p-0">
                      <div className="w-1.5 min-h-[32px]" style={{ backgroundColor: group.color + '55' }} />
                    </td>
                    <td className="px-4 py-1.5 pl-8 text-gray-600 dark:text-gray-400">{mt.name}</td>
                    {MONTHS.map(m => (
                      <td key={m} className="px-3 py-1.5 text-right font-mono"
                        style={{ color: mt.monthly[m] !== 0 ? group.color : undefined }}>
                        {fmt(mt.monthly[m])}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-mono font-medium text-gray-700 dark:text-gray-300">{fmt(mt.total)}</td>
                    <td className="px-3 py-1.5 text-right text-gray-400">{fmt(mt.media)}</td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
