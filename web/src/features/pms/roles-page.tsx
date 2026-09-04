import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon, UsersIcon } from 'lucide-react'

import { deleteRole, listRolesPage, updateRole } from '@/api/role'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTable } from '@/components/data-table/data-table'
import { Pagination } from '@/components/data-table/pagination'
import { Toolbar } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { useActionMutation } from '@/hooks/use-action-mutation'
import { useTableParams } from '@/hooks/use-table-params'
import type { RoleWithPermissions } from '@/types/api'

import { RoleFormDialog } from './role-form-dialog'
import { RoleUsersDialog } from './role-users-dialog'

export function RolesPage() {
  const params = useTableParams()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<RoleWithPermissions | undefined>()
  const [deleting, setDeleting] = useState<RoleWithPermissions | undefined>()
  const [assigning, setAssigning] = useState<RoleWithPermissions | undefined>()

  const query = useQuery({
    queryKey: ['roles-page', params.pageNo, params.pageSize, params.keyword],
    queryFn: () =>
      listRolesPage({
        pageNo: params.pageNo,
        pageSize: params.pageSize,
        name: params.keyword || undefined,
      }),
    placeholderData: keepPreviousData,
  })

  const removeMutation = useActionMutation({
    mutationFn: (role: RoleWithPermissions) => deleteRole(role.id),
    successMessage: '角色已删除',
    invalidate: [['roles-page'], ['roles']],
    onSuccess: () => setDeleting(undefined),
  })

  const toggleMutation = useActionMutation({
    mutationFn: ({ id, enable }: { id: number; enable: boolean }) => updateRole({ id, enable }),
    successMessage: '状态已更新',
    invalidate: [['roles-page'], ['roles']],
  })

  const columns: ColumnDef<RoleWithPermissions, unknown>[] = [
    {
      accessorKey: 'name',
      header: '角色名称',
      cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
    },
    {
      accessorKey: 'code',
      header: '角色标识',
      cell: ({ row }) => (
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.original.code}</code>
      ),
    },
    {
      id: 'permissions',
      header: '权限数',
      cell: ({ row }) => (
        <span className="tabular text-muted-foreground">
          {row.original.permissionIds?.length ?? 0}
        </span>
      ),
    },
    {
      accessorKey: 'enable',
      header: '启用',
      cell: ({ row }) => (
        <Switch
          checked={row.original.enable}
          disabled={toggleMutation.isPending}
          onCheckedChange={(enable) => toggleMutation.mutate({ id: row.original.id, enable })}
          aria-label="启用状态"
        />
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
              编辑与授权
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setAssigning(row.original)}>
              <UsersIcon className="size-4" />
              分配用户
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
      <PageHeader title="角色管理" description="角色决定用户能看到哪些菜单与操作。">
        <Button
          onClick={() => {
            setEditing(undefined)
            setFormOpen(true)
          }}
        >
          <PlusIcon />
          新增角色
        </Button>
      </PageHeader>

      <Toolbar
        keyword={params.keyword}
        onKeywordChange={params.setKeyword}
        placeholder="按角色名称搜索"
      />

      <DataTable
        columns={columns}
        data={query.data?.pageData}
        loading={query.isPending}
        error={query.error}
        emptyMessage={params.keyword ? '没有匹配的角色' : '还没有角色'}
      />

      <Pagination
        pageNo={params.pageNo}
        pageSize={params.pageSize}
        total={query.data?.total ?? 0}
        onPageChange={params.setPage}
        onPageSizeChange={params.setPageSize}
      />

      <RoleFormDialog open={formOpen} onOpenChange={setFormOpen} role={editing} />
      <RoleUsersDialog role={assigning} onClose={() => setAssigning(undefined)} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="删除角色？"
        description={`角色「${deleting?.name ?? ''}」会被移除，持有它的用户将失去对应权限。`}
        confirmLabel="删除"
        pending={removeMutation.isPending}
        onConfirm={() => deleting && removeMutation.mutate(deleting)}
      />
    </>
  )
}
