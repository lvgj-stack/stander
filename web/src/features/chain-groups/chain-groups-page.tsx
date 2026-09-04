import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { InfoIcon, PlusIcon, Trash2Icon } from 'lucide-react'

import { deleteChainGroup, listChainGroups } from '@/api/chain-group'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTable } from '@/components/data-table/data-table'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { useActionMutation } from '@/hooks/use-action-mutation'
import type { ChainGroup } from '@/types/api'

import { ChainGroupFormDialog } from './chain-group-form-dialog'

export function ChainGroupsPage() {
  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<ChainGroup | undefined>()

  const query = useQuery({
    queryKey: ['chain-groups'],
    queryFn: listChainGroups,
  })

  const removeMutation = useActionMutation({
    mutationFn: (group: ChainGroup) => deleteChainGroup(group.ChainGroupID),
    successMessage: '链路组已删除',
    invalidate: [['chain-groups']],
    onSuccess: () => setDeleting(undefined),
  })

  const columns: ColumnDef<ChainGroup, unknown>[] = [
    {
      accessorKey: 'ChainGroupName',
      header: '组名',
      cell: ({ row }) => <div className="font-medium">{row.original.ChainGroupName}</div>,
    },
    {
      accessorKey: 'ChainGroupID',
      header: '组 ID',
      cell: ({ row }) => (
        <code className="tabular text-xs text-muted-foreground">{row.original.ChainGroupID}</code>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-destructive"
          aria-label="删除"
          onClick={() => setDeleting(row.original)}
        >
          <Trash2Icon />
        </Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="链路组"
        description="把多条链路编成一组，按权重与备份关系分流。"
      >
        <Button onClick={() => setFormOpen(true)}>
          <PlusIcon />
          新增链路组
        </Button>
      </PageHeader>

      {/*
        ListChainGroup selects only the id and name columns, so membership is
        not readable over the API. Saying so is better than showing an empty
        "成员" column that looks like the groups are empty.
      */}
      <div className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <p>
          后端的 <code className="text-xs">ListChainGroups</code> 只返回组 ID 与组名，
          不返回组内链路，因此这里看不到成员明细。修改成员目前只能删除后重建
          （<code className="text-xs">EditChainGroup</code> 在后端是空实现）。
        </p>
      </div>

      <DataTable
        columns={columns}
        data={query.data?.ChainGroups ?? []}
        loading={query.isPending}
        error={query.error}
        emptyMessage="还没有链路组。注意：非超级管理员在此始终看到空列表。"
      />

      <ChainGroupFormDialog open={formOpen} onOpenChange={setFormOpen} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="删除链路组？"
        description={`链路组「${deleting?.ChainGroupName ?? ''}」会被移除，组内链路本身不受影响。`}
        confirmLabel="删除"
        pending={removeMutation.isPending}
        onConfirm={() => deleting && removeMutation.mutate(deleting)}
      />
    </>
  )
}
