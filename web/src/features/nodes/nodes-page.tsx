import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import {
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  TerminalIcon,
  Trash2Icon,
} from 'lucide-react'

import { ErrorState } from '@/components/error-state'
import { deleteNode, listNodeChains, listNodes } from '@/api/node'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTable } from '@/components/data-table/data-table'
import { Pagination } from '@/components/data-table/pagination'
import { Toolbar } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useActionMutation } from '@/hooks/use-action-mutation'
import { useTableParams } from '@/hooks/use-table-params'
import { formatTime, orEmpty } from '@/lib/format'
import type { Node } from '@/types/api'

import { NodeFormDialog } from './node-form-dialog'
import { NodeInstallDialog, type NodeInstallTarget } from './node-install-dialog'

/** Renders the node's transport, which the entity stores as 0 = TLS, 1 = TCP. */
function protocolLabel(protocol: number): string {
  return protocol === 1 ? 'TCP' : 'TLS'
}

export function NodesPage() {
  const params = useTableParams()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Node | undefined>()
  const [deleting, setDeleting] = useState<Node | undefined>()
  const [installing, setInstalling] = useState<NodeInstallTarget | null>(null)
  const [chainsOf, setChainsOf] = useState<Node | undefined>()

  const query = useQuery({
    queryKey: ['nodes', params.pageNo, params.pageSize, params.keyword],
    queryFn: () =>
      listNodes({
        PageNo: params.pageNo,
        PageSize: params.pageSize,
        NodeName: params.keyword || undefined,
      }),
    placeholderData: keepPreviousData,
  })

  const removeMutation = useActionMutation({
    mutationFn: (node: Node) => deleteNode(node.id),
    successMessage: '节点已删除',
    invalidate: [['nodes']],
    onSuccess: () => setDeleting(undefined),
  })

  const columns: ColumnDef<Node, unknown>[] = [
    {
      accessorKey: 'nodeName',
      header: '名称',
      cell: ({ row }) => (
        <div className="font-medium">{orEmpty(row.original.nodeName)}</div>
      ),
    },
    {
      accessorKey: 'nodeType',
      header: '类型',
      cell: ({ row }) => (
        <Badge variant={row.original.nodeType === 'inbound' ? 'default' : 'secondary'}>
          {row.original.nodeType === 'inbound' ? '入口' : '出口'}
        </Badge>
      ),
    },
    {
      id: 'address',
      header: '地址',
      cell: ({ row }) => (
        <span className="tabular text-muted-foreground">
          {orEmpty(row.original.ipv4 ?? row.original.ip)}
          {row.original.port ? `:${row.original.port}` : ''}
        </span>
      ),
    },
    {
      id: 'ipv6',
      header: 'IPv6',
      cell: ({ row }) => (
        <span className="tabular text-muted-foreground">{orEmpty(row.original.ipv6)}</span>
      ),
    },
    {
      accessorKey: 'protocol',
      header: '协议',
      cell: ({ row }) => <span className="tabular">{protocolLabel(row.original.protocol)}</span>,
    },
    {
      accessorKey: 'rate',
      header: '倍率',
      cell: ({ row }) => <span className="tabular">×{row.original.rate}</span>,
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => {
        const status = row.original.status
        // The column has no enum; anything the agent last wrote shows as-is,
        // and "online" is the only value treated as healthy.
        const online = status === 'online'
        return (
          <Badge variant={online ? 'default' : 'outline'} className={online ? '' : 'text-muted-foreground'}>
            {orEmpty(status)}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'createdAt',
      header: '创建时间',
      cell: ({ row }) => (
        <span className="tabular text-muted-foreground">{formatTime(row.original.createdAt)}</span>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label="操作">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                setEditing(row.original)
                setFormOpen(true)
              }}
            >
              <PencilIcon className="size-4" />
              编辑
            </DropdownMenuItem>
            {row.original.key ? (
              <DropdownMenuItem
                onSelect={() =>
                  setInstalling({
                    nodeName: row.original.nodeName,
                    nodeKey: row.original.key!,
                  })
                }
              >
                <TerminalIcon className="size-4" />
                安装命令
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => setChainsOf(row.original)}>
              <LinkIcon className="size-4" />
              查看链路
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row.original)}>
              <Trash2Icon className="size-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="节点" description="转发节点。入口节点接收流量，出口节点把流量送出去。">
        <Button
          onClick={() => {
            setEditing(undefined)
            setFormOpen(true)
          }}
        >
          <PlusIcon />
          新增节点
        </Button>
      </PageHeader>

      <Toolbar
        keyword={params.keyword}
        onKeywordChange={params.setKeyword}
        placeholder="按节点名称搜索"
      />

      <DataTable
        columns={columns}
        data={query.data?.pageData}
        loading={query.isPending}
        error={query.error}
        emptyMessage={params.keyword ? '没有匹配的节点' : '还没有节点，先创建一个'}
      />

      <Pagination
        pageNo={params.pageNo}
        pageSize={params.pageSize}
        total={query.data?.total ?? 0}
        onPageChange={params.setPage}
        onPageSizeChange={params.setPageSize}
      />

      <NodeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        node={editing}
        onCreated={({ key, preferIPv6 }) => setInstalling({ nodeKey: key, issued: true, preferIPv6 })}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="删除节点？"
        description={`节点「${deleting?.nodeName ?? ''}」及其上的链路和规则都会受影响，此操作不可撤销。`}
        confirmLabel="删除"
        pending={removeMutation.isPending}
        onConfirm={() => deleting && removeMutation.mutate(deleting)}
      />

      <NodeInstallDialog target={installing} onClose={() => setInstalling(null)} />
      <NodeChainsDialog node={chainsOf} onClose={() => setChainsOf(undefined)} />
    </>
  )
}

/** Lists the chains attached to one node. */
function NodeChainsDialog({ node, onClose }: { node: Node | undefined; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['nodes', node?.id, 'chains'],
    queryFn: () => listNodeChains(node!.id),
    enabled: Boolean(node),
  })

  return (
    <Dialog open={Boolean(node)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>「{node?.nodeName}」上的链路</DialogTitle>
          <DialogDescription>该节点参与的转发链路。</DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <p className="py-6 text-center text-sm text-muted-foreground">加载中…</p>
        ) : query.error ? (
          <ErrorState error={query.error} />
        ) : !query.data?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">该节点上还没有链路</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {query.data.map((chain) => (
              <li key={chain.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-medium">{orEmpty(chain.chainName)}</span>
                <span className="tabular text-muted-foreground">
                  {orEmpty(chain.ip)}:{orEmpty(chain.port)} · {orEmpty(chain.protocol)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
