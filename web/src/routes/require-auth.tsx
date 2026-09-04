import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader2Icon, ServerCrashIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'

/**
 * Blocks the app shell until there is a usable session.
 *
 * No token at all → straight to the login page, carrying where the user meant
 * to go. A token whose identity is still loading gets a spinner rather than a
 * redirect: bouncing to /login on every refresh, before `/user/detail` has
 * answered, is the classic bug here.
 *
 * A token that could not be resolved for some other reason — the backend down,
 * the database unreachable — gets an explicit error. Falling through to the
 * shell would render an empty sidebar, which looks exactly like a user who
 * holds no permissions.
 */
export function RequireAuth() {
  const { token, loading, error, retry, logout } = useAuth()
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

  if (error) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
        <ServerCrashIcon className="size-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">无法加载登录信息</p>
          <p className="max-w-sm text-sm text-muted-foreground">{error.message}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={retry}>重试</Button>
          <Button variant="outline" onClick={() => void logout()}>
            退出登录
          </Button>
        </div>
      </div>
    )
  }

  return <Outlet />
}
