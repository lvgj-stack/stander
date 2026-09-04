import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { clearToken, setToken } from '@/api/client'
import { AuthProvider, useAuth } from './use-auth'

/**
 * Covers how the session behaves when it cannot be loaded.
 *
 * The distinction that matters: a rejected token signs the user out, while any
 * other failure has to surface as an error. Collapsing the two either strands
 * the user on a login loop or renders an empty console that looks like a user
 * with no permissions.
 */
function Probe() {
  const { token, loading, error, codes } = useAuth()
  return (
    <div>
      <span data-testid="token">{token ?? 'none'}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="error">{error?.message ?? 'none'}</span>
      <span data-testid="codes">{[...codes].join(',') || 'none'}</span>
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

beforeEach(() => clearToken())
afterEach(() => vi.unstubAllGlobals())

describe('session loading', () => {
  it('flattens the permission tree into the code set the menu is gated on', async () => {
    setToken('jwt')
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          url.includes('/user/detail')
            ? json({ code: 0, message: 'OK', data: { id: 1, username: 'admin' }, originUrl: '' })
            : json({
                code: 0,
                message: 'OK',
                originUrl: '',
                data: [
                  {
                    id: 1,
                    code: 'SysMgt',
                    children: [{ id: 2, code: 'UserMgt', children: null }],
                  },
                ],
              }),
        ),
      ),
    )

    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false')
    })
    expect(screen.getByTestId('codes').textContent).toBe('SysMgt,UserMgt')
    expect(screen.getByTestId('error').textContent).toBe('none')
  })

  it('reports a server failure instead of pretending the user has no permissions', async () => {
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
