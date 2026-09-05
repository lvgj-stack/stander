import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Loader2Icon } from 'lucide-react'
import { z } from 'zod'

import { addNode, editNode } from '@/api/node'
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
import type { Node } from '@/types/api'

const schema = z.object({
  // Trimmed before the length check, so a name of only spaces is refused here
  // for the same reason the server refuses it, and the name submitted is the
  // one that gets stored.
  nodeName: z.string().trim().min(1, '请输入节点名称'),
  nodeType: z.enum(['inbound', 'outbound']),
  rate: z.number({ error: '请输入数字' }).positive('倍率必须大于 0'),
  defaultIPv6: z.boolean(),
})

type NodeValues = z.infer<typeof schema>

interface NodeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Absent means "create"; present means "edit that node". */
  node?: Node
  /**
   * Called after a create with the freshly issued key and the IPv6 preference
   * the form was submitted with, which together are what the install command
   * needs beyond the deployment's own settings.
   */
  onCreated?: (created: { key: string; preferIPv6: boolean }) => void
}

export function NodeFormDialog({ open, onOpenChange, node, onCreated }: NodeFormDialogProps) {
  const editing = Boolean(node)

  const form = useForm<NodeValues>({
    resolver: zodResolver(schema),
    defaultValues: { nodeName: '', nodeType: 'inbound', rate: 1, defaultIPv6: false },
  })

  // The dialog is mounted once and reused, so the values have to be pushed in
  // each time it opens rather than at mount.
  useEffect(() => {
    if (!open) return
    form.reset({
      nodeName: node?.nodeName ?? '',
      nodeType: (node?.nodeType as 'inbound' | 'outbound') ?? 'inbound',
      rate: node?.rate ?? 1,
      defaultIPv6: false,
    })
  }, [open, node, form])

  const mutation = useActionMutation({
    mutationFn: async (values: NodeValues) => {
      if (node) {
        await editNode({ ID: node.id, NodeName: values.nodeName, Rate: values.rate })
        return null
      }
      return addNode({
        NodeName: values.nodeName,
        NodeType: values.nodeType,
        Rate: values.rate,
        DefaultIPv6: values.defaultIPv6,
      })
    },
    successMessage: editing ? '节点已更新' : '节点已创建',
    invalidate: [['nodes']],
    onSuccess: (key) => {
      onOpenChange(false)
      if (!editing && typeof key === 'string' && key) {
        onCreated?.({ key, preferIPv6: form.getValues('defaultIPv6') })
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? '编辑节点' : '新增节点'}</DialogTitle>
          <DialogDescription>
            {editing
              ? '节点类型创建后不可更改。'
              : '创建后会给出一条安装命令，在目标机器上直接执行即可把 agent 装好并接入。'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="node-form"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="nodeName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>节点名称</FormLabel>
                  <FormControl>
                    <Input placeholder="hk-01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nodeType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>节点类型</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={editing}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="inbound">入口（inbound）</SelectItem>
                      <SelectItem value="outbound">出口（outbound）</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>流量倍率</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      // No `min` and `step="any"`: neither of those attributes
                      // is a second place to write "the rate must be > 0", they
                      // are a way to make the control invalid, and a form with
                      // an invalid control is one the browser refuses to submit
                      // at all — no submit event, so the handler that sends
                      // AddNode never runs and 创建 silently does nothing. A
                      // decimal step did that to the default rate of 1
                      // ((1 - 0.1) / 0.1 is 8.999999999999998, a step
                      // mismatch); `min` did it to any negative rate the user
                      // typed. The rule lives in the zod schema and in
                      // validateAddNode, and the schema reports it in the
                      // dialog where the user can read it.
                      step="any"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={Number.isNaN(field.value) ? '' : field.value}
                      onChange={(event) => field.onChange(event.target.valueAsNumber)}
                    />
                  </FormControl>
                  <FormDescription>结算时按此倍率折算消耗的流量。</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!editing && (
              <FormField
                control={form.control}
                name="defaultIPv6"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>默认走 IPv6</FormLabel>
                      <FormDescription>
                        节点注册时优先使用 IPv6 地址；安装命令会带上 --prefer-ipv6。
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
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
          <Button type="submit" form="node-form" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2Icon className="animate-spin" />}
            {editing ? '保存' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
