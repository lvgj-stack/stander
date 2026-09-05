import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { clearToken, setToken } from '@/api/client'
import { AuthProvider, useAuth } from './use-auth'

/**
 * Covers the two things the session decides.
 *
 * Which side of the console the account lands on — the console has exactly two
 * and nothing else routes without this answer — and what happens when the
 * session cannot be loaded at all. On the second: a rejected token signs the
 * user out, while any other failure has to surface as an error. Collapsing the
 * two either strands the user on a login loop or renders an empty console that
 * looks like a signed-in account with nothing in it.
 */
function Probe() {
  const { token, loading, error, isAdmin } = useAuth()
  return (
    <div>
      <span data-testid="token">{token ?? 'none'}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="error">{error?.message ?? 'none'}</span>
      <span data-testid="side">{isAdmin ? 'admin' : 'user'}</span>
    </div>
  )
}

function renderProbe() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  )
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Stubs `/user/detail` with the given account payload. */
function stubDetail(data: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(json({ code: 0, message: 'OK', data, originUrl: '' }))),
  )
}

const SUPER_ADMIN = { id: 1, code: 'SUPER_ADMIN', name: '超级管理员', enable: true }
const USER = { id: 4, code: 'USER', name: '普通用户', enable: true }

beforeEach(() => clearToken())
afterEach(() => vi.unstubAllGlobals())

describe('which side an account belongs to', () => {
  it('puts SUPER_ADMIN on the admin side', async () => {
    setToken('jwt')
    stubDetail({ id: 1, username: 'admin', roles: [SUPER_ADMIN, USER], currentRole: SUPER_ADMIN })

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('side').textContent).toBe('admin')
  })

  it('puts every other role on the user side', async () => {
    setToken('jwt')
    stubDetail({ id: 3, username: 'user01', roles: [USER], currentRole: USER })

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('side').textContent).toBe('user')
  })

  // Switching role is how an admin previews the user portal, so the active
  // role has to win over the roles the account merely holds.
  it('follows the active role, not the roles the account holds', async () => {
    setToken('jwt')
    stubDetail({ id: 1, username: 'admin', roles: [SUPER_ADMIN, USER], currentRole: USER })

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('side').textContent).toBe('user')
  })

  // The backend reads only the JWT's currentRoleCode, so the frontend must
  // too. A token whose role no longer resolves — ROLE_QA, which the
  // two-sides migration deletes — is scoped as a non-admin by every API call;
  // routing it to the admin side would render screens that all come back
  // empty.
  it('does not fall back to held roles when no active role came back', async () => {
    setToken('jwt')
    stubDetail({ id: 1, username: 'admin', roles: [SUPER_ADMIN, USER], currentRole: null })

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('side').textContent).toBe('user')
  })

  it('treats an account with no roles at all as a user', async () => {
    setToken('jwt')
    stubDetail({ id: 9, username: 'orphan', roles: null, currentRole: null })

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('side').textContent).toBe('user')
  })
})

describe('session loading', () => {
  it('reports a server failure instead of rendering an empty console', async () => {
    setToken('jwt')
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 500 }))))

    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('error').textContent).toContain('500')
    })
    // The token survives: this is not a rejected login, and clearing it would
    // send the user to a login page that cannot work either.
    expect(screen.getByTestId('token').textContent).toBe('jwt')
  })

  it('signs the user out when the backend rejects the token', async () => {
    setToken('jwt')
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 401 }))))

    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('token').textContent).toBe('none')
    })
  })

  it('does not request anything while signed out', async () => {
    const spy = vi.fn(() => Promise.resolve(json({ code: 0, message: 'OK', originUrl: '' })))
    vi.stubGlobal('fetch', spy)

    renderProbe()

    expect(screen.getByTestId('loading').textContent).toBe('false')
    expect(spy).not.toHaveBeenCalled()
  })
})
