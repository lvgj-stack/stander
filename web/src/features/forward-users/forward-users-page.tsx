import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { CalendarIcon, ChartColumnIcon, MoreHorizontalIcon, TicketIcon } from 'lucide-react'

import { listForwardUsers } from '@/api/forward-user'
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
import { useTableParams } from '@/hooks/use-table-params'
import { formatBytes, formatTime, orEmpty, usagePercent } from '@/lib/format'
import type { ForwardUser } from '@/types/api'

import { AssociatePlanDialog } from './associate-plan-dialog'
import { EditExpirationDialog } from './edit-expiration-dialog'
import { UserPlanDialog } from './user-plan-dialog'

export function ForwardUsersPage() {
  const params = useTableParams()
  const [planFor, setPlanFor] = useState<ForwardUser | undefined>()
  const [associateFor, setAssociateFor] = useState<ForwardUser | undefined>()
  const [expirationFor, setExpirationFor] = useState<ForwardUser | undefined>()

  const query = useQuery({
    queryKey: ['forward-users', params.pageNo, params.pageSize, params.keyword],
    queryFn: () =>
      listForwardUsers({
        PageNo: params.pageNo,
        PageSize: params.pageSize,
        Username: params.keyword || undefined,
      }),
    placeholderData: keepPreviousData,
  })

  const columns: ColumnDef<ForwardUser, unknown>[] = [
    {
      accessorKey: 'username',
      header: '用户名',
      cell: ({ row }) => <div className="font-medium">{orEmpty(row.original.username)}</div>,
    },
    {
      id: 'plan',
      header: '套餐',
      cell: ({ row }) =>
        row.original.traffic_plan?.planName ? (
          <Badge variant="secondary">{row.original.traffic_plan.planName}</Badge>
        ) : (
          <span className="text-muted-foreground">未关联</span>
        ),
    },
    {
      id: 'usage',
      header: '流量使用',
      cell: ({ row }) => {
        const used = row.original.UsedTraffic ?? 0
        const total = row.original.traffic_plan?.totalTraffic ?? 0
        const percent = usagePercent(used, total)
        return (
          <div className="min-w-40 space-y-1">
            <div className="flex justify-between text-xs tabular">
              <span>{formatBytes(used)}</span>
              <span className="text-muted-foreground">
                {total > 0 ? formatBytes(total) : '无额度'}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={
                  percent >= 90 ? 'h-full bg-destructive' : 'h-full bg-primary transition-all'
                }
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'expirationTime',
      header: '到期时间',
      cell: ({ row }) => {
        const value = row.original.expirationTime
        const expired = value ? new Date(value).getTime() < Date.now() : false
        return (
          <span className={expired ? 'tabular text-destructive' : 'tabular text-muted-foreground'}>
            {formatTime(value, false)}
            {expired && ' · 已过期'}
          </span>
        )
      },
    },
    {
      accessorKey: 'resetTrafficTime',
      header: '下次重置',
      cell: ({ row }) => (
        <span className="tabular text-muted-foreground">
          {formatTime(row.original.resetTrafficTime, false)}
        </span>
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
            <DropdownMenuItem onSelect={() => setPlanFor(row.original)}>
              <ChartColumnIcon className="size-4" />
              流量明细
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setAssociateFor(row.original)}>
              <TicketIcon className="size-4" />
              关联套餐
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setExpirationFor(row.original)}>
              <CalendarIcon className="size-4" />
              修改到期时间
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="转发用户" description="使用转发服务的用户，及其套餐与流量消耗。" />

      <Toolbar
        keyword={params.keyword}
        onKeywordChange={params.setKeyword}
        placeholder="按用户名搜索"
      />

      <DataTable
        columns={columns}
        data={query.data?.pageData}
        loading={query.isPending}
        error={query.error}
        emptyMessage={params.keyword ? '没有匹配的用户' : '还没有转发用户'}
      />

      <Pagination
        pageNo={params.pageNo}
        pageSize={params.pageSize}
        total={query.data?.total ?? 0}
        onPageChange={params.setPage}
        onPageSizeChange={params.setPageSize}
      />

      <UserPlanDialog user={planFor} onClose={() => setPlanFor(undefined)} />
      <AssociatePlanDialog user={associateFor} onClose={() => setAssociateFor(undefined)} />
      <EditExpirationDialog user={expirationFor} onClose={() => setExpirationFor(undefined)} />
    </>
  )
}
