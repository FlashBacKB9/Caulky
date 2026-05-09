import { useEffect, useState } from 'react'
import { syncPref } from '../utils/prefSync'

export function useDarkMode() {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')

  useEffect(() => {
    const root = document.documentElement
    if (dark) {
      root.classList.add('dark')
      syncPref('theme', 'dark')
    } else {
      root.classList.remove('dark')
      syncPref('theme', 'light')
    }
  }, [dark])

  return { dark, toggle: () => setDark(d => !d) }
}
