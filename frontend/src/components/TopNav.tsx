import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Wallet, Settings, LogOut, Info, X, ExternalLink } from 'lucide-react'
import { useNavConfig, PAGE_META } from '../hooks/useNavConfig'
import { logout } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import { queryClient } from '../App'

function InfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-white">Acerca de Caulky</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">v1.0</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 text-sm">
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
      </div>
    </div>
  )
}

export default function TopNav() {
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
    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shrink-0 ${
      isActive
        ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200'
    }`

  return (
    <>
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
      <header id="topnav" className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 h-14 px-4">

          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0 mr-2">
            <Wallet className="w-5 h-5 text-gray-800 dark:text-white" strokeWidth={1.5} />
            <span className="font-bold text-gray-800 dark:text-white hidden sm:block">Caulky</span>
          </div>

          {/* Nav links — scrollable */}
          <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-none flex-1 min-w-0">
            {visibleLinks.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => linkCls(isActive)}
              >
                <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                <span className="hidden xl:block whitespace-nowrap">{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Right side: settings + info + logout */}
          <div className="flex items-center gap-0.5 shrink-0 ml-2">
            <NavLink to="/settings" className={({ isActive }) => linkCls(isActive)}>
              <Settings className="w-4 h-4" strokeWidth={1.5} />
            </NavLink>
            <button
              onClick={() => setShowInfo(true)}
              className="flex items-center px-2 py-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <Info className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center px-2 py-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </header>
    </>
  )
}
