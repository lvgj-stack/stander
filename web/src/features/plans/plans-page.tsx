import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { InfoIcon } from 'lucide-react'

import { listPlans } from '@/api/plan'
import { DataTable } from '@/components/data-table/data-table'
import { PageHeader } from '@/components/page-header'
import { formatBytes, formatTime, orEmpty } from '@/lib/format'
import type { TrafficPlan } from '@/types/api'

/** Renders the reset period, which the column stores as a day count. */
function periodLabel(period: number | null): string {
  if (period === null || period === undefined) return '—'
  if (period === 0) return '不重置'
  if (period === 30) return '每 30 天'
  return `每 ${period} 天`
}

export function PlansPage() {
  const query = useQuery({ queryKey: ['plans'], queryFn: listPlans })

  const columns: ColumnDef<TrafficPlan, unknown>[] = [
    {
      accessorKey: 'planName',
      header: '套餐名称',
      cell: ({ row }) => <div className="font-medium">{orEmpty(row.original.planName)}</div>,
    },
    {
      accessorKey: 'totalTraffic',
      header: '流量额度',
      cell: ({ row }) => <span className="tabular">{formatBytes(row.original.totalTraffic)}</span>,
    },
    {
      accessorKey: 'period',
      header: '重置周期',
      cell: ({ row }) => <span className="tabular">{periodLabel(row.original.period)}</span>,
    },
    {
      accessorKey: 'createdAt',
      header: '创建时间',
      cell: ({ row }) => (
        <span className="tabular text-muted-foreground">{formatTime(row.original.createdAt)}</span>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="流量套餐" description="用户可以关联的流量额度与重置周期。" />

      {/*
        The backend exposes ListPlans and AssociatePlan only — there is no
        create, edit or delete action for plans. Saying so beats an "新增"
        button that has nothing to call.
      */}
      <div className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <p>
          后端只提供 <code className="text-xs">ListPlans</code> 与{' '}
          <code className="text-xs">AssociatePlan</code>，没有套餐的增删改接口，
          套餐需要直接在数据库的 <code className="text-xs">traffic_plan</code> 表里维护。
          在「转发用户」页面可以把套餐关联到用户。
        </p>
      </div>

      <DataTable
        columns={columns}
        data={query.data?.Plans ?? []}
        loading={query.isPending}
        error={query.error}
        emptyMessage="还没有套餐"
      />
    </>
  )
}
