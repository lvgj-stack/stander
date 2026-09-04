import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import * as authApi from '@/api/auth'
import { clearToken, getToken, setToken, setUnauthorizedHandler } from '@/api/client'
import { getPermissionsTree } from '@/api/role'
import { getCurrentUser } from '@/api/user'
import { collectCodes } from '@/lib/permissions'
import type { CurrentUser, Permission } from '@/types/api'

interface AuthState {
  token: string | null
  user: CurrentUser | undefined
  permissionTree: Permission[] | undefined
  codes: Set<string>
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

  const permissionQuery = useQuery({
    queryKey: ['auth', 'permissions', token],
    queryFn: getPermissionsTree,
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

  const codes = useMemo(() => collectCodes(permissionQuery.data), [permissionQuery.data])

  const retry = useCallback(() => {
    void userQuery.refetch()
    void permissionQuery.refetch()
  }, [userQuery, permissionQuery])

  const value = useMemo<AuthState>(
    () => ({
      token,
      user: userQuery.data,
      permissionTree: permissionQuery.data,
      codes,
      loading: Boolean(token) && (userQuery.isPending || permissionQuery.isPending),
      // A rejected token clears itself and lands on the login page. Anything
      // else — the backend down, the database unreachable — must be reported,
      // or the console renders an empty shell that looks like a user with no
      // permissions at all.
      error: userQuery.error ?? permissionQuery.error,
      retry,
      login,
      logout,
      switchRole,
    }),
    [
      token,
      userQuery.data,
      userQuery.isPending,
      userQuery.error,
      permissionQuery.data,
      permissionQuery.isPending,
      permissionQuery.error,
      codes,
      retry,
      login,
      logout,
      switchRole,
    ],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthState {
  const context = use(AuthContext)
  if (!context) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return context
}

/** True when the signed-in user holds `code`. Codeless callers pass undefined. */
export function useHasPermission(code: string | undefined): boolean {
  const { codes } = useAuth()
  if (!code) return true
  return codes.has(code)
}
