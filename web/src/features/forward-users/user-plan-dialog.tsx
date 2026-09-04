import { useQuery } from '@tanstack/react-query'

import { getUserPlanInfo } from '@/api/forward-user'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatBytes, formatTime, usagePercent } from '@/lib/format'
import type { ForwardUser } from '@/types/api'

/** Plan, quota and the per-day traffic series for one forwarding user. */
export function UserPlanDialog({
  user,
  onClose,
}: {
  user: ForwardUser | undefined
  onClose: () => void
}) {
  const query = useQuery({
    queryKey: ['forward-users', user?.id, 'plan'],
    queryFn: () => getUserPlanInfo(user!.id!),
    enabled: Boolean(user?.id),
  })

  const info = query.data
  const daily = info?.DailyTraffics ?? []
  const peak = daily.reduce((max, day) => Math.max(max, day.Traffic), 0)

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>「{user?.username}」的流量</DialogTitle>
          <DialogDescription>套餐额度与最近的每日消耗。</DialogDescription>
        </DialogHeader>

        {query.isPending ? (
          <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
        ) : query.error ? (
          <p className="py-8 text-center text-sm text-destructive">{query.error.message}</p>
        ) : !info ? (
          <p className="py-8 text-center text-sm text-muted-foreground">没有数据</p>
        ) : (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Field label="套餐" value={info.PlanName || '未关联'} />
              <Field label="额度" value={formatBytes(info.PlanTraffic)} />
              <Field label="已用" value={formatBytes(info.UsedTraffic)} />
              <Field
                label="使用率"
                value={`${usagePercent(info.UsedTraffic, info.PlanTraffic).toFixed(1)}%`}
              />
              <Field label="到期时间" value={formatTime(info.ExpirationTime, false)} />
              <Field label="下次重置" value={formatTime(info.ResetTrafficTime, false)} />
            </dl>

            <div className="space-y-2">
              <p className="text-sm font-medium">每日消耗</p>
              {daily.length === 0 ? (
                <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                  该用户还没有流量记录
                </p>
              ) : (
                <div className="flex h-32 items-end gap-1 rounded-md border p-3">
                  {daily.map((day) => (
                    <div
                      key={day.Date}
                      className="group relative flex-1"
                      title={`${formatTime(day.Date, false)}：${formatBytes(day.Traffic)}`}
                    >
                      <div
                        className="w-full rounded-sm bg-primary/70 transition-colors group-hover:bg-primary"
                        // A zero-traffic day still gets a visible sliver, so
                        // the axis reads as "no traffic" rather than "no data".
                        style={{
                          height: `${peak > 0 ? Math.max(2, (day.Traffic / peak) * 100) : 2}%`,
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular font-medium">{value}</dd>
    </div>
  )
}
