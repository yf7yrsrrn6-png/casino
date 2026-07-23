import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '@/store/useSession'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const user = useSession((s) => s.user)
  const ready = useSession((s) => s.ready)
  const location = useLocation()

  if (!ready) {
    return (
      <div className="flex min-h-[50svh] items-center justify-center text-mist">
        <span className="animate-pulse">…</span>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return <>{children}</>
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const user = useSession((s) => s.user)
  const ready = useSession((s) => s.ready)
  const location = useLocation()

  if (!ready) {
    return (
      <div className="flex min-h-[50svh] items-center justify-center text-mist">
        <span className="animate-pulse">…</span>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (user.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}
