import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { clearToken } from '@/api/client'
import { LoginPage } from '@/features/auth/login-page'
import { AuthProvider } from '@/hooks/use-auth'
import { ThemeProvider } from '@/hooks/use-theme'

/**
 * A smoke test for the composition, not for the login page's markup.
 *
 * It is the one check that the whole provider stack — QueryClient, theme,
 * auth, router, react-hook-form and the shadcn/ui primitives — actually mounts
 * together. A wiring mistake there breaks every screen at once and no unit
 * test would catch it, since each piece works fine on its own.
 */
function renderLogin() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  clearToken()
  // The login screen issues no request of its own; a stub is here so that a
  // future one fails the test loudly instead of hitting the network.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('the login screen must not fetch on mount'))),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('app composition', () => {
  it('mounts the login screen through the full provider stack', async () => {
    renderLogin()

    expect(screen.getByText('Stander')).toBeTruthy()
    expect(screen.getByLabelText('用户名')).toBeTruthy()
    expect(screen.getByLabelText('密码')).toBeTruthy()
  })

  it('asks for nothing but a username and a password', async () => {
    renderLogin()

    expect(screen.queryByLabelText('验证码')).toBeNull()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
