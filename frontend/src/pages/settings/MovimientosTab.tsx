import { useSharedMovements } from '../../hooks/useSharedMovements'
import { t } from '../../utils/i18n'
import { Section } from './shared'

export default function MovimientosTab() {
  const { sharedEnabled, setSharedEnabled } = useSharedMovements()

  return (
    <Section title={t('settings.movements')}>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
        <div className="flex items-start justify-between gap-4 px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('settings.sharedMovements')}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">{t('settings.sharedMovementsDesc')}</p>
          </div>
          <button
            onClick={() => setSharedEnabled(!sharedEnabled)}
            className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
              sharedEnabled ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              sharedEnabled ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </div>
    </Section>
  )
}
