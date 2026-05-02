import { useState, useEffect, useCallback } from 'react'

const KEY = 'spendly-date-format'
const EVENT = 'spendly-date-format-change'

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'

export interface DateFormatOption {
  value: DateFormat
  label: string
}

export const DATE_FORMATS: DateFormatOption[] = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/AAAA' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/AAAA' },
  { value: 'YYYY-MM-DD', label: 'AAAA-MM-DD' },
]

function getCurrent(): DateFormat {
  return (localStorage.getItem(KEY) as DateFormat) ?? 'DD/MM/YYYY'
}

export function useDateFormat() {
  const [format, setFormatState] = useState<DateFormat>(getCurrent)

  useEffect(() => {
    const handler = () => setFormatState(getCurrent())
    window.addEventListener(EVENT, handler)
    return () => window.removeEventListener(EVENT, handler)
  }, [])

  const setFormat = useCallback((f: DateFormat) => {
    localStorage.setItem(KEY, f)
    window.dispatchEvent(new Event(EVENT))
  }, [])

  const fmtDate = useCallback((iso: string | null | undefined): string => {
    if (!iso) return '—'
    const [y, m, d] = iso.split('-')
    switch (format) {
      case 'DD/MM/YYYY': return `${d}/${m}/${y}`
      case 'MM/DD/YYYY': return `${m}/${d}/${y}`
      case 'YYYY-MM-DD': return iso
    }
  }, [format])

  return { format, setFormat, fmtDate, formats: DATE_FORMATS }
}
