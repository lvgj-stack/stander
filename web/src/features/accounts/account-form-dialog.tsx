import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Loader2Icon, ShieldCheckIcon, UserIcon } from 'lucide-react'
import { z } from 'zod'

import { addUser, updateUser } from '@/api/user'
import { Button } from '@/components/ui/button'
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
import { useAuth } from '@/hooks/use-auth'
import { ADMIN_ROLE, USER_ROLE } from '@/lib/roles'
import { cn } from '@/lib/utils'
import type { AdminUser } from '@/types/api'

const schema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string(),
  enable: z.boolean(),
  side: z.enum(['admin', 'user']),
})

type AccountValues = z.infer<typeof schema>

interface AccountFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: AdminUser
}

/**
 * Create or edit an account.
 *
 * The side is a single either/or rather than the checkbox list of roles this
 * used to be. A role no longer carries anything but that choice — the
 * permission rows it used to own, which the previous frontend turned into
 * menus, are gone — and letting someone tick an arbitrary combination of roles
 * only ever produced accounts whose side depended on which role sorted first.
 *
 * It sends the role code. It used to fetch /role first, to translate that code
 * into whichever id this database numbered the row with; the lookup — and the
 * endpoint behind it — belonged to a world where roles were data the console
 * discovered rather than two things it already knows.
 */
export function AccountFormDialog({ open, onOpenChange, account }: AccountFormDialogProps) {
  const { user } = useAuth()
  const editing = Boolean(account)
  // Moving your own account to the user portal takes effect on the next
  // request and cannot be undone from there — the account form is an admin
  // screen. If you are the only administrator, nothing short of SQL brings the
  // admin side back.
  const isSelf = editing && account?.id === user?.id

  const form = useForm<AccountValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '', enable: true, side: 'user' },
  })

  useEffect(() => {
    if (!open) return
    form.reset({
      username: account?.username ?? '',
      password: '',
      enable: account?.enable ?? true,
      side: account?.role === ADMIN_ROLE ? 'admin' : 'user',
    })
  }, [open, account, form])

  const mutation = useActionMutation({
    mutationFn: (values: AccountValues) => {
      const role = values.side === 'admin' ? ADMIN_ROLE : USER_ROLE
      if (account) {
        return updateUser({
          id: account.id,
          username: values.username,
          enable: values.enable,
          role,
        })
      }
      return addUser({
        username: values.username,
        password: values.password,
        enable: values.enable,
        role,
      })
    },
    successMessage: editing ? '账号已更新' : '账号已创建',
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
          <DialogTitle>{editing ? '编辑账号' : '新增账号'}</DialogTitle>
          <DialogDescription>
            {editing ? '修改用户名、状态与所属端。密码请用「重置密码」。' : '创建一个登录账号。'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form id="account-form" onSubmit={submit} className="space-y-4">
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
              name="side"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>登录后进入</FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    <SideOption
                      selected={field.value === 'user'}
                      onSelect={() => field.onChange('user')}
                      disabled={isSelf}
                      icon={<UserIcon className="size-4" />}
                      title="用户端"
                      hint={isSelf ? '不能把自己移出管理端' : '自己的转发规则与流量'}
                    />
                    <SideOption
                      selected={field.value === 'admin'}
                      onSelect={() => field.onChange('admin')}
                      icon={<ShieldCheckIcon className="size-4" />}
                      title="管理端"
                      hint="节点、链路、套餐与账号"
                    />
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
          <Button type="submit" form="account-form" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2Icon className="animate-spin" />}
            {editing ? '保存' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SideOption({
  selected,
  onSelect,
  disabled,
  icon,
  title,
  hint,
}: {
  selected: boolean
  onSelect: () => void
  disabled?: boolean
  icon: React.ReactNode
  title: string
  hint: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'rounded-md border p-3 text-left transition-colors',
        selected ? 'border-primary bg-primary/5' : 'hover:bg-accent',
        disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium">
        {icon}
        {title}
      </span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
    </button>
  )
}
