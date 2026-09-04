import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'

import { deleteChain, listChains } from '@/api/chain'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTable } from '@/components/data-table/data-table'
import { Pagination } from '@/components/data-table/pagination'
import { Toolbar } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useActionMutation } from '@/hooks/use-action-mutation'
import { useTableParams } from '@/hooks/use-table-params'
import { formatTime, orEmpty } from '@/lib/format'
import type { Chain } from '@/types/api'

import { ChainFormDialog } from './chain-form-dialog'

export function ChainsPage() {
  const params = useTableParams()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Chain | undefined>()
  const [deleting, setDeleting] = useState<Chain | undefined>()

  const query = useQuery({
    queryKey: ['chains', params.pageNo, params.pageSize, params.keyword],
    queryFn: () =>
      listChains({
        PageNo: params.pageNo,
        PageSize: params.pageSize,
        ChainName: params.keyword || undefined,
      }),
    placeholderData: keepPreviousData,
  })

  const removeMutation = useActionMutation({
    // DeleteChain needs the port as well as the id: the backend tears down the
    // listener on the node before dropping the row.
    mutationFn: (chain: Chain) => deleteChain(chain.id, chain.port ?? 0),
    successMessage: '链路已删除',
    invalidate: [['chains']],
    onSuccess: () => setDeleting(undefined),
  })

  const columns: ColumnDef<Chain, unknown>[] = [
    {
      accessorKey: 'chainName',
      header: '名称',
      cell: ({ row }) => <div className="font-medium">{orEmpty(row.original.chainName)}</div>,
    },
    {
      id: 'node',
      header: '节点',
      cell: ({ row }) => orEmpty(row.original.node?.nodeName),
    },
    {
      id: 'listen',
      header: '监听',
      cell: ({ row }) => (
        <span className="tabular text-muted-foreground">
          {orEmpty(row.original.ip)}:{orEmpty(row.original.port)}
        </span>
      ),
    },
    {
      accessorKey: 'protocol',
      header: '协议',
      cell: ({ row }) => <Badge variant="outline">{orEmpty(row.original.protocol)}</Badge>,
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
              重命名
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
      <PageHeader title="链路" description="链路在节点上监听端口，是转发规则的中继跳板。">
        <Button
          onClick={() => {
            setEditing(undefined)
            setFormOpen(true)
          }}
        >
          <PlusIcon />
          新增链路
        </Button>
      </PageHeader>

      <Toolbar
        keyword={params.keyword}
        onKeywordChange={params.setKeyword}
        placeholder="按链路名称搜索"
      />

      <DataTable
        columns={columns}
        data={query.data?.pageData}
        loading={query.isPending}
        error={query.error}
        emptyMessage={params.keyword ? '没有匹配的链路' : '还没有链路'}
      />

      <Pagination
        pageNo={params.pageNo}
        pageSize={params.pageSize}
        total={query.data?.total ?? 0}
        onPageChange={params.setPage}
        onPageSizeChange={params.setPageSize}
      />

      <ChainFormDialog open={formOpen} onOpenChange={setFormOpen} chain={editing} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="删除链路？"
        description={`链路「${deleting?.chainName ?? ''}」会被移除，引用它的转发规则将失效。`}
        confirmLabel="删除"
        pending={removeMutation.isPending}
        onConfirm={() => deleting && removeMutation.mutate(deleting)}
      />
    </>
  )
}
