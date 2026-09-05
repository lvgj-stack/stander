import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2Icon, PlusIcon } from 'lucide-react'

import { associatePlan, listPlans } from '@/api/plan'
import { PlanFormDialog } from '@/features/plans/plan-form-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useActionMutation } from '@/hooks/use-action-mutation'
import { formatBytes, orEmpty } from '@/lib/format'
import type { ForwardUser } from '@/types/api'

export function AssociatePlanDialog({
  user,
  onClose,
}: {
  user: ForwardUser | undefined
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {/* Keyed on the user so the select starts on their current plan. */}
        {user && <Body key={user.id ?? 'none'} user={user} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function Body({ user, onClose }: { user: ForwardUser; onClose: () => void }) {
  const [planId, setPlanId] = useState(() => (user.planId ? String(user.planId) : ''))
  const [creating, setCreating] = useState(false)

  const plansQuery = useQuery({ queryKey: ['plans'], queryFn: listPlans })

  const mutation = useActionMutation({
    mutationFn: () => associatePlan(user.id!, Number(planId)),
    successMessage: '套餐已关联',
    invalidate: [['forward-users']],
    onSuccess: onClose,
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>关联套餐</DialogTitle>
        <DialogDescription>
          为「{user.username}」选择流量套餐，额度与重置周期随之生效。
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>套餐</Label>
          {/*
            Here rather than only on 流量套餐 because this is where the gap is
            noticed: the operator came to give this user an allowance and the
            dropdown has nothing that fits. Creating it in place also
            associates it, so they leave with the thing they came for.
          */}
          <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
            <PlusIcon />
            新建套餐
          </Button>
        </div>
        <Select value={planId} onValueChange={setPlanId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={plansQuery.isPending ? '加载中…' : '选择套餐'} />
          </SelectTrigger>
          <SelectContent>
            {(plansQuery.data?.Plans ?? []).map((plan) => (
              <SelectItem key={plan.id} value={String(plan.id)}>
                {orEmpty(plan.planName)}
                <span className="ml-2 text-muted-foreground">{formatBytes(plan.totalTraffic)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button disabled={!planId || mutation.isPending} onClick={() => mutation.mutate(undefined)}>
          {mutation.isPending && <Loader2Icon className="animate-spin" />}
          保存
        </Button>
      </DialogFooter>

      {/*
        Given the user, creating already associates — the plan is live before
        this dialog closes, and 取消 out here does not undo it. Selecting it
        keeps the dropdown honest about what the user now has; pressing 保存
        afterwards re-associates the same plan, which recomputes the expiry
        from a fresh now rather than changing which plan they hold.
      */}
      <PlanFormDialog
        open={creating}
        onOpenChange={setCreating}
        userId={user.id ?? undefined}
        onCreated={(plan) => setPlanId(String(plan.id))}
      />
    </>
  )
}
