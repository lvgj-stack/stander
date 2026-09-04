import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'

import { listPermissionTree } from '@/api/permission'
import { addRole, updateRole } from '@/api/role'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { useActionMutation } from '@/hooks/use-action-mutation'
import type { Permission, RoleWithPermissions } from '@/types/api'

import { PermissionTree, subtreeIds } from './permission-tree'

interface RoleFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  role?: RoleWithPermissions
}

export function RoleFormDialog({ open, onOpenChange, role }: RoleFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {/*
          Keyed on the role, so switching from editing one role to another (or
          to "新增") remounts with that role's fields and permission ticks
          already in place, rather than correcting them after a first render.
        */}
        {open && <Body key={role?.id ?? 'new'} role={role} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  )
}

function Body({
  role,
  onOpenChange,
}: {
  role?: RoleWithPermissions
  onOpenChange: (open: boolean) => void
}) {
  const editing = Boolean(role)
  const [name, setName] = useState(role?.name ?? '')
  const [code, setCode] = useState(role?.code ?? '')
  const [enable, setEnable] = useState(role?.enable ?? true)
  const [selected, setSelected] = useState<Set<number>>(() => new Set(role?.permissionIds ?? []))
  const [error, setError] = useState<string | null>(null)

  const treeQuery = useQuery({ queryKey: ['permission-tree'], queryFn: listPermissionTree })

  /**
   * Ticks or clears a whole subtree at once. A role that holds a child but not
   * its parent yields a menu entry with nowhere to appear, so the two always
   * move together.
   */
  const toggle = (permission: Permission, checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous)
      for (const id of subtreeIds(permission)) {
        if (checked) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const mutation = useActionMutation({
    mutationFn: () => {
      const permissionIds = [...selected]
      if (role) return updateRole({ id: role.id, name, code, enable, permissionIds })
      return addRole({ name, code, enable, permissionIds })
    },
    successMessage: editing ? '角色已更新' : '角色已创建',
    invalidate: [['roles-page'], ['roles'], ['auth', 'permissions']],
    onSuccess: () => onOpenChange(false),
  })

  const submit = () => {
    if (!name.trim()) return setError('请输入角色名称')
    if (!code.trim()) return setError('请输入角色标识')
    setError(null)
    mutation.mutate(undefined)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? '编辑角色' : '新增角色'}</DialogTitle>
        <DialogDescription>
          勾选这个角色能访问的菜单与按钮。勾选父节点会连同其下所有子节点一起勾选。
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="role-name">角色名称</Label>
            <Input
              id="role-name"
              value={name}
              placeholder="运维"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-code">角色标识</Label>
            <Input
              id="role-code"
              value={code}
              placeholder="ROLE_OPS"
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="space-y-0.5">
            <Label>启用</Label>
            <p className="text-sm text-muted-foreground">停用后该角色的权限不再生效。</p>
          </div>
          <Switch checked={enable} onCheckedChange={setEnable} />
        </div>

        <div className="space-y-2">
          <Label>权限（已选 {selected.size} 项）</Label>
          <ScrollArea className="h-72 rounded-md border p-2">
            {treeQuery.isPending ? (
              <p className="p-4 text-center text-sm text-muted-foreground">加载中…</p>
            ) : treeQuery.error ? (
              <p className="p-4 text-center text-sm text-destructive">{treeQuery.error.message}</p>
            ) : (
              <PermissionTree nodes={treeQuery.data ?? []} selected={selected} onToggle={toggle} />
            )}
          </ScrollArea>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button onClick={submit} disabled={mutation.isPending}>
          {mutation.isPending && <Loader2Icon className="animate-spin" />}
          {editing ? '保存' : '创建'}
        </Button>
      </DialogFooter>
    </>
  )
}
