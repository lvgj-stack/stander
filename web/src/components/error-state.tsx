import { AlertCircleIcon } from 'lucide-react'

import { errorRequestId, errorTitle } from '@/lib/errors'
import { cn } from '@/lib/utils'

/**
 * How a failed load is shown, everywhere it is shown.
 *
 * The console had ten copies of `<p className="text-destructive">{
 * error.message }</p>`, which was all a failure had to offer back when every
 * one of them arrived with the same code and no id. Now that a failure carries
 * a log id, it needs a place to put it, and that place has to be the same on
 * every screen — an id shown in one panel and dropped in the next is worse
 * than none, because nobody learns to look for it.
 *
 * Unlike the toast, this shows the id whenever there is one: a panel is
 * somewhere the reader has stopped to look, and the failures that land here
 * are loads rather than rejected input.
 */
export function ErrorState({
  error,
  className,
  compact,
}: {
  error: unknown
  /** Extra classes for the wrapper. */
  className?: string
  /** Drops the icon, for tight spots like a dialog body. */
  compact?: boolean
}) {
  const requestId = errorRequestId(error)

  return (
    <div className={cn('flex flex-col items-center gap-1.5 py-6 text-center', className)}>
      {!compact && <AlertCircleIcon className="size-5 text-destructive" />}
      <p className="text-sm text-destructive">{errorTitle(error)}</p>
      {requestId && (
        <p className="tabular text-xs text-muted-foreground">日志 ID：{requestId}</p>
      )}
    </div>
  )
}
