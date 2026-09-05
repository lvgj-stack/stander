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

beforeEach(() => clearToken())
afterEach(() => vi.unstubAllGlobals())

describe('which side an account belongs to', () => {
  it('puts SUPER_ADMIN on the admin side', async () => {
    setToken('jwt')
    stubDetail({ id: 1, username: 'admin', role: 'SUPER_ADMIN' })

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('side').textContent).toBe('admin')
  })

  it('puts USER on the user side', async () => {
    setToken('jwt')
    stubDetail({ id: 3, username: 'user01', role: 'USER' })

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('side').textContent).toBe('user')
  })

  // `role` is the role the *token* carries — identity.Principal.RoleCode, the
  // only value the backend authorizes on. Anything it cannot place is already
  // reported as USER (identity.NormalizeRole), so a code the console does not
  // know must land on the user side rather than be waved through: the
  // alternative renders admin screens that every API call answers as empty.
  it('treats a role it does not know as a user', async () => {
    setToken('jwt')
    stubDetail({ id: 9, username: 'orphan', role: 'ROLE_QA' })

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('side').textContent).toBe('user')
  })

  it('treats a missing role as a user', async () => {
    setToken('jwt')
    stubDetail({ id: 9, username: 'orphan' })

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
