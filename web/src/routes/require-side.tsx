import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '@/hooks/use-auth'

/**
 * Keeps each side to the accounts that belong on it.
 *
 * There are exactly two, and the role decides which: SUPER_ADMIN gets the
 * admin console, everyone else the user portal. An account that lands on the
 * wrong one is sent to its own rather than shown a 404 — the URL is not wrong,
 * it just belongs to the other side.
 *
 * This is a routing convenience, not the security boundary. The service layer
 * makes the same distinction on every call (identity.Principal.IsSuperAdmin),
 * so a user who types an admin URL gets an empty or rejected screen even
 * before this redirect runs.
 */
export function RequireSide({ admin }: { admin: boolean }) {
  const { isAdmin } = useAuth()
  if (isAdmin !== admin) return <Navigate to={isAdmin ? '/admin' : '/portal'} replace />
  return <Outlet />
}

/** Sends a signed-in account to its own side. The app's landing route. */
export function SideRedirect() {
  const { isAdmin } = useAuth()
  return <Navigate to={isAdmin ? '/admin' : '/portal'} replace />
}
