import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(new Blob(['<svg/>']), { status: 200 }))),
  )
  vi.stubGlobal('URL', Object.assign(Object.create(URL), URL, {
    createObjectURL: () => 'blob:captcha',
    revokeObjectURL: () => {},
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('app composition', () => {
  it('mounts the login screen through the full provider stack', async () => {
    renderLogin()

    expect(screen.getByText('Stander 管理后台')).toBeTruthy()
    expect(screen.getByLabelText('用户名')).toBeTruthy()
    expect(screen.getByLabelText('密码')).toBeTruthy()
    expect(screen.getByLabelText('验证码')).toBeTruthy()
  })

  it('fetches the captcha with credentials on mount', async () => {
    renderLogin()

    await waitFor(() => {
      expect(screen.getByAltText('验证码')).toBeTruthy()
    })

    const [url, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/auth/captcha')
    expect(init.credentials).toBe('include')
  })
})
