import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import {
  ActivityIcon,
  ArrowRightIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'

import { deleteRule, listRules, testRule } from '@/api/rule'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTable } from '@/components/data-table/data-table'
import { Pagination } from '@/components/data-table/pagination'
import { Toolbar } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useActionMutation } from '@/hooks/use-action-mutation'
import { useTableParams } from '@/hooks/use-table-params'
import { formatBytes, orEmpty } from '@/lib/format'
import type { Rule, RuleTestResult } from '@/types/api'

import { RuleFormDialog } from './rule-form-dialog'

export function RulesPage() {
  const params = useTableParams()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Rule | undefined>()
  const [deleting, setDeleting] = useState<Rule | undefined>()
  const [testing, setTesting] = useState<Rule | undefined>()
  const [testResult, setTestResult] = useState<RuleTestResult | undefined>()

  const query = useQuery({
    queryKey: ['rules', params.pageNo, params.pageSize, params.keyword],
    queryFn: () =>
      listRules({
        PageNo: params.pageNo,
        PageSize: params.pageSize,
        RuleName: params.keyword || undefined,
      }),
    placeholderData: keepPreviousData,
  })

  const removeMutation = useActionMutation({
    // Like DeleteChain, the backend needs the port to tear down the listener.
    mutationFn: (rule: Rule) => deleteRule(rule.id, rule.listenPort ?? 0),
    successMessage: '规则已删除',
    invalidate: [['rules']],
    onSuccess: () => setDeleting(undefined),
  })

  const testMutation = useActionMutation({
    mutationFn: (rule: Rule) => testRule(rule.id),
    onSuccess: (result) => setTestResult(result),
  })

  const columns: ColumnDef<Rule, unknown>[] = [
    {
      accessorKey: 'ruleName',
      header: '名称',
      cell: ({ row }) => <div className="font-medium">{orEmpty(row.original.ruleName)}</div>,
    },
    {
      id: 'path',
      header: '转发路径',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-sm">
          <span className="tabular">
            {orEmpty(row.original.node?.nodeName)}:{orEmpty(row.original.listenPort)}
          </span>
          <ArrowRightIcon className="size-3 text-muted-foreground" />
          {row.original.chain?.chainName && (
            <>
              <Badge variant="outline" className="font-normal">
                {row.original.chain.chainName}
              </Badge>
              <ArrowRightIcon className="size-3 text-muted-foreground" />
            </>
          )}
          <span className="tabular text-muted-foreground">{orEmpty(row.original.remoteAddr)}</span>
        </div>
      ),
    },
    {
      accessorKey: 'protocol',
      header: '协议',
      cell: ({ row }) => <Badge variant="outline">{orEmpty(row.original.protocol)}</Badge>,
    },
    {
      accessorKey: 'traffic',
      header: '已用流量',
      cell: ({ row }) => <span className="tabular">{formatBytes(row.original.traffic)}</span>,
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label="操作">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                setTesting(row.original)
                setTestResult(undefined)
                testMutation.mutate(row.original)
              }}
            >
              <ActivityIcon className="size-4" />
              连通性测试
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setEditing(row.original)
                setFormOpen(true)
              }}
            >
              <PencilIcon className="size-4" />
              编辑
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row.original)}>
              <Trash2Icon className="size-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="转发规则" description="入口端口到目标地址的转发关系，可经链路中继。">
        <Button
          onClick={() => {
            setEditing(undefined)
            setFormOpen(true)
          }}
        >
          <PlusIcon />
          新增规则
        </Button>
      </PageHeader>

      <Toolbar
        keyword={params.keyword}
        onKeywordChange={params.setKeyword}
        placeholder="按规则名称搜索"
      />

      <DataTable
        columns={columns}
        data={query.data?.pageData}
        loading={query.isPending}
        error={query.error}
        emptyMessage={params.keyword ? '没有匹配的规则' : '还没有转发规则'}
      />

      <Pagination
        pageNo={params.pageNo}
        pageSize={params.pageSize}
        total={query.data?.total ?? 0}
        onPageChange={params.setPage}
        onPageSizeChange={params.setPageSize}
      />

      <RuleFormDialog open={formOpen} onOpenChange={setFormOpen} rule={editing} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="删除转发规则？"
        description={`规则「${deleting?.ruleName ?? ''}」会被移除，节点上对应的监听会立即停止。`}
        confirmLabel="删除"
        pending={removeMutation.isPending}
        onConfirm={() => deleting && removeMutation.mutate(deleting)}
      />

      <TestResultDialog
        rule={testing}
        result={testResult}
        pending={testMutation.isPending}
        onClose={() => {
          setTesting(undefined)
          setTestResult(undefined)
        }}
      />
    </>
  )
}

/** Shows the inbound and outbound legs a `TestRule` probe measured. */
function TestResultDialog({
  rule,
  result,
  pending,
  onClose,
}: {
  rule: Rule | undefined
  result: RuleTestResult | undefined
  pending: boolean
  onClose: () => void
}) {
  const legs = result
    ? [
        { label: '入口', name: result.inboundName, to: result.inboundTo, ping: result.inboundPing },
        {
          label: '出口',
          name: result.outboundName,
          to: result.outboundTo,
          ping: result.outboundPing,
        },
      ].filter((leg) => leg.name || leg.to || leg.ping !== undefined)
    : []

  return (
    <Dialog open={Boolean(rule)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>连通性测试</DialogTitle>
          <DialogDescription>规则「{orEmpty(rule?.ruleName)}」的各段延迟。</DialogDescription>
        </DialogHeader>

        {pending ? (
          <p className="py-6 text-center text-sm text-muted-foreground">测试中…</p>
        ) : legs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {result?.ping !== undefined ? `延迟 ${result.ping} ms` : '没有返回测试结果'}
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {legs.map((leg) => (
              <li key={leg.label} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {leg.label} · {orEmpty(leg.name)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground tabular">
                    {orEmpty(leg.to)}
                  </p>
                </div>
                <Badge variant={pingVariant(leg.ping)} className="tabular shrink-0">
                  {leg.ping === undefined ? '—' : `${leg.ping} ms`}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Under 100 ms reads as healthy, under 300 ms as usable, above that as bad. */
function pingVariant(ping: number | undefined): 'default' | 'secondary' | 'destructive' {
  if (ping === undefined || ping <= 0) return 'secondary'
  if (ping < 100) return 'default'
  if (ping < 300) return 'secondary'
  return 'destructive'
}
