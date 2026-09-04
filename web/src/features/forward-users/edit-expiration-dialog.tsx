import { useState } from 'react'
import { Loader2Icon } from 'lucide-react'

import { editForwardUser } from '@/api/forward-user'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useActionMutation } from '@/hooks/use-action-mutation'
import { toDateInputValue } from '@/lib/format'
import type { ForwardUser } from '@/types/api'

/**
 * The dialog shell.
 *
 * The body is keyed on the user, so opening it for someone else remounts it
 * with their date already in place. Syncing the field through an effect would
 * render the previous user's value first and then correct it.
 */
export function EditExpirationDialog({
  user,
  onClose,
}: {
  user: ForwardUser | undefined
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {user && <Body key={user.id ?? 'none'} user={user} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function Body({ user, onClose }: { user: ForwardUser; onClose: () => void }) {
  const [date, setDate] = useState(() => toDateInputValue(user.expirationTime))

  const mutation = useActionMutation({
    mutationFn: () =>
      // The backend binds this into a *time.Time, so it has to be RFC 3339.
      // A date input gives a bare YYYY-MM-DD; expiry means the end of that
      // day, so it is sent as the last instant of it in local time.
      editForwardUser(user.id!, date ? new Date(`${date}T23:59:59`).toISOString() : null),
    successMessage: '到期时间已更新',
    invalidate: [['forward-users']],
    onSuccess: onClose,
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>修改到期时间</DialogTitle>
        <DialogDescription>
          「{user.username}」在该日期结束时到期。留空表示不设到期时间。
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="expiration">到期日期</Label>
        <Input
          id="expiration"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button disabled={mutation.isPending} onClick={() => mutation.mutate(undefined)}>
          {mutation.isPending && <Loader2Icon className="animate-spin" />}
          保存
        </Button>
      </DialogFooter>
    </>
  )
}
