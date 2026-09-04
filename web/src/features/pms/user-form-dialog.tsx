import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Loader2Icon } from 'lucide-react'
import { z } from 'zod'

import { listRoles } from '@/api/role'
import { addUser, updateUser } from '@/api/user'
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useActionMutation } from '@/hooks/use-action-mutation'
import type { AdminUser } from '@/types/api'

const schema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string(),
  enable: z.boolean(),
  roleIds: z.array(z.number()).min(1, '至少选择一个角色'),
})

type UserValues = z.infer<typeof schema>

interface UserFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: AdminUser
}

export function UserFormDialog({ open, onOpenChange, user }: UserFormDialogProps) {
  const editing = Boolean(user)

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: listRoles, enabled: open })

  const form = useForm<UserValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '', enable: true, roleIds: [] },
  })

  useEffect(() => {
    if (!open) return
    form.reset({
      username: user?.username ?? '',
      password: '',
      enable: user?.enable ?? true,
      roleIds: (user?.roles ?? []).map((role) => role.id),
    })
  }, [open, user, form])

  const mutation = useActionMutation({
    mutationFn: (values: UserValues) => {
      if (user) {
        return updateUser({
          id: user.id,
          username: values.username,
          enable: values.enable,
          roleIds: values.roleIds,
        })
      }
      return addUser({
        username: values.username,
        password: values.password,
        enable: values.enable,
        roleIds: values.roleIds,
      })
    },
    successMessage: editing ? '用户已更新' : '用户已创建',
    invalidate: [['admin-users']],
    onSuccess: () => onOpenChange(false),
  })

  const submit = form.handleSubmit((values) => {
    // The password is required on create and ignored on edit, which zod cannot
    // express from the schema alone since it does not know which mode we are in.
    if (!editing && values.password.length === 0) {
      form.setError('password', { message: '请输入初始密码' })
      return
    }
    mutation.mutate(values)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? '编辑用户' : '新增用户'}</DialogTitle>
          <DialogDescription>
            {editing ? '修改用户名、状态与角色。密码请用「重置密码」。' : '创建一个后台账号。'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form id="user-form" onSubmit={submit} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>用户名</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!editing && (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>初始密码</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="roleIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>角色</FormLabel>
                  <div className="space-y-2 rounded-md border p-3">
                    {rolesQuery.isPending && (
                      <p className="text-sm text-muted-foreground">加载中…</p>
                    )}
                    {(rolesQuery.data ?? []).map((role) => (
                      <label key={role.id} className="flex cursor-pointer items-center gap-2.5">
                        <Checkbox
                          checked={field.value.includes(role.id)}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked === true
                                ? [...field.value, role.id]
                                : field.value.filter((id) => id !== role.id),
                            )
                          }
                        />
                        <span className="text-sm">{role.name}</span>
                        <code className="text-xs text-muted-foreground">{role.code}</code>
                      </label>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="enable"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>启用</FormLabel>
                    <FormDescription>停用后该账号无法登录。</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="submit" form="user-form" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2Icon className="animate-spin" />}
            {editing ? '保存' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
