import { describe, expect, it } from 'vitest'

import type { CurrentUser, Page } from '@/types/api'

/**
 * Guards two response-shape contracts that were verified against the live Go
 * backend and had drifted from what the frontend assumed:
 *
 *  1. The profile object is serialised camelCase (userId/nickName), matching
 *     internal/admin/model/profile.go — not the PascalCase the old external
 *     API demo showed.
 *  2. ListChainGroups is wrapped as {pageData,total} by the admin handler,
 *     like every other list action — not {ChainGroups}.
 *
 * These are pure type-level assertions: if someone re-introduces the old field
 * names, the file stops compiling and `pnpm typecheck` fails.
 */
describe('response-shape contracts', () => {
  it('profile uses the camelCase field names the backend sends', () => {
    const profile: NonNullable<CurrentUser['profile']> = {
      id: 1,
      gender: 0,
      avatar: '',
      address: '',
      email: '',
      userId: 1,
      nickName: 'admin',
    }
    expect(profile.nickName).toBe('admin')
    expect(profile.userId).toBe(1)
  })

  it('a chain-group listing is a Page, keyed on pageData', () => {
    const page: Page<{ ChainGroupID: string }> = {
      pageData: [{ ChainGroupID: 'g1' }],
      total: 1,
    }
    expect(page.pageData).toHaveLength(1)
  })
})
