import { describe, expect, it } from 'vitest'

import { buildTree, collectCodes, filterNav, flattenTree, type NavSection } from './permissions'
import type { Permission } from '@/types/api'

function permission(partial: Partial<Permission> & { id: number; code: string }): Permission {
  return {
    name: partial.code,
    type: 'MENU',
    parentId: null,
    path: null,
    redirect: null,
    icon: null,
    component: null,
    layout: null,
    keepAlive: null,
    method: null,
    description: null,
    show: 1,
    enable: 1,
    order: 0,
    ...partial,
  }
}

const TREE: Permission[] = [
  permission({
    id: 1,
    code: 'SysMgt',
    children: [
      permission({
        id: 2,
        code: 'UserMgt',
        parentId: 1,
        children: [permission({ id: 3, code: 'AddUser', parentId: 2, type: 'BUTTON' })],
      }),
      permission({ id: 4, code: 'RoleMgt', parentId: 1, children: [] }),
    ],
  }),
  permission({ id: 5, code: 'Server', children: null }),
]

describe('collectCodes', () => {
  it('collects codes at every depth', () => {
    expect(collectCodes(TREE)).toEqual(
      new Set(['SysMgt', 'UserMgt', 'AddUser', 'RoleMgt', 'Server']),
    )
  })

  it('tolerates the null children the backend sends for leaves', () => {
    expect(collectCodes(null)).toEqual(new Set())
    expect(collectCodes(undefined)).toEqual(new Set())
    expect(collectCodes([])).toEqual(new Set())
  })
})

describe('flattenTree', () => {
  it('lists parents before their children', () => {
    expect(flattenTree(TREE).map((node) => node.id)).toEqual([1, 2, 3, 4, 5])
  })
})

describe('buildTree', () => {
  it('relinks a flat list through parentId', () => {
    const rows = [
      permission({ id: 3, code: 'C', parentId: 1, order: 1 }),
      permission({ id: 1, code: 'A', parentId: null, order: 0 }),
      permission({ id: 2, code: 'B', parentId: 1, order: 0 }),
    ]
    const tree = buildTree(rows)
    expect(tree).toHaveLength(1)
    expect(tree[0].code).toBe('A')
    expect(tree[0].children?.map((child) => child.code)).toEqual(['B', 'C'])
  })

  it('keeps a row whose parent is missing as a root rather than dropping it', () => {
    // A child can outlive its parent: deleting a permission does not cascade.
    const tree = buildTree([permission({ id: 9, code: 'Orphan', parentId: 404 })])
    expect(tree.map((node) => node.code)).toEqual(['Orphan'])
  })

  it('orders siblings by order, then by id', () => {
    const rows = [
      permission({ id: 2, code: 'B', order: 0 }),
      permission({ id: 1, code: 'A', order: 0 }),
      permission({ id: 3, code: 'C', order: -1 }),
    ]
    expect(buildTree(rows).map((node) => node.code)).toEqual(['C', 'A', 'B'])
  })
})

describe('filterNav', () => {
  const sections: NavSection[] = [
    {
      title: '转发',
      items: [
        { title: '节点', to: '/nodes', code: 'Server' },
        { title: '链路', to: '/chains', code: 'Chain' },
      ],
    },
    {
      title: '系统',
      items: [
        { title: '用户', to: '/pms/user', code: 'UserMgt' },
        { title: '个人资料', to: '/profile' },
      ],
    },
  ]

  it('keeps only the entries whose code the user holds', () => {
    const result = filterNav(sections, new Set(['Server']))
    expect(result).toEqual([
      { title: '转发', items: [{ title: '节点', to: '/nodes', code: 'Server' }] },
      { title: '系统', items: [{ title: '个人资料', to: '/profile' }] },
    ])
  })

  it('drops a section left with no entries', () => {
    const result = filterNav(sections, new Set())
    expect(result.map((section) => section.title)).toEqual(['系统'])
  })

  it('does not treat an empty code set as permission to see everything', () => {
    const gated: NavSection[] = [
      { title: '转发', items: [{ title: '节点', to: '/nodes', code: 'Server' }] },
    ]
    expect(filterNav(gated, new Set())).toEqual([])
  })
})
