import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { PlanFormDialog } from './plan-form-dialog'

/**
 * What the create form puts on the wire.
 *
 * The two things worth pinning both live in the request body rather than in any
 * function this form calls. The quota is entered in GB and stored in bytes, so
 * a correct converter proves nothing on its own — the form still has to send
 * its result. And the reset period's first value is 0 (月付), which is exactly
 * the value a serialiser drops: a plan created with a missing period expires
 * the moment it is made, and the form looks like it worked.
 */

let calls: { url: string; method: string; body: Record<string, unknown> | undefined }[] = []

function renderDialog(props: Partial<React.ComponentProps<typeof PlanFormDialog>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <PlanFormDialog open onOpenChange={() => {}} {...props} />
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
        new Response(
          JSON.stringify({
            code: 0,
            message: 'OK',
            originUrl: '',
            data: { Plan: { id: 42, planName: '月付 100G', totalTraffic: 1, period: 0 } },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

async function fillAndSubmit(name = '月付 100G', gb = '100') {
  fireEvent.change(await screen.findByLabelText('套餐名称'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText(/流量额度/), { target: { value: gb } })
  fireEvent.click(screen.getByRole('button', { name: '创建' }))
}

function createdBody() {
  const created = calls.find((c) => c.method === 'POST')
  if (!created) throw new Error('no request was sent')
  return created.body as Record<string, unknown>
}

describe('PlanFormDialog', () => {
  it('sends the quota in bytes, not in the gigabytes it was typed in', async () => {
    renderDialog()
    await fillAndSubmit('月付 100G', '100')

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(createdBody()).toMatchObject({
      planName: '月付 100G',
      totalTraffic: 100 * 1024 * 1024 * 1024,
    })
  })

  /**
   * Asserted as "present and 0", not with a body match.
   *
   * `toMatchObject` passes on a field that was dropped in serialisation, which
   * is the failure this exists to catch. So the property has to be looked for
   * by name before its value is compared.
   */
  it('sends the month period as a present zero rather than dropping it', async () => {
    renderDialog()
    await fillAndSubmit()

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    const body = createdBody()
    expect(Object.keys(body)).toContain('period')
    expect(body.period).toBe(0)
  })

  it('sends the period the operator picked', async () => {
    renderDialog()
    fireEvent.change(await screen.findByLabelText('套餐名称'), { target: { value: '年付' } })
    fireEvent.change(screen.getByLabelText(/流量额度/), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('重置周期'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(createdBody().period).toBe(3)
  })

  // The association half of the action. Given a user, the same one request
  // both creates and associates; there is no second call to AssociatePlan.
  it('associates in the same request when a user is given', async () => {
    renderDialog({ userId: 7 })
    await fillAndSubmit()

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(createdBody()).toMatchObject({ userId: 7 })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain('Action=CreatePlan')
  })

  // Without one it is a catalogue entry and nothing else. An absent userId has
  // to be absent, not 0 — user 0 does not exist, and the whole request would
  // roll back on it.
  it('omits the user entirely when none is given', async () => {
    renderDialog()
    await fillAndSubmit()

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(Object.keys(createdBody())).not.toContain('userId')
  })

  it('refuses to submit without a name', async () => {
    renderDialog()
    fireEvent.change(await screen.findByLabelText(/流量额度/), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    await screen.findByText('请输入套餐名称')
    expect(calls).toHaveLength(0)
  })

  // Zero is the value a partly-filled form lands on, and a zero-quota plan is
  // one whose user is over quota from the moment it is associated.
  it('refuses to submit a non-positive quota', async () => {
    renderDialog()
    await fillAndSubmit('月付', '0')

    await screen.findByText('流量额度必须大于 0')
    expect(calls).toHaveLength(0)
  })
})
