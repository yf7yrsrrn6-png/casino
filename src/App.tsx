import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useSession } from '@/store/useSession'
import { useSettings } from '@/store/useSettings'
import { useTrades } from '@/store/useTrades'
import { ProtectedRoute } from '@/lib/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { PageLoader } from '@/components/ui/Feedback'
import { TradeEditor } from '@/components/trades/TradeEditor'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { Journal } from '@/pages/Journal'
import { TradeDetail } from '@/pages/TradeDetail'
import { Analytics } from '@/pages/Analytics'
import { Plans } from '@/pages/Plans'
import { Calculators } from '@/pages/Calculators'
import { Settings } from '@/pages/Settings'

function AuthedApp() {
  const loadSettings = useSettings((s) => s.load)
  const loadTrades = useTrades((s) => s.load)

  useEffect(() => {
    void loadSettings()
    void loadTrades()
  }, [loadSettings, loadTrades])

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/journal/:id" element={<TradeDetail />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/plans" element={<Plans />} />
        <Route path="/plans/:id" element={<Plans />} />
        <Route path="/calculators" element={<Calculators />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TradeEditor />
    </AppShell>
  )
}

function App() {
  const bootstrap = useSession((s) => s.bootstrap)
  const ready = useSession((s) => s.ready)
  const user = useSession((s) => s.user)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  if (!ready) return <PageLoader />

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AuthedApp />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
