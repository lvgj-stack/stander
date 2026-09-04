import type { Permission } from '@/types/api'

/**
 * Permission handling.
 *
 * The backend returns a tree of permission rows whose `component` column
 * points at Vue files from the previous frontend. This app routes statically,
 * so only `code` matters: a menu item or button declares the code it needs,
 * and it is rendered when that code is in the signed-in user's set.
 *
 * `/role/permissions/tree` already filters by role — SUPER_ADMIN gets
 * everything, everyone else gets their roles' rows — so no special case for
 * the admin is needed here.
 */

/** Collects every `code` in a permission tree, at any depth. */
export function collectCodes(tree: Permission[] | null | undefined): Set<string> {
  const codes = new Set<string>()
  const walk = (nodes: Permission[] | null | undefined) => {
    if (!nodes) return
    for (const node of nodes) {
      if (node.code) codes.add(node.code)
      walk(node.children)
    }
  }
  walk(tree)
  return codes
}

/** Flattens a permission tree into a list, parents before their children. */
export function flattenTree(tree: Permission[] | null | undefined): Permission[] {
  const flat: Permission[] = []
  const walk = (nodes: Permission[] | null | undefined) => {
    if (!nodes) return
    for (const node of nodes) {
      flat.push(node)
      walk(node.children)
    }
  }
  walk(tree)
  return flat
}

/** Rebuilds a `parentId`-linked flat list into a tree, ordered by `order`. */
export function buildTree(rows: Permission[]): Permission[] {
  const byId = new Map<number, Permission & { children: Permission[] }>()
  for (const row of rows) byId.set(row.id, { ...row, children: [] })

  const roots: Permission[] = []
  for (const node of byId.values()) {
    const parent = node.parentId === null ? undefined : byId.get(node.parentId)
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sortDeep = (nodes: Permission[]) => {
    nodes.sort((a, b) => a.order - b.order || a.id - b.id)
    for (const node of nodes) if (node.children) sortDeep(node.children)
  }
  sortDeep(roots)
  return roots
}

/** A navigation entry, gated on a permission code. */
export interface NavItem {
  title: string
  to: string
  /** Required permission code; an item without one is always visible. */
  code?: string
}

export interface NavSection {
  title: string
  items: NavItem[]
}

/**
 * Drops the entries whose code the user does not hold, then drops any section
 * left empty.
 *
 * `codes` being empty means the permission tree has not loaded yet or the user
 * genuinely holds nothing; both should render an empty menu rather than the
 * whole one, so there is no "empty means allow everything" shortcut here.
 */
export function filterNav(sections: NavSection[], codes: Set<string>): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.code || codes.has(item.code)),
    }))
    .filter((section) => section.items.length > 0)
}
