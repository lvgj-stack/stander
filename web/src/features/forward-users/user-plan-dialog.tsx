import { useQuery } from '@tanstack/react-query'

import { getUserPlanInfo } from '@/api/forward-user'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TrafficSummary } from '@/components/traffic/traffic-summary'
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
        ) : !query.data ? (
          <p className="py-8 text-center text-sm text-muted-foreground">没有数据</p>
        ) : (
          <TrafficSummary info={query.data} />
        )}
      </DialogContent>
    </Dialog>
  )
}
