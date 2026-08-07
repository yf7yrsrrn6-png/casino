import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '@/store/useSession'
import { PageLoader } from '@/components/ui/Feedback'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const user = useSession((s) => s.user)
  const ready = useSession((s) => s.ready)
  const location = useLocation()

  if (!ready) return <PageLoader />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return <>{children}</>
}
