import { useState, useEffect } from 'react'
import {
  Home, List, Landmark, BarChart2, LineChart, GitCompare,
  ChartCandlestick, TrendingUp, Upload, BookOpen, Telescope, Brain,
  type LucideIcon,
} from 'lucide-react'

export interface NavEntry { id: string; visible: boolean }

export interface NavPageMeta { label: string; Icon: LucideIcon }

export const PAGE_META: Record<string, NavPageMeta> = {
  '/':              { label: 'Dashboard',        Icon: Home },
  '/movements':     { label: 'Movimientos',      Icon: List },
  '/cuentas':       { label: 'Cuentas',          Icon: Landmark },
  '/annual':        { label: 'Finanzas del Año', Icon: BarChart2 },
  '/charts':        { label: 'Gráficos',         Icon: LineChart },
  '/comparaciones': { label: 'Comparaciones',    Icon: GitCompare },
  '/budgets':       { label: 'Presupuestos',      Icon: ChartCandlestick },
  '/inversiones':   { label: 'Inversiones',      Icon: TrendingUp },
  '/import':        { label: 'Importar Excel',   Icon: Upload },
  '/proyeccion':    { label: 'Proyección',       Icon: Telescope },
  '/analisis':      { label: 'Análisis',         Icon: Brain },
  '/docs':          { label: 'Documentación',    Icon: BookOpen },
}

const DEFAULT_IDS = Object.keys(PAGE_META)
const NAV_KEY = 'caulky-nav-config'
const INV_KEY = 'caulky-show-investments'

function buildDefault(): NavEntry[] {
  const showInv = localStorage.getItem(INV_KEY) === 'true'
  return DEFAULT_IDS.map(id => ({ id, visible: id === '/inversiones' ? showInv : true }))
}

export function loadNavConfig(): NavEntry[] {
  try {
    const s = localStorage.getItem(NAV_KEY)
    if (s) {
      const saved = JSON.parse(s) as NavEntry[]
      if (Array.isArray(saved)) {
        const savedIds = new Set(saved.map(e => e.id))
        const merged = [
          ...saved.filter(e => DEFAULT_IDS.includes(e.id)),
          ...DEFAULT_IDS.filter(id => !savedIds.has(id)).map(id => ({ id, visible: id !== '/inversiones' })),
        ]
        return merged
      }
    }
  } catch { /**/ }
  return buildDefault()
}

export function saveNavConfig(entries: NavEntry[]) {
  localStorage.setItem(NAV_KEY, JSON.stringify(entries))
  window.dispatchEvent(new StorageEvent('storage', { key: NAV_KEY, newValue: JSON.stringify(entries) }))
}

export function useNavConfig(): NavEntry[] {
  const [entries, setEntries] = useState<NavEntry[]>(loadNavConfig)

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === NAV_KEY && e.newValue) {
        try { setEntries(JSON.parse(e.newValue)) } catch { /**/ }
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  return entries
}
