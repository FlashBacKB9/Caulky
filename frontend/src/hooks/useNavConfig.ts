import { useState, useEffect } from 'react'
import { syncPref } from '../utils/prefSync'
import {
  Home, List, Landmark, BarChart2, LineChart, GitCompare,
  ChartCandlestick, TrendingUp, Upload, BookOpen, Telescope, Brain, BotMessageSquare, Receipt,
  type LucideIcon,
} from 'lucide-react'

export interface NavEntry { id: string; visible: boolean }

export interface NavPageMeta { label: string; labelKey: string; Icon: LucideIcon }

export const PAGE_META: Record<string, NavPageMeta> = {
  '/':              { label: 'Dashboard',        labelKey: 'nav.dashboard',   Icon: Home },
  '/movements':     { label: 'Movimientos',      labelKey: 'nav.movements',   Icon: List },
  '/cuentas':       { label: 'Cuentas',          labelKey: 'nav.accounts',    Icon: Landmark },
  '/annual':        { label: 'Finanzas del Año', labelKey: 'nav.annual',      Icon: BarChart2 },
  '/charts':        { label: 'Gráficos',         labelKey: 'nav.charts',      Icon: LineChart },
  '/comparaciones': { label: 'Comparaciones',    labelKey: 'nav.comparisons', Icon: GitCompare },
  '/budgets':       { label: 'Presupuestos',     labelKey: 'nav.budgets',     Icon: ChartCandlestick },
  '/inversiones':   { label: 'Inversiones',      labelKey: 'nav.investments', Icon: TrendingUp },
  '/import':        { label: 'Importar Excel',   labelKey: 'nav.import',      Icon: Upload },
  '/proyeccion':    { label: 'Proyección',       labelKey: 'nav.projection',  Icon: Telescope },
  '/analisis':      { label: 'Análisis',         labelKey: 'nav.analysis',    Icon: Brain },
  '/docs':          { label: 'Documentación',    labelKey: 'nav.docs',        Icon: BookOpen },
  '/consultor-ia':  { label: 'Consultor IA',     labelKey: 'nav.ai',          Icon: BotMessageSquare },
  '/tickets':       { label: 'Tickets',          labelKey: 'nav.tickets',     Icon: Receipt },
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
  syncPref(NAV_KEY, JSON.stringify(entries))
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
