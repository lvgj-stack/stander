import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { deleteChain, listChains } from './chain'
import { listChainGroups } from './chain-group'
import { clearToken } from './client'
import {
  editForwardUser,
  getUserResources,
  listForwardUsers,
  setUserResources,
} from './forward-user'
import { associatePlan, listPlans } from './plan'
import { addNode, deleteNode, getAgentInstallInfo, listNodes } from './node'
import { addRule, deleteRule, testRule } from './rule'
import { listUsers } from './user'

/**
 * Pins how each domain call is put on the wire.
 *
 * The two request dialects are the thing worth guarding: `/stander/*` takes
 * PascalCase fields in a POST body with the verb in an `Action` query
 * parameter, while the account endpoints are ordinary REST with camelCase
 * query parameters. Getting one of them wrong fails at runtime with an opaque
 * "unknown action" or a silently ignored filter.
 */
let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  clearToken()
  fetchSpy = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ code: 0, message: 'OK', data: null, originUrl: '/' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** The URL and parsed JSON body of the single request that was made. */
function sent() {
  const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
  return { url, body: init.body ? JSON.parse(init.body as string) : undefined, method: init.method }
}

describe('node actions', () => {
  it('lists nodes with PascalCase paging fields', async () => {
    await listNodes({ PageNo: 2, PageSize: 20, NodeName: 'hk' })
    expect(sent()).toMatchObject({
      url: '/stander/node?Action=ListNodes',
      method: 'POST',
      body: { PageNo: 2, PageSize: 20, NodeName: 'hk' },
    })
  })

  it('passes the AddChainScene filter through untouched', async () => {
    await listNodes({ PageNo: 1, PageSize: 200, Scene: 'AddChainScene' })
    expect(sent().body).toMatchObject({ Scene: 'AddChainScene' })
  })

  it('creates a node', async () => {
    await addNode({ NodeName: 'hk-01', NodeType: 'inbound', Rate: 1.5, DefaultIPv6: true })
    expect(sent()).toMatchObject({
      url: '/stander/node?Action=AddNode',
      body: { NodeName: 'hk-01', NodeType: 'inbound', Rate: 1.5, DefaultIPv6: true },
    })
  })

  it('deletes a node by id', async () => {
    await deleteNode(42)
    expect(sent()).toMatchObject({ url: '/stander/node?Action=DeleteNode', body: { ID: 42 } })
  })

  it('asks for what the install command needs besides the key', async () => {
    await getAgentInstallInfo()
    expect(sent()).toMatchObject({
      url: '/stander/node?Action=GetAgentInstallInfo',
      method: 'POST',
      body: {},
    })
  })
})

describe('chain actions', () => {
  it('lists chains', async () => {
    await listChains({ PageNo: 1, PageSize: 10, ChainName: 'relay' })
    expect(sent().url).toBe('/stander/chain?Action=ListChains')
  })

  it('sends the port alongside the id when deleting', async () => {
    // DelChain tears the listener down on the node before dropping the row, so
    // omitting the port leaves a live listener behind.
    await deleteChain(7, 20000)
    expect(sent().body).toEqual({ ID: 7, Port: 20000 })
  })
})

describe('chain group actions', () => {
  it('targets the hyphenated resource path', async () => {
    await listChainGroups()
    expect(sent().url).toBe('/stander/chain-group?Action=ListChainGroups')
  })
})

describe('rule actions', () => {
  it('creates a rule', async () => {
    await addRule({
      RuleName: 'web',
      ListenPort: 443,
      RemoteAddr: '1.2.3.4:443',
      NodeId: 3,
      ChainId: 9,
      ChainType: 'TLS',
    })
    expect(sent()).toMatchObject({
      url: '/stander/rule?Action=AddRule',
      body: { RuleName: 'web', ListenPort: 443, RemoteAddr: '1.2.3.4:443', NodeId: 3, ChainId: 9 },
    })
  })

  it('sends the listen port alongside the id when deleting', async () => {
    await deleteRule(5, 443)
    expect(sent().body).toEqual({ ID: 5, Port: 443 })
  })

  it('probes a rule by id', async () => {
    await testRule(5)
    expect(sent()).toMatchObject({ url: '/stander/rule?Action=TestRule', body: { ID: 5 } })
  })
})

describe('forwarding user and plan actions', () => {
  it('lists forwarding users through the stander user resource', async () => {
    await listForwardUsers({ PageNo: 1, PageSize: 10 })
    expect(sent().url).toBe('/stander/user?Action=ListUsers')
  })

  it('sends a null expiration when the date is cleared', async () => {
    await editForwardUser(3, null)
    expect(sent().body).toEqual({ ID: 3, ExpirationTime: null })
  })

  it('associates a plan with the lowercase field names the request struct uses', async () => {
    // req.AssociatePlanReq tags these as `userId`/`planId`, unlike its
    // PascalCase neighbours.
    await associatePlan(3, 8)
    expect(sent()).toMatchObject({
      url: '/stander/plan?Action=AssociatePlan',
      body: { userId: 3, planId: 8 },
    })
  })

  it('lists plans', async () => {
    await listPlans()
    expect(sent().url).toBe('/stander/plan?Action=ListPlans')
  })

  it('reads a user’s resource grants', async () => {
    await getUserResources(3)
    expect(sent()).toMatchObject({
      url: '/stander/user?Action=GetUserResources',
      body: { UserId: 3 },
    })
  })

  // The grant set is replaced wholesale, so empty arrays have to reach the
  // server as empty arrays — dropping them would turn a revoke into a no-op.
  it('sends both grant lists even when they are empty', async () => {
    await setUserResources(3, [], [])
    expect(sent()).toMatchObject({
      url: '/stander/user?Action=SetUserResources',
      body: { UserId: 3, NodeIds: [], ChainIds: [] },
    })
  })
})

describe('account endpoints keep the REST dialect', () => {
  it('lists accounts with camelCase query parameters', async () => {
    await listUsers({ pageNo: 2, pageSize: 20, username: 'ad' })
    expect(sent()).toMatchObject({
      url: '/user?pageNo=2&pageSize=20&username=ad',
      method: 'GET',
    })
  })
})
