import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { AuthProvider } from '@/hooks/use-auth'
import type { AdminUser } from '@/types/api'

import { AccountFormDialog } from './account-form-dialog'

/**
 * The form names the role instead of looking its id up.
 *
 * That is the whole reason /role could go: the console used to fetch the role
 * table only to translate SUPER_ADMIN into whatever id this database numbered
 * the row with. These pin the request body, so a regression to id-passing
 * fails here rather than in a database nobody runs locally.
 */

let calls: { url: string; method: string; body: unknown }[] = []

function renderForm(account?: AdminUser) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountFormDialog open onOpenChange={() => {}} account={account} />
      </AuthProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      return Promise.resolve(
        new Response(JSON.stringify({ code: 0, message: 'OK', originUrl: '' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

/** The account row the list endpoint returns, carrying one role code. */
const adminAccount: AdminUser = {
  id: 7,
  username: 'ops',
  enable: true,
  createTime: '',
  updateTime: '',
  gender: 0,
  avatar: '',
  address: '',
  email: '',
  role: 'SUPER_ADMIN',
}

describe('AccountFormDialog', () => {
  it('creates an account with a role code, not a role id', async () => {
    renderForm()

    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'newbie' } })
    fireEvent.change(screen.getByLabelText('初始密码'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    const created = calls.find((c) => c.method === 'POST')!
    expect(created.url).toContain('/user')
    expect(created.body).toMatchObject({ username: 'newbie', role: 'USER' })
    expect(created.body).not.toHaveProperty('roleIds')
  })

  it('sends SUPER_ADMIN when the admin side is picked', async () => {
    renderForm()

    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'boss' } })
    fireEvent.change(screen.getByLabelText('初始密码'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: /管理端/ }))
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({ role: 'SUPER_ADMIN' })
  })

  // The row carries `role`, so the form has to read the side off that rather
  // than off the array of roles it used to be handed.
  it('preselects the side from the account it is editing', async () => {
    renderForm(adminAccount)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /管理端/ }).getAttribute('aria-pressed')).toBe(
        'true',
      ),
    )
  })

  // Creating an account is one request. Opening the form is none at all —
  // which is the point: the role lookup it used to do on open is what kept the
  // /role endpoint alive.
  it('creates without ever asking for the role table', async () => {
    renderForm()
    await screen.findByLabelText('用户名')
    expect(calls).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'newbie' } })
    fireEvent.change(screen.getByLabelText('初始密码'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].url).toContain('/user')
  })
})
