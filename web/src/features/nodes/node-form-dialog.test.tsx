import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { NodeFormDialog } from './node-form-dialog'

/**
 * 创建 has to reach the server.
 *
 * The console once shipped a rate input carrying `min="0.1" step="0.1"`, which
 * makes the default rate of 1 a step mismatch in floating point. A form with an
 * invalid control is never submitted by the browser, so no submit event fired,
 * react-hook-form's handler never ran, and the button did nothing at all —
 * no request, no error, no message. Asserting the request is what catches that
 * class of bug; asserting the mutation would not.
 */

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <NodeFormDialog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  )
}

/** Answers AddNode with the console's envelope and records the calls. */
function stubAddNode() {
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ code: 0, message: 'OK', data: 'a-node-key' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NodeFormDialog', () => {
  it('sends AddNode when 创建 is clicked', async () => {
    const fetchMock = stubAddNode()
    renderDialog()

    fireEvent.change(screen.getByPlaceholderText('hk-01'), { target: { value: 'hk-01' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('Action=AddNode')
    expect(JSON.parse(String(init.body))).toMatchObject({
      NodeName: 'hk-01',
      NodeType: 'inbound',
      Rate: 1,
    })
  })

  it('leaves no control the browser would refuse to submit', () => {
    renderDialog()
    fireEvent.change(screen.getByPlaceholderText('hk-01'), { target: { value: 'hk-01' } })

    const form = document.getElementById('node-form') as HTMLFormElement
    const invalid = [...form.elements]
      .filter((el): el is HTMLInputElement => 'validity' in el)
      .filter((el) => !el.validity.valid)
      .map((el) => el.name || el.type)
    expect(invalid).toEqual([])
  })
})
