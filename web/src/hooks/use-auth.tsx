import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import * as authApi from '@/api/auth'
import { clearToken, getToken, setToken, setUnauthorizedHandler } from '@/api/client'
import { getCurrentUser } from '@/api/user'
import type { CurrentUser } from '@/types/api'

/**
 * The role that puts an account on the admin side.
 *
 * It is the same constant the Go service layer splits on
 * (identity.RoleSuperAdmin), and deliberately the only one: the backend has
 * exactly one authorization boundary — super admin or not — so the console has
 * exactly two sides rather than a menu assembled per role at runtime.
 */
export const ADMIN_ROLE = 'SUPER_ADMIN'

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
  switchRole: (roleCode: string) => Promise<void>
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

  const switchRole = useCallback(
    async (roleCode: string) => {
      const { accessToken } = await authApi.switchRole(roleCode)
      setToken(accessToken)
      setTokenState(accessToken)
      await queryClient.invalidateQueries()
    },
    [queryClient],
  )

  // The *active* role decides the side, and only it — deliberately no fallback
  // to the roles the account merely holds.
  //
  // The backend reads the same single value: identity.Principal.RoleCode is
  // the JWT's currentRoleCode and nothing else. A token whose role no longer
  // resolves (it was renamed, or deleted — the two-sides migration drops
  // ROLE_QA) leaves `currentRole` null, and the backend scopes that caller as
  // a non-admin. Routing them to the admin side on the strength of a role
  // they hold but are not currently acting as would show them admin screens
  // that every API call then answers as empty — data loss, not a stale token.
  const user = userQuery.data
  const isAdmin = useMemo(() => user?.currentRole?.code === ADMIN_ROLE, [user])

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
      switchRole,
    }),
    [token, user, isAdmin, userQuery.isPending, userQuery.error, retry, login, logout, switchRole],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthState {
  const context = use(AuthContext)
  if (!context) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return context
}
