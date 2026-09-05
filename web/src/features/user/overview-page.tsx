import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRightIcon, RouteIcon, ServerIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { ErrorState } from '@/components/error-state'
import { getUserPlanInfo } from '@/api/forward-user'
import { listNodes } from '@/api/node'
import { listRules } from '@/api/rule'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'

import { TrafficSummary } from '@/components/traffic/traffic-summary'

/**
 * The user portal's landing screen: what this account has, and how much of its
 * quota is left.
 *
 * `GetUserPlanInfo` takes a user id, but the backend ignores it for anyone who
 * is not the super admin and answers about the caller instead, so the id sent
 * here is the caller's own and is not what makes the answer safe.
 */
export function UserOverviewPage() {
  const { user } = useAuth()

  const plan = useQuery({
    queryKey: ['me', 'plan', user?.id],
    queryFn: () => getUserPlanInfo(user!.id),
    enabled: Boolean(user?.id),
  })

  const rules = useQuery({
    queryKey: ['me', 'rule-count'],
    queryFn: () => listRules({ PageNo: 1, PageSize: 1 }),
  })

  const nodes = useQuery({
    queryKey: ['me', 'node-count'],
    queryFn: () => listNodes({ PageNo: 1, PageSize: 1 }),
  })

  return (
    <>
      <PageHeader
        title={`你好，${user?.username ?? ''}`}
        description="你的套餐额度、流量消耗和转发资源。"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="我的转发规则"
          value={rules.data?.total}
          loading={rules.isPending}
          error={Boolean(rules.error)}
          icon={RouteIcon}
          to="/portal/rules"
        />
        <StatCard
          label="可用节点"
          value={nodes.data?.total}
          loading={nodes.isPending}
          error={Boolean(nodes.error)}
          icon={ServerIcon}
          to="/portal/nodes"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">流量与套餐</CardTitle>
        </CardHeader>
        <CardContent>
          {plan.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : plan.error ? (
            <ErrorState error={plan.error} />
          ) : !plan.data ? (
            <p className="py-6 text-center text-sm text-muted-foreground">还没有套餐信息</p>
          ) : (
            <TrafficSummary info={plan.data} />
          )}
        </CardContent>
      </Card>
    </>
  )
}

function StatCard({
  label,
  value,
  loading,
  error,
  icon: Icon,
  to,
}: {
  label: string
  value: number | undefined
  loading: boolean
  error: boolean
  icon: LucideIcon
  to: string
}) {
  return (
    <Link to={to}>
      <Card className="transition-colors hover:border-primary/40">
        <CardContent className="flex items-center gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">{label}</p>
            {loading ? (
              <Skeleton className="mt-1 h-7 w-12" />
            ) : error ? (
              <p className="text-sm text-destructive">读取失败</p>
            ) : (
              <p className="tabular text-2xl font-semibold">{value ?? 0}</p>
            )}
          </div>
          <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  )
}
