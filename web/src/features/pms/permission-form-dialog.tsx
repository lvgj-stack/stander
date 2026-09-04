import { useState } from 'react'
import { Loader2Icon } from 'lucide-react'

import { addPermission, updatePermission } from '@/api/permission'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useActionMutation } from '@/hooks/use-action-mutation'
import type { Permission, PermissionType } from '@/types/api'

interface PermissionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing. */
  permission?: Permission
  /** Present when creating a child under this node. */
  parent?: Permission
}

export function PermissionFormDialog({
  open,
  onOpenChange,
  permission,
  parent,
}: PermissionFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/*
          Keyed on what is being edited (or what the new node hangs under), so
          reopening for a different row starts from that row's values.
        */}
        {open && (
          <Body
            key={permission ? `edit-${permission.id}` : `new-${parent?.id ?? 'root'}`}
            permission={permission}
            parent={parent}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Body({
  permission,
  parent,
  onOpenChange,
}: {
  permission?: Permission
  parent?: Permission
  onOpenChange: (open: boolean) => void
}) {
  const editing = Boolean(permission)
  const [name, setName] = useState(permission?.name ?? '')
  const [code, setCode] = useState(permission?.code ?? '')
  const [type, setType] = useState<PermissionType>(permission?.type ?? 'MENU')
  const [path, setPath] = useState(permission?.path ?? '')
  const [icon, setIcon] = useState(permission?.icon ?? '')
  const [order, setOrder] = useState(permission?.order ?? 0)
  const [show, setShow] = useState(permission ? permission.show === 1 : true)
  const [enable, setEnable] = useState(permission ? permission.enable === 1 : true)
  const [error, setError] = useState<string | null>(null)

  const mutation = useActionMutation({
    mutationFn: () => {
      const payload = {
        type,
        parentId: permission ? permission.parentId : (parent?.id ?? null),
        name: name.trim(),
        code: code.trim(),
        path,
        icon,
        layout: '',
        // The column stores a Vue file path from the previous frontend. This
        // app routes statically and never reads it, so it is carried through
        // untouched on edit rather than blanked out.
        component: permission?.component ?? '',
        show,
        enable,
        keepAlive: false,
        order,
      }
      if (permission) return updatePermission({ ...payload, id: permission.id })
      return addPermission(payload)
    },
    successMessage: editing ? '权限已更新' : '权限已创建',
    invalidate: [['permission-tree'], ['auth', 'permissions']],
    onSuccess: () => onOpenChange(false),
  })

  const submit = () => {
    if (!name.trim()) return setError('请输入名称')
    if (!code.trim()) return setError('请输入 code')
    setError(null)
    mutation.mutate(undefined)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? '编辑权限' : '新增权限'}</DialogTitle>
        <DialogDescription>
          {parent ? `在「${parent.name}」下新增子节点。` : ''}
          code 是前端菜单与按钮的判断依据，要和前端约定一致。
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="perm-name">名称</Label>
            <Input
              id="perm-name"
              value={name}
              placeholder="节点"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="perm-code">code</Label>
            <Input
              id="perm-code"
              value={code}
              placeholder="Server"
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>类型</Label>
            <Select value={type} onValueChange={(value) => setType(value as PermissionType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MENU">菜单</SelectItem>
                <SelectItem value="BUTTON">按钮</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="perm-order">排序</Label>
            <Input
              id="perm-order"
              type="number"
              value={order}
              onChange={(event) => {
                const next = event.target.valueAsNumber
                if (!Number.isNaN(next)) setOrder(next)
              }}
            />
          </div>
        </div>

        {type === 'MENU' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="perm-path">路由路径</Label>
              <Input
                id="perm-path"
                value={path}
                placeholder="/nodes"
                onChange={(event) => setPath(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="perm-icon">图标</Label>
              <Input
                id="perm-icon"
                value={icon}
                placeholder="i-fe:server"
                onChange={(event) => setIcon(event.target.value)}
              />
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <div className="flex flex-1 items-center justify-between rounded-md border p-3">
            <Label>显示</Label>
            <Switch checked={show} onCheckedChange={setShow} />
          </div>
          <div className="flex flex-1 items-center justify-between rounded-md border p-3">
            <Label>启用</Label>
            <Switch checked={enable} onCheckedChange={setEnable} />
          </div>
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
