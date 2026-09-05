import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { KeyRoundIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'

import { deleteUser, listUsers, updateUser } from '@/api/user'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTable } from '@/components/data-table/data-table'
import { Pagination } from '@/components/data-table/pagination'
import { Toolbar } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/page-header'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { useActionMutation } from '@/hooks/use-action-mutation'
import { ADMIN_ROLE, useAuth } from '@/hooks/use-auth'
import { useTableParams } from '@/hooks/use-table-params'
import { formatTime, orEmpty } from '@/lib/format'
import type { AdminUser } from '@/types/api'

import { AccountFormDialog } from './account-form-dialog'
import { ResetPasswordDialog } from './reset-password-dialog'

/**
 * Account management.
 *
 * The 角色 column reads as "which side of the console this account gets",
 * because that is now the only thing a role decides. It used to be a set of
 * badges whose real meaning was a set of permission rows, and those rows also
 * decided which menu entries the account would see.
 */
export function AccountsPage() {
  const { user } = useAuth()
  const params = useTableParams()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AdminUser | undefined>()
  const [deleting, setDeleting] = useState<AdminUser | undefined>()
  const [resetting, setResetting] = useState<AdminUser | undefined>()

  const query = useQuery({
    queryKey: ['admin-users', params.pageNo, params.pageSize, params.keyword],
    queryFn: () =>
      listUsers({
        pageNo: params.pageNo,
        pageSize: params.pageSize,
        username: params.keyword || undefined,
      }),
    placeholderData: keepPreviousData,
  })

  const removeMutation = useActionMutation({
    mutationFn: (user: AdminUser) => deleteUser(user.id),
    successMessage: '账号已删除',
    invalidate: [['admin-users']],
    onSuccess: () => setDeleting(undefined),
  })

  const toggleMutation = useActionMutation({
    mutationFn: ({ id, enable }: { id: number; enable: boolean }) => updateUser({ id, enable }),
    successMessage: '状态已更新',
    invalidate: [['admin-users']],
  })

  const columns: ColumnDef<AdminUser, unknown>[] = [
    {
      id: 'user',
      header: '用户',
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="size-7">
            <AvatarImage src={row.original.avatar || undefined} alt="" />
            <AvatarFallback className="text-xs">
              {row.original.username?.slice(0, 1).toUpperCase() ?? '?'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{orEmpty(row.original.username)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.email || '—'}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'side',
      header: '所属端',
      cell: ({ row }) => {
        const admin = (row.original.roles ?? []).some((role) => role.code === ADMIN_ROLE)
        return (
          <Badge variant={admin ? 'default' : 'secondary'} className="font-normal">
            {admin ? '管理端' : '用户端'}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'enable',
      header: '启用',
      cell: ({ row }) => {
        // Disabling your own account signs you out with no way back in.
        const self = row.original.id === user?.id
        return (
          <Switch
            checked={row.original.enable}
            disabled={toggleMutation.isPending || self}
            onCheckedChange={(enable) => toggleMutation.mutate({ id: row.original.id, enable })}
            aria-label={self ? '不能停用自己的账号' : '启用状态'}
          />
        )
      },
    },
    {
      accessorKey: 'createTime',
      header: '创建时间',
      cell: ({ row }) => (
        <span className="tabular text-muted-foreground">{formatTime(row.original.createTime)}</span>
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
            <DropdownMenuItem onSelect={() => setResetting(row.original)}>
              <KeyRoundIcon className="size-4" />
              重置密码
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              // Deleting yourself would end the session and, if you are the
              // only administrator, leave the deployment with no way into the
              // admin side short of editing the database.
              disabled={row.original.id === user?.id}
              onSelect={() => setDeleting(row.original)}
            >
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
      <PageHeader title="账号管理" description="所有账号，以及每个账号登录后进入哪个端。">
        <Button
          onClick={() => {
            setEditing(undefined)
            setFormOpen(true)
          }}
        >
          <PlusIcon />
          新增账号
        </Button>
      </PageHeader>

      <Toolbar
        keyword={params.keyword}
        onKeywordChange={params.setKeyword}
        placeholder="按昵称搜索"
      />

      <DataTable
        columns={columns}
        data={query.data?.pageData}
        loading={query.isPending}
        error={query.error}
        emptyMessage={params.keyword ? '没有匹配的账号' : '还没有账号'}
      />

      <Pagination
        pageNo={params.pageNo}
        pageSize={params.pageSize}
        total={query.data?.total ?? 0}
        onPageChange={params.setPage}
        onPageSizeChange={params.setPageSize}
      />

      <AccountFormDialog open={formOpen} onOpenChange={setFormOpen} account={editing} />

      <ResetPasswordDialog user={resetting} onClose={() => setResetting(undefined)} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="删除账号？"
        description={`账号「${deleting?.username ?? ''}」及其角色关联会被移除。`}
        confirmLabel="删除"
        pending={removeMutation.isPending}
        onConfirm={() => deleting && removeMutation.mutate(deleting)}
      />
    </>
  )
}
