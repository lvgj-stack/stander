import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2Icon, ServerIcon, WaypointsIcon } from 'lucide-react'

import { listChains } from '@/api/chain'
import { getUserResources, setUserResources } from '@/api/forward-user'
import { listNodes } from '@/api/node'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useActionMutation } from '@/hooks/use-action-mutation'
import { orEmpty } from '@/lib/format'
import type { ForwardUser } from '@/types/api'

/**
 * Grants a forwarding user the nodes and chains they may build rules on.
 *
 * Without this screen the user portal is empty for everyone: `ListNodes` and
 * `ListChains` filter on these rows, and `AddRule` refuses a node or chain the
 * caller does not hold. The only other thing that ever wrote one was `AddNode`
 * run by the user themselves, which is an administrator's screen now.
 *
 * The whole selection is submitted at once and replaces what was there, so
 * unticking is how you revoke.
 */
export function UserResourcesDialog({
  user,
  onClose,
}: {
  user: ForwardUser | undefined
  onClose: () => void
}) {
  const open = Boolean(user?.id)

  const granted = useQuery({
    queryKey: ['forward-users', user?.id, 'resources'],
    queryFn: () => getUserResources(user!.id!),
    enabled: open,
  })

  // PageNo -1 is this API's "everything" — a grant screen that paginated would
  // silently drop the boxes the administrator could not see.
  const nodes = useQuery({
    queryKey: ['nodes', 'all'],
    queryFn: () => listNodes({ PageNo: -1 }),
    enabled: open,
  })
  const chains = useQuery({
    queryKey: ['chains', 'all'],
    queryFn: () => listChains({ PageNo: -1 }),
    enabled: open,
  })

  const loading = granted.isPending || nodes.isPending || chains.isPending
  const error = granted.error ?? nodes.error ?? chains.error
  const ready = !loading && !error && granted.data

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>「{user?.username}」的资源授权</DialogTitle>
          <DialogDescription>
            勾选这个用户可以使用的节点与链路。用户端只看得到这里勾中的资源，也只能用它们建转发规则。
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">加载中…</p>
        ) : error ? (
          <p className="py-10 text-center text-sm text-destructive">{error.message}</p>
        ) : ready ? (
          // Mounted with the loaded grants and keyed on the user, so the boxes
          // start ticked rather than rendering empty and being corrected — an
          // administrator who saves quickly would otherwise wipe the grants
          // they came to extend.
          <GrantForm
            key={user!.id!}
            userId={user!.id!}
            initialNodeIds={granted.data.NodeIds ?? []}
            initialChainIds={granted.data.ChainIds ?? []}
            nodes={(nodes.data?.pageData ?? []).map((node) => ({
              id: node.id,
              label: orEmpty(node.nodeName),
              hint: node.nodeType === 'inbound' ? '入口' : '出口',
            }))}
            chains={(chains.data?.pageData ?? []).map((chain) => ({
              id: chain.id,
              label: orEmpty(chain.chainName),
              hint: orEmpty(chain.protocol),
            }))}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

interface GrantItem {
  id: number
  label: string
  hint: string
}

function GrantForm({
  userId,
  initialNodeIds,
  initialChainIds,
  nodes,
  chains,
  onClose,
}: {
  userId: number
  initialNodeIds: number[]
  initialChainIds: number[]
  nodes: GrantItem[]
  chains: GrantItem[]
  onClose: () => void
}) {
  const [nodeIds, setNodeIds] = useState(initialNodeIds)
  const [chainIds, setChainIds] = useState(initialChainIds)

  const mutation = useActionMutation({
    mutationFn: () => setUserResources(userId, nodeIds, chainIds),
    successMessage: '授权已保存',
    invalidate: [['forward-users']],
    onSuccess: onClose,
  })

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <GrantList
          title="节点"
          icon={<ServerIcon className="size-4" />}
          empty="还没有节点"
          items={nodes}
          selected={nodeIds}
          onToggle={setNodeIds}
        />
        <GrantList
          title="链路"
          icon={<WaypointsIcon className="size-4" />}
          empty="还没有链路"
          items={chains}
          selected={chainIds}
          onToggle={setChainIds}
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button disabled={mutation.isPending} onClick={() => mutation.mutate(undefined)}>
          {mutation.isPending && <Loader2Icon className="animate-spin" />}
          保存
        </Button>
      </DialogFooter>
    </>
  )
}

function GrantList({
  title,
  icon,
  empty,
  items,
  selected,
  onToggle,
}: {
  title: string
  icon: React.ReactNode
  empty: string
  items: GrantItem[]
  selected: number[]
  onToggle: (next: number[]) => void
}) {
  const allSelected = items.length > 0 && items.every((item) => selected.includes(item.id))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          {icon}
          {title}
          <Badge variant="secondary" className="font-normal">
            {selected.length}/{items.length}
          </Badge>
        </p>
        {items.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onToggle(allSelected ? [] : items.map((item) => item.id))}
          >
            {allSelected ? '全不选' : '全选'}
          </Button>
        )}
      </div>

      <ScrollArea className="h-64 rounded-md border">
        {items.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="space-y-0.5 p-2">
            {items.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <Checkbox
                  checked={selected.includes(item.id)}
                  onCheckedChange={(checked) =>
                    onToggle(
                      checked === true
                        ? [...selected, item.id]
                        : selected.filter((id) => id !== item.id),
                    )
                  }
                />
                <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{item.hint}</span>
              </label>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
