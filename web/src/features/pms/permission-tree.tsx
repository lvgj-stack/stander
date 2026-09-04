import { ChevronRightIcon } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import type { Permission } from '@/types/api'

interface PermissionTreeProps {
  nodes: Permission[]
  /** When set, each row gets a checkbox bound to this selection. */
  selected?: Set<number>
  onToggle?: (permission: Permission, checked: boolean) => void
  /** Rendered at the right end of a row; used for per-row actions. */
  renderActions?: (permission: Permission) => React.ReactNode
  depth?: number
}

/**
 * Renders a permission tree, optionally with checkboxes.
 *
 * Ticking a parent ticks its whole subtree and unticking it clears the
 * subtree: the backend stores a flat list of permission ids, so a role holding
 * a child but not its parent would produce a menu item with no section to sit
 * under.
 */
export function PermissionTree({
  nodes,
  selected,
  onToggle,
  renderActions,
  depth = 0,
}: PermissionTreeProps) {
  return (
    <ul className={cn(depth === 0 && 'space-y-0.5')}>
      {nodes.map((node) => (
        <PermissionRow
          key={node.id}
          node={node}
          selected={selected}
          onToggle={onToggle}
          renderActions={renderActions}
          depth={depth}
        />
      ))}
    </ul>
  )
}

function PermissionRow({
  node,
  selected,
  onToggle,
  renderActions,
  depth,
}: {
  node: Permission
  selected?: Set<number>
  onToggle?: (permission: Permission, checked: boolean) => void
  renderActions?: (permission: Permission) => React.ReactNode
  depth: number
}) {
  const [expanded, setExpanded] = useState(depth < 1)
  const children = node.children ?? []

  return (
    <li>
      <div
        className="group flex items-center gap-2 rounded-md py-1.5 pr-2 hover:bg-muted/60"
        style={{ paddingLeft: `${depth * 1.25 + 0.25}rem` }}
      >
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground',
            children.length === 0 && 'invisible',
          )}
          aria-label={expanded ? '收起' : '展开'}
        >
          <ChevronRightIcon className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} />
        </button>

        {selected && onToggle && (
          <Checkbox
            checked={selected.has(node.id)}
            onCheckedChange={(checked) => onToggle(node, checked === true)}
          />
        )}

        <span className="text-sm">{node.name}</span>
        <code className="text-xs text-muted-foreground">{node.code}</code>
        {node.type === 'BUTTON' && (
          <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
            按钮
          </Badge>
        )}
        {node.enable === 0 && (
          <Badge variant="secondary" className="h-4 px-1 text-[10px] font-normal">
            停用
          </Badge>
        )}

        {renderActions && (
          <div className="ml-auto opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {renderActions(node)}
          </div>
        )}
      </div>

      {expanded && children.length > 0 && (
        <PermissionTree
          nodes={children}
          selected={selected}
          onToggle={onToggle}
          renderActions={renderActions}
          depth={depth + 1}
        />
      )}
    </li>
  )
}

/** Every id in a subtree, including the root's. */
export function subtreeIds(node: Permission): number[] {
  const ids = [node.id]
  for (const child of node.children ?? []) ids.push(...subtreeIds(child))
  return ids
}
