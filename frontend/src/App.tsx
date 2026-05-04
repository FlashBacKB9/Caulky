import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
import { useDarkMode } from './hooks/useDarkMode'
import { useUiZoom } from './hooks/useUiZoom'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,  // 1 min — no refetch on quick navigation
      gcTime:    300_000, // 5 min — keep in memory while browsing
    },
  },
})

function Layout() {
  useDarkMode()
  useUiZoom()
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      <Sidebar />
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
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
