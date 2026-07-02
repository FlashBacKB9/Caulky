import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ChevronUp, ChevronDown, LayoutDashboard } from 'lucide-react'
import { loadNavConfig, saveNavConfig, PAGE_META, type NavEntry } from '../../hooks/useNavConfig'
import { t } from '../../utils/i18n'
import { Section } from './shared'

// ── Nav config section ────────────────────────────────────────────────────────

function NavSection({ entries, onChange }: { entries: NavEntry[]; onChange: (e: NavEntry[]) => void }) {
  const toggle = (id: string) =>
    onChange(entries.map(e => e.id === id ? { ...e, visible: !e.visible } : e))

  const move = (id: string, dir: -1 | 1) => {
    const idx = entries.findIndex(e => e.id === id)
    if (idx < 0) return
    const target = idx + dir
    if (target < 0 || target >= entries.length) return
    const next = [...entries]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
      {entries.map((entry, i) => {
        const meta = PAGE_META[entry.id]
        if (!meta) return null
        const Icon = meta.Icon
        return (
          <div key={entry.id} className="flex items-center gap-2 px-3 py-2.5">
            <div className="flex flex-col -space-y-0.5 shrink-0">
              <button onClick={() => move(entry.id, -1)} disabled={i === 0}
                className="p-0.5 text-gray-300 dark:text-gray-700 hover:text-gray-500 dark:hover:text-gray-400 disabled:opacity-20 transition-colors">
                <ChevronUp className="w-3 h-3" />
              </button>
              <button onClick={() => move(entry.id, 1)} disabled={i === entries.length - 1}
                className="p-0.5 text-gray-300 dark:text-gray-700 hover:text-gray-500 dark:hover:text-gray-400 disabled:opacity-20 transition-colors">
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
            <Icon className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0" strokeWidth={1.5} />
            <Link to={entry.id} className={`flex-1 text-sm transition-colors hover:underline underline-offset-2 ${
              entry.visible ? 'text-gray-700 dark:text-gray-200' : 'text-gray-300 dark:text-gray-600'
            }`}>
              {t(meta.labelKey)}
            </Link>
            <button
              onClick={() => toggle(entry.id)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none shrink-0 ${
                entry.visible ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                entry.visible ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ── Tab entry point ────────────────────────────────────────────────────────────

export default function NavegacionTab() {
  const navigate = useNavigate()
  const [navEntries, setNavEntries] = useState<NavEntry[]>(loadNavConfig)

  function updateNav(next: NavEntry[]) {
    setNavEntries(next)
    saveNavConfig(next)
  }

  return (
    <>
      <Section title={t('settings.navigation')}>
        <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">{t('settings.navigationDesc')}</p>
        <NavSection entries={navEntries} onChange={updateNav} />
      </Section>
      <Section title={t('settings.dashboard')}>
        <button
          onClick={() => navigate('/?edit=1')}
          className="flex items-center gap-3 w-full px-4 py-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            <LayoutDashboard className="w-4 h-4 text-blue-500" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('settings.editDashboard')}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('settings.editDashboardDesc')}</p>
          </div>
        </button>
      </Section>
    </>
  )
}
