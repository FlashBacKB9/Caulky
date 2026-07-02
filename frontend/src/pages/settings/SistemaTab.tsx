import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Trash2 } from 'lucide-react'
import { getAuditLog, clearAuditLog } from '../../api/auditLog'
import { resetSystem } from '../../api/backup'
import { t } from '../../utils/i18n'
import { Section } from './shared'

// ── Audit Log ─────────────────────────────────────────────────────────────────

const ACTION_COLOR: Record<string, string> = {
  create: 'text-green-400',
  update: 'text-blue-400',
  delete: 'text-red-400',
}

function fmtTs(iso: string) {
  return iso.replace('T', ' ').slice(0, 19)
}

function LogsSection() {
  const queryClient = useQueryClient()
  const { data: entries = [], isLoading, refetch } = useQuery({
    queryKey: ['audit-log'],
    queryFn: () => getAuditLog({ limit: 500 }),
  })
  const clearMut = useMutation({
    mutationFn: clearAuditLog,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['audit-log'] }),
  })

  const download = () => {
    const lines = entries
      .map(e => `${fmtTs(e.created_at)}  [${e.action.toUpperCase()}]  ${e.summary}`)
      .join('\n')
    const blob = new Blob([lines], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activity-${new Date().toISOString().slice(0, 10)}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {isLoading ? '…' : `${entries.length} ${t('settings.entries')}`}
        </span>
        <div className="flex items-center gap-3">
          <button onClick={() => refetch()} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            {t('settings.refresh')}
          </button>
          {entries.length > 0 && (
            <button onClick={download} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              {t('settings.download')}
            </button>
          )}
          {entries.length > 0 && (
            <button
              onClick={() => { if (confirm(t('settings.clearActivityConfirm'))) clearMut.mutate() }}
              className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors"
            >
              {t('settings.clearAll')}
            </button>
          )}
        </div>
      </div>
      <div className="font-mono text-xs bg-gray-950 text-gray-300 rounded-xl p-3 overflow-y-auto max-h-72 leading-5">
        {isLoading
          ? <span className="text-gray-500">{t('common.loading')}</span>
          : entries.length === 0
            ? <span className="text-gray-500">{t('settings.noActivity')}</span>
            : entries.map(e => (
              <div key={e.id}>
                <span className="text-gray-500">{fmtTs(e.created_at)}</span>
                {'  '}
                <span className={ACTION_COLOR[e.action] ?? 'text-gray-400'}>
                  [{e.action.toUpperCase()}]
                </span>
                {'  '}
                <span>{e.summary}</span>
              </div>
            ))
        }
      </div>
    </div>
  )
}

// ── Reset section ─────────────────────────────────────────────────────────────

function ResetSection() {
  const [showModal, setShowModal] = useState(false)
  const [input, setInput]         = useState('')
  const [resetting, setResetting] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const confirmed = input === 'DELETE'

  async function handleReset() {
    if (!confirmed) return
    setResetting(true); setError(null)
    try {
      await resetSystem()
      window.location.reload()
    } catch {
      setError(t('settings.resetError'))
      setResetting(false)
    }
  }

  function closeModal() {
    if (resetting) return
    setShowModal(false); setInput(''); setError(null)
  }

  return (
    <>
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={closeModal}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4 text-red-500" strokeWidth={1.5} />
                </div>
                <h2 className="text-sm font-semibold text-gray-800 dark:text-white">{t('settings.resetTitle')}</h2>
              </div>
              <button onClick={closeModal} disabled={resetting} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 disabled:opacity-40">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2.5 text-xs text-red-700 dark:text-red-400 space-y-1">
                <p className="font-semibold">{t('settings.resetIrreversible')}</p>
                <p>{t('settings.resetDesc')}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500 dark:text-gray-400">
                  Escribe <span className="font-mono font-bold text-gray-700 dark:text-gray-200">DELETE</span> para confirmar
                </label>
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onPaste={e => e.preventDefault()}
                  placeholder="DELETE"
                  autoFocus
                  className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-300 dark:placeholder:text-gray-600"
                />
              </div>
              {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
            </div>
            <div className="px-5 pb-5 flex justify-end gap-2">
              <button onClick={closeModal} disabled={resetting}
                className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40">
                {t('common.cancel')}
              </button>
              <button onClick={handleReset} disabled={!confirmed || resetting}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500 hover:bg-red-600 text-white disabled:opacity-40 transition-colors">
                {resetting ? t('settings.resetBtnDoing') : t('settings.resetBtnAll')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-red-100 dark:border-red-900/30 divide-y divide-gray-50 dark:divide-gray-800">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm text-red-600 dark:text-red-400">{t('settings.resetTitle')}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('settings.resetSystemDesc')}</p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
            {t('settings.resetBtn')}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Tab entry point ────────────────────────────────────────────────────────────

export default function SistemaTab() {
  return (
    <>
      <Section title={t('settings.activityLog')}>
        <LogsSection />
      </Section>
      <Section title={t('settings.danger')}>
        <ResetSection />
      </Section>
    </>
  )
}
