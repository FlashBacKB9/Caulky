import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAccountsSummary } from '../api/accounts'
import { useCurrency } from '../hooks/useCurrency'
import { t } from '../utils/i18n'
import CuentasTab from './settings/CuentasTab'
import AparienciaTab from './settings/AparienciaTab'
import MovimientosTab from './settings/MovimientosTab'
import NavegacionTab from './settings/NavegacionTab'
import BackupTab from './settings/BackupTab'
import TicketsTab from './settings/TicketsTab'
import SuscripcionesTab from './settings/SuscripcionesTab'
import PluginsTab from './settings/PluginsTab'
import SistemaTab from './settings/SistemaTab'

const SETTINGS_TABS = [
  { id: 'cuentas',        labelKey: 'settings.accounts'  },
  { id: 'apariencia',     labelKey: 'settings.appearance' },
  { id: 'movimientos',    labelKey: 'settings.movements'  },
  { id: 'navegacion',     labelKey: 'settings.navigation' },
  { id: 'backup',         labelKey: 'settings.backup'     },
  { id: 'tickets',        label:    'Tickets'              },
  { id: 'suscripciones',  label:    'Suscripciones'        },
  { id: 'plugins',        labelKey: 'settings.plugins'     },
  { id: 'sistema',        label:    'Sistema'              },
] as const

export default function Settings() {
  const { fmt } = useCurrency()
  const { data, isLoading } = useQuery({ queryKey: ['accounts-summary'], queryFn: getAccountsSummary })
  const [activeTab, setActiveTab] = useState<string>('cuentas')

  if (isLoading) return <div className="p-8 text-gray-500">{t('common.loading')}</div>
  if (!data) return null

  return (
    <div className="p-3 md:p-6 space-y-0">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">{t('settings.title')}</h1>

      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-gray-100 dark:border-gray-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SETTINGS_TABS.map(tab => {
          const label = 'label' in tab ? tab.label : t(tab.labelKey)
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="max-w-xl space-y-6 pt-6">
        {activeTab === 'cuentas'       && <CuentasTab accounts={data.accounts} fmt={fmt} />}
        {activeTab === 'apariencia'    && <AparienciaTab />}
        {activeTab === 'movimientos'   && <MovimientosTab />}
        {activeTab === 'navegacion'    && <NavegacionTab />}
        {activeTab === 'backup'        && <BackupTab />}
        {activeTab === 'tickets'       && <TicketsTab />}
        {activeTab === 'suscripciones' && <SuscripcionesTab />}
        {activeTab === 'plugins'       && <PluginsTab />}
        {activeTab === 'sistema'       && <SistemaTab />}
      </div>
    </div>
  )
}
