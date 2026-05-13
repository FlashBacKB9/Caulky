import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Wallet, Settings, Info, X, ExternalLink, LogOut } from 'lucide-react'
import { useNavConfig, PAGE_META } from '../hooks/useNavConfig'
import { logout } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import { queryClient } from '../App'
import { t } from '../utils/i18n'

function InfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto overscroll-y-contain scrollbar-none" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-white">{t('about.title')}</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">v1.3</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">{t('about.developedBy')}</p>
            <a
              href="https://github.com/FlashBacKB9"
              target="_blank" rel="noreferrer"
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
            >
              <span className="font-medium text-gray-800 dark:text-gray-100">FlashBacKB9</span>
              <ExternalLink className="w-3 h-3 text-gray-400 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">{t('about.externalApis')}</p>
            <div className="space-y-1.5">
              <div className="px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800">
                <p className="font-medium text-gray-800 dark:text-gray-100">Yahoo Finance</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('about.yahooDesc')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">query1.finance.yahoo.com</p>
              </div>
              <div className="px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800">
                <p className="font-medium text-gray-800 dark:text-gray-100">Google Fonts</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('about.googleDesc')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">fonts.googleapis.com</p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">{t('about.frontend')}</p>
            <div className="space-y-1.5">
              {[
                { name: 'React + TypeScript', desc: t('about.reactDesc') },
                { name: 'Vite', desc: t('about.viteDesc') },
                { name: 'TanStack Query', desc: t('about.tanstackDesc') },
                { name: 'React Router', desc: t('about.routerDesc') },
                { name: 'Tailwind CSS v4', desc: t('about.tailwindDesc') },
                { name: 'Lucide React', desc: t('about.lucideDesc') },
                { name: 'Axios', desc: t('about.axiosDesc') },
              ].map(item => (
                <div key={item.name} className="flex items-baseline gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800">
                  <span className="font-medium text-gray-800 dark:text-gray-100 shrink-0">{item.name}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">{t('about.backend')}</p>
            <div className="space-y-1.5">
              {[
                { name: 'FastAPI', desc: t('about.fastapiDesc') },
                { name: 'SQLAlchemy 2.0', desc: t('about.sqlalchemyDesc') },
                { name: 'PostgreSQL', desc: t('about.postgresDesc') },
                { name: 'Alembic', desc: t('about.alembicDesc') },
                { name: 'Pydantic v2', desc: t('about.pydanticDesc') },
                { name: 'httpx', desc: t('about.httpxDesc') },
              ].map(item => (
                <div key={item.name} className="flex items-baseline gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800">
                  <span className="font-medium text-gray-800 dark:text-gray-100 shrink-0">{item.name}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">{t('about.extensibility')}</p>
            <div className="space-y-1.5">
              {[
                { name: 'Plugins', desc: t('about.pluginsDesc') },
                { name: 'Skins', desc: t('about.skinsDesc') },
                { name: 'Idiomas', desc: t('about.langsDesc') },
              ].map(item => (
                <div key={item.name} className="flex items-baseline gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800">
                  <span className="font-medium text-gray-800 dark:text-gray-100 shrink-0">{item.name}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const navEntries = useNavConfig()
  const [showInfo, setShowInfo] = useState(false)
  const { setUser } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout().catch(() => {})
    queryClient.clear()
    setUser(null)
    navigate('/login', { replace: true })
  }

  const visibleLinks = navEntries
    .filter(e => e.visible && PAGE_META[e.id])
    .map(e => ({ to: e.id, ...PAGE_META[e.id] }))

  const linkCls = (isActive: boolean) =>
    `flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200'
    }`

  return (
    <>
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-56 flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 overflow-y-auto
        transition-transform duration-200
        md:relative md:translate-x-0 md:z-auto
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="px-5 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2.5">
          <Wallet className="w-5 h-5 text-gray-800 dark:text-white" strokeWidth={1.5} />
          <span className="font-bold text-lg text-gray-800 dark:text-white">Caulky</span>
        </div>

        <nav className="px-3 pt-4 space-y-0.5">
          {visibleLinks.map(({ to, labelKey, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => linkCls(isActive)}
              onClick={onClose}
            >
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              {t(labelKey) || label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 pb-4 border-t border-gray-100 dark:border-gray-800 mt-2 pt-2 space-y-0.5">
          <NavLink
            to="/settings"
            className={({ isActive }) => linkCls(isActive)}
            onClick={onClose}
          >
            <Settings className="w-4 h-4" strokeWidth={1.5} />
            {t('layout.settings')}
          </NavLink>
          <button
            onClick={() => { setShowInfo(true); onClose?.() }}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <Info className="w-4 h-4" strokeWidth={1.5} />
            {t('layout.about')}
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-gray-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" strokeWidth={1.5} />
            {t('layout.logout')}
          </button>
        </div>
      </aside>
    </>
  )
}
