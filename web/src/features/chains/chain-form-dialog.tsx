import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Loader2Icon } from 'lucide-react'
import { z } from 'zod'

import { addChain, editChain } from '@/api/chain'
import { listNodes } from '@/api/node'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useActionMutation } from '@/hooks/use-action-mutation'
import { orEmpty } from '@/lib/format'
import type { Chain } from '@/types/api'

const schema = z.object({
  name: z.string().min(1, '请输入链路名称'),
  port: z
    .number({ error: '请输入端口' })
    .int('端口必须是整数')
    .min(1, '端口范围 1–65535')
    .max(65535, '端口范围 1–65535'),
  nodeId: z.number({ error: '请选择节点' }).positive('请选择节点'),
  chainType: z.enum(['TLS', 'TCP']),
  preferIpv6: z.boolean(),
})

type ChainValues = z.infer<typeof schema>

interface ChainFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chain?: Chain
}

/**
 * Creates a chain, or renames an existing one.
 *
 * Editing is deliberately limited to the name: `EditChain` on the backend
 * only writes `chain_name`. Offering port or node edits here would look like
 * they work and then silently do nothing.
 */
export function ChainFormDialog({ open, onOpenChange, chain }: ChainFormDialogProps) {
  const editing = Boolean(chain)

  const nodesQuery = useQuery({
    queryKey: ['nodes', 'for-chain'],
    queryFn: () => listNodes({ PageNo: 1, PageSize: 200, Scene: 'AddChainScene' }),
    enabled: open && !editing,
  })

  const form = useForm<ChainValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', port: 0, nodeId: 0, chainType: 'TLS', preferIpv6: false },
  })

  useEffect(() => {
    if (!open) return
    form.reset({
      name: chain?.chainName ?? '',
      port: chain?.port ?? 0,
      nodeId: chain?.nodeId ?? 0,
      chainType: (chain?.protocol as 'TLS' | 'TCP') ?? 'TLS',
      preferIpv6: false,
    })
  }, [open, chain, form])

  const mutation = useActionMutation({
    mutationFn: async (values: ChainValues) => {
      if (chain) return editChain(chain.id, values.name)
      return addChain({
        Name: values.name,
        Port: values.port,
        NodeId: values.nodeId,
        ChainType: values.chainType,
        PreferIpv6: values.preferIpv6,
      })
    },
    successMessage: editing ? '链路已更新' : '链路已创建',
    invalidate: [['chains']],
    onSuccess: () => onOpenChange(false),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? '重命名链路' : '新增链路'}</DialogTitle>
          <DialogDescription>
            {editing
              ? '后端只支持修改链路名称，端口与节点需要删除后重建。'
              : '链路在指定节点上监听一个端口，供转发规则串联使用。'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="chain-form"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>链路名称</FormLabel>
                  <FormControl>
                    <Input placeholder="hk-relay" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!editing && (
              <>
                <FormField
                  control={form.control}
                  name="nodeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>所属节点</FormLabel>
                      <Select
                        value={field.value ? String(field.value) : ''}
                        onValueChange={(value) => field.onChange(Number(value))}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue
                              placeholder={nodesQuery.isPending ? '加载中…' : '选择一个节点'}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(nodesQuery.data?.pageData ?? []).map((node) => (
                            <SelectItem key={node.id} value={String(node.id)}>
                              {orEmpty(node.nodeName)}
                              <span className="ml-2 text-muted-foreground">
                                {node.nodeType === 'inbound' ? '入口' : '出口'}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="port"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>监听端口</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          max="65535"
                          placeholder="20000"
                          name={field.name}
                          ref={field.ref}
                          onBlur={field.onBlur}
                          value={field.value || ''}
                          onChange={(event) => field.onChange(event.target.valueAsNumber)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="chainType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>传输协议</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="TLS">TLS（加密）</SelectItem>
                          <SelectItem value="TCP">TCP（明文）</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="preferIpv6"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>优先 IPv6</FormLabel>
                        <FormDescription>连接对端时优先使用 IPv6 地址。</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </>
            )}
          </form>
        </Form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="submit" form="chain-form" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2Icon className="animate-spin" />}
            {editing ? '保存' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
