import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Menu, Wallet } from 'lucide-react'
import Sidebar from './components/Sidebar'
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
import QuickAdd from './pages/QuickAdd'
import LoginPage from './pages/LoginPage'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useDarkMode } from './hooks/useDarkMode'
import { useUiZoom } from './hooks/useUiZoom'
import { usePluginLoader } from './hooks/usePlugins'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime:    300_000,
    },
  },
})

function Layout() {
  useDarkMode()
  useUiZoom()
  usePluginLoader()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-full overflow-hidden bg-gray-50 dark:bg-gray-950">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

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

        <main className="flex-1 overflow-y-auto">
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
          </Routes>
        </main>
      </div>
    </div>
  )
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
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
