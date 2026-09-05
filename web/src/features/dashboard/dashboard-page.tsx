import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRightIcon, RouteIcon, ServerIcon, UsersIcon, WaypointsIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { ErrorState } from '@/components/error-state'
import { listChains } from '@/api/chain'
import { listForwardUsers } from '@/api/forward-user'
import { listNodes } from '@/api/node'
import { listRules } from '@/api/rule'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'
import { formatBytes, orEmpty } from '@/lib/format'

/**
 * The overview screen.
 *
 * There is no aggregate endpoint, so the counts come from the `total` field
 * of the list endpoints with `PageSize: 1` — one cheap round trip each rather
 * than pulling every row down to count it client-side. The traffic ranking
 * does need rows, so it asks for one page of them.
 */
export function DashboardPage() {
  const { user } = useAuth()

  const nodes = useQuery({
    queryKey: ['dashboard', 'nodes'],
    queryFn: () => listNodes({ PageNo: 1, PageSize: 1 }),
  })
  const chains = useQuery({
    queryKey: ['dashboard', 'chains'],
    queryFn: () => listChains({ PageNo: 1, PageSize: 1 }),
  })
  const rules = useQuery({
    queryKey: ['dashboard', 'rules'],
    queryFn: () => listRules({ PageNo: 1, PageSize: 1 }),
  })
  const users = useQuery({
    queryKey: ['dashboard', 'forward-users'],
    queryFn: () => listForwardUsers({ PageNo: 1, PageSize: 1 }),
  })

  const topRules = useQuery({
    queryKey: ['dashboard', 'top-rules'],
    queryFn: () => listRules({ PageNo: 1, PageSize: 8, OrderBy: 'traffic', Asc: false }),
  })

  return (
    <>
      <PageHeader title={`欢迎回来，${user?.username ?? ''}`} description="管理端总览。" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="节点"
          value={nodes.data?.total}
          loading={nodes.isPending}
          error={Boolean(nodes.error)}
          icon={ServerIcon}
          to="/admin/nodes"
        />
        <StatCard
          label="链路"
          value={chains.data?.total}
          loading={chains.isPending}
          error={Boolean(chains.error)}
          icon={WaypointsIcon}
          to="/admin/chains"
        />
        <StatCard
          label="转发规则"
          value={rules.data?.total}
          loading={rules.isPending}
          error={Boolean(rules.error)}
          icon={RouteIcon}
          to="/admin/rules"
        />
        <StatCard
          label="转发用户"
          value={users.data?.total}
          loading={users.isPending}
          error={Boolean(users.error)}
          icon={UsersIcon}
          to="/admin/forward-users"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">流量最高的规则</CardTitle>
        </CardHeader>
        <CardContent>
          {topRules.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-8 w-full" />
              ))}
            </div>
          ) : topRules.error ? (
            <ErrorState error={topRules.error} />
          ) : !topRules.data?.pageData.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">还没有流量记录</p>
          ) : (
            <ul className="divide-y">
              {topRules.data.pageData.map((rule) => (
                <li key={rule.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{orEmpty(rule.ruleName)}</span>
                    <Badge variant="outline" className="shrink-0 font-normal">
                      {orEmpty(rule.protocol)}
                    </Badge>
                  </div>
                  <span className="tabular shrink-0 text-sm text-muted-foreground">
                    {formatBytes(rule.traffic)}
                  </span>
                </li>
              ))}
            </ul>
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
