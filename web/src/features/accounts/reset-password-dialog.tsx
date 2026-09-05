import { useState } from 'react'
import { Loader2Icon } from 'lucide-react'

import { resetUserPassword } from '@/api/user'
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
import type { AdminUser } from '@/types/api'

export function ResetPasswordDialog({
  user,
  onClose,
}: {
  user: AdminUser | undefined
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {/* Keyed so a half-typed password never carries over to another user. */}
        {user && <Body key={user.id} user={user} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function Body({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useActionMutation({
    mutationFn: () => resetUserPassword(user.id, password),
    successMessage: '密码已重置',
    invalidate: [['admin-users']],
    onSuccess: onClose,
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>重置密码</DialogTitle>
        <DialogDescription>
          为「{user.username}」设置新密码。该用户下次登录时需要使用它。
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="new-password">新密码</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button
          disabled={mutation.isPending}
          onClick={() => {
            if (password.length < 6) return setError('密码至少 6 位')
            setError(null)
            mutation.mutate(undefined)
          }}
        >
          {mutation.isPending && <Loader2Icon className="animate-spin" />}
          重置
        </Button>
      </DialogFooter>
    </>
  )
}
