import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Wallet, Settings, Info, X, ExternalLink } from 'lucide-react'
import { useNavConfig, PAGE_META } from '../hooks/useNavConfig'

function InfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-white">Acerca de Caulky</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">v1.0</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">Desarrollado por</p>
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
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">APIs y servicios externos</p>
            <div className="space-y-1.5">
              <div className="px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800">
                <p className="font-medium text-gray-800 dark:text-gray-100">Yahoo Finance</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Precios actuales e históricos de fondos de inversión</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">query1.finance.yahoo.com</p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">Frontend</p>
            <div className="space-y-1.5">
              {[
                { name: 'React + TypeScript', desc: 'Interfaz de usuario' },
                { name: 'Vite', desc: 'Bundler y servidor de desarrollo' },
                { name: 'TanStack Query', desc: 'Gestión de estado y caché de datos' },
                { name: 'React Router', desc: 'Enrutamiento SPA' },
                { name: 'Tailwind CSS v4', desc: 'Estilos y diseño' },
                { name: 'Lucide React', desc: 'Iconografía' },
                { name: 'Axios', desc: 'Cliente HTTP' },
              ].map(t => (
                <div key={t.name} className="flex items-baseline gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800">
                  <span className="font-medium text-gray-800 dark:text-gray-100 shrink-0">{t.name}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{t.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">Backend</p>
            <div className="space-y-1.5">
              {[
                { name: 'FastAPI', desc: 'Framework de API REST en Python' },
                { name: 'SQLAlchemy 2.0', desc: 'ORM asíncrono' },
                { name: 'PostgreSQL', desc: 'Base de datos relacional' },
                { name: 'Alembic', desc: 'Migraciones de base de datos' },
                { name: 'Pydantic v2', desc: 'Validación de datos y schemas' },
                { name: 'httpx', desc: 'Cliente HTTP asíncrono (Yahoo Finance)' },
              ].map(t => (
                <div key={t.name} className="flex items-baseline gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800">
                  <span className="font-medium text-gray-800 dark:text-gray-100 shrink-0">{t.name}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{t.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Sidebar() {
  const navEntries = useNavConfig()
  const [showInfo, setShowInfo] = useState(false)

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
      <aside className="w-56 h-screen sticky top-0 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 flex flex-col">
        <div className="px-5 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2.5 shrink-0">
          <Wallet className="w-5 h-5 text-gray-800 dark:text-white" strokeWidth={1.5} />
          <span className="font-bold text-lg text-gray-800 dark:text-white">Caulky</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 min-h-0">
          {visibleLinks.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => linkCls(isActive)}
            >
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 pb-4 border-t border-gray-100 dark:border-gray-800 pt-3 space-y-1 shrink-0">
          <NavLink
            to="/settings"
            className={({ isActive }) => linkCls(isActive)}
          >
            <Settings className="w-4 h-4" strokeWidth={1.5} />
            Configuración
          </NavLink>
          <button
            onClick={() => setShowInfo(true)}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <Info className="w-4 h-4" strokeWidth={1.5} />
            Acerca de
          </button>
        </div>
      </aside>
    </>
  )
}
