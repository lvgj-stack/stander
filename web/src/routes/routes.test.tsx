import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

import { clearToken, setToken } from '@/api/client'
import { ADMIN_SIDE } from '@/app/admin/admin-nav'
import { USER_SIDE } from '@/app/user/user-nav'
import { ConsoleShell } from '@/components/layout/console-shell'
import { AuthProvider } from '@/hooks/use-auth'
import { ThemeProvider } from '@/hooks/use-theme'

import { NotFoundPage } from './not-found'
import { RequireAuth } from './require-auth'
import { RequireSide, SideRedirect } from './require-side'

/**
 * The routing decision the whole refactor turns on: which side of the console
 * an account gets.
 *
 * `use-auth.test.tsx` covers the input to that decision (`isAdmin`); this
 * covers what the router does with it — that `/` lands on the right side, and
 * that neither side is reachable from the other. Nothing else asserts this,
 * and a wrong answer either shows a forwarding user the admin screens or
 * strands an admin in the portal.
 *
 * The route *tree* is the real one, rebuilt here on a memory router because
 * `routes/index.tsx` exports a browser router that cannot be pointed at a
 * path. The guards, the shell and both nav constants are the production ones;
 * only the leaf elements are stand-ins, so this stays a test of routing rather
 * than of every page's data fetching.
 */
function leaf(name: string) {
  return <div data-testid="page">{name}</div>
}

function makeRouter(initialPath: string) {
  return createMemoryRouter(
    [
      { path: '/login', element: leaf('login') },
      {
        element: <RequireAuth />,
        children: [
          { index: true, element: <SideRedirect /> },
          {
            path: 'admin',
            element: <RequireSide admin />,
            children: [
              {
                element: <ConsoleShell side={ADMIN_SIDE} />,
                children: [
                  { index: true, element: leaf('admin-dashboard') },
                  { path: 'nodes', element: leaf('admin-nodes') },
                  { path: '*', element: <NotFoundPage home="/admin" /> },
                ],
              },
            ],
          },
          {
            path: 'portal',
            element: <RequireSide admin={false} />,
            children: [
              {
                element: <ConsoleShell side={USER_SIDE} />,
                children: [
                  { index: true, element: leaf('portal-overview') },
                  { path: 'rules', element: leaf('portal-rules') },
                  { path: '*', element: <NotFoundPage home="/portal" /> },
                ],
              },
            ],
          },
          { path: '*', element: <SideRedirect /> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  )
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = makeRouter(path)
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
  return router
}

const SUPER_ADMIN = { id: 1, code: 'SUPER_ADMIN', name: '超级管理员', enable: true }
const USER = { id: 4, code: 'USER', name: '普通用户', enable: true }

/** Signs in as an account whose active role is `currentRole`. */
function signInAs(data: unknown) {
  setToken('jwt')
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ code: 0, message: 'OK', data, originUrl: '' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))),
  )
}

const asAdmin = () =>
  signInAs({ id: 1, username: 'admin', roles: [SUPER_ADMIN], currentRole: SUPER_ADMIN })
const asUser = () => signInAs({ id: 3, username: 'user01', roles: [USER], currentRole: USER })

/**
 * Waits for the page a navigation settles on, then reports where it landed.
 *
 * The wait is on the rendered leaf rather than on `router.state.location`:
 * router state updates a commit earlier than the DOM, so polling it can win
 * the race against React and see an empty tree.
 */
async function settled(router: ReturnType<typeof makeRouter>) {
  const page = await screen.findByTestId('page')
  return { page: page.textContent, pathname: router.state.location.pathname }
}

beforeEach(() => clearToken())
afterEach(() => vi.unstubAllGlobals())

describe('landing', () => {
  it('sends an administrator to the admin side', async () => {
    asAdmin()
    const router = renderAt('/')
    expect(await settled(router)).toEqual({ page: 'admin-dashboard', pathname: '/admin' })
  })

  it('sends a forwarding user to the portal', async () => {
    asUser()
    const router = renderAt('/')
    expect(await settled(router)).toEqual({ page: 'portal-overview', pathname: '/portal' })
  })

  it('sends an unknown path to the account’s own side rather than a 404', async () => {
    asUser()
    const router = renderAt('/some/stale/bookmark')
    expect(await settled(router)).toEqual({ page: 'portal-overview', pathname: '/portal' })
  })
})

describe('the two sides do not overlap', () => {
  it('bounces a forwarding user off an admin URL', async () => {
    asUser()
    const router = renderAt('/admin/nodes')
    expect(await settled(router)).toEqual({ page: 'portal-overview', pathname: '/portal' })
  })

  it('bounces an administrator off a portal URL', async () => {
    asAdmin()
    const router = renderAt('/portal/rules')
    expect(await settled(router)).toEqual({ page: 'admin-dashboard', pathname: '/admin' })
  })

  it('lets each side reach its own pages', async () => {
    asUser()
    const router = renderAt('/portal/rules')
    expect(await settled(router)).toEqual({ page: 'portal-rules', pathname: '/portal/rules' })
  })
})

describe('sign-in', () => {
  it('redirects to /login with the intended path when there is no token', async () => {
    const router = renderAt('/portal/rules')
    expect(await settled(router)).toMatchObject({ page: 'login', pathname: '/login' })
    expect(router.state.location.search).toContain(encodeURIComponent('/portal/rules'))
  })
})

describe('a 404 inside a side stays on that side', () => {
  it('renders the portal’s not-found for an unknown portal path', async () => {
    asUser()
    const router = renderAt('/portal/nope')
    expect(await screen.findByText('404')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/portal/nope')
    // "Back" must stay on the side the visitor is actually on.
    expect(screen.getByRole('link', { name: '返回首页' }).getAttribute('href')).toBe('/portal')
  })
})
