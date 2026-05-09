import api from './client'
import { syncPref } from '../utils/prefSync'
import { setPreference } from './preferences'

export interface RestoreOptions {
  // DB
  groups: boolean
  accounts: boolean
  types: boolean
  movements: boolean
  investments: boolean
  templates: boolean
  // localStorage
  dashboard: boolean
  charts: boolean
  budgets: boolean
  appearance: boolean
  tablePrefs: boolean
}

const LS_MAP: Record<keyof Pick<RestoreOptions, 'dashboard' | 'charts' | 'budgets' | 'appearance' | 'tablePrefs'>, string[]> = {
  dashboard:  ['spendly-dashboard-config'],
  charts:     ['spendly-custom-charts-v2', 'spendly-hidden-builtins', 'spendly-hidden-customs', 'spendly-builtin-cfg', 'spendly-builtin-order'],
  budgets:    ['spendly-budgets'],
  appearance: ['theme', 'spendly-currency', 'spendly-date-format', 'caulky-show-investments'],
  tablePrefs: ['movements-filter-favorites', 'movements-widths', 'movements-col-order', 'kanban-group-order', 'movements-day-order'],
}

const ALL_LS_KEYS = Object.values(LS_MAP).flat()

export async function exportBackup(): Promise<void> {
  const { data: dbData } = await api.get('/backup/export')

  const ls: Record<string, unknown> = {}
  for (const key of ALL_LS_KEYS) {
    const raw = localStorage.getItem(key)
    if (raw !== null) {
      try { ls[key] = JSON.parse(raw) } catch { ls[key] = raw }
    }
  }

  const blob = new Blob([JSON.stringify({ ...dbData, localStorage: ls }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `caulky-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function resetSystem(): Promise<void> {
  await api.post('/backup/reset')
  localStorage.clear()
}

export async function importBackup(file: File, options: RestoreOptions): Promise<void> {
  const backup = JSON.parse(await file.text())
  if (!backup.version || !backup.db) throw new Error('Archivo de copia de seguridad inválido')

  const hasDb = options.groups || options.accounts || options.types || options.movements || options.investments || options.templates
  const hasPrefs = options.dashboard || options.charts || options.budgets || options.appearance || options.tablePrefs
  const hasServerPrefs = hasPrefs && backup.db.preferences != null

  if (hasDb || hasServerPrefs) {
    await api.post('/backup/restore', {
      version:               backup.version,
      db:                    backup.db,
      restore_groups:        options.groups,
      restore_accounts:      options.accounts,
      restore_types:         options.types,
      restore_movements:     options.movements,
      restore_investments:   options.investments,
      restore_templates:     options.templates,
      restore_preferences:   hasServerPrefs,
    })
  }

  // Fallback: restore from localStorage section for old backup files without db.preferences.
  // We must write to the server synchronously before reloading, otherwise the reload triggers
  // initPreferences() which fetches stale server prefs and overwrites what we just set.
  if (hasPrefs && backup.db.preferences == null) {
    const ls: Record<string, unknown> = backup.localStorage ?? {}
    const serverWrites: Promise<void>[] = []
    for (const [optKey, keys] of Object.entries(LS_MAP) as [keyof typeof LS_MAP, string[]][]) {
      if (!options[optKey]) continue
      for (const key of keys) {
        if (ls[key] !== undefined) {
          const value = typeof ls[key] === 'string' ? ls[key] as string : JSON.stringify(ls[key])
          syncPref(key, value)
          serverWrites.push(setPreference(key, value).catch(() => {}))
        }
      }
    }
    await Promise.all(serverWrites)
  }

  if (hasDb || hasPrefs) {
    window.location.reload()
  }
}
