import { useState } from 'react'

import { formatBytes, formatTime, usagePercent } from '@/lib/format'
import type { UserPlanInfo } from '@/types/api'

/**
 * Plan, quota and the recent daily series for one user.
 *
 * Shared by the user portal's overview and the admin's per-user dialog, so the
 * two never drift into reporting the same numbers differently — which is why
 * it lives here rather than under either side's feature folder. Every figure
 * in `UserPlanInfo` is a byte count.
 */
export function TrafficSummary({ info }: { info: UserPlanInfo }) {
  const percent = usagePercent(info.UsedTraffic, info.PlanTraffic)
  const daily = info.DailyTraffics ?? []
  const peak = daily.reduce((max, day) => Math.max(max, day.Traffic), 0)
  // Read once, in a state initializer: the clock is impure, and re-reading it
  // on every render would make this component's output depend on when React
  // happened to re-render it.
  const [now] = useState(() => Date.now())
  const expired = info.ExpirationTime ? new Date(info.ExpirationTime).getTime() < now : false

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {info.PlanName || '未关联套餐'} · 本周期已用
          </p>
          <p className="tabular text-sm">
            <span className="text-lg font-semibold">{formatBytes(info.UsedTraffic)}</span>
            <span className="text-muted-foreground">
              {' / '}
              {info.PlanTraffic > 0 ? formatBytes(info.PlanTraffic) : '无额度'}
            </span>
          </p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={percent >= 90 ? 'h-full bg-destructive' : 'h-full bg-primary transition-all'}
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="tabular text-xs text-muted-foreground">{percent.toFixed(1)}%</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Field label="套餐" value={info.PlanName || '未关联'} />
        <Field label="额度" value={info.PlanTraffic > 0 ? formatBytes(info.PlanTraffic) : '无额度'} />
        <Field
          label="到期时间"
          value={formatTime(info.ExpirationTime, false)}
          tone={expired ? 'bad' : undefined}
          note={expired ? '已过期' : undefined}
        />
        <Field label="下次重置" value={formatTime(info.ResetTrafficTime, false)} />
      </dl>

      <div className="space-y-2">
        <p className="text-sm font-medium">每日消耗</p>
        {daily.length === 0 ? (
          <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            还没有流量记录
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
                  // A zero-traffic day still gets a visible sliver, so the axis
                  // reads as "no traffic" rather than "no data".
                  style={{ height: `${peak > 0 ? Math.max(2, (day.Traffic / peak) * 100) : 2}%` }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note?: string
  tone?: 'bad'
}) {
  return (
    <div className="rounded-md border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={tone === 'bad' ? 'tabular font-medium text-destructive' : 'tabular font-medium'}>
        {value}
        {note && ` · ${note}`}
      </dd>
    </div>
  )
}
