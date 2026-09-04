import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'

import { addRoleUsers, removeRoleUsers } from '@/api/role'
import { listUsers } from '@/api/user'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useActionMutation } from '@/hooks/use-action-mutation'
import { orEmpty } from '@/lib/format'
import type { AdminUser, RoleWithPermissions } from '@/types/api'

/**
 * Assigns users to a role.
 *
 * The membership checkboxes start from the users the role already has, which
 * is only known once the user list has loaded — so the list is fetched here
 * and the interactive body is mounted with it, rather than mounted empty and
 * back-filled from an effect.
 */
export function RoleUsersDialog({
  role,
  onClose,
}: {
  role: RoleWithPermissions | undefined
  onClose: () => void
}) {
  const usersQuery = useQuery({
    queryKey: ['admin-users', 'all'],
    queryFn: () => listUsers({ pageNo: 1, pageSize: 200 }),
    enabled: Boolean(role),
  })

  return (
    <Dialog open={Boolean(role)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>分配用户</DialogTitle>
          <DialogDescription>选择持有角色「{role?.name}」的用户。</DialogDescription>
        </DialogHeader>

        {usersQuery.isPending ? (
          <p className="py-16 text-center text-sm text-muted-foreground">加载中…</p>
        ) : usersQuery.error ? (
          <p className="py-16 text-center text-sm text-destructive">{usersQuery.error.message}</p>
        ) : role && usersQuery.data ? (
          <Body
            key={role.id}
            role={role}
            users={usersQuery.data.pageData}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Body({
  role,
  users,
  onClose,
}: {
  role: RoleWithPermissions
  users: AdminUser[]
  onClose: () => void
}) {
  const [initial] = useState<Set<number>>(
    () => new Set(users.filter((u) => (u.roles ?? []).some((r) => r.id === role.id)).map((u) => u.id)),
  )
  const [selected, setSelected] = useState<Set<number>>(() => new Set(initial))

  const mutation = useActionMutation({
    // There is no "set members" call, only add and remove, so the two sets are
    // diffed and whichever calls are actually needed get sent.
    mutationFn: async () => {
      const added = [...selected].filter((id) => !initial.has(id))
      const removed = [...initial].filter((id) => !selected.has(id))
      if (added.length) await addRoleUsers(role.id, added)
      if (removed.length) await removeRoleUsers(role.id, removed)
      return null
    },
    successMessage: '成员已更新',
    invalidate: [['admin-users'], ['roles-page']],
    onSuccess: onClose,
  })

  const dirty = selected.size !== initial.size || [...selected].some((id) => !initial.has(id))

  return (
    <>
      <ScrollArea className="h-80 rounded-md border">
        <ul className="divide-y">
          {users.map((user) => (
            <li key={user.id}>
              <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2">
                <Checkbox
                  checked={selected.has(user.id)}
                  onCheckedChange={(checked) =>
                    setSelected((previous) => {
                      const next = new Set(previous)
                      if (checked === true) next.add(user.id)
                      else next.delete(user.id)
                      return next
                    })
                  }
                />
                <Avatar className="size-6">
                  <AvatarImage src={user.avatar || undefined} alt="" />
                  <AvatarFallback className="text-xs">
                    {user.username?.slice(0, 1).toUpperCase() ?? '?'}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm">{orEmpty(user.username)}</span>
              </label>
            </li>
          ))}
          {users.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">还没有用户</li>
          )}
        </ul>
      </ScrollArea>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button disabled={!dirty || mutation.isPending} onClick={() => mutation.mutate(undefined)}>
          {mutation.isPending && <Loader2Icon className="animate-spin" />}
          保存
        </Button>
      </DialogFooter>
    </>
  )
}
