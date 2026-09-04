import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'

import { deletePermission, listPermissionTree } from '@/api/permission'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useActionMutation } from '@/hooks/use-action-mutation'
import type { Permission } from '@/types/api'

import { PermissionFormDialog } from './permission-form-dialog'
import { PermissionTree } from './permission-tree'

export function PermissionsPage() {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Permission | undefined>()
  const [parentFor, setParentFor] = useState<Permission | undefined>()
  const [deleting, setDeleting] = useState<Permission | undefined>()

  const query = useQuery({ queryKey: ['permission-tree'], queryFn: listPermissionTree })

  const removeMutation = useActionMutation({
    mutationFn: (permission: Permission) => deletePermission(permission.id),
    successMessage: '权限已删除',
    invalidate: [['permission-tree'], ['auth', 'permissions']],
    onSuccess: () => setDeleting(undefined),
  })

  const openCreate = (parent?: Permission) => {
    setEditing(undefined)
    setParentFor(parent)
    setFormOpen(true)
  }

  return (
    <>
      <PageHeader
        title="权限管理"
        description="菜单与按钮权限。前端路由是静态的，这里的 code 决定谁能看到哪些入口。"
      >
        <Button onClick={() => openCreate(undefined)}>
          <PlusIcon />
          新增顶级权限
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-2">
          {query.isPending ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-7 w-full" />
              ))}
            </div>
          ) : query.error ? (
            <p className="p-8 text-center text-sm text-destructive">{query.error.message}</p>
          ) : !query.data?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">还没有权限记录</p>
          ) : (
            <PermissionTree
              nodes={query.data}
              renderActions={(permission) => (
                <div className="flex items-center gap-0.5">
                  {permission.type === 'MENU' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="新增子权限"
                      onClick={() => openCreate(permission)}
                    >
                      <PlusIcon className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="编辑"
                    onClick={() => {
                      setEditing(permission)
                      setParentFor(undefined)
                      setFormOpen(true)
                    }}
                  >
                    <PencilIcon className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive"
                    aria-label="删除"
                    onClick={() => setDeleting(permission)}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
              )}
            />
          )}
        </CardContent>
      </Card>

      <PermissionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        permission={editing}
        parent={parentFor}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="删除权限？"
        description={`权限「${deleting?.name ?? ''}」会被移除。它的子节点不会自动删除，请先处理它们。`}
        confirmLabel="删除"
        pending={removeMutation.isPending}
        onConfirm={() => deleting && removeMutation.mutate(deleting)}
      />
    </>
  )
}
