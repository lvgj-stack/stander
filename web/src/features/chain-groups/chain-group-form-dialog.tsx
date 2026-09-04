import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'

import { listChains } from '@/api/chain'
import { addChainGroup, type ChainGroupMemberInput } from '@/api/chain-group'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { useActionMutation } from '@/hooks/use-action-mutation'
import { orEmpty } from '@/lib/format'

/** Per-chain dispatch settings, matching `req.ChainEntityForChainGroup` defaults. */
const DEFAULT_MEMBER = { Backup: false, MaxFails: 2, Timeout: 10, Weight: 1 }

type MemberSettings = typeof DEFAULT_MEMBER

interface ChainGroupFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Builds a chain group from the existing chains.
 *
 * This is create-only. `EditChainGroup` is a no-op on the backend, so there is
 * no honest edit path to offer.
 */
export function ChainGroupFormDialog({ open, onOpenChange }: ChainGroupFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {/*
          The body is mounted only while the dialog is open, so every visit
          starts from an empty form. Clearing the fields from an effect instead
          would flash the previous draft on reopen.
        */}
        {open && <Body onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  )
}

function Body({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Map<number, MemberSettings>>(new Map())
  const [error, setError] = useState<string | null>(null)

  const chainsQuery = useQuery({
    queryKey: ['chains', 'all-for-group'],
    queryFn: () => listChains({ PageNo: 1, PageSize: 200 }),
  })

  const toggle = (id: number, checked: boolean) => {
    setSelected((previous) => {
      const next = new Map(previous)
      if (checked) next.set(id, { ...DEFAULT_MEMBER })
      else next.delete(id)
      return next
    })
  }

  const patch = (id: number, changes: Partial<MemberSettings>) => {
    setSelected((previous) => {
      const next = new Map(previous)
      const current = next.get(id)
      if (current) next.set(id, { ...current, ...changes })
      return next
    })
  }

  const mutation = useActionMutation({
    mutationFn: () => {
      const chains: ChainGroupMemberInput[] = [...selected.entries()].map(([id, settings]) => ({
        ID: id,
        ...settings,
      }))
      return addChainGroup({ Name: name.trim(), Chains: chains })
    },
    successMessage: '链路组已创建',
    invalidate: [['chain-groups']],
    onSuccess: () => onOpenChange(false),
  })

  const submit = () => {
    if (!name.trim()) return setError('请输入链路组名称')
    if (selected.size === 0) return setError('至少选择一条链路')
    setError(null)
    mutation.mutate(undefined)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>新增链路组</DialogTitle>
        <DialogDescription>
          勾选要编入组的链路，并为每条设置权重、最大失败次数与超时。
          备份链路只在主链路全部失效时启用。
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="group-name">链路组名称</Label>
          <Input
            id="group-name"
            value={name}
            placeholder="hk-pool"
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>组内链路（已选 {selected.size} 条）</Label>
          <ScrollArea className="h-72 rounded-md border">
            {chainsQuery.isPending ? (
              <p className="p-4 text-center text-sm text-muted-foreground">加载中…</p>
            ) : chainsQuery.error ? (
              <p className="p-4 text-center text-sm text-destructive">{chainsQuery.error.message}</p>
            ) : !chainsQuery.data?.pageData.length ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                还没有链路，先去链路页面创建
              </p>
            ) : (
              <ul className="divide-y">
                {chainsQuery.data.pageData.map((chain) => {
                  const settings = selected.get(chain.id)
                  return (
                    <li key={chain.id} className="space-y-3 p-3">
                      <label className="flex cursor-pointer items-center gap-2.5">
                        <Checkbox
                          checked={Boolean(settings)}
                          onCheckedChange={(checked) => toggle(chain.id, checked === true)}
                        />
                        <span className="text-sm font-medium">{orEmpty(chain.chainName)}</span>
                        <span className="tabular text-xs text-muted-foreground">
                          {orEmpty(chain.ip)}:{orEmpty(chain.port)} · {orEmpty(chain.protocol)}
                        </span>
                      </label>

                      {settings && (
                        <div className="grid grid-cols-2 gap-3 pl-7 sm:grid-cols-4">
                          <NumberField
                            label="权重"
                            value={settings.Weight}
                            min={1}
                            onChange={(Weight) => patch(chain.id, { Weight })}
                          />
                          <NumberField
                            label="最大失败"
                            value={settings.MaxFails}
                            min={1}
                            onChange={(MaxFails) => patch(chain.id, { MaxFails })}
                          />
                          <NumberField
                            label="超时（秒）"
                            value={settings.Timeout}
                            min={1}
                            onChange={(Timeout) => patch(chain.id, { Timeout })}
                          />
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">备份</Label>
                            <Switch
                              checked={settings.Backup}
                              onCheckedChange={(Backup) => patch(chain.id, { Backup })}
                            />
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
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
          创建
        </Button>
      </DialogFooter>
    </>
  )
}

function NumberField({
  label,
  value,
  min,
  onChange,
}: {
  label: string
  value: number
  min: number
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min={min}
        value={value}
        className="h-8"
        onChange={(event) => {
          const next = event.target.valueAsNumber
          // An empty box parses to NaN; keep the last good value rather than
          // sending NaN to the backend.
          if (!Number.isNaN(next)) onChange(next)
        }}
      />
    </div>
  )
}
