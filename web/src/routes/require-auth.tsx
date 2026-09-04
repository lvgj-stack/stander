import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader2Icon } from 'lucide-react'

import { useAuth } from '@/hooks/use-auth'

/**
 * Blocks the app shell until there is a usable session.
 *
 * No token at all → straight to the login page, carrying where the user meant
 * to go. A token whose identity is still loading gets a spinner rather than a
 * redirect: bouncing to /login on every refresh, before `/user/detail` has
 * answered, is the classic bug here.
 */
export function RequireAuth() {
  const { token, loading } = useAuth()
  const location = useLocation()

  if (!token) {
    const redirect = `${location.pathname}${location.search}`
    return (
      <Navigate
        to={`/login${redirect && redirect !== '/' ? `?redirect=${encodeURIComponent(redirect)}` : ''}`}
        replace
      />
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return <Outlet />
}
