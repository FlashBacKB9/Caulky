import { useRef, useState, useCallback } from 'react'
import { Puzzle, Trash2, Download, Upload } from 'lucide-react'
import { usePlugins, type PluginScanResult } from '../../hooks/usePlugins'
import { t } from '../../utils/i18n'
import { Section } from './shared'

function PluginsSection() {
  const { plugins, addPlugin, removePlugin, togglePlugin, removeAll } = usePlugins()
  const fileRef = useRef<HTMLInputElement>(null)
  const [scan, setScan] = useState<PluginScanResult | null>(null)
  const [generalError, setGeneralError] = useState<string | null>(null)

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setScan(null)
    setGeneralError(null)
    try {
      const result = await addPlugin(file)
      if (result.blocked.length > 0 || result.warnings.length > 0) setScan(result)
    } catch {
      setGeneralError(t('settings.pluginsLoadError'))
    }
  }, [addPlugin])

  const blocked  = scan?.blocked  ?? []
  const warnings = scan?.warnings ?? []

  return (
    <div className="space-y-2">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
        {plugins.length === 0 && (
          <p className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">{t('settings.pluginsNone')}</p>
        )}
        {plugins.map(p => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3">
            <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center shrink-0">
              <Puzzle className="w-3.5 h-3.5 text-purple-500" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{p.name}</p>
                {p.autoDisabled && (
                  <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                    {t('settings.pluginsAutoDisabled')}
                  </span>
                )}
              </div>
              {p.description && (
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{p.description}</p>
              )}
            </div>
            <span className="text-xs text-gray-300 dark:text-gray-600 shrink-0">v{p.version}</span>
            <button
              onClick={() => togglePlugin(p.id)}
              title={p.autoDisabled ? t('settings.pluginsReactivate') : undefined}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none shrink-0 ${
                p.enabled ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                p.enabled ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
            <button onClick={() => removePlugin(p.id)} className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-400 rounded transition-colors shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {blocked.length > 0 && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-red-600 dark:text-red-400">{t('settings.pluginsBlocked')}</p>
          {blocked.map((msg, i) => (
            <p key={i} className="text-xs text-red-500 dark:text-red-400 flex gap-1.5"><span>•</span>{msg}</p>
          ))}
        </div>
      )}

      {warnings.length > 0 && blocked.length === 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">{t('settings.pluginsWarnings')}</p>
          {warnings.map((msg, i) => (
            <p key={i} className="text-xs text-amber-600 dark:text-amber-400 flex gap-1.5"><span>•</span>{msg}</p>
          ))}
        </div>
      )}

      {generalError && <p className="text-xs text-red-500">{generalError}</p>}

      <input ref={fileRef} type="file" accept=".js" onChange={handleFile} className="sr-only" />
      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 flex-1 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
        >
          <Upload className="w-4 h-4" />
          {t('settings.pluginsInstall')}
        </button>
        <a
          href="/plugins/fuente-personalizada.js"
          download="fuente-personalizada.js"
          className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          {t('settings.languageExample')}
        </a>
        <a
          href="/plugins/plugin-dev-guide.md"
          download="plugin-dev-guide.md"
          className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          {t('settings.languageGuide')}
        </a>
      </div>

      {plugins.length > 0 && (
        <button
          onClick={() => { if (confirm(t('settings.pluginsDeleteAllConfirm'))) removeAll() }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          {t('settings.pluginsDeleteAll')}
        </button>
      )}
    </div>
  )
}

// ── Tab entry point ────────────────────────────────────────────────────────────

export default function PluginsTab() {
  return (
    <Section title={t('settings.plugins')}>
      <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">{t('settings.pluginsDesc')}</p>
      <PluginsSection />
    </Section>
  )
}
