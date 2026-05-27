import { getAllPreferences, setPreference } from '../api/preferences'

export const PREF_KEYS = new Set([
  'theme',
  'spendly-currency',
  'spendly-date-format',
  'spendly-dashboard-config',
  'spendly-dashboard-layout-v1',
  'spendly-custom-charts-v2',
  'spendly-hidden-builtins',
  'spendly-hidden-customs',
  'spendly-builtin-cfg',
  'spendly-builtin-order',
  'spendly-charts-layout-v1',
  'spendly-budgets',
  'caulky-nav-config',
  'caulky-show-investments',
  'shared-movements-enabled',
  'ui-zoom-v2',
  'movements-filter-favorites',
  'movements-widths',
  'movements-col-order',
  'kanban-group-order',
  'movements-day-order',
  'spendly-analysis-config',
  'spendly-5030-assignment',
  'annual-group-order',
  'annual-type-order',
  'caulky-projection-config',
  'caulky-projection-snapshot',
  'app-language',
  'app-custom-languages',
  'caulky_plugins',
  'app-skins',
  'ai-tab-names',
  'ai-write-perms',
  'ticket_food_type_id',
  'ticket_supplies_type_id',
  'ticket_combined_type_id',
])

const _timers: Record<string, ReturnType<typeof setTimeout>> = {}

export function syncPref(key: string, value: string): void {
  localStorage.setItem(key, value)
  if (!PREF_KEYS.has(key)) return
  clearTimeout(_timers[key])
  _timers[key] = setTimeout(() => {
    setPreference(key, value).catch(() => { /* best-effort */ })
  }, 1000)
}

export async function syncPrefNow(key: string, value: string): Promise<void> {
  localStorage.setItem(key, value)
  clearTimeout(_timers[key])
  if (PREF_KEYS.has(key)) {
    await setPreference(key, value).catch(() => { /* best-effort */ })
  }
}

export async function initPreferences(): Promise<{ changed: boolean }> {
  try {
    const serverPrefs = await getAllPreferences()
    let changed = false
    const uploads: Promise<void>[] = []

    for (const key of PREF_KEYS) {
      const local = localStorage.getItem(key)
      const remote = serverPrefs[key]

      if (remote !== undefined) {
        // Server has a value → apply to localStorage (server wins)
        if (local !== remote) {
          localStorage.setItem(key, remote)
          changed = true
        }
      } else if (local !== null) {
        // Local has a value but server doesn't → upload it
        uploads.push(setPreference(key, local).catch(() => {}))
      }
    }

    await Promise.all(uploads)
    return { changed }
  } catch {
    return { changed: false }
  }
}
