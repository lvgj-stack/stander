import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import { z } from 'zod'

import { createPlan } from '@/api/plan'
import { listForwardUsers } from '@/api/forward-user'
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
import { useActionMutation } from '@/hooks/use-action-mutation'
import { PERIOD_OPTIONS, PLAN_PERIODS, gbToBytes } from '@/lib/plan'
import { cn } from '@/lib/utils'
import type { TrafficPlan } from '@/types/api'

/**
 * The quota is typed in GB and stored in bytes, so it is a string here and
 * converted on submit. Kept as a string rather than a number so that an empty
 * field is a value the message below can talk about, instead of NaN.
 */
const schema = z.object({
  planName: z.string().trim().min(1, '请输入套餐名称'),
  totalTrafficGb: z.string().refine((value) => Number(value) > 0, '流量额度必须大于 0'),
  // Kept as a string because that is what a select gives back; 「0」 is 月付,
  // a real period, and must survive the trip to the request body.
  period: z.string(),
  /** Empty means "catalogue entry only". */
  userId: z.string(),
})

type PlanValues = z.infer<typeof schema>

/**
 * How many forwarding users the optional picker offers.
 *
 * A plain cap, not paging: this select is a convenience on a create form, and
 * anyone past it can be reached from 转发用户 › 关联套餐, which is the screen
 * built for finding a user. The form says so when the list is short of the
 * total rather than letting an absent name read as a missing account.
 */
const USER_PICKER_LIMIT = 200

interface PlanFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Associate the new plan with this user, in the same request that creates
   * it. Set by the inline create inside 关联套餐, where the user is already
   * known.
   */
  userId?: number
  /**
   * Offer an optional user to associate with. Set by 流量套餐, where the
   * operator may or may not have someone in mind.
   *
   * Deliberately opt-in: it costs a request for the user list, and the inline
   * case already knows its user.
   */
  userPicker?: boolean
  /** Handed the created plan, so an inline caller can select it. */
  onCreated?: (plan: TrafficPlan) => void
}

/**
 * Create a plan, optionally associating it with a user.
 *
 * One request does both. A create followed by a separate associate leaves an
 * unused plan behind whenever the second half fails — in a shared catalogue
 * that has no delete, and where nobody can tell someone else's leftovers from
 * a plan still in use.
 */
export function PlanFormDialog({
  open,
  onOpenChange,
  userId,
  userPicker = false,
  onCreated,
}: PlanFormDialogProps) {
  const form = useForm<PlanValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      planName: '',
      totalTrafficGb: '',
      period: String(PLAN_PERIODS.MONTH),
      userId: '',
    },
  })

  useEffect(() => {
    if (!open) return
    form.reset({
      planName: '',
      totalTrafficGb: '',
      period: String(PLAN_PERIODS.MONTH),
      userId: '',
    })
  }, [open, form])

  const usersQuery = useQuery({
    queryKey: ['forward-users', 'plan-form'],
    queryFn: () => listForwardUsers({ PageNo: 1, PageSize: USER_PICKER_LIMIT }),
    enabled: open && userPicker,
  })
  const truncatedUsers = (usersQuery.data?.total ?? 0) > (usersQuery.data?.pageData.length ?? 0)

  // The user this will be associated with, if any: the prop when the caller
  // already knows it, otherwise whatever the picker currently holds. Read at
  // render rather than at submit so the toast below can describe what actually
  // happened — a create that also associates overwrites someone's plan and
  // resets their expiry, which is not something to report as 「套餐已创建」.
  // useWatch rather than form.watch: the latter hands back a function the
  // React Compiler refuses to memoize, which opts this whole component out of
  // compilation.
  const pickedUserId = useWatch({ control: form.control, name: 'userId' })
  const associateWith = userId ?? (pickedUserId ? Number(pickedUserId) : undefined)

  const mutation = useActionMutation({
    mutationFn: (values: PlanValues) =>
      createPlan({
        planName: values.planName.trim(),
        totalTraffic: gbToBytes(Number(values.totalTrafficGb)),
        period: Number(values.period),
        // An absent user must be absent from the body rather than 0: user 0
        // does not exist, and the backend rolls the whole request back on a
        // user it cannot find.
        ...(associateWith === undefined ? {} : { userId: associateWith }),
      }),
    successMessage: associateWith === undefined ? '套餐已创建' : '套餐已创建并关联',
    invalidate: [['plans'], ['forward-users']],
    onSuccess: (result) => {
      onCreated?.(result.Plan)
      onOpenChange(false)
    },
  })

  const submit = form.handleSubmit((values) => mutation.mutate(values))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新增套餐</DialogTitle>
          <DialogDescription>
            套餐是所有管理员共用的，创建后无法修改或删除，命名和额度请一次填对。
            {/*
              Only in the inline case, where the association is implied by
              where the dialog was opened from rather than chosen in it. It
              takes effect on create and cannot be undone by closing the
              dialog behind this one.
            */}
            {userId !== undefined && '创建后会立即关联给该用户，到期时间与流量重置时间从现在起算。'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form id="plan-form" onSubmit={submit} className="space-y-4">
            <FormField
              control={form.control}
              name="planName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>套餐名称</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" placeholder="月付 100G" {...field} />
                  </FormControl>
                  <FormDescription>关联套餐时只能靠名称分辨，重名会被拒绝。</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="totalTrafficGb"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>流量额度（GB）</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      autoComplete="off"
                      placeholder="100"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>一个重置周期内可用的上限。</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="period"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>重置周期</FormLabel>
                  <FormControl>
                    {/*
                      A plain select rather than the styled one used elsewhere:
                      four fixed options need nothing more, and the styled one
                      cannot be driven in jsdom, which is where the request body
                      this form sends is pinned.
                    */}
                    <select
                      {...field}
                      className={cn(
                        'border-input bg-background ring-offset-background flex h-9 w-full',
                        'rounded-md border px-3 py-1 text-sm shadow-xs',
                        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                      )}
                    >
                      {PERIOD_OPTIONS.map((option) => (
                        <option key={option.value} value={String(option.value)}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormDescription>额度归零的间隔，也是关联后的有效期长度。</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {userPicker && (
              <FormField
                control={form.control}
                name="userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>同时关联给用户</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        className={cn(
                          'border-input bg-background ring-offset-background flex h-9 w-full',
                          'rounded-md border px-3 py-1 text-sm shadow-xs',
                          'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                        )}
                      >
                        <option value="">不关联，只加进套餐目录</option>
                        {(usersQuery.data?.pageData ?? []).map((user) => (
                          <option key={user.id} value={String(user.id)}>
                            {user.username}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormDescription>
                      选了用户，到期时间与流量重置时间都会从现在起算——这是覆盖，不是续费。
                      {/*
                        The list is capped, and a name that is not in it looks
                        exactly like a user who does not exist. Say so rather
                        than let someone conclude the account is missing.
                      */}
                      {truncatedUsers &&
                        ` 用户较多，这里只列出前 ${usersQuery.data?.pageData.length} 个，其余请到「转发用户」页面关联。`}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </form>
        </Form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="submit" form="plan-form" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2Icon className="animate-spin" />}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
