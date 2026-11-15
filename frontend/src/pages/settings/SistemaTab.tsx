import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Trash2 } from 'lucide-react'
import { getAdminSettings, updateAdminSettings, type AdminSettings } from '../../api/admin'
import { useAuth } from '../../context/AuthContext'
import { resetSystem } from '../../api/backup'
import { t } from '../../utils/i18n'
import { Section } from './shared'
import ActivityLog from './ActivityLog'

// ── Administración ────────────────────────────────────────────────────────────

function AdminSection() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['admin-settings'], queryFn: getAdminSettings })
  const mut = useMutation({
    mutationFn: updateAdminSettings,
    onSuccess: s => queryClient.setQueryData(['admin-settings'], s),
  })
  if (!data) return null
  const rows: { key: keyof AdminSettings; label: string; desc: string }[] = [
    { key: 'registration_open',   label: t('settings.adminRegistration'), desc: t('settings.adminRegistrationDesc') },
  ]
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
      {rows.map(r => {
        const on = data[r.key]
        return (
          <div key={r.key} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm text-gray-700 dark:text-gray-200">{r.label}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{r.desc}</p>
            </div>
            <button type="button" role="switch" aria-checked={on} disabled={mut.isPending}
              onClick={() => mut.mutate({ ...data, [r.key]: !on })}
              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50 ${on ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
              <span className={`absolute top-0.5 h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
            </button>
          </div>
        )
      })}
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
  const { user } = useAuth()
  return (
    <>
      {user?.is_superuser && (
        <Section title={t('settings.admin')}>
          <AdminSection />
        </Section>
      )}
      <Section title={t('settings.activityLog')}>
        <ActivityLog />
      </Section>
      <Section title={t('settings.danger')}>
        <ResetSection />
      </Section>
    </>
  )
}
