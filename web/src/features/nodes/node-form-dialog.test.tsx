import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { NodeFormDialog } from './node-form-dialog'

/**
 * 创建 has to reach the server, carrying what the form was filled in with.
 *
 * Both halves are asserted against the request itself, and for the same
 * reason: everything downstream of it has passed while the feature was broken.
 *
 * The console once shipped a rate input carrying `min="0.1" step="0.1"`, which
 * makes the default rate of 1 a step mismatch in floating point. A form with an
 * invalid control is never submitted by the browser, so no submit event fired,
 * react-hook-form's handler never ran, and the button did nothing at all —
 * no request, no error, no message. Asserting the request is what catches that
 * class of bug; asserting the mutation would not.
 *
 * The IPv6 preference failed the other way round: it was a field the backend
 * accepted and dropped, and the install command shown right afterwards was
 * built from the form's own memory — so every test that stopped short of the
 * request body still passed while the preference never left the browser.
 * Asserting that `addNode` sends what it is handed proves nothing either; the
 * question is what the form hands it.
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

/** The body of the AddNode request, once one has been sent. */
async function createdBody(fetchMock: ReturnType<typeof stubAddNode>) {
  await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  return JSON.parse(String(init.body)) as Record<string, unknown>
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
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('Action=AddNode')
    expect(await createdBody(fetchMock)).toMatchObject({
      NodeName: 'hk-01',
      NodeType: 'inbound',
      Rate: 1,
    })
  })

  it('sends the IPv6 preference the switch was turned on', async () => {
    const fetchMock = stubAddNode()
    renderDialog()

    fireEvent.click(screen.getByLabelText('默认走 IPv6'))
    fireEvent.change(screen.getByPlaceholderText('hk-01'), { target: { value: 'hk-01' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    expect(await createdBody(fetchMock)).toMatchObject({
      NodeName: 'hk-01',
      DefaultIPv6: true,
    })
  })

  // Asserted as an explicit false rather than by absence: a field that goes
  // missing is precisely the failure this pins, and a loose match passes on a
  // body that never carried it.
  it('sends the preference as false when the switch is left alone', async () => {
    const fetchMock = stubAddNode()
    renderDialog()

    fireEvent.change(screen.getByPlaceholderText('hk-01'), { target: { value: 'hk-01' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    expect((await createdBody(fetchMock)).DefaultIPv6).toBe(false)
  })

  it('sends the name with its surrounding whitespace removed', async () => {
    const fetchMock = stubAddNode()
    renderDialog()

    fireEvent.change(screen.getByPlaceholderText('hk-01'), { target: { value: '  hk-01  ' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    expect(await createdBody(fetchMock)).toMatchObject({ NodeName: 'hk-01' })
  })

  it('reports a negative rate through the form instead of letting the browser swallow it', async () => {
    const fetchMock = stubAddNode()
    renderDialog()

    fireEvent.change(screen.getByPlaceholderText('hk-01'), { target: { value: 'hk-01' } })
    fireEvent.change(screen.getByLabelText('流量倍率'), { target: { value: '-1' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    // The rule lives in the zod schema, so the user reads it in the dialog. A
    // `min` on the input would instead make the control invalid, and a form
    // with an invalid control is one the browser refuses to submit at all —
    // no submit event, no handler, no message, the same silence that once made
    // 创建 do nothing.
    expect(await screen.findByText('倍率必须大于 0')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
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

  it('names no control after a property of the form element', () => {
    renderDialog()

    // A control's `name` becomes a property of the form element itself, and
    // `HTMLFormElement` is [LegacyOverrideBuiltIns]: the control wins over
    // whatever it collides with. React reads `event.target.nodeName` on every
    // event it dispatches, so a control named `nodeName` makes that read return
    // an <input>; `.toLowerCase()` on it throws inside React's dispatch, before
    // onSubmit runs. Nothing then calls preventDefault, so the browser falls
    // back to submitting the form itself: the page reloads with the fields in
    // the query string, the dialog is gone, and AddNode was never sent —
    // 创建 looks like it did nothing, for the third time and a third reason.
    //
    // happy-dom does not implement that shadowing, which is why every test
    // above passes while a browser breaks. So the rule is asserted against the
    // prototype chain, which both agree on.
    const form = document.getElementById('node-form') as HTMLFormElement
    const shadowing = [...form.elements]
      .map((el) => (el as HTMLInputElement).name)
      .filter((name) => name && name in HTMLFormElement.prototype)
    expect(shadowing).toEqual([])
  })
})
