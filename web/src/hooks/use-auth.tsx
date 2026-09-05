import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import * as authApi from '@/api/auth'
import { clearToken, getToken, setToken, setUnauthorizedHandler } from '@/api/client'
import { getCurrentUser } from '@/api/user'
import { ADMIN_ROLE } from '@/lib/roles'
import type { CurrentUser } from '@/types/api'

interface AuthState {
  token: string | null
  user: CurrentUser | undefined
  /** True when this session belongs on the admin side rather than the user portal. */
  isAdmin: boolean
  /** True while the identity behind an existing token is still loading. */
  loading: boolean
  /** Set when the session could not be loaded for a reason other than a rejected token. */
  error: Error | null
  /** Retries loading the session after such a failure. */
  retry: () => void
  login: (params: authApi.LoginParams) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken())
  const queryClient = useQueryClient()

  // The client throws from deep inside a query when the backend rejects the
  // token; this is how that reaches React state.
  useEffect(() => {
    setUnauthorizedHandler(() => setTokenState(null))
    return () => setUnauthorizedHandler(() => {})
  }, [])

  const userQuery = useQuery({
    queryKey: ['auth', 'me', token],
    queryFn: getCurrentUser,
    enabled: Boolean(token),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const login = useCallback(
    async (params: authApi.LoginParams) => {
      const { accessToken } = await authApi.login(params)
      setToken(accessToken)
      setTokenState(accessToken)
      // The previous session's cached rows must not leak into the new one.
      await queryClient.invalidateQueries()
    },
    [queryClient],
  )

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // Logging out locally must succeed even if the server call does not.
    }
    clearToken()
    setTokenState(null)
    queryClient.clear()
  }, [queryClient])

  // `role` is the role the token carries, which is the only thing the backend
  // authorizes on (identity.Principal.RoleCode is the JWT's currentRoleCode and
  // nothing else). Anything the backend does not recognise it already reports
  // as USER, so there is no third case to handle here.
  const user = userQuery.data
  const isAdmin = useMemo(() => user?.role === ADMIN_ROLE, [user])

  const retry = useCallback(() => {
    void userQuery.refetch()
  }, [userQuery])

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      isAdmin,
      loading: Boolean(token) && userQuery.isPending,
      // A rejected token clears itself and lands on the login page. Anything
      // else — the backend down, the database unreachable — must be reported,
      // or the console renders an empty shell that looks like a signed-in user
      // with nothing in it.
      error: userQuery.error,
      retry,
      login,
      logout,
    }),
    [token, user, isAdmin, userQuery.isPending, userQuery.error, retry, login, logout],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthState {
  const context = use(AuthContext)
  if (!context) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return context
}
