import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { AuthProvider } from '@/hooks/use-auth'
import type { AdminUser, Chain, Node, Rule } from '@/types/api'

import { AccountFormDialog } from './accounts/account-form-dialog'
import { LoginPage } from './auth/login-page'
import { ChainFormDialog } from './chains/chain-form-dialog'
import { NodeFormDialog } from './nodes/node-form-dialog'
import { PlanFormDialog } from './plans/plan-form-dialog'
import { RuleFormDialog } from './rules/rule-form-dialog'

/**
 * No control in this console may be named after a property of its form.
 *
 * A control's `name` becomes a property of the <form> element itself, and
 * `HTMLFormElement` is [LegacyOverrideBuiltIns]: the control wins over whatever
 * it collides with, so `form.nodeName` stops being the string "FORM" and starts
 * being an <input>. React reads `event.target.nodeName` on every event it
 * dispatches, so that read then throws — inside React's dispatch, before the
 * form's onSubmit runs. Nothing calls preventDefault, the browser submits the
 * form itself, and the page navigates away with the fields in the query string:
 * the dialog is gone, no request was sent, and the button looks dead. That is
 * what 新增节点 did until its 节点名称 control stopped carrying the attribute.
 *
 * `nodeName` is the collision that crashes React today. The others it can
 * produce — `name`, `id`, `action`, `method`, `target`, `elements` — only
 * shadow the property for whoever reads it next, which is the same trap
 * waiting on a different reader. So the rule is the whole set, not the one
 * name that bites.
 *
 * happy-dom does not implement that shadowing: `form.nodeName` is "FORM" there
 * whatever the controls are called, which is exactly why this bug shipped past
 * a green suite three times. So it cannot be asserted through behaviour here —
 * it is asserted against the prototype chain, which happy-dom and browsers
 * agree on.
 */

/** Enough of each entity to put its dialog into edit mode. */
const account = { id: 7, username: 'ops', enable: true } as AdminUser
const chain = { id: 3, chainName: 'hk-relay', port: 443, nodeId: 1 } as Chain
const node = { id: 5, nodeName: 'hk-01', nodeType: 'inbound', rate: 1 } as Node
const rule = { id: 9, ruleName: 'web-443', listenPort: 443 } as Rule

/** Every form in the console, in both the modes that render one. */
const forms = {
  '登录': <LoginPage />,
  '新增账号': <AccountFormDialog open onOpenChange={() => {}} />,
  '编辑账号': <AccountFormDialog open onOpenChange={() => {}} account={account} />,
  '新增链路': <ChainFormDialog open onOpenChange={() => {}} />,
  '重命名链路': <ChainFormDialog open onOpenChange={() => {}} chain={chain} />,
  '新增节点': <NodeFormDialog open onOpenChange={() => {}} />,
  '编辑节点': <NodeFormDialog open onOpenChange={() => {}} node={node} />,
  '新增套餐': <PlanFormDialog open onOpenChange={() => {}} />,
  '新增规则': <RuleFormDialog open onOpenChange={() => {}} />,
  '编辑规则': <RuleFormDialog open onOpenChange={() => {}} rule={rule} />,
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ code: 0, message: 'OK', data: { pageData: [], total: 0 } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    ),
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('form controls', () => {
  it.each(Object.keys(forms))('%s names no control after a property of the form', (label) => {
    const { unmount } = render(
      <MemoryRouter>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <AuthProvider>{forms[label as keyof typeof forms]}</AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    const shadowing = [...document.querySelectorAll('form')].flatMap((form) =>
      [...form.elements]
        .map((el) => (el as HTMLInputElement).name)
        .filter((name) => name && name in HTMLFormElement.prototype),
    )

    unmount()
    expect(shadowing).toEqual([])
  })
})
