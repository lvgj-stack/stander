import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Loader2Icon } from 'lucide-react'
import { z } from 'zod'

import { listChains } from '@/api/chain'
import { listNodes } from '@/api/node'
import { addRule, modifyRule } from '@/api/rule'
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
import { useActionMutation } from '@/hooks/use-action-mutation'
import { orEmpty } from '@/lib/format'
import type { Rule } from '@/types/api'

/** `host:port`, an IPv6 literal in brackets, or a bare hostname with a port. */
const REMOTE_ADDR = /^(\[[0-9a-fA-F:]+\]|[^\s:]+):\d{1,5}$/

const schema = z.object({
  ruleName: z.string().min(1, '请输入规则名称'),
  listenPort: z
    .number({ error: '请输入端口' })
    .int('端口必须是整数')
    .min(1, '端口范围 1–65535')
    .max(65535, '端口范围 1–65535'),
  remoteAddr: z
    .string()
    .min(1, '请输入目标地址')
    .regex(REMOTE_ADDR, '格式应为 host:port，例如 1.2.3.4:443'),
  nodeId: z.number({ error: '请选择入口节点' }).positive('请选择入口节点'),
  // 0 means "direct", i.e. no relay chain.
  chainId: z.number(),
  chainType: z.enum(['TLS', 'TCP']),
})

type RuleValues = z.infer<typeof schema>

/** Sentinel for the "no chain" option; Select cannot hold an empty value. */
const NO_CHAIN = '0'

interface RuleFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule?: Rule
}

export function RuleFormDialog({ open, onOpenChange, rule }: RuleFormDialogProps) {
  const editing = Boolean(rule)

  const nodesQuery = useQuery({
    queryKey: ['nodes', 'for-rule'],
    queryFn: () => listNodes({ PageNo: 1, PageSize: 200, nodeType: 'inbound' }),
    enabled: open && !editing,
  })

  const chainsQuery = useQuery({
    queryKey: ['chains', 'for-rule'],
    queryFn: () => listChains({ PageNo: 1, PageSize: 200 }),
    enabled: open,
  })

  const form = useForm<RuleValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      ruleName: '',
      listenPort: 0,
      remoteAddr: '',
      nodeId: 0,
      chainId: 0,
      chainType: 'TLS',
    },
  })

  useEffect(() => {
    if (!open) return
    form.reset({
      ruleName: rule?.ruleName ?? '',
      listenPort: rule?.listenPort ?? 0,
      remoteAddr: rule?.remoteAddr ?? '',
      nodeId: rule?.nodeId ?? 0,
      chainId: rule?.chainId ?? 0,
      chainType: (rule?.protocol as 'TLS' | 'TCP') ?? 'TLS',
    })
  }, [open, rule, form])

  const mutation = useActionMutation({
    mutationFn: (values: RuleValues) => {
      if (rule) {
        return modifyRule({
          ID: rule.id,
          RuleName: values.ruleName,
          ListenPort: values.listenPort,
          RemoteAddr: values.remoteAddr,
          ChainId: values.chainId,
          ChainType: values.chainType,
        })
      }
      return addRule({
        RuleName: values.ruleName,
        ListenPort: values.listenPort,
        RemoteAddr: values.remoteAddr,
        NodeId: values.nodeId,
        ChainId: values.chainId || undefined,
        ChainType: values.chainType,
      })
    },
    successMessage: editing ? '规则已更新' : '规则已创建',
    invalidate: [['rules']],
    onSuccess: () => onOpenChange(false),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? '编辑转发规则' : '新增转发规则'}</DialogTitle>
          <DialogDescription>
            规则在入口节点上监听一个端口，把流量送到目标地址；选了链路则经由链路中继。
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="rule-form"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="ruleName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>规则名称</FormLabel>
                  <FormControl>
                    <Input placeholder="web-443" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!editing && (
              <FormField
                control={form.control}
                name="nodeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>入口节点</FormLabel>
                    <Select
                      value={field.value ? String(field.value) : ''}
                      onValueChange={(value) => field.onChange(Number(value))}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={nodesQuery.isPending ? '加载中…' : '选择入口节点'}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(nodesQuery.data?.pageData ?? []).map((node) => (
                          <SelectItem key={node.id} value={String(node.id)}>
                            {orEmpty(node.nodeName)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>创建后不可更改。</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="listenPort"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>监听端口</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      max="65535"
                      placeholder="443"
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
              name="remoteAddr"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>目标地址</FormLabel>
                  <FormControl>
                    <Input placeholder="1.2.3.4:443" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="chainId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>中继链路</FormLabel>
                  <Select
                    value={String(field.value ?? 0)}
                    onValueChange={(value) => field.onChange(Number(value))}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_CHAIN}>不经中继（直连）</SelectItem>
                      {(chainsQuery.data?.pageData ?? []).map((chain) => (
                        <SelectItem key={chain.id} value={String(chain.id)}>
                          {orEmpty(chain.chainName)}
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
          </form>
        </Form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="submit" form="rule-form" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2Icon className="animate-spin" />}
            {editing ? '保存' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
