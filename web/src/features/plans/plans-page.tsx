import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { InfoIcon, PlusIcon } from 'lucide-react'

import { listPlans } from '@/api/plan'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/data-table/data-table'
import { PageHeader } from '@/components/page-header'
import { formatBytes, formatTime, orEmpty } from '@/lib/format'
import { periodLabel } from '@/lib/plan'
import type { TrafficPlan } from '@/types/api'

import { PlanFormDialog } from './plan-form-dialog'

export function PlansPage() {
  const query = useQuery({ queryKey: ['plans'], queryFn: listPlans })
  const [creating, setCreating] = useState(false)

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
      <PageHeader title="流量套餐" description="用户可以关联的流量额度与重置周期。">
        <Button onClick={() => setCreating(true)}>
          <PlusIcon />
          新增套餐
        </Button>
      </PageHeader>

      {/*
        Create is the only write there is. Saying so beats leaving an operator
        to discover it by looking for an edit button that was never built —
        and it is worth knowing before naming a plan, since the name is what
        the 关联套餐 dropdown identifies it by and it cannot be changed after.
      */}
      <div className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <p>
          套餐暂不支持修改与删除，创建时请一次填对。在「转发用户」页面可以把套餐关联到用户，
          新增套餐时也可以直接指定一个用户。
        </p>
      </div>

      <DataTable
        columns={columns}
        data={query.data?.Plans ?? []}
        loading={query.isPending}
        error={query.error}
        emptyMessage="还没有套餐"
      />

      <PlanFormDialog open={creating} onOpenChange={setCreating} userPicker />
    </>
  )
}
