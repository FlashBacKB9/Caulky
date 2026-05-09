import { useState } from 'react'
import { syncPref } from '../utils/prefSync'

export interface DashboardWidget {
  id: string
  colSpan: number  // 1-4 (4-column grid)
  rowSpan?: number  // grid row span (undefined = 1)
  height?: number  // chart height in px (undefined = default)
  period?: 'month' | 'year'  // period filter for chart widgets
}

export interface DashboardConfig {
  widgets: DashboardWidget[]
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  widgets: [
    { id: 'stat-uso',            colSpan: 1 },
    { id: 'stat-income',         colSpan: 1 },
    { id: 'stat-expense',        colSpan: 1 },
    { id: 'stat-accounts',       colSpan: 1 },
    { id: 'chart-expenses-line', colSpan: 4 },
    { id: 'chart-expenses-pie',  colSpan: 2 },
    { id: 'chart-balance',       colSpan: 2 },
  ],
}

const STORAGE_KEY = 'spendly-dashboard-config'

export function useDashboardConfig() {
  const [config, setConfig] = useState<DashboardConfig>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        // Migrate old format (had statWidgets + mainWidgets)
        if (parsed.statWidgets || parsed.mainWidgets) {
          return DEFAULT_DASHBOARD_CONFIG
        }
        if (Array.isArray(parsed.widgets)) return { widgets: parsed.widgets }
      }
    } catch {}
    return DEFAULT_DASHBOARD_CONFIG
  })

  const save = (next: DashboardConfig) => {
    setConfig(next)
    syncPref(STORAGE_KEY, JSON.stringify(next))
  }

  return { config, save }
}
