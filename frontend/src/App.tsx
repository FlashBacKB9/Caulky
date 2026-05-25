import { useState, useLayoutEffect, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Menu, Wallet } from 'lucide-react'
import Sidebar from './components/Sidebar'
import TopNav from './components/TopNav'
import Dashboard from './pages/Dashboard'
import Movements from './pages/Movements'
import Annual from './pages/Annual'
import Charts from './pages/Charts'
import Budgets from './pages/Budgets'
import Settings from './pages/Settings'
import Import from './pages/Import'
import Investments from './pages/Investments'
import Documentation from './pages/Documentation'
import Comparaciones from './pages/Comparaciones'
import AccountsPage from './pages/AccountsPage'
import Projection from './pages/Projection'
import Analysis from './pages/Analysis'
import AiConsultant from './pages/AiConsultant'
import QuickAdd from './pages/QuickAdd'
import LoginPage from './pages/LoginPage'
import { AuthProvider, useAuth } from './context/AuthContext'
import { initPreferences } from './utils/prefSync'
import { useDarkMode } from './hooks/useDarkMode'
import { useUiZoom } from './hooks/useUiZoom'
import { usePluginLoader } from './hooks/usePlugins'
import { getActiveSkin, applySkinCSS } from './utils/skins'

// Apply active skin CSS before first paint
const _skin = getActiveSkin()
applySkinCSS(_skin?.css)

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime:    300_000,
    },
  },
})

function PageRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/movements" element={<Movements />} />
      <Route path="/cuentas" element={<AccountsPage />} />
      <Route path="/annual" element={<Annual />} />
      <Route path="/charts" element={<Charts />} />
      <Route path="/budgets" element={<Budgets />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/import" element={<Import />} />
      <Route path="/inversiones" element={<Investments />} />
      <Route path="/docs" element={<Documentation />} />
      <Route path="/comparaciones" element={<Comparaciones />} />
      <Route path="/proyeccion" element={<Projection />} />
      <Route path="/analisis" element={<Analysis />} />
      <Route path="/consultor-ia" element={<AiConsultant />} />
    </Routes>
  )
}

function SidebarLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === '1'
  )
  const { pathname } = useLocation()
  const fullscreen = pathname === '/consultor-ia'

  const toggleCollapsed = () => {
    setSidebarCollapsed(v => {
      const next = !v
      localStorage.setItem('sidebar-collapsed', next ? '1' : '0')
      return next
    })
  }

  return (
    <div className="flex h-full overflow-hidden bg-gray-50 dark:bg-gray-950">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleCollapsed}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 md:hidden shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <Menu className="w-5 h-5" strokeWidth={1.5} />
          </button>
          <Wallet className="w-5 h-5 text-gray-800 dark:text-white" strokeWidth={1.5} />
          <span className="font-bold text-gray-800 dark:text-white">Caulky</span>
        </header>
        {fullscreen
          ? <div className="flex-1 min-h-0 flex flex-col overflow-hidden"><PageRoutes /></div>
          : <main className="flex-1 overflow-y-auto"><PageRoutes /></main>
        }
      </div>
    </div>
  )
}

function TopNavLayout() {
  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950">
      <TopNav />
      <main className="flex-1 overflow-y-auto">
        <PageRoutes />
      </main>
    </div>
  )
}

function Layout() {
  useDarkMode()
  useUiZoom()
  usePluginLoader()

  const skin = getActiveSkin()

  // Re-apply CSS after dark mode hook runs (in case class changed)
  useLayoutEffect(() => {
    applySkinCSS(skin?.css)
  }, [skin?.id])

  if (skin?.layout === 'topnav') return <TopNavLayout />
  return <SidebarLayout />
}

function AppRoutes() {
  const { user, loading } = useAuth()
  const [prefsReady, setPrefsReady] = useState(false)

  useEffect(() => {
    if (!user) { setPrefsReady(false); return }
    setPrefsReady(false)
    initPreferences().then(() => setPrefsReady(true))
  }, [user?.id])

  if (loading || (user && !prefsReady)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-800 dark:border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/speedmode" element={user ? <QuickAdd /> : <Navigate to="/login" replace />} />
      <Route path="/*" element={user ? <Layout /> : <Navigate to="/login" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
