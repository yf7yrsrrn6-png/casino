import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { ProtectedRoute, AdminRoute } from '@/lib/ProtectedRoute'
import { useSession } from '@/store/useSession'
import { useWallet } from '@/store/useWallet'
import { RealtimeProvider } from '@/components/realtime/RealtimeProvider'
import { Home } from '@/pages/Home'
import { Login } from '@/pages/Login'
import { Register } from '@/pages/Register'
import { Slots } from '@/pages/Slots'
import { SlotGame } from '@/pages/SlotGame'
import { Blackjack } from '@/pages/Blackjack'
import { Roulette } from '@/pages/Roulette'
import { Baccarat } from '@/pages/Baccarat'
import { Crash } from '@/pages/Crash'
import { Wallet } from '@/pages/Wallet'
import { Profile } from '@/pages/Profile'
import { Settings } from '@/pages/Settings'
import { Admin } from '@/pages/Admin'
import { Vip } from '@/pages/Vip'
import { Bonuses } from '@/pages/Bonuses'
import { Leaderboard } from '@/pages/Leaderboard'
import { Fairness } from '@/pages/Fairness'
import { NotFound } from '@/pages/NotFound'

function App() {
  const bootstrap = useSession((s) => s.bootstrap)
  const user = useSession((s) => s.user)
  const ready = useSession((s) => s.ready)
  const refreshWallet = useWallet((s) => s.refresh)
  const clearWallet = useWallet((s) => s.clear)

  // Restore session from the httpOnly cookie on first load.
  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  // Keep the wallet in sync with the current session.
  useEffect(() => {
    if (!ready) return
    if (user) {
      void refreshWallet().catch(() => {})
    } else {
      clearWallet()
    }
  }, [ready, user, refreshWallet, clearWallet])

  return (
    <BrowserRouter>
      <RealtimeProvider />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="slots" element={<Slots />} />
          <Route path="slots/:slotId" element={<SlotGame />} />
          <Route path="blackjack" element={<Blackjack />} />
          <Route path="roulette" element={<Roulette />} />
          <Route path="baccarat" element={<Baccarat />} />
          <Route path="crash" element={<Crash />} />
          <Route path="leaderboard" element={<Leaderboard />} />
          <Route path="fair" element={<Fairness />} />
          <Route
            path="wallet"
            element={
              <ProtectedRoute>
                <Wallet />
              </ProtectedRoute>
            }
          />
          <Route
            path="profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="vip"
            element={
              <ProtectedRoute>
                <Vip />
              </ProtectedRoute>
            }
          />
          <Route
            path="bonuses"
            element={
              <ProtectedRoute>
                <Bonuses />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin"
            element={
              <AdminRoute>
                <Admin />
              </AdminRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
