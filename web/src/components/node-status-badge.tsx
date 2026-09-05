import { Badge } from '@/components/ui/badge'
import { isRegistered, nodeStatusLabel } from '@/lib/node-status'

/**
 * A node's status, as both console sides render it.
 *
 * It says whether the node's agent has ever called home, and deliberately not
 * whether the node is reachable now — see `lib/node-status`.
 */
export function NodeStatusBadge({ status }: { status: string | null | undefined }) {
  const registered = isRegistered(status)
  return (
    <Badge
      variant={registered ? 'default' : 'outline'}
      className={registered ? '' : 'text-muted-foreground'}
    >
      {nodeStatusLabel(status)}
    </Badge>
  )
}
