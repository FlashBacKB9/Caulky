import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Upload, AlertTriangle } from 'lucide-react'
import { exportBackup, importBackup, type RestoreOptions } from '../../api/backup'
import { t } from '../../utils/i18n'
import { Section } from './shared'

const ALL_ON: RestoreOptions = {
  groups: true, accounts: true, types: true, movements: true, investments: true,
  dashboard: true, charts: true, budgets: true, templates: true,
  appearance: true, tablePrefs: true,
}
const ALL_OFF: RestoreOptions = {
  groups: false, accounts: false, types: false, movements: false, investments: false,
  dashboard: false, charts: false, budgets: false, templates: false,
  appearance: false, tablePrefs: false,
}

const DB_OPTS = [
  { key: 'groups'      as const, labelKey: 'backup.optGroups',       warn: true },
  { key: 'accounts'    as const, labelKey: 'settings.accounts',      warn: true },
  { key: 'types'       as const, labelKey: 'settings.movementTypes', warn: true },
  { key: 'movements'   as const, labelKey: 'nav.movements',          warn: true },
  { key: 'investments' as const, labelKey: 'nav.investments',        warn: true },
  { key: 'templates'   as const, labelKey: 'backup.optTemplates',    warn: false },
]
const LS_OPTS = [
  { key: 'dashboard'  as const, labelKey: 'nav.dashboard'         },
  { key: 'charts'     as const, labelKey: 'backup.optCharts'      },
  { key: 'budgets'    as const, labelKey: 'nav.budgets'           },
  { key: 'appearance' as const, labelKey: 'backup.optAppearance'  },
  { key: 'tablePrefs' as const, labelKey: 'backup.optTablePrefs'  },
]

function BackupSection() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting]   = useState(false)
  const [importing, setImporting]   = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [opts, setOpts]             = useState<RestoreOptions>(ALL_ON)
  const [error, setError]           = useState<string | null>(null)
  const [success, setSuccess]       = useState(false)

  const toggle = (k: keyof RestoreOptions) =>
    setOpts(p => ({ ...p, [k]: !p[k] }))

  const allChecked = Object.values(opts).every(Boolean)
  const toggleAll  = () => setOpts(allChecked ? ALL_OFF : ALL_ON)
  const noneSelected = Object.values(opts).every(v => !v)

  const handleExport = async () => {
    setExporting(true); setError(null)
    try { await exportBackup() }
    catch { setError(t('backup.exportError')) }
    finally { setExporting(false) }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) { setPendingFile(file); setError(null); setOpts(ALL_ON) }
    e.target.value = ''
  }

  const handleRestore = async () => {
    if (!pendingFile) return
    setImporting(true); setError(null)
    try {
      await importBackup(pendingFile, opts)
      setPendingFile(null)
      setSuccess(true)
      qc.invalidateQueries()
      setTimeout(() => setSuccess(false), 4000)
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? (e instanceof Error ? e.message : t('backup.importError')))
    } finally { setImporting(false) }
  }

  const hasDbSelected = opts.groups || opts.accounts || opts.types || opts.movements

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">

      {/* Export */}
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm text-gray-700 dark:text-gray-200">{t('backup.export')}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('backup.exportDesc')}</p>
        </div>
        <button onClick={handleExport} disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors">
          <Download className="w-3.5 h-3.5" />
          {exporting ? t('backup.exporting') : t('backup.exportBtn')}
        </button>
      </div>

      {/* Import trigger */}
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-700 dark:text-gray-200">{t('backup.import')}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('backup.importDesc')}</p>
          </div>
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <Upload className="w-3.5 h-3.5" />
            {t('backup.selectFile')}
          </button>
          <input ref={fileRef} type="file" accept=".json" onChange={handleFileChange} className="sr-only" />
        </div>

        {/* Checklist */}
        {pendingFile && (
          <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
              <span className="text-xs font-mono text-gray-400 truncate flex-1">{pendingFile.name}</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={allChecked} onChange={toggleAll}
                  className="w-3.5 h-3.5 rounded accent-blue-500" />
                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{t('backup.selectAll')}</span>
              </label>
            </div>

            {/* DB section */}
            <div className="px-3 py-2 space-y-1">
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">{t('backup.dbSection')}</p>
              {DB_OPTS.map(o => (
                <label key={o.key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 px-1 py-0.5 rounded">
                  <input type="checkbox" checked={opts[o.key]} onChange={() => toggle(o.key)}
                    className="w-3.5 h-3.5 rounded accent-blue-500" />
                  <span className="text-xs text-gray-700 dark:text-gray-200 flex-1">{t(o.labelKey)}</span>
                </label>
              ))}
            </div>

            {/* localStorage section */}
            <div className="px-3 py-2 space-y-1 border-t border-gray-50 dark:border-gray-800">
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">{t('backup.configSection')}</p>
              {LS_OPTS.map(o => (
                <label key={o.key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 px-1 py-0.5 rounded">
                  <input type="checkbox" checked={opts[o.key]} onChange={() => toggle(o.key)}
                    className="w-3.5 h-3.5 rounded accent-blue-500" />
                  <span className="text-xs text-gray-700 dark:text-gray-200">{t(o.labelKey)}</span>
                </label>
              ))}
            </div>

            {/* Warning + actions */}
            <div className="px-3 py-2.5 border-t border-gray-100 dark:border-gray-800 space-y-2">
              {hasDbSelected && (
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t('backup.warning')}
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => setPendingFile(null)}
                  className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                  {t('common.cancel')}
                </button>
                <button onClick={handleRestore} disabled={importing || noneSelected}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-40 transition-colors">
                  {importing ? t('backup.restoring') : t('backup.restore')}
                </button>
              </div>
            </div>
          </div>
        )}

        {error   && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
        {success && <p className="text-xs text-green-600 dark:text-green-400">{t('backup.success')}</p>}
      </div>
    </div>
  )
}

export default function BackupTab() {
  return (
    <Section title={t('settings.backup')}>
      <BackupSection />
    </Section>
  )
}
