import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { Node } from '@/types/api'

import {
  installTargetFor,
  NodeInstallDialog,
  type NodeInstallTarget,
} from './node-install-dialog'

/**
 * The point of the feature is that what lands on the clipboard runs unedited on
 * a fresh box, so these assert the rendered command rather than the markup.
 */

const NODE_KEY = 'b6f1c0de-0000-4000-8000-000000000001'

/** A node as the list action sends it, for the row-to-target tests below. */
const nodeRow: Node = {
  id: 7,
  createdAt: null,
  updatedAt: null,
  nodeName: 'hk-01',
  ip: null,
  managerIp: '',
  port: null,
  key: NODE_KEY,
  status: 'unregistered',
  nodeType: 'inbound',
  ipv4: null,
  ipv6: null,
  rate: 1,
  protocol: 0,
  iepl: 0,
  preferIpv6: false,
}

function renderDialog(target: NodeInstallTarget = { nodeKey: NODE_KEY, issued: true }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <NodeInstallDialog target={target} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

/** Answers the GetAgentInstallInfo action with the console's envelope. */
function stubInstallInfo(controllerAddr = 'controller.example.com:8123') {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            code: 0,
            message: 'OK',
            data: { controllerAddr, scriptUrl: 'https://example.com/install.sh' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    ),
  )
}

let copied: string[] = []

beforeEach(() => {
  copied = []
  localStorage.clear()
  stubInstallInfo()
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: (text: string) => {
        copied.push(text)
        return Promise.resolve()
      },
    },
    configurable: true,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NodeInstallDialog', () => {
  it('renders a command carrying the address the backend suggested and the node key', async () => {
    renderDialog()

    await screen.findByText(
      `curl -fsSL https://example.com/install.sh | sudo bash -s -- controller.example.com:8123 ${NODE_KEY}`,
    )
  })

  it('appends --prefer-ipv6 when the node was created with it', async () => {
    renderDialog({ nodeKey: NODE_KEY, issued: true, preferIPv6: true })

    await screen.findByText(new RegExp(`${NODE_KEY} --prefer-ipv6$`))
  })

  // The command shown from the node list has to be the one the create dialog
  // gave. The preference used to live only in that dialog's memory, so
  // reopening it later silently dropped the flag and the agent installed from
  // that second command registered its IPv4 address.
  it('rebuilds the same command from a stored node, long after creation', async () => {
    const stored = { ...nodeRow, preferIpv6: true }
    renderDialog(installTargetFor(stored))

    await screen.findByText(new RegExp(`${NODE_KEY} --prefer-ipv6$`))
  })

  it('leaves the flag off for a node created without it', async () => {
    renderDialog(installTargetFor({ ...nodeRow, preferIpv6: false }))

    await screen.findByText(new RegExp(`${NODE_KEY}$`))
  })

  it('rebuilds the command from a corrected address and remembers it', async () => {
    renderDialog()
    const field = await screen.findByLabelText('控制面地址')

    fireEvent.change(field, { target: { value: '10.0.0.5:9000' } })
    await screen.findByText(new RegExp('-- 10\\.0\\.0\\.5:9000 '))

    fireEvent.click(screen.getByRole('button', { name: /复制安装命令/ }))

    await waitFor(() => expect(copied).toHaveLength(1))
    expect(copied[0]).toContain('-- 10.0.0.5:9000 ')
    // Typed once per browser, not once per node.
    expect(localStorage.getItem('stander.controllerAddr')).toBe('10.0.0.5:9000')
  })

  it('prefers a remembered address over the backend’s guess', async () => {
    localStorage.setItem('stander.controllerAddr', 'agents.internal:8123')
    renderDialog()

    await screen.findByText(new RegExp('-- agents\\.internal:8123 '))
  })

  it('copies the bare key too, for a box that already runs an agent', async () => {
    renderDialog()

    fireEvent.click(await screen.findByRole('button', { name: /只复制密钥/ }))
    await waitFor(() => expect(copied).toEqual([NODE_KEY]))
  })
})
